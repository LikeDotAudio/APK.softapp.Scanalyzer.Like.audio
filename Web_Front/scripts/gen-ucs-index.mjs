// Regenerates the two UCS mirrors the front end carries — src/ucsIndex.ts (UCS_BY_ID:
// category_id -> [CATEGORY, SUBCATEGORY]) and src/categoryEmoji.ts (CATEGORY_EMOJI and
// SUBCATEGORY_EMOJI) — from the UCS category JSONs (the DATATYPE.soundfx.UCS repo, a
// sibling Softapp, the same source gen-ucs-synonyms.mjs reads).
// Run:  node scripts/gen-ucs-index.mjs [path/to/DATATYPE.soundfx.UCS]     (npm run gen:ucs-index)
//       node scripts/gen-ucs-index.mjs --check [path]   exit 1 if either file is stale
//
// ONLY THE DATA IS REWRITTEN. Each file is hand code (the accessors under the tables)
// around generated tables: this replaces the object literal of each named `export const`
// and the "Regenerate" header line, and leaves every other byte alone. So the accessors
// are edited in the .ts file as usual, and the tables are never edited by hand.
//
// REFUSES TO WRITE ON A BAD READ. A category file that will not parse, or a path with no
// categories, stops it before anything is written: an empty table would silently make
// every legacy runner-up unresolvable.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const pathArg = args.find(a => a !== '--check');
// scripts → Web_Front → SCANALYZER.Like.audio → SCANALYZER_SUITE → Softapps
const ucsDir = resolve(pathArg || process.env.UCS_DIR || join(here, '../../../../DATATYPE/DATATYPE.soundfx.UCS'));
const catDir = join(ucsDir, 'categories');

let files;
try {
  files = readdirSync(catDir).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
} catch (e) {
  console.error(`error: cannot list ${catDir}: ${e.message}`);
  process.exit(1);
}

const cats = [];
for (const f of files) {
  let d;
  try {
    d = JSON.parse(readFileSync(join(catDir, f), 'utf8'));
  } catch (e) {
    console.error(`error: ${f}: ${e.message} — nothing written`);
    process.exit(1);
  }
  if (!d.category || !Array.isArray(d.subcategories)) {
    console.error(`error: ${f}: no category/subcategories — nothing written`);
    process.exit(1);
  }
  cats.push(d);
}
if (!cats.length) {
  console.error(`error: no category files in ${catDir} — nothing written`);
  process.exit(1);
}
cats.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

const versions = [...new Set(cats.map(c => c.version).filter(Boolean))].sort();
const subCount = cats.reduce((n, c) => n + c.subcategories.length, 0);
const stamp = `${subCount} subcategories in ${cats.length} categories, UCS ${versions.join(' + ')}`;

const ident = k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k.replace(/'/g, "\\'")}'`);
const sq = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const dq = s => JSON.stringify(String(s));

// UCS_BY_ID — sorted by id (code-unit order, as the table has always been).
const byId = new Map();
for (const c of cats) {
  for (const s of c.subcategories) {
    if (!s.category_id) continue;
    if (byId.has(s.category_id)) console.warn(`warn: ${s.category_id} appears twice; first kept`);
    else byId.set(s.category_id, [c.category, s.subcategory]);
  }
}
// RETIRED IDS ARE KEPT. The map exists for records the old engine wrote, so an id the
// taxonomy has since dropped (MUSICAL's MUSC*, MUSICPROD's MUSP*, retired when the 8.2.APK
// instrument categories arrived) must still resolve: an id already in the table and absent
// from the source is carried over unchanged. Only ever added to, never pruned.
const indexFile = join(here, '../src/ucsIndex.ts');
let retired = 0;
for (const m of readFileSync(indexFile, 'utf8').matchAll(/^  '?([^':\s]+)'?: \['((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\],$/gm)) {
  if (!byId.has(m[1])) { byId.set(m[1], [m[2], m[3]]); retired++; }
}
const idRows = [...byId.keys()].sort().map(id => {
  const [cat, sub] = byId.get(id);
  return `  ${ident(id)}: [${sq(cat)}, ${sq(sub)}],`;
});

const catRows = cats.filter(c => c.emoji).map(c => `  ${dq(c.category)}: ${dq(c.emoji)},`);
const subRows = cats.map(c => {
  const pairs = c.subcategories
    .filter(s => s.emoji)
    .map(s => [s.subcategory, s.emoji])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${dq(k)}: ${dq(v)}`);
  return pairs.length ? `  ${dq(c.category)}: { ${pairs.join(', ')} },` : null;
}).filter(Boolean);

/** Replace the body of `export const NAME ... = {` up to the first line that is `};`. */
function replaceTable(src, name, rows, file) {
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${file}: no \`export const ${name}\``);
  const open = src.indexOf('{\n', start);
  const close = src.indexOf('\n};', open);
  if (open < 0 || close < 0) throw new Error(`${file}: cannot find the body of ${name}`);
  return src.slice(0, open + 2) + rows.join('\n') + src.slice(close);
}

function stampHeader(src, line) {
  return src.replace(/^\/\/ (?:them for the UI\. )?Regenerate whenever the taxonomy changes.*$/m, line);
}

const outputs = [
  {
    file: indexFile,
    build(src) {
      src = stampHeader(src, `// Regenerate whenever the taxonomy changes (${stamp}; ${retired} retired ids kept): npm run gen:ucs-index.`);
      return replaceTable(src, 'UCS_BY_ID', idRows, 'ucsIndex.ts');
    },
  },
  {
    file: join(here, '../src/categoryEmoji.ts'),
    build(src) {
      src = stampHeader(src, `// them for the UI. Regenerate whenever the taxonomy changes (${stamp}): npm run gen:ucs-index.`);
      src = replaceTable(src, 'CATEGORY_EMOJI', catRows, 'categoryEmoji.ts');
      return replaceTable(src, 'SUBCATEGORY_EMOJI', subRows, 'categoryEmoji.ts');
    },
  },
];

let stale = 0;
for (const o of outputs) {
  const before = readFileSync(o.file, 'utf8');
  const after = o.build(before);
  if (before === after) {
    console.log(`up to date: ${o.file}`);
    continue;
  }
  stale++;
  if (check) console.error(`stale: ${o.file} — run npm run gen:ucs-index`);
  else {
    writeFileSync(o.file, after);
    console.log(`wrote ${o.file}`);
  }
}
console.log(`${byId.size} ids (${retired} retired, kept), ${catRows.length} category emoji (${stamp})`);
if (check && stale) process.exit(1);
