// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//! The worker's self test: the runner answers `outgoing/selftest_run` with it.
//!
//! All `Depth::Own` — a worker has no hardware. The decisive checks run each
//! op on a PNG built in memory, so a pass means THIS image decodes PNG and
//! both engines answer through the job path a client uses.

use apkaudio_contracts::self_test::{Check, Depth, Report};

use crate::{CONFIG_INI, Limits, MODULE};

pub fn self_test(depth: Depth) -> Report {
    let mut report = Report::new(MODULE, depth);
    report.record(Check::from_result(
        "landing_spots_build",
        Depth::Own,
        "job, result and the self-test leaves address legal topics",
        landing_spots(),
    ));
    report.record(Check::from_result(
        "config_section_still_names_this_module",
        Depth::Own,
        "config.ini declares this module under the name the bus knows it by",
        config_declares_module(),
    ));
    report.record(Check::from_result(
        "an_ocr_job_reads_the_probe",
        Depth::Own,
        "an OCR job on a two-glyph PNG comes back ok with two characters",
        probe("ocr", |r| r["detected_characters"].as_array().map(Vec::len) == Some(2)),
    ));
    report.record(Check::from_result(
        "a_vectorize_job_traces_the_probe",
        Depth::Own,
        "a vectorize job on the same PNG comes back ok as an SVG of two paths",
        probe("vectorize", |r| r["path_count"].as_u64() == Some(2) && r["svg_xml"].as_str().is_some_and(|s| s.starts_with("<svg "))),
    ));
    report
}

fn landing_spots() -> Result<(), String> {
    use apkaudio_contracts::{baremetal_io, self_test as st};
    baremetal_io::module_job(MODULE).map_err(|e| format!("{e:?}"))?;
    baremetal_io::module_result(MODULE).map_err(|e| format!("{e:?}"))?;
    st::run_topic(MODULE).map_err(|e| format!("{e:?}"))?;
    Ok(())
}

fn config_declares_module() -> Result<(), String> {
    let wanted = format!("[{MODULE}]");
    if CONFIG_INI.lines().any(|line| line.trim() == wanted) {
        Ok(())
    } else {
        Err(format!("config.ini does not declare {wanted}"))
    }
}

fn probe(op: &str, good: impl Fn(&serde_json::Value) -> bool) -> Result<(), String> {
    use base64::Engine as _;
    let job = serde_json::json!({"job_id": "selftest", "op": op, "filename": "probe.png",
        "content_b64": base64::engine::general_purpose::STANDARD.encode(crate::probe_png())});
    let out = crate::handle_job(job.to_string().as_bytes(), Limits::from_ini(CONFIG_INI));
    if out["ok"].as_bool() == Some(true) && good(&out["result"]) {
        Ok(())
    } else {
        Err(format!("unexpected answer: ok={} error={}", out["ok"], out["error"]))
    }
}

pub fn self_test_json(depth_word: &str) -> String {
    apkaudio_contracts::self_test::run_as_json(MODULE, depth_word, self_test)
}

#[cfg(test)]
mod tests {
    use super::*;
    use apkaudio_contracts::self_test::Verdict;

    #[test]
    fn the_self_test_passes_against_this_build() {
        let report = self_test(Depth::Own);
        assert_eq!(report.verdict(), Verdict::Pass, "{}", report.headline());
    }
}
