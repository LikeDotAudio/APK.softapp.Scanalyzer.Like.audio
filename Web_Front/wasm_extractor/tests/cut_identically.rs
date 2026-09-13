// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//! The executable form of this crate's reason to exist: web and desktop cut identically.
//!
//! `extractor_engine`'s header claims that the WASM build and the native desktop build
//! "call these exact functions and therefore cut identically". Eleven unit tests in that
//! crate prove the DSP; none of them crosses a wrapper. This suite drives ONE fixture
//! through both wrappers' code paths and asserts the answers are the same object:
//!
//!   native  — `extractor_engine::detect_regions_from_samples` / `slice_region` /
//!             `encode_wav_pcm16`, which is literally what `src-tauri/src/lib.rs:236-250`
//!             calls in process for the desktop Extractor;
//!   wrapper — `ExtractorSession::detect` / `slice_wav`, this crate's public surface, the
//!             one the browser reaches through wasm-bindgen.
//!
//! It runs under a plain `cargo test` on the host, deliberately: `#[wasm_bindgen]` items
//! compile for non-wasm targets, and what can drift between the two paths is Rust —
//! parameter defaulting, JSON field names, the fade curve the wrapper hardcodes, the
//! empty-input guards. wasm-bindgen's own codegen is not this repository's code and is
//! covered by `cargo check --target wasm32-unknown-unknown` in `check.sh scan-extractor`.
//! Executing the same assertions INSIDE a browser needs `wasm-pack test --headless`, a
//! browser binary and a network fetch of the test runner — a `browser` gate, not this one.
//!
//! PLAN-109.03 step 3.

use extractor_engine::{
    detect_regions_from_samples, encode_wav_pcm16, slice_region, DetectParams, FadeCurve, Region,
};
use wasm_extractor::ExtractorSession;

const SAMPLE_RATE: u32 = 44_100;

/// Four bursts of decaying tone separated by silence — enough structure that a drifted
/// gate, hop or pad shows up as a different region count or a different edge, not as a
/// rounding difference.
fn fixture() -> Vec<f32> {
    let sr = SAMPLE_RATE as f32;
    let mut pcm = vec![0.0f32; (sr * 0.25) as usize];
    for burst in 0..4 {
        let length = (sr * (0.18 + 0.05 * burst as f32)) as usize;
        for i in 0..length {
            let t = i as f32 / sr;
            let decay = (-9.0 * t).exp();
            let hz = 220.0 * (burst as f32 + 1.0);
            pcm.push((t * hz * std::f32::consts::TAU).sin() * 0.8 * decay);
        }
        pcm.extend(std::iter::repeat(0.0).take((sr * 0.4) as usize));
    }
    pcm
}

fn assert_same_regions(native: &[Region], wrapper: &[Region], what: &str) {
    assert_eq!(
        native.len(),
        wrapper.len(),
        "{what}: native cut {} regions, the wasm wrapper cut {}",
        native.len(),
        wrapper.len()
    );
    for (n, w) in native.iter().zip(wrapper) {
        assert_eq!(n.index, w.index, "{what}: index");
        assert_eq!(n.start_seconds, w.start_seconds, "{what}: region {} start", n.index);
        assert_eq!(n.end_seconds, w.end_seconds, "{what}: region {} end", n.index);
        assert_eq!(
            n.duration_seconds, w.duration_seconds,
            "{what}: region {} duration", n.index
        );
        assert_eq!(
            n.peak_amplitude, w.peak_amplitude,
            "{what}: region {} peak", n.index
        );
        assert_eq!(n.name, w.name, "{what}: region {} name", n.index);
        assert_eq!(
            n.fade_in_seconds, w.fade_in_seconds,
            "{what}: region {} fade in", n.index
        );
        assert_eq!(
            n.fade_out_seconds, w.fade_out_seconds,
            "{what}: region {} fade out", n.index
        );
    }
}

fn wrapper_regions(session: &ExtractorSession, parameters_json: &str) -> Vec<Region> {
    serde_json::from_str(&session.detect(parameters_json))
        .expect("the wrapper's detect() must return a JSON array of Region")
}

