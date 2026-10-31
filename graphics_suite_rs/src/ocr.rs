//! OCR: character recognition by Tesseract (LOOSE-ocr-not-recognition).
//!
//! The pass that lived here before was not recognition: it cut the page into
//! connected blobs and named each one I, -, O, A or E from its aspect ratio and
//! ink density, so "IO-AE" came back "IAAA-". This module now hands the image
//! to the `tesseract` CLI (installed in the worker image) and reads back two
//! renderers in ONE run, both written to stdout:
//!
//! * `tsv`     — one row per word with its box and confidence → `word_regions`
//!   and `extracted_text` (words joined by spaces, lines by newlines);
//! * `makebox` — one row per character with its box → `detected_characters`.
//!
//! The image goes in on stdin as PNG and nothing is staged on disk, so the
//! read-only worker container needs no writable path for it.
//!
//! NO TESSERACT, NO READING: when the binary or its language data is missing
//! `process_image` returns an error naming what is missing. It never falls
//! back to guessing glyphs.
//!
//! Tunables (environment, read per call):
//! * `APK_OCR_TESSERACT` — the binary (default `tesseract` on PATH);
//! * `APK_OCR_LANG`      — the language(s), as `-l` takes them (default `eng`);
//! * `TESSDATA_PREFIX`   — Tesseract's own: where the `.traineddata` live.
//!
//! CODE-LIKE TOKENS (LOOSE-ocr-code-tokens): Tesseract's English model reads a
//! sans-serif capital I and O as 1 and 0 when no word context says otherwise
//! ("IO-AE" → "10-AE"). A caller that knows its text is a code passes
//! [`OcrOptions`] per job: `psm` (Tesseract's page segmentation mode — 8 "one
//! word" or 13 "raw line" for a lone label) and `whitelist` (the only
//! characters it may answer). The two go together: with a whitelist under the
//! default psm 3 the LSTM still segments "1", finds it banned and drops it
//! ("O-AE"); under psm 8 or 13 it answers "IO-AE". Defaults (psm 3, no
//! whitelist) are the reading every caller had before.

use std::io::{Cursor, Read, Write};
use std::process::{Command, Stdio};

use image::DynamicImage;
use serde::{Deserialize, Serialize};

/// What `extracted_text` says when this pass read nothing.
///
/// A NAMED sentinel because callers must be able to tell it from a reading.
/// detect_title_block() compared against the empty string instead and stored
/// this sentence as a drawing's title.
pub const NO_TEXT: &str = "No OCR text detected";

