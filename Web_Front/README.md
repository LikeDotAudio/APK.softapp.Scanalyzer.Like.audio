# Web_Front — the Scanalyzer app

The Scanalyzer's one front end: React 19 + Vite in the browser, the same bundle inside a
Tauri v2 window on the desktop (`src-tauri/`). What it shows and why is in the
[repo README](../README.md); this page is the working notes for this folder.

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build` → `dist/` (`tsc -b` currently fails on pre-existing errors; `npx vite build` alone succeeds — see `../Documentation/🔍Audits/KNOWN_ISSUES.md`) |
| `npm run preview` | serve `dist/` |
| `npm test` | `node --test test/*.test.mjs` — no runner beyond node's own |
| `npm run lint` | oxlint over `src/` (what CI runs) |
| `npm run tauri dev` | the desktop app |
| `npm run gen:logo` | regenerate the logo/favicon SVGs |
| `npm run gen:ucs-synonyms` | regenerate `src/ucsSynonyms.json` from `../../../DATATYPE/DATATYPE.soundfx.UCS` (or a path given as the first argument / `UCS_DIR`) |

`wasm_analyzer/` and `wasm_extractor/` wrap the core and the extractor engine for the
browser (`wasm-pack build wasm_analyzer --target web`); their Cargo paths point at
`../../../../PROCESSOR/PROCESSOR.SampleAnalyzer` and `../../../../CAPTURE/CAPTURE.Extractor-Engine`.

## Gates (`scripts/check-*.mjs`)

Run with `node scripts/<name>.mjs`; each compares against its `*.baseline.json`.
`check-discovery` (a deleted gate or test must not read as a pass), `check-effect-abort`,
`check-mount-reach` (a component nothing can open) and `check-public-api` (a PHP file in
`public/` nothing calls is served to anyone). The last two currently fail on
pre-existing files.

## The UCS in the front end

`groupColors.ts` (category hue, subcategory shade), `categoryEmoji.ts`, `ucsIndex.ts`
(legacy runner-up ids) and the synonym library: `ucsSynonyms.ts` (the matcher, import-free
so the tests execute it), `ucsSynonymData.ts` (bundles the two JSONs), `ucsSynonyms.json`
(generated — the UCS's own synonyms) and `ucsThesaurus.json` (hand-kept rings of words for
those words). Add a ring to the thesaurus by hand; `test/ucs-synonyms.test.mjs` fails if
it reaches no UCS word.
