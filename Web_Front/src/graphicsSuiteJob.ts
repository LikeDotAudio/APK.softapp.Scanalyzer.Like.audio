// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * OCR and raster→SVG as jobs for Worker-GRAPHICS_SUITE (this repository's own
 * graphics_suite_rs/SRC, pod POD.workers) instead of private HTTP routes (SDK
 * audit DS-02).
 *
 *   outgoing/job     {"job_id", "op": "ocr" | "vectorize", "filename", "content_b64"[, "threshold"]
 *                    | ocr only: [, "psm", "whitelist"]}
 *   incoming/result  {"job_id", "ok", "result", "error"}   (result = what /api/ocr and
 *                    /api/to-svg answered: `extracted_text`…, `svg_xml`/`path_count`)
 *
 * Only these two ops are workers; `/api/analyze-image`, `/api/photo-id`, the DOCX
 * and DXF routes have no worker op, so they stay on the micro-API — and so does
 * any page with no bus (the published site, the desktop app), where `viaBus`
 * answers null and the caller falls back to HTTP.
 *
 * Erasable types only, so node's own test runner imports it (test/graphics-suite-job.test.mjs).
 */
import { bytesToBase64, newJobId, type BusClientLike } from './sampleConversionJob.ts';
// @ts-expect-error TS7016 — untyped vendored ES module (see sampleConversionJob.ts)
import { Topics as ContractTopics } from './vendor/apk-contracts/apk-contracts.mjs';
const Topics: { protocols: { topic(address: { proto: string; path: string[] }): string } } = ContractTopics;

/** The worker's bus token (`[graphics_suite]` in graphics_suite_rs/SRC/config.ini). */
export const GRAPHICS_TOKEN = 'graphics_suite';
/** The worker's ops (graphics_suite_rs/SRC/src/lib.rs `OPS`). Wire constants. */
export const GRAPHICS_OPS = ['ocr', 'vectorize'] as const;
export type GraphicsOp = typeof GRAPHICS_OPS[number];

export function graphicsTopics(token: string = GRAPHICS_TOKEN) {
  const leaf = (...path: string[]): string => Topics.protocols.topic({ proto: token, path });
  return { job: leaf('outgoing', 'job'), result: leaf('incoming', 'result') };
}

/** An OCR job's reading options (graphics_suite_rs/src/ocr.rs `OcrOptions`,
 *  LOOSE-web-front-ocr-options): `psm` is Tesseract's page segmentation mode
 *  (8 one word, 13 raw line for a lone label) and `whitelist` the only
 *  characters it may answer. Together they read a code token like "IO-AE",
 *  which the page reading answers "10-AE". Absent = the page reading. */
export interface OcrJobOptions { psm?: number; whitelist?: string }
/** The worker's limit (ocr.rs `MAX_WHITELIST_CHARS`). Wire constant. */
export const MAX_WHITELIST_CHARS = 512;

/** The checked OCR fields, or a thrown RangeError naming the bad one: the
 *  worker would refuse them anyway, and quietly dropping one would answer a
 *  reading the caller did not ask for. */
export function ocrJobFields(opts: OcrJobOptions = {}): { psm?: number; whitelist?: string } {
  const out: { psm?: number; whitelist?: string } = {};
  if (opts.psm !== undefined) {
    if (!Number.isInteger(opts.psm) || opts.psm < 0 || opts.psm > 13) throw new RangeError(`psm ${opts.psm} is not a Tesseract page segmentation mode (0-13)`);
    out.psm = opts.psm;
  }
  if (opts.whitelist !== undefined) {
    const w = opts.whitelist;
    if (typeof w !== 'string' || w.length === 0) throw new RangeError('whitelist is empty: it would allow no character at all (leave it out for any)');
    if ([...w].length > MAX_WHITELIST_CHARS) throw new RangeError(`whitelist is longer than ${MAX_WHITELIST_CHARS} characters`);
    if (/\p{Cc}/u.test(w)) throw new RangeError('whitelist holds a control character');
    out.whitelist = w;
  }
  return out;
}

/** `threshold` (vectorize, 0-255) as a bare number, as before, or an options
 *  object: `{threshold}` for vectorize, `{psm, whitelist}` for ocr. */
export type GraphicsJobOptions = number | ({ threshold?: number } & OcrJobOptions);

export function buildGraphicsJob(jobId: string, op: GraphicsOp, filename: string, contentB64: string, options?: GraphicsJobOptions) {
  const job: Record<string, unknown> = { job_id: jobId, op, filename: filename.split(/[\\/]/).pop() || 'image.png', content_b64: contentB64 };
  const o = typeof options === 'number' ? { threshold: options } : (options ?? {});
  const threshold = o.threshold;
  if (op === 'vectorize' && Number.isInteger(threshold) && (threshold as number) >= 0 && (threshold as number) <= 255) job.threshold = threshold;
  if (op === 'ocr') Object.assign(job, ocrJobFields(o));
  return job as { job_id: string };
}

/** The micro-API's `/api/ocr` URL path for the same options (`?psm=…&whitelist=…`,
 *  graphics_suite_rs/src/server.rs), for the page with no bus. */
export function ocrApiPath(opts: OcrJobOptions = {}): string {
  const f = ocrJobFields(opts);
  const q = new URLSearchParams();
  if (f.psm !== undefined) q.set('psm', String(f.psm));
  if (f.whitelist !== undefined) q.set('whitelist', f.whitelist);
  const s = q.toString();
  return s ? `/api/ocr?${s}` : '/api/ocr';
}

/** The `result` of the answer to `jobId`, `{error}` for a refusal, or null when
 *  the payload is someone else's answer. */
