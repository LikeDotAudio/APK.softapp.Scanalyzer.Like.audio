// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ROAD-3482: the browser OCR (Engines 1 and 2 of src/ocr.ts) runs on this
// bundle's own Tesseract files, never jsDelivr's. Pinned exactly (package.json =
// scripts/ocr-assets.mjs PINS = what is installed), every file the build emits
// exists, every path ocrEngine.ts hands tesseract.js is under the page's own
// base, and no source calls createWorker() without them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINS, checkPins, ocrAssetMap, bundleUsesTesseract } from '../scripts/ocr-assets.mjs';
import { browserOptions, OCR_DIRS, CORE_FILES, TESSERACT_VERSION } from '../src/ocrEngine.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package.json pins the engine exactly, at the versions the asset script checks', () => {
  for (const [name, want] of Object.entries(PINS)) {
    assert.equal(pkg.dependencies[name], want, `${name} must be pinned exact at ${want}`);
  }
  assert.equal(TESSERACT_VERSION, PINS['tesseract.js']);
  checkPins(); // what is installed is what is pinned
});

test('every emitted engine file exists, under the paths ocrEngine.ts asks for', () => {
  const map = ocrAssetMap();
  for (const [published, src] of Object.entries(map)) {
    assert.ok(existsSync(src) && statSync(src).size > 0, `${published} ← ${src} is missing`);
  }
  assert.ok(map[OCR_DIRS.worker + 'worker.min.js']);
  assert.ok(map[OCR_DIRS.core + CORE_FILES.simd]);
  assert.ok(map[OCR_DIRS.core + CORE_FILES.plain]);
  assert.ok(map[OCR_DIRS.lang + 'eng.traineddata.gz']);
});

test('browserOptions: every path is same-origin, under the folder the page is served from', () => {
  const base = 'https://apk.audio/APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html?solo=1#/ocr';
  const dir = 'https://apk.audio/APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/';
  for (const simd of [true, false]) {
    const o = browserOptions(base, simd);
    assert.equal(o.workerBlobURL, false);
    for (const k of ['workerPath', 'corePath', 'langPath']) {
      assert.ok(o[k].startsWith(dir + 'ocr/'), `${k} = ${o[k]}`);
    }
    assert.equal(o.corePath, dir + OCR_DIRS.core + (simd ? CORE_FILES.simd : CORE_FILES.plain));
    assert.equal(o.langPath, dir + 'ocr/lang/eng-4.0.0_best_int');
  }
});

test('no source starts a Tesseract worker except ocrEngine.ts, and that one passes the paths', () => {
  const src = path.join(root, 'src');
  const offenders = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) { if (n !== 'vendor') walk(p); continue; }
      if (!/\.(ts|tsx|js|mjs)$/.test(n) || p.endsWith('ocrEngine.ts')) continue;
      const code = readFileSync(p, 'utf8');
      const startsEngine = /\bcreateWorker\s*\(/.test(code)
        || /^import\s+(?!type\b)[^;]*from\s+['"]tesseract\.js['"]/m.test(code)
        || /\bimport\s*\(\s*['"]tesseract\.js['"]\s*\)/.test(code);
      if (startsEngine) offenders.push(path.relative(root, p));
    }
  };
  walk(src);
  assert.deepEqual(offenders, []);
  const engine = readFileSync(path.join(src, 'ocrEngine.ts'), 'utf8');
  assert.match(engine, /const opts = browserOptions\(base\);/);
  assert.match(engine, /createWorker\('eng', OEM\.LSTM_ONLY, \{ \.\.\.opts, errorHandler: /);
  assert.equal((engine.match(/\bcreateWorker\('/g) ?? []).length, 1, 'one createWorker call, the one with the paths');
});

test('bundleUsesTesseract: files ship with the engine, and only with it', () => {
  const chunk = (ids) => ({ type: 'chunk', moduleIds: ids });
  assert.equal(bundleUsesTesseract({ a: chunk(['/x/src/main.tsx']) }), false);
  assert.equal(bundleUsesTesseract({ a: chunk(['/x/node_modules/tesseract.js/src/index.js']) }), true);
  assert.equal(bundleUsesTesseract({ a: chunk(['/x/node_modules/tesseract.js-core/index.js']) }), false);
  assert.equal(bundleUsesTesseract({ a: { type: 'chunk', modules: { 'C:\\x\\node_modules\\tesseract.js\\src\\index.js': {} } } }), true);
});
