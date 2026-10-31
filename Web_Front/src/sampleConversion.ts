// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The convert action: one file to Worker-SAMPLE_CONVERSION over the page's bus
 * link (`busLink.ts`, the shared softapp helper).
 */
import {
  bytesToBase64, buildConversionJob, newJobId, refuseBeforeSending, requestConversion,
  type ConversionOptions, type ConversionResult,
} from './sampleConversionJob';
import { connectedClient } from './busLink';

/** The worker gives ffmpeg 120 s (`config.ini`, `timeout_s`); the wait here
 *  adds the transfer both ways on top of it. */
const ANSWER_TIMEOUT_MS = 150_000;

/** Convert one file on the worker. `onStage` hears each step for the card. */
export async function convertSample(
  file: File,
  options: ConversionOptions,
  onStage: (stage: string) => void = () => {},
): Promise<ConversionResult> {
  const refusal = refuseBeforeSending(file.name, file.size);
  if (refusal) throw new Error(refusal);
  onStage('reading the file');
  const contentB64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  onStage('connecting to the bus');
  const client = await connectedClient();
  const job = buildConversionJob(newJobId(), file.name, contentB64, options);
  onStage('converting on Worker-SAMPLE_CONVERSION');
  return requestConversion(client, job, ANSWER_TIMEOUT_MS);
}
