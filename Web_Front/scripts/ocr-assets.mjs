// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * scripts/ocr-assets.mjs — the self-hosted Tesseract files (ROAD-3482), put where
 * src/ocrEngine.ts looks for them:
 *
 *   ocr/tesseract.js-7.0.0/worker.min.js
 *   ocr/tesseract.js-core-7.0.0/tesseract-core-simd-lstm.wasm.js
 *   ocr/tesseract.js-core-7.0.0/tesseract-core-lstm.wasm.js
 *   ocr/lang/eng-4.0.0_best_int/eng.traineddata.gz
 *
 * The same pins and layout as WEB.SPOG's SETUP/ocr-assets.mjs (WEB.SPOG 42ac458).
 *
 * Owns: the pin check (an installed version that differs from the pin stops the
 * build — a path that says 7.0.0 must hold 7.0.0), emitting the files into the
 * build's outDir beside index.html, and serving them under `vite` (dev).
 *
 * Must not: ship ~10 MB of engine for code the bundle does not contain. The files
 * are emitted only when tesseract.js is in the output; a build without it says so
 * on the console. The engine and its files therefore travel together, and both
 * routes that build this page — `npx vite build --base ./` in the root
 * .apk.deploy.ini (FTPS to apk.audio walks dist/) and Docker/dist.Dockerfile
 * (WEB.Frontend-Assets copies its output) — pick them up from vite.config.ts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NM = join(ROOT, 'node_modules');
export const PINS = { 'tesseract.js': '7.0.0', 'tesseract.js-core': '7.0.0', '@tesseract.js-data/eng': '1.0.0' };

/** published path → source file */
export function ocrAssetMap() {
  const v = PINS['tesseract.js'], cv = PINS['tesseract.js-core'];
  return {
    [`ocr/tesseract.js-${v}/worker.min.js`]: join(NM, 'tesseract.js/dist/worker.min.js'),
    [`ocr/tesseract.js-core-${cv}/tesseract-core-simd-lstm.wasm.js`]: join(NM, 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
    [`ocr/tesseract.js-core-${cv}/tesseract-core-lstm.wasm.js`]: join(NM, 'tesseract.js-core/tesseract-core-lstm.wasm.js'),
    'ocr/lang/eng-4.0.0_best_int/eng.traineddata.gz': join(NM, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
  };
}

export function checkPins() {
  for (const [pkg, want] of Object.entries(PINS)) {
    const pj = join(NM, pkg, 'package.json');
    const have = existsSync(pj) ? JSON.parse(readFileSync(pj, 'utf8')).version : 'missing';
    if (have !== want) throw new Error(`ocr-assets: ${pkg} is ${have}, pinned ${want} — run npm ci`);
  }
}

/** True when any output chunk carries a module from the tesseract.js package. */
export function bundleUsesTesseract(bundle) {
  const isTess = (id) => /[\\/]node_modules[\\/]tesseract\.js[\\/]/.test(id);
  return Object.values(bundle).some((out) => out.type === 'chunk'
    && (out.moduleIds ?? Object.keys(out.modules ?? {})).some(isTess));
}

const TYPES = { '.js': 'text/javascript', '.gz': 'application/octet-stream' };

export function ocrAssetsPlugin() {
  return {
    name: 'ocr-assets',
    buildStart() { checkPins(); },
    generateBundle(_options, bundle) {
      // Only the page's own bundle runs this hook (worker bundles take `worker.plugins`).
      if (!bundleUsesTesseract(bundle)) {
        console.log('ocr-assets: tesseract.js is not in this bundle; OCR engine files not emitted');
        return;
      }
      for (const [fileName, src] of Object.entries(ocrAssetMap())) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(src) });
      }
    },
    configureServer(server) {
      const map = ocrAssetMap();
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const src = map[path];
        if (!src) return next();
        res.setHeader('Content-Type', TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream');
        res.end(readFileSync(src));
      });
    },
  };
}