/// A PNG the self test reads, and the text it must read from it: "OCR probe
/// 42" in DejaVu Sans Bold 24 px, rendered by ImageMagick.
pub const PROBE_PNG: &[u8] = include_bytes!("ocr_fixtures/probe.png");
pub const PROBE_TEXT: &str = "OCR probe 42";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct OcrCharacterMatch {
    pub character: char,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    /// The confidence (0-1) of the word this character was read in.
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct OcrWordRegion {
    pub text: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    /// Tesseract's word confidence scaled to 0-1.
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct OcrResult {
    pub extracted_text: String,
    pub line_count: usize,
    pub word_count: usize,
    pub detected_characters: Vec<OcrCharacterMatch>,
    pub word_regions: Vec<OcrWordRegion>,
}

/// Per-job settings for one OCR run. `Default` is the page reading: psm 3,
/// every character allowed.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct OcrOptions {
    /// Tesseract's `--psm` (0-13); None = 3, fully automatic page layout.
    pub psm: Option<u8>,
    /// The only characters Tesseract may answer (`tessedit_char_whitelist`);
    /// None = any.
    pub whitelist: Option<String>,
}

/// The longest whitelist a job may carry, in characters.
pub const MAX_WHITELIST_CHARS: usize = 512;

impl OcrOptions {
    /// Check the options before any pixel is touched. A psm outside 0-13, or
    /// a whitelist that is empty, too long or holds a control character, is
    /// an error naming the field: Tesseract would only warn and read anyway.
    pub fn validate(&self) -> Result<(), String> {
        if let Some(p) = self.psm {
            if p > 13 {
                return Err(format!("psm {p} is not a Tesseract page segmentation mode (0-13)"));
            }
        }
        if let Some(w) = &self.whitelist {
            if w.is_empty() {
                return Err("whitelist is empty: it would allow no character at all (leave it out for any)".into());
            }
            if w.chars().count() > MAX_WHITELIST_CHARS {
                return Err(format!("whitelist is longer than {MAX_WHITELIST_CHARS} characters"));
            }
            if w.chars().any(char::is_control) {
                return Err("whitelist holds a control character".into());
            }
        }
        Ok(())
    }
}

pub struct OcrEngine;

impl OcrEngine {
    /// Read the text in `img`. Err only when Tesseract could not be run or
    /// failed; a page with no text is Ok with `extracted_text == NO_TEXT`.
    pub fn process_image(img: &DynamicImage) -> Result<OcrResult, String> {
        let bin = std::env::var("APK_OCR_TESSERACT").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "tesseract".into());
        let lang = std::env::var("APK_OCR_LANG").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "eng".into());
        Self::process_image_with(img, &bin, &lang)
    }

    /// `process_image` with per-job [`OcrOptions`] (psm, whitelist).
    pub fn process_image_opts(img: &DynamicImage, opts: &OcrOptions) -> Result<OcrResult, String> {
        let bin = std::env::var("APK_OCR_TESSERACT").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "tesseract".into());
        let lang = std::env::var("APK_OCR_LANG").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "eng".into());
        Self::process_image_full(img, &bin, &lang, opts)
    }

    /// `process_image` with the binary and language named rather than read
    /// from the environment.
    pub fn process_image_with(img: &DynamicImage, bin: &str, lang: &str) -> Result<OcrResult, String> {
        Self::process_image_full(img, bin, lang, &OcrOptions::default())
    }

    /// Everything named: binary, language and per-job options.
    pub fn process_image_full(img: &DynamicImage, bin: &str, lang: &str, opts: &OcrOptions) -> Result<OcrResult, String> {
        opts.validate()?;
        let height = img.height();
        // Grey is all Tesseract binarises from, and a quarter of the bytes.
        let mut png = Vec::new();
        DynamicImage::ImageLuma8(img.to_luma8())
            .write_to(&mut Cursor::new(&mut png), image::ImageOutputFormat::Png)
            .map_err(|e| format!("the image does not encode as PNG for Tesseract: {e}"))?;
        let out = run_tesseract(&png, bin, lang, opts)?;
        // Without its `tsv` config file Tesseract only warns and prints plain
        // text; reading that as "no words" would be a silent NO_TEXT.
        if !out.lines().any(|l| l.starts_with("level\tpage_num")) {
            return Err(format!("Tesseract ({bin}) wrote no TSV: its tessdata/configs/tsv is missing (TESSDATA_PREFIX?)"));
        }
        Ok(parse(&out, height))
    }
}

/// The argument list after the binary: input, output, language, psm, the
/// whitelist as one `-c` (one argv entry, so no shell and no quoting), then
/// the two renderers, which must come last.
fn tesseract_args(lang: &str, opts: &OcrOptions) -> Vec<String> {
    let mut a: Vec<String> = ["stdin", "stdout", "-l", lang, "--psm"].iter().map(|s| s.to_string()).collect();
    a.push(opts.psm.unwrap_or(3).to_string());
    if let Some(w) = &opts.whitelist {
        a.push("-c".into());
        a.push(format!("tessedit_char_whitelist={w}"));
    }
    a.push("tsv".into());
    a.push("makebox".into());
    a
}

fn run_tesseract(png: &[u8], bin: &str, lang: &str, opts: &OcrOptions) -> Result<String, String> {
    let mut child = Command::new(bin)
        .args(tesseract_args(lang, opts))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("OCR needs Tesseract: `{bin}` could not be started ({e}); install tesseract-ocr or set APK_OCR_TESSERACT"))?;

    // Feed stdin on its own thread so a large answer cannot deadlock the pipe.
    let mut stdin = child.stdin.take().expect("stdin was piped");
    let input = png.to_vec();
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let mut stdout = String::new();
    let mut stderr = String::new();
    child.stdout.take().expect("stdout was piped").read_to_string(&mut stdout).map_err(|e| format!("reading Tesseract's answer: {e}"))?;
    child.stderr.take().expect("stderr was piped").read_to_string(&mut stderr).ok();
    let status = child.wait().map_err(|e| format!("waiting for Tesseract: {e}"))?;
    let _ = writer.join();
    if !status.success() {
        return Err(format!("Tesseract ({bin}, -l {lang}) failed with {status}: {}", stderr.trim()));
    }
    Ok(stdout)
}

