// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// A file's name is the user's text, and it reaches innerHTML only through
// escapeHTML (src/lib/html.ts).
//
// schematicsFinder.ts once wrote fileItem.name into its template raw; the same
// defect then sat in svgConverter.ts (and CAPTURE.Vectorizer's copy of it) at
// the pipeline label, the download attribute and the metadata table. A file
// named `<img src=x onerror=…>.png` ran its handler on the Inspector tab.
//
// READ OFF THE SOURCE, not rendered: these modules import imagetracerjs, OCR
// and a DOM this lane does not have. The rule is structural — inside a template
// literal, every `${…fileItem.name…}` / `${…fileItem.relativePath…}` is wrapped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = ['../src/svgConverter.ts', '../src/schematicsFinder.ts'];

for (const rel of FILES) {
  test(`${rel}: every interpolated file name is escaped`, () => {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    const raw = [...src.matchAll(/\$\{([^}]*fileItem\.(?:name|relativePath)[^}]*)\}/g)]
      .map(m => m[1])
      .filter(expr => !/^\s*escapeHTML\(/.test(expr));
    assert.deepEqual(raw, [], `unescaped interpolation(s): ${raw.join(' | ')}`);
    assert.match(src, /import \{ escapeHTML \} from '\.\/lib\/html'/);
  });
}
