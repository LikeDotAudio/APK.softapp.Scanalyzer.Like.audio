// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The convert action's job and result, apart from the socket.
 *
 * The inspector's ⚙️ CONVERT card asks `Worker-SAMPLE_CONVERSION` (POD.workers,
 * repository PROCESSOR.SampleConversion) to turn the selected audio file into
 * a delivery format. This file is only the shape of that conversation: what
 * goes out on `outgoing/job`, and how an answer on `incoming/result` is read.
 * `sampleConversion.ts` beside it owns the MQTT client.
 *
 * It is a `.ts` with only erasable types on purpose: node strips TypeScript
 * natively, so `test/sample-conversion-job.test.mjs` imports THIS FILE and
 * checks the rules with nothing installed. Its one import is the contracts'
 * browser build, vendored (`src/vendor/apk-contracts/`, refreshed by
 * `.apk.scripts/vendor_contract_web.py`, drift caught by its `--check`): the
 * topic is built by the contract, not formatted here.
 *
 * The allowed values are the worker's own (`SRC/src/lib.rs`, `convert` and
 * `demuxer_for`). They are wire constants, not a list of known devices: the
 * worker refuses anything else with `ok: false`, so offering it here would
 * only offer a refusal.
 */

// The vendored bundle ships no .d.ts (a file beside it would fail the vendor
// --check), so the one builder used here is typed at the import.
// @ts-expect-error TS7016 — untyped vendored ES module
import { Topics as ContractTopics } from './vendor/apk-contracts/apk-contracts.mjs';
const Topics: { protocols: { topic(address: { proto: string; path: string[] }): string } } = ContractTopics;

/** The token the worker is known by on the bus. */
export const CONVERSION_TOKEN = 'sample_conversion';

/** The extensions the worker reads; anything else it refuses unread. */
export const CONVERTIBLE_EXTENSIONS = [
  'wav', 'wave', 'w64', 'aif', 'aiff', 'aifc', 'flac', 'mp3',
  'ogg', 'oga', 'opus', 'm4a', 'mp4', 'mov', 'alac', 'caf',
] as const;

export const TARGET_FORMATS = ['WAV', 'FLAC'] as const;
export const TARGET_CHANNELS = ['Preserve', 'Mono', 'Stereo'] as const;
export const TARGET_SAMPLE_RATES = ['Preserve', '44100', '48000', '88200', '96000', '192000'] as const;
export const TARGET_BIT_DEPTHS = ['Preserve', '16', '24', '32f'] as const;

/** The worker's default limit (`config.ini`, `max_job_bytes`) — the size the
 *  card refuses before sending, so a too-big file is told so at once rather
 *  than after the upload. The worker still checks; this is only a courtesy. */
export const DEFAULT_MAX_JOB_BYTES = 32 * 1024 * 1024;

/** What the operator picked on the card. */
export interface ConversionOptions {
  target_format: string;
  target_channels: string;
  target_sample_rate: string;
  target_bit_depth: string;
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  target_format: 'FLAC',
  target_channels: 'Preserve',
  target_sample_rate: 'Preserve',
  target_bit_depth: 'Preserve',
};

/** The worker's job and result leaves for a token. */
export function conversionTopics(token: string = CONVERSION_TOKEN) {
  const leaf = (...path: string[]): string => Topics.protocols.topic({ proto: token, path });
  return {
    job: leaf('outgoing', 'job'),
    result: leaf('incoming', 'result'),
    // The liveness leaf the runner's LAST WILL writes (`unavailable`, retained) —
    // not `/status`, which the runner sets `online` once and nothing ever clears,
    // so a dead worker kept reading `online` (SDK audit WS-06/OS-06).
    state: leaf('incoming', 'state'),
  };
}

function extensionOf(name: string): string {
  const leaf = name.split(/[\\/]/).pop() || '';
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(dot + 1).toLowerCase() : '';
}

