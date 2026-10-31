# Feature table export (directory → CSV)

An idea carried from the retired `🛣Roadmap/open_items.md` (2026-10-31). The analyzer
(`PODS/POD.THIN/Softapps/PROCESSOR/PROCESSOR.SampleAnalyzer/SRC/core`) writes per-file `.PEAK`
sidecars and, with `--db-url`, database rows; its CLI (`core/src/Core/args.rs`) has no flat "one
row of features per file" export. `core/examples/ucs_rescore.rs --csv` writes UCS verdicts only
(name, category, subcategory, confidence, reason), not features. A CSV/Parquet feature table would
be the natural input for a calibration or validation pass, if one is ever run.
