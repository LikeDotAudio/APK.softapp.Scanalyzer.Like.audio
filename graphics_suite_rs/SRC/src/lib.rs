// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//! Scanalyzer's graphics suite as a worker (LOOSE-workers-convert-rest): the
//! OCR pass (CAPTURE.OCR) and the raster→SVG tracer (CAPTURE.Vectorizer).
//!
//! ```text
//!   client ── APK.audio/System/Protocols/graphics_suite/outgoing/job ──▶ worker
//!   worker ── APK.audio/System/Protocols/graphics_suite/incoming/result ─▶ client
//! ```
//!
//! ONE JOB IN, ONE RESULT OUT, MATCHED BY `job_id`. Neither leaf retains (see
//! `contracts/rust/src/baremetal_io.rs`). The job carries one image and an
//! `op`; the result carries what the CLI prints for that op — the same
//! `OcrEngine::process_image` and `VectorizerEngine::convert_to_svg` the CLI
//! and the micro-API call, linked from the library one directory up.
//!
//! THE JOB NEVER NAMES A PATH, and nothing is staged on disk: the image is
//! decoded from the job's bytes in memory, with its sides capped before a
//! pixel is allocated (a few-kB PNG can declare a gigapixel canvas).

pub mod self_test;

use std::io::Cursor;
use std::time::{Duration, Instant};

use apkaudio_contracts::baremetal_io;
use apkaudio_graphics_suite::ocr::{OcrEngine, OcrOptions};
use apkaudio_graphics_suite::vectorizer::VectorizerEngine;
use base64::Engine as _;
use image::DynamicImage;
use rumqttc::{Client, Event, MqttOptions, Packet, QoS};
use serde_json::{Value, json};

/// The token the bus knows this worker by. The same word as `[graphics_suite]`.
pub const MODULE: &str = "graphics_suite";

/// The tool the result came from, for a reader that listens to several.
pub const TOOL: &str = "SCANALYZER.Like.audio/graphics_suite_rs";

/// The compiled-in config, the same text the runner publishes at `/config`.
pub const CONFIG_INI: &str = include_str!("../config.ini");

/// The operations a job may ask for, and the CAPTURE tool each stands for.
pub const OPS: [(&str, &str); 2] = [("ocr", "CAPTURE.OCR"), ("vectorize", "CAPTURE.Vectorizer")];

const DEFAULT_MAX_JOB_BYTES: usize = 32 * 1024 * 1024;
const DEFAULT_MAX_SIDE_PX: u32 = 8192;
const DEFAULT_MAX_RESULT_BYTES: usize = 32 * 1024 * 1024;
/// The CLI's `to-svg --threshold` default.
const DEFAULT_THRESHOLD: u8 = 128;

/// The limits a job runs under, read from `config.ini`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Limits {
    pub max_job_bytes: usize,
    pub max_side_px: u32,
    pub max_result_bytes: usize,
}

impl Limits {
    pub fn from_ini(config_ini: &str) -> Self {
        let ini = apk_plugin_runner::ini_to_json(config_ini);
        let key = |k: &str| ini.get(MODULE).and_then(|s| s.get(k)).and_then(Value::as_str).map(|v| v.trim().to_string());
        Limits {
            max_job_bytes: key("max_job_bytes").and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_MAX_JOB_BYTES),
            max_side_px: key("max_side_px").and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_MAX_SIDE_PX),
            max_result_bytes: key("max_result_bytes").and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_MAX_RESULT_BYTES),
        }
    }
}

