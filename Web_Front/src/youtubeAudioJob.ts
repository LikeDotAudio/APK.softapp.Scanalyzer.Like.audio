// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * A song from a YouTube link — the Song Analyzer's half of Worker-YOUTUBE_AUDIO
 * (SCANALYZER.Like.audio youtube_audio/).
 *
 * A browser cannot fetch a YouTube page's audio itself, so the link goes to the
 * worker as a job on the bus; the worker stores the audio-only stream on the
 * bench's file store and answers its URL (same origin as this page on :8080),
 * which the analyser then GETs and decodes like a dropped file.
 */
import { conversionTopics, newJobId, workerIsDown, type BusClientLike } from './sampleConversionJob.ts';

export const YOUTUBE_AUDIO_TOKEN = 'youtube_audio';

/** Long enough for an hour of audio on a slow line; the worker refuses longer. */
export const YOUTUBE_AUDIO_TIMEOUT_MS = 5 * 60 * 1000;

export interface YoutubeAudio {
  url: string;
  title: string;
  uploader: string;
  duration_s: number | null;
  video_id: string;
  webpage_url: string;
  ext: string;
  content_type: string;
  bytes: number;
}

export interface YoutubeAudioAnswer {
  ok: boolean;
  result: YoutubeAudio | null;
  error: string | null;
  problem?: string;
}

const LINK = /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com)(\/|$)/i;

/** Does this text look like a YouTube link? A hint for the page; the worker decides. */
export function looksLikeYoutube(text: string): boolean {
  return LINK.test(text.trim());
}

/** The job document. */
export function buildYoutubeJob(jobId: string, url: string) {
  return { job_id: jobId, op: 'fetch', url: url.trim() };
}

/** The answer to this job, or null when the payload is someone else's. */
export function readYoutubeAnswer(payload: string, jobId: string): YoutubeAudioAnswer | null {
  let doc: any;
  try { doc = JSON.parse(payload); } catch { return null; }
  if (!doc || doc.job_id !== jobId) return null;
  return {
    ok: doc.ok === true && !!doc.result?.url,
    result: doc.ok === true ? doc.result as YoutubeAudio : null,
    error: doc.ok === true ? null : String(doc.error || 'the worker refused the link'),
    problem: doc.problem,
  };
}

/** Send the link and wait for the worker's answer. Subscribe first, then publish:
 *  the result is not retained. Rejects on a timeout or a bus failure; a link the
 *  worker refused RESOLVES with ok: false and its error. */
export function requestYoutubeAudio(
  client: BusClientLike,
  url: string,
  timeoutMs: number = YOUTUBE_AUDIO_TIMEOUT_MS,
): Promise<YoutubeAudioAnswer> {
  const topics = conversionTopics(YOUTUBE_AUDIO_TOKEN);
  const job = buildYoutubeJob(newJobId(), url);
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
      if (topic === topics.state) { lastState = text.trim(); return; }
      if (topic !== topics.result) return;
      const read = readYoutubeAnswer(text, job.job_id);
      if (read) finish(() => resolve(read));
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(
        `no answer from the YouTube fetcher in ${Math.round(timeoutMs / 1000)} s`
        + (workerIsDown(lastState) ? ' — its retained state is `unavailable` (is Worker-YOUTUBE_AUDIO running?)' : ''),
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
