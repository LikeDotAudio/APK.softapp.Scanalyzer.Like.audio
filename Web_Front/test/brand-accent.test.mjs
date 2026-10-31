// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// WS-07 (SDK/contracts audit): the brand accent is the contract's token, never
// spelt by hand — not as #f4902c and not as its rgb(244,144,44) triple.
// Exempt: src/vendor/ (the vendored token itself) and src/percent-fill.css, a
// byte-identical mirror of APK:OS/core/theme/percent-fill.css (PLAN-924.03:
// "edit all of them, or none"); there the triple is only var()'s fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src', import.meta.url));
const EXEMPT = new Set([path.join(src, 'vendor'), path.join(src, 'percent-fill.css')]);
const SPELLINGS = /#f4902c|244\s*,\s*144\s*,\s*44/i;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (EXEMPT.has(p)) continue;
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|css|js|mjs)$/.test(name)) yield p;
  }
}

test('no file spells the brand accent by hand', () => {
  const hits = [];
  for (const f of files(src)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (SPELLINGS.test(line)) hits.push(`${path.relative(src, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], 'use ACCENT / accentRgba() from src/brand.ts or var(--apk-accent[-rgb])');
});
