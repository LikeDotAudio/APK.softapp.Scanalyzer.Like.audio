// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * OCR and raster→SVG as jobs for Worker-GRAPHICS_SUITE (this repository's own
 * graphics_suite_rs/SRC, pod POD.workers) instead of private HTTP routes (SDK
 * audit DS-02).
 *
 *   outgoing/job     {"job_id", "op": "ocr" | "vectorize", "filename", "content_b64"[, "threshold"]}
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

export function buildGraphicsJob(jobId: string, op: GraphicsOp, filename: string, contentB64: string, threshold?: number) {
  const job: Record<string, unknown> = { job_id: jobId, op, filename: filename.split(/[\\/]/).pop() || 'image.png', content_b64: contentB64 };
  if (op === 'vectorize' && Number.isInteger(threshold) && (threshold as number) >= 0 && (threshold as number) <= 255) job.threshold = threshold;
  return job as { job_id: string };
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
): Promise<any | null> {
  let client: BusClientLike;
  try { client = await connect(); } catch { return null; }
  try {
    return await requestGraphicsJob(client, buildGraphicsJob(newJobId(), op, filename, bytesToBase64(new Uint8Array(bytes))), timeoutMs);
  } catch (err) {
    console.warn(`graphics_suite ${op} over the bus failed; using the micro-API`, err);
    return null;
  }
}