/// Answer one job. Always returns a result document, never panics on input:
/// a malformed job gets `ok: false` and an `error`, with its `job_id` when it
/// had one, so the caller waiting on that id is not left waiting forever.
pub fn handle_job(payload: &[u8], limits: Limits) -> Value {
    let started = Instant::now();
    let job: Value = match serde_json::from_slice(payload) {
        Ok(v @ Value::Object(_)) => v,
        Ok(_) => return failure(Value::Null, Value::Null, "a job is a JSON object", started),
        Err(e) => return failure(Value::Null, Value::Null, &format!("the job is not JSON: {e}"), started),
    };
    let job_id = match job.get("job_id") {
        Some(Value::String(s)) if !s.is_empty() => Value::String(s.clone()),
        _ => return failure(Value::Null, Value::Null, "the job has no job_id", started),
    };
    let op = job.get("op").cloned().unwrap_or(Value::Null);
    match run(&job, limits) {
        Ok(result) => json!({
            "job_id": job_id,
            "tool": TOOL,
            "op": op,
            "ok": true,
            "result": result,
            "error": null,
            "elapsed_ms": started.elapsed().as_millis() as u64,
        }),
        Err(e) => failure(job_id, op, &e, started),
    }
}

fn run(job: &Value, limits: Limits) -> Result<Value, String> {
    let op = job.get("op").and_then(Value::as_str).unwrap_or("");
    if !OPS.iter().any(|(name, _)| *name == op) {
        let names: Vec<&str> = OPS.iter().map(|(n, _)| *n).collect();
        return Err(format!("op {op:?} is not one this worker runs ({})", names.join(", ")));
    }
    // Checked before the image is decoded, so a bad field costs nothing.
    let threshold = match job.get("threshold") {
        None | Some(Value::Null) => DEFAULT_THRESHOLD,
        Some(v) => v
            .as_u64()
            .and_then(|t| u8::try_from(t).ok())
            .ok_or_else(|| format!("threshold {v} is not a whole number 0-255"))?,
    };
    // OCR's per-job options (LOOSE-ocr-code-tokens): a code-like label reads
    // as letters only when the job says so (psm 8/13 + a whitelist).
    let ocr_opts = OcrOptions {
        psm: match job.get("psm") {
            None | Some(Value::Null) => None,
            Some(v) => Some(v.as_u64().and_then(|p| u8::try_from(p).ok()).ok_or_else(|| format!("psm {v} is not a whole number 0-13"))?),
        },
        whitelist: match job.get("whitelist") {
            None | Some(Value::Null) => None,
            Some(Value::String(w)) => Some(w.clone()),
            Some(v) => return Err(format!("whitelist {v} is not a string of the characters allowed")),
        },
    };
    ocr_opts.validate()?;
    let bytes = match job.get("content_b64") {
        Some(Value::String(b)) => base64::engine::general_purpose::STANDARD
            .decode(b.trim())
            .map_err(|e| format!("content_b64 does not decode: {e}"))?,
        _ => return Err("the job carries no content_b64 (an image is bytes, never a path)".into()),
    };
    if bytes.len() > limits.max_job_bytes {
        return Err(format!("the image is {} bytes; this worker takes at most {}", bytes.len(), limits.max_job_bytes));
    }
    let img = decode(&bytes, limits.max_side_px)?;

    match op {
        "ocr" => serde_json::to_value(OcrEngine::process_image_opts(&img, &ocr_opts)?).map_err(|e| e.to_string()),
        _ => {
            let svg = VectorizerEngine::convert_to_svg(&img, threshold);
            if svg.svg_xml.len() > limits.max_result_bytes {
                return Err(format!(
                    "the SVG is {} bytes ({} paths); this worker answers at most {} — raise the threshold",
                    svg.svg_xml.len(),
                    svg.path_count,
                    limits.max_result_bytes
                ));
            }
            let filename = job.get("filename").and_then(Value::as_str).unwrap_or("");
            let stem = filename.rsplit(['/', '\\']).next().unwrap_or("").rsplit_once('.').map_or("vectorized", |(s, _)| s);
            let mut out = serde_json::to_value(&svg).map_err(|e| e.to_string())?;
            out["filename"] = json!(format!("{stem}.svg"));
            out["threshold"] = json!(threshold);
            Ok(out)
        }
    }
}

/// Decode an image from memory: the format is read off the bytes (never the
/// name), and the sides are checked against the header before the pixels are.
pub fn decode(bytes: &[u8], max_side_px: u32) -> Result<DynamicImage, String> {
    let mut reader = image::io::Reader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| format!("the image could not be read: {e}"))?;
    if reader.format().is_none() {
        return Err("content_b64 is not an image format this worker reads (png, jpeg, gif, bmp, tiff, webp, …)".into());
    }
    let mut lim = image::io::Limits::default();
    lim.max_image_width = Some(max_side_px);
    lim.max_image_height = Some(max_side_px);
    reader.limits(lim);
    reader.decode().map_err(|e| format!("the image does not decode: {e}"))
}