/// Turn the concatenated `tsv` + `makebox` output into an OcrResult.
/// `height` is the image's, because box rows count y from the bottom.
fn parse(out: &str, height: u32) -> OcrResult {
    let mut words: Vec<OcrWordRegion> = Vec::new();
    let mut text = String::new();
    let mut last_line: Option<(u32, u32, u32)> = None;
    let mut chars: Vec<OcrCharacterMatch> = Vec::new();

    for row in out.lines() {
        if row.contains('\t') {
            // level page block par line word left top width height conf text
            let f: Vec<&str> = row.split('\t').collect();
            if f.len() < 12 || f[0] != "5" {
                continue;
            }
            let word = f[11].trim();
            let conf: f32 = f[10].parse().unwrap_or(-1.0);
            if word.is_empty() || conf < 0.0 {
                continue;
            }
            let n = |i: usize| f[i].parse::<u32>().unwrap_or(0);
            let line = (n(2), n(3), n(4));
            match last_line {
                Some(l) if l == line => text.push(' '),
                Some(_) => text.push('\n'),
                None => {}
            }
            last_line = Some(line);
            text.push_str(word);
            words.push(OcrWordRegion {
                text: word.to_string(),
                x: n(6),
                y: n(7),
                width: n(8),
                height: n(9),
                confidence: (conf / 100.0).clamp(0.0, 1.0),
            });
        } else {
            // <glyph> left bottom right top page — the glyph may be any char.
            let f: Vec<&str> = row.split_whitespace().collect();
            if f.len() < 6 {
                continue;
            }
            let nums: Option<Vec<u32>> = f[f.len() - 5..f.len() - 1].iter().map(|s| s.parse().ok()).collect();
            let (Some(nums), Some(character)) = (nums, f[0].chars().next()) else { continue };
            let (left, bottom, right, top) = (nums[0], nums[1], nums[2], nums[3]);
            chars.push(OcrCharacterMatch {
                character,
                x: left,
                y: height.saturating_sub(top),
                width: right.saturating_sub(left),
                height: top.saturating_sub(bottom),
                confidence: 0.0,
            });
        }
    }

    // A character takes the confidence of the word whose box holds its centre.
    for c in &mut chars {
        let (cx, cy) = (c.x + c.width / 2, c.y + c.height / 2);
        if let Some(w) = words.iter().find(|w| cx >= w.x && cx <= w.x + w.width && cy >= w.y && cy <= w.y + w.height) {
            c.confidence = w.confidence;
        }
    }

    if text.trim().is_empty() {
        text = NO_TEXT.to_string();
    }
    OcrResult {
        line_count: if words.is_empty() { 0 } else { text.lines().count() },
        word_count: words.len(),
        extracted_text: text,
        detected_characters: chars,
        word_regions: words,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tesseract is in the worker image, not necessarily on a dev host. A test
    /// that needs it says so and passes vacuously; the image's self test
    /// (`an_ocr_job_reads_the_probe`) is the check that cannot skip.
    fn tesseract_here() -> bool {
        let bin = std::env::var("APK_OCR_TESSERACT").unwrap_or_else(|_| "tesseract".into());
        let ok = Command::new(bin).arg("--version").output().is_ok_and(|o| o.status.success());
        if !ok {
            eprintln!("SKIP: no tesseract on this host (set APK_OCR_TESSERACT / TESSDATA_PREFIX to run)");
        }
        ok
    }

    fn read(png: &[u8]) -> OcrResult {
        OcrEngine::process_image(&image::load_from_memory(png).unwrap()).unwrap()
    }

    #[test]
    fn tsv_and_box_rows_parse_into_words_lines_and_characters() {
        let out = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
                   5\t1\t1\t1\t1\t1\t10\t5\t30\t20\t90\tab\n\
                   5\t1\t1\t1\t1\t2\t50\t5\t10\t20\t80\tc\n\
                   5\t1\t1\t1\t2\t1\t10\t40\t10\t20\t70\td\n\
                   a 10 35 20 55 0\nb 25 35 40 55 0\nc 50 35 60 55 0\nd 10 0 20 20 0\n";
        let r = parse(out, 60);
        assert_eq!(r.extracted_text, "ab c\nd");
        assert_eq!((r.line_count, r.word_count), (2, 3));
        assert_eq!(r.detected_characters.iter().map(|c| c.character).collect::<String>(), "abcd");
        let d = &r.detected_characters[3];
        assert_eq!((d.x, d.y, d.width, d.height), (10, 40, 10, 20));
        assert!((d.confidence - 0.70).abs() < 1e-6);
    }

    #[test]
    fn an_empty_answer_is_the_no_text_sentinel() {
        let r = parse("level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n", 10);
        assert_eq!(r.extracted_text, NO_TEXT);
        assert_eq!((r.line_count, r.word_count), (0, 0));
    }

    #[test]
    fn io_ae_keeps_its_dash_in_place() {
        if !tesseract_here() {
            return;
        }
        // The loose end's own case: DejaVu Sans Bold 32 px. The old pass
        // answered "IAAA-". Tesseract 5 reads the sans-serif I and O, which
        // have no serif to tell them from 1 and 0, as "10" — real readings,
        // in order, with the dash where it was.
        let r = read(include_bytes!("ocr_fixtures/ioae.png"));
        let t = r.extracted_text.as_str();
        assert!(t == "IO-AE" || t == "10-AE" || t == "I0-AE" || t == "1O-AE", "{t:?}");
        assert_eq!(r.detected_characters.len(), 5, "{:?}", r.detected_characters);
        assert_eq!(r.detected_characters[2].character, '-');
    }

    #[test]
    fn options_shape_the_command_line_and_default_to_the_page_reading() {
        assert_eq!(tesseract_args("eng", &OcrOptions::default()).join(" "), "stdin stdout -l eng --psm 3 tsv makebox");
        let code = OcrOptions { psm: Some(8), whitelist: Some("ABC -".into()) };
        let a = tesseract_args("eng", &code);
        assert_eq!(a.join("|"), "stdin|stdout|-l|eng|--psm|8|-c|tessedit_char_whitelist=ABC -|tsv|makebox");
    }

    #[test]
    fn bad_options_are_refused_before_tesseract_runs() {
        let img = DynamicImage::ImageLuma8(image::GrayImage::from_pixel(8, 8, image::Luma([255])));
        for (o, why) in [
            (OcrOptions { psm: Some(14), whitelist: None }, "psm"),
            (OcrOptions { psm: None, whitelist: Some(String::new()) }, "empty"),
            (OcrOptions { psm: None, whitelist: Some("A\nB".into()) }, "control"),
            (OcrOptions { psm: None, whitelist: Some("A".repeat(MAX_WHITELIST_CHARS + 1)) }, "longer"),
        ] {
            // The binary does not exist: an options error proves it was never started.
            let err = OcrEngine::process_image_full(&img, "/nonexistent/tesseract-for-test", "eng", &o).unwrap_err();
            assert!(err.contains(why), "{why}: {err}");
        }
        assert!(OcrOptions { psm: Some(13), whitelist: Some("IO-AE".into()) }.validate().is_ok());
    }

    #[test]
    fn a_code_token_reads_as_letters_with_psm_and_whitelist() {
        if !tesseract_here() {
            return;
        }
        // LOOSE-ocr-code-tokens: the same pixels io_ae_keeps_its_dash_in_place
        // reads as "10-AE" come back "IO-AE" when the job says it is one
        // word of capitals and dashes.
        let img = image::load_from_memory(include_bytes!("ocr_fixtures/ioae.png")).unwrap();
        let caps = "ABCDEFGHIJKLMNOPQRSTUVWXYZ-";
        for psm in [8, 13] {
            let r = OcrEngine::process_image_opts(&img, &OcrOptions { psm: Some(psm), whitelist: Some(caps.into()) }).unwrap();
            assert_eq!(r.extracted_text, "IO-AE", "psm {psm}");
            assert_eq!(r.detected_characters.iter().map(|c| c.character).collect::<String>(), "IO-AE");
        }
    }

    #[test]
    fn a_document_line_is_read_word_for_word() {
        if !tesseract_here() {
            return;
        }
        let r = read(include_bytes!("ocr_fixtures/line.png"));
        assert_eq!(r.extracted_text, "Invoice 4471-B: 12 cables shipped to Toronto.");
        assert_eq!(r.word_regions.len(), 7);
        assert_eq!(r.line_count, 1);
    }

    #[test]
    fn the_probe_reads_as_its_text() {
        if !tesseract_here() {
            return;
        }
        assert_eq!(read(PROBE_PNG).extracted_text, PROBE_TEXT);
    }

    #[test]
    fn a_blank_page_reads_nothing() {
        if !tesseract_here() {
            return;
        }
        let blank = DynamicImage::ImageLuma8(image::GrayImage::from_pixel(64, 32, image::Luma([255])));
        assert_eq!(OcrEngine::process_image(&blank).unwrap().extracted_text, NO_TEXT);
    }

    #[test]
    fn a_missing_binary_is_an_error_not_a_guess() {
        let img = DynamicImage::ImageLuma8(image::GrayImage::from_pixel(8, 8, image::Luma([255])));
        let err = OcrEngine::process_image_with(&img, "/nonexistent/tesseract-for-test", "eng").unwrap_err();
        assert!(err.contains("could not be started"), "{err}");
    }
}