#[test]
fn the_two_paths_detect_the_same_regions() {
    let pcm = fixture();
    let parameters = DetectParams::default();
    let parameters_json = serde_json::to_string(&parameters).expect("DetectParams serialises");

    let native = detect_regions_from_samples(&pcm, SAMPLE_RATE, &parameters);
    let session = ExtractorSession::new(&pcm, SAMPLE_RATE);
    let wrapper = wrapper_regions(&session, &parameters_json);

    assert!(
        native.len() >= 4,
        "the fixture must actually cut, or this test proves nothing (got {})",
        native.len()
    );
    assert_same_regions(&native, &wrapper, "explicit parameters");
}

/// The wrapper falls back to `DetectParams::default()` on empty or unparseable JSON.
/// If that fallback ever stops matching the native default, the browser silently cuts on
/// different gates than the desktop — which is precisely the TypeScript/Rust drift this
/// crate replaced.
#[test]
fn the_wrappers_parameter_fallback_is_the_native_default() {
    let pcm = fixture();
    let native = detect_regions_from_samples(&pcm, SAMPLE_RATE, &DetectParams::default());
    let session = ExtractorSession::new(&pcm, SAMPLE_RATE);

    for junk in ["", "{}", "not json at all"] {
        assert_same_regions(&native, &wrapper_regions(&session, junk), junk);
    }
}

/// A non-default parameter set has to travel across the JSON boundary intact, or the
/// sliders move the web build and not the desktop one.
#[test]
fn non_default_parameters_survive_the_json_boundary() {
    let pcm = fixture();
    let parameters = DetectParams {
        open_threshold_db: -30.0,
        close_threshold_db: -38.0,
        minimum_silence_seconds: 0.30,
        minimum_region_seconds: 0.10,
        attack_pad_seconds: 0.020,
        release_pad_seconds: 0.060,
        transient_aware: false,
        snap_zero_crossing: false,
        noise_floor_margin_db: 6.0,
    };
    let parameters_json = serde_json::to_string(&parameters).expect("DetectParams serialises");

    let native = detect_regions_from_samples(&pcm, SAMPLE_RATE, &parameters);
    let session = ExtractorSession::new(&pcm, SAMPLE_RATE);
    assert_same_regions(&native, &wrapper_regions(&session, &parameters_json), "tightened parameters");
}

/// Detecting identically is half of it — the bytes written out have to match too. The
/// wrapper hardcodes `FadeCurve::Linear`; so does the Tauri command. If either changes
/// alone, the same region exports as two different files.
#[test]
fn the_two_paths_export_the_same_wav_bytes() {
    let pcm = fixture();
    let parameters = DetectParams::default();
    let parameters_json = serde_json::to_string(&parameters).expect("DetectParams serialises");
    let session = ExtractorSession::new(&pcm, SAMPLE_RATE);

    let mut regions = detect_regions_from_samples(&pcm, SAMPLE_RATE, &parameters);
    assert!(!regions.is_empty());
    // Fades are Extractor-only fields the caller sets after detection; carry non-zero
    // ones so the fade ramp is part of what is being compared.
    for r in regions.iter_mut() {
        r.fade_in_seconds = 0.005;
        r.fade_out_seconds = 0.020;
    }

    for region in &regions {
        let slice = slice_region(&pcm, SAMPLE_RATE, region, FadeCurve::Linear);
        let native_wav = encode_wav_pcm16(&slice, SAMPLE_RATE);
        let wrapper_wav = session.slice_wav(&serde_json::to_string(region).unwrap());
        assert_eq!(
            native_wav, wrapper_wav,
            "region {} exported {} native bytes and {} wrapper bytes",
            region.index,
            native_wav.len(),
            wrapper_wav.len()
        );
        assert!(native_wav.starts_with(b"RIFF"), "region {} is not a WAV", region.index);
    }

    // And the parameters the detect call used are still what the wrapper reports, so the
    // export above was taken from the same cut as the detect above.
    assert_same_regions(
        &detect_regions_from_samples(&pcm, SAMPLE_RATE, &parameters),
        &wrapper_regions(&session, &parameters_json),
        "post-export",
    );
}

/// The empty-input guard is in the engine, not in the wrapper. Both must return nothing
/// rather than one of them panicking across the wasm boundary.
#[test]
fn both_paths_refuse_an_empty_buffer_the_same_way() {
    let parameters = DetectParams::default();
    let parameters_json = serde_json::to_string(&parameters).unwrap();
    let session = ExtractorSession::new(&[], SAMPLE_RATE);
    assert_same_regions(
        &detect_regions_from_samples(&[], SAMPLE_RATE, &parameters),
        &wrapper_regions(&session, &parameters_json),
        "empty buffer",
    );
}