/** Whether the worker would read this file at all. */
export function canConvert(name: string): boolean {
  return (CONVERTIBLE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Why this file cannot be sent, or null when it can. */
export function refuseBeforeSending(name: string, size: number, maxBytes: number = DEFAULT_MAX_JOB_BYTES): string | null {
  if (!canConvert(name)) return `${extensionOf(name) || 'no extension'}: not an audio container the converter reads`;
  if (size > maxBytes) return `the file is ${size} bytes; the converter takes at most ${maxBytes}`;
  if (size === 0) return 'the file is empty';
  return null;
}

/** Keep only the choices the worker takes; anything else falls back to the
 *  default for that field rather than reaching the bus as a certain refusal. */
export function sanitizeOptions(raw: Partial<Record<keyof ConversionOptions, unknown>>): ConversionOptions {
  const pick = (value: unknown, allowed: readonly string[], fallback: string) =>
    typeof value === 'string' && allowed.includes(value) ? value : fallback;
  return {
    target_format: pick(raw.target_format, TARGET_FORMATS, DEFAULT_OPTIONS.target_format),
    target_channels: pick(raw.target_channels, TARGET_CHANNELS, DEFAULT_OPTIONS.target_channels),
    target_sample_rate: pick(raw.target_sample_rate, TARGET_SAMPLE_RATES, DEFAULT_OPTIONS.target_sample_rate),
    target_bit_depth: pick(raw.target_bit_depth, TARGET_BIT_DEPTHS, DEFAULT_OPTIONS.target_bit_depth),
  };
}

/** A fresh job id: unique enough that two tabs never read each other's answer. */
export function newJobId(now: number = Date.now()): string {
  return `scanalyzer-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Bytes to base64 in slices, so a 30 MB file does not overflow the argument
 *  list of String.fromCharCode. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The job document. The file name goes as a leaf only — the worker never
 *  sees a path, and the folder a sample sits in is the operator's business. */
export function buildConversionJob(jobId: string, filename: string, contentB64: string, options: ConversionOptions) {
  const leaf = filename.split(/[\\/]/).pop() || filename;
  return {
    job_id: jobId,
    filename: leaf,
    content_b64: contentB64,
    ...sanitizeOptions(options),
  };
}

/** One answer, read. */
export interface ConversionResult {
  ok: boolean;
  error: string | null;
  filename: string;
  format: string;
  bytes: number;
  contentB64: string;
  elapsedMs: number | null;
}

/** Read a payload off `incoming/result`. Null when it is not JSON or answers
 *  someone else's job — the result leaf is shared by every client. */
export function readConversionResult(payload: string, jobId: string): ConversionResult | null {
  let doc: any;
  try { doc = JSON.parse(payload); } catch { return null; }
  if (!doc || typeof doc !== 'object' || doc.job_id !== jobId) return null;
  const result = doc.result && typeof doc.result === 'object' ? doc.result : {};
  const ok = doc.ok === true && typeof result.content_b64 === 'string';
  return {
    ok,
    error: ok ? null : String(doc.error || 'the converter answered without a file'),
    filename: typeof result.filename === 'string' ? result.filename : '',
    format: typeof result.format === 'string' ? result.format : '',
    bytes: typeof result.bytes === 'number' ? result.bytes : 0,
    contentB64: ok ? result.content_b64 : '',
    elapsedMs: typeof doc.elapsed_ms === 'number' ? doc.elapsed_ms : null,
  };
}

/** The few methods of an mqtt.js client the request uses. */
export interface BusClientLike {
  subscribe(topic: string | string[], opts: { qos: 0 | 1 | 2 }, cb?: (err?: Error | null) => void): unknown;
  unsubscribe(topic: string | string[], cb?: () => void): unknown;
  publish(topic: string, payload: string, opts: { qos: 0 | 1 | 2; retain: boolean }, cb?: (err?: Error) => void): unknown;
  on(event: 'message', cb: (topic: string, payload: Uint8Array) => void): unknown;
  removeListener(event: 'message', cb: (topic: string, payload: Uint8Array) => void): unknown;
}

/** Whether a retained `incoming/state` carries the last will's word. A hint for
 *  the timeout message, never a refusal (see `requestConversion`). */
export function workerIsDown(stateText: string): boolean {
  return stateText.trim() === 'unavailable';
}

/** Send one job on a connected client and wait for its answer.
 *
 *  SUBSCRIBE FIRST, THEN PUBLISH: the result leaf is not retained, so an
 *  answer that comes back before the subscription is in place is lost.
 *  The worker's retained `incoming/state` is read on the same subscription and
 *  named in the timeout error. It is NOT a reason to refuse up front: the
 *  runner's last will writes `unavailable` when the process dies, but the same
 *  word is retained while a live worker is withdrawn onto the workbench (and
 *  still answering jobs), so only the missing answer is proof. `/status` is not
 *  read at all: the runner sets it `online` once and no will ever clears it.
 *  Rejects with the reason on a timeout, a refusal to publish, or an offline
 *  worker; a job the worker refused RESOLVES with `ok: false` and its error. */
export function requestConversion(
  client: BusClientLike,
  job: { job_id: string },
  timeoutMs: number,
  token: string = CONVERSION_TOKEN,
): Promise<ConversionResult> {
  const topics = conversionTopics(token);
  const decoder = new TextDecoder();
  return new Promise((resolve, reject) => {
    let done = false;
    let lastState = '';
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.removeListener('message', onMessage);
      client.unsubscribe([topics.result, topics.state]);
      fn();
    };
    const onMessage = (topic: string, payload: Uint8Array) => {
      const text = decoder.decode(payload);
      if (topic === topics.state) {
        lastState = text.trim();
        return;
      }
      if (topic !== topics.result) return;
      const read = readConversionResult(text, job.job_id);
      if (read) finish(() => resolve(read));
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(
        `no answer from the converter in ${Math.round(timeoutMs / 1000)} s`
        + (workerIsDown(lastState) ? ' — its retained state is `unavailable` (its last will: is Worker-SAMPLE_CONVERSION running?)' : ''),
      ))),
      timeoutMs,
    );
    client.on('message', onMessage);
    client.subscribe([topics.result, topics.state], { qos: 1 }, (err) => {
      if (err) { finish(() => reject(new Error(`could not subscribe: ${err.message}`))); return; }
      client.publish(topics.job, JSON.stringify(job), { qos: 1, retain: false }, (perr) => {
        if (perr) finish(() => reject(new Error(`could not publish the job: ${perr.message}`)));
      });
    });
  });
}
