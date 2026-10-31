# 🛣 Improvements — SCANALYZER.Like.audio (from the 2026-10-30 architecture audit)

What this repo should change to meet the standard, most valuable first. Source: [🔍Audits/ARCHITECTURE-AUDIT.md](../%F0%9F%94%8DAudits/ARCHITECTURE-AUDIT.md).
← [Roadmap](INDEX.md)

| # | Improvement | Category | Effort (S/M/L) | Evidence |
|---|---|---|---|---|
| 1 | Needs owner: decide on and set `SCAN_UPLOAD_TOKEN` (bench compose env, cPanel host) — the code enforces it once set. | Boundary | S | `Web_Front/public/api/db.php` |
| 2 | Needs owner: tag releases (`v0.1.0`) of this app and of the pinned crates. | Change management | S | `Web_Front/package.json` |

Everything else is delivered — see [🌍Publishing/DELIVERY.md](../%F0%9F%8C%8DPublishing/DELIVERY.md).
