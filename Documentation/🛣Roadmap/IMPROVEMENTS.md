# 🛣 Improvements — SCANALYZER.Like.audio (from the 2026-10-30 architecture audit)

What this repo should change to meet the standard, most valuable first. Source: [🔍Audits/ARCHITECTURE-AUDIT.md](../%F0%9F%94%8DAudits/ARCHITECTURE-AUDIT.md).
← [Roadmap](INDEX.md)

| # | Improvement | Category | Effort (S/M/L) | Evidence |
|---|---|---|---|---|
| 1 | Needs owner: set `SCAN_UPLOAD_TOKEN` on the cPanel public host. The bench half is decided and wired: the token sits in the secrets envelope, and Scanalyzer-API plus the analyzer worker compose pass it (owner recreates the stacks). | Boundary | S | `Web_Front/public/api/db.php` |

Everything else is delivered — see [🌍Publishing/DELIVERY.md](../%F0%9F%8C%8DPublishing/DELIVERY.md).