export function readGraphicsResult(payload: string, jobId: string): { ok: boolean; result: any; error: string | null } | null {
  let doc: any;
  try { doc = JSON.parse(payload); } catch { return null; }
  if (!doc || doc.job_id !== jobId) return null;
  return { ok: doc.ok === true, result: doc.result ?? null, error: doc.ok === true ? null : String(doc.error ?? 'refused') };
}

/** Send one job and wait for its answer (subscribe first, then publish). */
export function requestGraphicsJob(client: BusClientLike, job: { job_id: string }, timeoutMs: number, token = GRAPHICS_TOKEN): Promise<any> {
  const topics = graphicsTopics(token);
  const decoder = new TextDecoder();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.removeListener('message', onMessage);
      client.unsubscribe(topics.result);
      fn();
    };
    const onMessage = (topic: string, payload: Uint8Array) => {
      if (topic !== topics.result) return;
      const read = readGraphicsResult(decoder.decode(payload), job.job_id);
      if (!read) return;
      finish(() => (read.ok ? resolve(read.result) : reject(new Error(read.error ?? 'refused'))));
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`no answer from Worker-GRAPHICS_SUITE in ${Math.round(timeoutMs / 1000)} s`))), timeoutMs);
    client.on('message', onMessage);
    client.subscribe(topics.result, { qos: 1 }, (err) => {
      if (err) { finish(() => reject(err)); return; }
      client.publish(topics.job, JSON.stringify(job), { qos: 1, retain: false }, (perr) => {
        if (perr) finish(() => reject(perr));
      });
    });
  });
}

/** Run `op` on the worker if this page has a bus; null when it has none (or the
 *  worker does not answer), so the caller can fall back to the micro-API. */
export async function viaBus(
  connect: () => Promise<BusClientLike>, op: GraphicsOp, filename: string, bytes: ArrayBuffer, timeoutMs = 15_000,
  options?: GraphicsJobOptions,
): Promise<any | null> {
  // Bad options are the caller's error, not a reason to try the micro-API.
  const job = buildGraphicsJob(newJobId(), op, filename, bytesToBase64(new Uint8Array(bytes)), options);
  let client: BusClientLike;
  try { client = await connect(); } catch { return null; }
  try {
    return await requestGraphicsJob(client, job, timeoutMs);
  } catch (err) {
    console.warn(`graphics_suite ${op} over the bus failed; using the micro-API`, err);
    return null;
  }
}

/** What the worker's / micro-API's `extracted_text` says when Tesseract read
 *  nothing (graphics_suite_rs/src/ocr.rs `NO_TEXT`). Wire constant. */
export const OCR_NO_TEXT = 'No OCR text detected';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface OcrReadingWord { text: string; confidence: number; bbox: Box }
export interface OcrReadingLine { text: string; confidence: number; bbox: Box; words: OcrReadingWord[] }
/** One Tesseract reading in the page's terms: confidence 0-100 as tesseract.js
 *  reports it, or null when there is no word to measure. */
export interface OcrReading { text: string; confidence: number | null; wordCount: number; lines: OcrReadingLine[] }

/**
 * An `ocr` answer (ocr.rs `OcrResult`: `extracted_text`, `word_regions` with
 * 0-1 confidences and x/y/width/height boxes) as a reading the page can weigh
 * beside tesseract.js (LOOSE-web-front-engine3-shape-only). Engine 3 is real
 * Tesseract since LOOSE-ocr-not-recognition, so its words and confidence are
 * kept, not thrown away. Lines follow the text's newlines (one TSV word per
 * space-separated token, in order); the page confidence is the mean word
 * confidence; `wordCount` counts words as the tesseract.js engines do (longer
 * than one character, confidence above 15). The NO_TEXT sentinel is no text.
 */
export function readingFromOcrResult(res: any): OcrReading {
  const raw = typeof res?.extracted_text === 'string' ? res.extracted_text : '';
  const text = raw === OCR_NO_TEXT ? '' : raw;
  const regions: any[] = Array.isArray(res?.word_regions) ? res.word_regions : [];
  const words: OcrReadingWord[] = regions
    .filter(r => r && typeof r.text === 'string' && r.text.length > 0)
    .map(r => {
      const x = Number(r.x) || 0, y = Number(r.y) || 0;
      return {
        text: r.text,
        confidence: Math.round(Math.min(1, Math.max(0, Number(r.confidence) || 0)) * 100),
        bbox: { x0: x, y0: y, x1: x + (Number(r.width) || 0), y1: y + (Number(r.height) || 0) },
      };
    });

  const mean = (ws: OcrReadingWord[]) => Math.round(ws.reduce((s, w) => s + w.confidence, 0) / ws.length);
  const lineOf = (lw: OcrReadingWord[]): OcrReadingLine => ({
    text: lw.map(w => w.text).join(' '),
    confidence: mean(lw),
    bbox: {
      x0: Math.min(...lw.map(w => w.bbox.x0)), y0: Math.min(...lw.map(w => w.bbox.y0)),
      x1: Math.max(...lw.map(w => w.bbox.x1)), y1: Math.max(...lw.map(w => w.bbox.y1)),
    },
    words: lw,
  });
  const lines: OcrReadingLine[] = [];
  let next = 0;
  for (const lineText of text.split('\n')) {
    const n = lineText.split(' ').filter(Boolean).length;
    const lw = words.slice(next, next + n);
    next += n;
    if (lw.length) lines.push(lineOf(lw));
  }
  // Words the text did not account for (a reply from an older build) still count.
  if (next < words.length) lines.push(lineOf(words.slice(next)));

  return {
    text: text.trim(),
    confidence: words.length ? mean(words) : null,
    wordCount: words.filter(w => w.text.length > 1 && w.confidence > 15).length,
    lines,
  };
}
