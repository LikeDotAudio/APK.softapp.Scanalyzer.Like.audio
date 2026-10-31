// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The convert action: one file to Worker-SAMPLE_CONVERSION over the page's bus
 * link (`busLink.ts`, the shared softapp helper).
 */
import {
  base64ToBytes, bytesToBase64, buildConversionJob, buildUrlConversionJob, newJobId, refuseBeforeSending,
  requestConversion, type ConversionOptions, type ConversionResult,
} from './sampleConversionJob';
import { connectedClient } from './busLink';

/** The worker gives ffmpeg 120 s (`config.ini`, `timeout_s`); the wait here
 *  adds the transfer both ways on top of it. */
const ANSWER_TIMEOUT_MS = 150_000;

/** A converted file, ready to play or save. */
export interface ConvertedSample extends ConversionResult { blob: Blob }

/** Statuses meaning "this origin has no file store (yet)": fall back to the inline job.
 *  The /api/files routes are new (Storage-Portal); until every host serves them the
 *  one-release inline job (base64 in, base64 out) still works. */
const NO_FILE_STORE = new Set([404, 405, 501]);

/** Convert one file on the worker. `onStage` hears each step for the card.
 *
 *  BY URL FIRST (PROCESSOR.SampleConversion schema 2): PUT the sample to
 *  `/api/files/sample_conversion/<job_id>/<filename>` on this page's origin, publish the
 *  job with `source_url` / `result_url`, read `result.url` from the answer and GET it.
 *  Only when the origin has no file store does it send the audio inline. */
export async function convertSample(
  file: File,
  options: ConversionOptions,
  onStage: (stage: string) => void = () => {},
): Promise<ConvertedSample> {
  const refusal = refuseBeforeSending(file.name, file.size);
  if (refusal) throw new Error(refusal);
  const jobId = newJobId();
  const byUrl = buildUrlConversionJob(jobId, file.name, options);
  onStage('uploading to the file store');
  let stored = false;
  try {
    const put = await fetch(byUrl.source_url, { method: 'PUT', body: file });
    if (put.ok) stored = true;
    else if (!NO_FILE_STORE.has(put.status)) throw new Error(`the file store refused the upload (HTTP ${put.status})`);
  } catch (err) {
    if (err instanceof Error && /refused the upload/.test(err.message)) throw err;
    // No file store reachable from this page: the inline job below.
  }
  onStage('connecting to the bus');
  const client = await connectedClient();
  onStage('converting on Worker-SAMPLE_CONVERSION');
  if (stored) {
    const result = await requestConversion(client, byUrl, ANSWER_TIMEOUT_MS);
    if (!result.ok) return { ...result, blob: new Blob() };
    onStage('fetching the converted file');
    const got = await fetch(result.url);
    if (!got.ok) throw new Error(`the converted file is not in the file store (HTTP ${got.status})`);
    return { ...result, blob: await got.blob() };
  }
  const contentB64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const result = await requestConversion(client, buildConversionJob(jobId, file.name, contentB64, options), ANSWER_TIMEOUT_MS);
  const type = result.format === 'FLAC' ? 'audio/flac' : 'audio/wav';
  return { ...result, blob: result.ok ? new Blob([base64ToBytes(result.contentB64).buffer as ArrayBuffer], { type }) : new Blob() };
}