fn failure(job_id: Value, op: Value, error: &str, started: Instant) -> Value {
    json!({
        "job_id": job_id,
        "tool": TOOL,
        "op": op,
        "ok": false,
        "result": null,
        "error": error,
        "elapsed_ms": started.elapsed().as_millis() as u64,
    })
}

/// A 48×16 PNG: white, with a filled 10×12 black block and a 3-px ring
/// beside it, built in memory so the self test needs no file.
pub fn probe_png() -> Vec<u8> {
    let mut g = image::GrayImage::from_pixel(48, 16, image::Luma([255]));
    for y in 2..14 {
        for x in 4..14 {
            g.put_pixel(x, y, image::Luma([0]));
        }
        for x in 20..32 {
            if !(5..11).contains(&y) || !(23..29).contains(&x) {
                g.put_pixel(x, y, image::Luma([0]));
            }
        }
    }
    let mut out = Vec::new();
    DynamicImage::ImageLuma8(g)
        .write_to(&mut Cursor::new(&mut out), image::ImageOutputFormat::Png)
        .expect("a PNG encodes in memory");
    out
}

/// The job loop. Blocking; the runner starts it on its own thread and exits
/// the process if it ever returns, so Docker restarts the container.
pub fn run_job_agent(host: &str, port: u16) {
    let (job_topic, _) = baremetal_io::module_job(MODULE).expect("graphics_suite is a legal module token");
    let (result_topic, retain) = baremetal_io::module_result(MODULE).expect("graphics_suite is a legal module token");
    let limits = Limits::from_ini(CONFIG_INI);

    let client_id = format!("apk-worker-{MODULE}-{}", std::process::id());
    let mut options = MqttOptions::new(client_id, host, port);
    options.set_keep_alive(Duration::from_secs(30));
    // In: base64 image, a third larger than the file. Out: an SVG up to
    // max_result_bytes, or OCR boxes. Sized for the larger of the two.
    let ceiling = (limits.max_job_bytes / 3 * 4).max(limits.max_result_bytes) + 1024 * 1024;
    options.set_max_packet_size(ceiling, ceiling);
    if let Some((username, password)) = apkaudio_contracts::broker_auth::credentials() {
        options.set_credentials(username, password);
    }

    let (client, mut connection) = Client::new(options, 32);
    println!("🧰 [{MODULE}] worker listening on {job_topic}, answering on {result_topic}");
    for event in connection.iter() {
        apk_plugin_runner::tick();
        match event {
            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                let _ = client.try_subscribe(job_topic.clone(), QoS::AtLeastOnce);
            }
            Ok(Event::Incoming(Packet::Publish(p))) if p.topic == job_topic => {
                // One job taken off outgoing/job and run: this worker's packet (ROAD-3472).
                apk_plugin_runner::loopback::packet_received();
                let answer = handle_job(&p.payload, limits);
                println!(
                    "🧰 [{MODULE}] job {} op={} → ok={} ({} ms) {}",
                    answer["job_id"], answer["op"], answer["ok"], answer["elapsed_ms"], answer["error"]
                );
                // Counted, never `let _ =` (ROAD-3472): a refused publish is a failure on /telemetry.
                apk_plugin_runner::loopback::published(client.try_publish(result_topic.clone(), QoS::AtLeastOnce, retain, answer.to_string()).is_ok());
            }
            Ok(_) => {}
            Err(e) => {
                eprintln!("⚠️ [{MODULE}] broker session: {e}; retrying");
                std::thread::sleep(Duration::from_secs(2));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The manifest the binary compiles in parses, declares the loopback port
    /// and lists every key of config.ini's [graphics_suite] that code reads (ROAD-3472).
    #[test]
    fn the_compiled_in_manifest_parses_and_reads_every_config_key() {
        let manifest = apkaudio_contracts::embedded_manifest!().expect("agent.toml parses");
        assert_eq!(manifest.name, MODULE);
        assert_eq!(manifest.kind, "worker");
        assert_eq!(manifest.telemetry_port, 8231);
        let config = apk_plugin_runner::ini_to_json(CONFIG_INI);
        let keys: Vec<&str> = config[MODULE].as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(manifest.unread_config_keys(keys), Some(0), "a [graphics_suite] key nothing reads");
    }

    const LIMITS: Limits = Limits { max_job_bytes: 1 << 22, max_side_px: 4096, max_result_bytes: 1 << 22 };

    fn job(body: Value) -> Vec<u8> {
        body.to_string().into_bytes()
    }

    fn b64(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    #[test]
    fn an_ocr_job_comes_back_with_the_engines_reading() {
        use apkaudio_graphics_suite::ocr::{PROBE_PNG, PROBE_TEXT};
        let out = handle_job(&job(json!({"job_id": "o1", "op": "ocr", "filename": "p.png", "content_b64": b64(PROBE_PNG)})), LIMITS);
        assert_eq!(out["job_id"], "o1");
        assert_eq!(out["op"], "ocr");
        match OcrEngine::process_image(&decode(PROBE_PNG, 4096).unwrap()) {
            // The same answer the library gives for the same pixels.
            Ok(direct) => {
                assert_eq!(out["ok"], true, "{}", out["error"]);
                assert_eq!(out["result"], serde_json::to_value(direct).unwrap());
                assert_eq!(out["result"]["extracted_text"], PROBE_TEXT, "{}", out["result"]);
            }
            // No Tesseract on this host: the job says so instead of guessing.
            Err(e) => {
                eprintln!("SKIP reading check: {e}");
                assert_eq!(out["ok"], false);
                assert!(out["error"].as_str().unwrap().contains("Tesseract"), "{}", out["error"]);
            }
        }
    }

    #[test]
    fn an_ocr_job_carries_psm_and_whitelist_to_the_engine() {
        use apkaudio_graphics_suite::ocr::{OcrEngine, OcrOptions};
        // LOOSE-ocr-code-tokens: "IO-AE" in sans-serif, which a plain job reads "10-AE".
        let png: &[u8] = include_bytes!("../../lib/ocr_fixtures/ioae.png");
        let opts = OcrOptions { psm: Some(13), whitelist: Some("ABCDEFGHIJKLMNOPQRSTUVWXYZ-".into()) };
        let body = json!({"job_id": "c1", "op": "ocr", "content_b64": b64(png), "psm": 13, "whitelist": opts.whitelist});
        let out = handle_job(&job(body), LIMITS);
        match OcrEngine::process_image_opts(&decode(png, 4096).unwrap(), &opts) {
            Ok(direct) => {
                assert_eq!(out["ok"], true, "{}", out["error"]);
                assert_eq!(out["result"], serde_json::to_value(direct).unwrap());
                assert_eq!(out["result"]["extracted_text"], "IO-AE", "{}", out["result"]);
            }
            Err(e) => eprintln!("SKIP reading check: {e}"),
        }
    }

    #[test]
    fn a_vectorize_job_comes_back_as_svg_with_the_ring_hole_kept() {
        let out = handle_job(
            &job(json!({"job_id": "v1", "op": "vectorize", "filename": "scans/p.png", "content_b64": b64(&probe_png()), "threshold": 100})),
            LIMITS,
        );
        assert_eq!(out["ok"], true, "{}", out["error"]);
        let r = &out["result"];
        assert_eq!((r["width"].as_u64(), r["height"].as_u64(), r["path_count"].as_u64()), (Some(48), Some(16), Some(2)));
        assert_eq!(r["filename"], "p.svg");
        assert_eq!(r["threshold"], 100);
        let svg = r["svg_xml"].as_str().unwrap();
        assert!(svg.starts_with("<svg "), "{svg}");
        assert_eq!(svg.matches(" Z").count(), 3, "block + ring outline + ring hole: {svg}");
    }

    #[test]
    fn a_bad_job_is_answered_not_dropped() {
        let out = handle_job(b"not json", LIMITS);
        assert_eq!(out["ok"], false);
        assert!(out["job_id"].is_null());
        let out = handle_job(&job(json!({"op": "ocr", "content_b64": b64(&probe_png())})), LIMITS);
        assert_eq!(out["ok"], false, "no job_id");
        for (body, why) in [
            (json!({"job_id": "b", "op": "ocr"}), "no content"),
            (json!({"job_id": "b", "op": "ocr", "content_b64": "%%%"}), "bad base64"),
            (json!({"job_id": "b", "op": "ocr", "content_b64": b64(b"plain text, not pixels")}), "not an image"),
            (json!({"job_id": "b", "op": "sharpen", "content_b64": b64(&probe_png())}), "unknown op"),
            (json!({"job_id": "b", "content_b64": b64(&probe_png())}), "no op"),
            (json!({"job_id": "b", "op": "vectorize", "threshold": 300, "content_b64": b64(&probe_png())}), "threshold > 255"),
            (json!({"job_id": "b", "op": "vectorize", "threshold": "128", "content_b64": b64(&probe_png())}), "threshold as text"),
            (json!({"job_id": "b", "op": "ocr", "psm": 14, "content_b64": b64(&probe_png())}), "psm > 13"),
            (json!({"job_id": "b", "op": "ocr", "psm": "8", "content_b64": b64(&probe_png())}), "psm as text"),
            (json!({"job_id": "b", "op": "ocr", "whitelist": "", "content_b64": b64(&probe_png())}), "empty whitelist"),
            (json!({"job_id": "b", "op": "ocr", "whitelist": ["A"], "content_b64": b64(&probe_png())}), "whitelist as list"),
        ] {
            let out = handle_job(&job(body), LIMITS);
            assert_eq!((out["job_id"].as_str(), out["ok"].as_bool()), (Some("b"), Some(false)), "{why}: {}", out);
            assert!(out["error"].is_string(), "{why}");
        }
    }

    #[test]
    fn an_oversized_job_is_refused_by_bytes_by_side_and_by_answer() {
        let png = b64(&probe_png());
        let small = Limits { max_job_bytes: 10, ..LIMITS };
        let out = handle_job(&job(json!({"job_id": "s", "op": "ocr", "content_b64": png})), small);
        assert!(out["error"].as_str().unwrap().contains("at most 10"), "{}", out["error"]);
        let narrow = Limits { max_side_px: 32, ..LIMITS };
        let out = handle_job(&job(json!({"job_id": "s", "op": "ocr", "content_b64": png})), narrow);
        assert_eq!(out["ok"], false, "48 px wide past a 32 px cap");
        let terse = Limits { max_result_bytes: 50, ..LIMITS };
        let out = handle_job(&job(json!({"job_id": "s", "op": "vectorize", "content_b64": png})), terse);
        assert!(out["error"].as_str().unwrap().contains("raise the threshold"), "{}", out["error"]);
    }

    #[test]
    fn the_limits_come_from_config_ini() {
        assert_eq!(
            Limits::from_ini(CONFIG_INI),
            Limits { max_job_bytes: 33_554_432, max_side_px: 8192, max_result_bytes: 33_554_432 }
        );
        assert_eq!(
            Limits::from_ini("[graphics_suite]\n"),
            Limits { max_job_bytes: DEFAULT_MAX_JOB_BYTES, max_side_px: DEFAULT_MAX_SIDE_PX, max_result_bytes: DEFAULT_MAX_RESULT_BYTES }
        );
    }

    #[test]
    fn job_and_result_topics_are_this_modules() {
        let (job, retain) = baremetal_io::module_job(MODULE).unwrap();
        assert_eq!(job, "APK.audio/System/Protocols/graphics_suite/outgoing/job");
        assert!(!retain);
        let (result, retain) = baremetal_io::module_result(MODULE).unwrap();
        assert_eq!(result, "APK.audio/System/Protocols/graphics_suite/incoming/result");
        assert!(!retain);
    }
}
