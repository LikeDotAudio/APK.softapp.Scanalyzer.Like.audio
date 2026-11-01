// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ocrEngine.ts — the browser's Tesseract, self-hosted (ROAD-3482).
 *
 * Owns: where Engines 1 and 2 of ocr.ts load their worker, wasm core and English
 * data from, and starting one worker with those paths.
 *
 * Must not: let tesseract.js fall back to its defaults. Left alone, createWorker()
 * fetches all three from cdn.jsdelivr.net; here every path is this bundle's own:
 *
 *   workerPath  ocr/tesseract.js-7.0.0/worker.min.js      started directly
 *               (workerBlobURL: false), so no blob: shim a CSP would have to allow
 *   corePath    ocr/tesseract.js-core-7.0.0/<one file>   the SIMD+LSTM build when
 *               this browser validates a SIMD module, else the plain LSTM build;
 *               naming the file skips the library's own probe and its CDN default
 *   langPath    ocr/lang/eng-4.0.0_best_int              eng.traineddata.gz, kept in
 *               IndexedDB by tesseract.js after the first read
 *
 * scripts/ocr-assets.mjs puts those files into dist/ocr/ (and serves them in dev),
 * pinned to the same versions as WEB.SPOG's OCR (tesseract.js 7.0.0,
 * tesseract.js-core 7.0.0, @tesseract.js-data/eng 1.0.0).
 *
 * Non-obvious constraints:
 *   - The URLs are ABSOLUTE: the core and the data are fetched from inside the
 *     worker, where a relative path would resolve against the worker script.
 *   - The base is the page's own URL (document.baseURI). The bundle is built with
 *     base './' and served from a folder (…/Web_Front/dist/), so ocr/ sits beside
 *     index.html wherever that is.
 *   - A worker that cannot start rejects. Nothing here turns that into "no text".
 */
import type { PSM, Worker as TessWorker } from 'tesseract.js';

export const TESSERACT_VERSION = '7.0.0';
export const OCR_DIRS = {
  worker: `ocr/tesseract.js-${TESSERACT_VERSION}/`,
  core: `ocr/tesseract.js-core-${TESSERACT_VERSION}/`,
  lang: 'ocr/lang/eng-4.0.0_best_int/',
} as const;
export const CORE_FILES = { simd: 'tesseract-core-simd-lstm.wasm.js', plain: 'tesseract-core-lstm.wasm.js' } as const;

export interface EngineOptions {
  workerPath: string;
  corePath: string;
  langPath: string;
  workerBlobURL: false;
}

/** The smallest module using a v128 op (wasm-feature-detect's `simd` probe). */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function hasWasmSimd(wasm: Pick<typeof WebAssembly, 'validate'> | undefined = globalThis.WebAssembly): boolean {
  try { return !!wasm && wasm.validate(SIMD_PROBE); } catch { return false; }
}

/** Every path tesseract.js would otherwise take from jsDelivr, as same-origin URLs under `base`. */
export function browserOptions(base: string, simd = hasWasmSimd()): EngineOptions {
  const at = (p: string): string => new URL(p, base).href;
  return {
    workerPath: at(OCR_DIRS.worker + 'worker.min.js'),
    corePath: at(OCR_DIRS.core + (simd ? CORE_FILES.simd : CORE_FILES.plain)),
    langPath: at(OCR_DIRS.lang).replace(/\/$/, ''),
    workerBlobURL: false,
  };
}

/** One English LSTM worker on this bundle's own engine files, with its page
 *  segmentation mode set. A failed start or a refused parameter is thrown. */
export async function createOcrWorker(psm: PSM | `${PSM}`, base: string = document.baseURI): Promise<TessWorker> {
  const { createWorker, OEM } = await import('tesseract.js');
  const opts = browserOptions(base);
  // tesseract.js 7 settles createWorker() only for a worker script that fails to
  // load (and then with no reason: undefined). A core or language file that fails
  // inside the worker reaches errorHandler and nothing else: without one it is
  // thrown uncaught and createWorker() never settles, so the panel would wait
  // forever. The handler turns it into this rejection. (The half-started worker is
  // unreachable then and stays idle; the next run starts a fresh one.)
  let failed!: (reason: unknown) => void;
  const failure = new Promise<never>((_, reject) => { failed = reject; });
  let worker: TessWorker;
  try {
    worker = await Promise.race([
      createWorker('eng', OEM.LSTM_ONLY, { ...opts, errorHandler: (e: unknown) => failed(e) }),
      failure,
    ]);
  } catch (err) {
    const why = err instanceof Error ? err.message : err === undefined ? 'no reason given' : String(err);
    throw new Error(`Tesseract engine did not start (worker ${opts.workerPath}): ${why}`, { cause: err });
  }
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm as PSM });
  } catch (err) {
    await worker.terminate();
    throw err;
  }
  return worker;
}
