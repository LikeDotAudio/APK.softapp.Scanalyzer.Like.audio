// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The convert action's door onto the bus: one MQTT client, opened on the
 * first conversion and kept for the next.
 *
 * WHERE THE BROKER IS — the same answer the other softapps give
 * (AUDIO.PitchClass-SongAnalyzer `busLink.ts`, AUDIO.Sampler `mqttBus.js`):
 * `localStorage['oa_bus_url']` when a bench says so, otherwise ws(s)://<page
 * host>:9001 on a local origin, and nowhere on a public one. The published
 * site has no broker, so there the card says so and sends nothing.
 *
 * WHERE mqtt.js IS — loaded from the shell, in the shell's own order
 * (OS/DataBus/mqtt-lib), never bundled: a bundle served without a shell has no
 * broker either.
 */
import {
  bytesToBase64, buildConversionJob, newJobId, refuseBeforeSending, requestConversion,
  type ConversionOptions, type ConversionResult, type BusClientLike,
} from './sampleConversionJob';

const MQTT_SOURCES = [
  '/engine/vendor/mqtt.min.js',
  '/FrontEnd/vendor/mqtt.min.js',
  '/APK:FrontEnd/vendor/mqtt.min.js',
  '/APK:OS/vendor/mqtt.min.js',
];

/** The worker gives ffmpeg 120 s (`config.ini`, `timeout_s`); the wait here
 *  adds the transfer both ways on top of it. */
const ANSWER_TIMEOUT_MS = 150_000;
const CONNECT_TIMEOUT_MS = 5_000;

function isLocalOrigin(): boolean {
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '' || host === '::1'
    || /^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || host.endsWith('.local');
}

/** The broker this page would use, or null when there is none to use. */
export function conversionBrokerUrl(): string | null {
  try {
    const override = localStorage.getItem('oa_bus_url');
    if (override) return override;
  } catch { /* storage refused: no override */ }
  if (!isLocalOrigin()) return null;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.hostname || '127.0.0.1'}:9001`;
}

function loadMqtt(index = 0): Promise<any> {
  const w = window as any;
  if (w.mqtt) return Promise.resolve(w.mqtt);
  if (index >= MQTT_SOURCES.length) return Promise.reject(new Error('no mqtt.js on this server'));
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = MQTT_SOURCES[index];
    // A server with an SPA fallback answers a missing path with index.html and a
    // 200, which "loads" and defines nothing — so that is a miss too, not the end.
    const next = () => { tag.remove(); loadMqtt(index + 1).then(resolve, reject); };
    tag.onload = () => (w.mqtt ? resolve(w.mqtt) : next());
    tag.onerror = next;
    document.head.appendChild(tag);
  });
}

let clientPromise: Promise<BusClientLike> | null = null;

function connectedClient(): Promise<BusClientLike> {
  if (clientPromise) return clientPromise;
  const url = conversionBrokerUrl();
  if (!url) return Promise.reject(new Error('no broker on a public origin — open Scanalyzer from a bench'));
  clientPromise = loadMqtt().then(mqtt => new Promise<BusClientLike>((resolve, reject) => {
    const client = mqtt.connect(url, {
      clientId: 'scanalyzer-convert-' + Math.random().toString(16).slice(2, 8),
      reconnectPeriod: 5000,
      connectTimeout: CONNECT_TIMEOUT_MS,
    });
    const timer = setTimeout(() => { client.end(true); reject(new Error(`no broker answered at ${url}`)); }, CONNECT_TIMEOUT_MS + 500);
    client.once('connect', () => { clearTimeout(timer); resolve(client); });
  }));
  // A failed connect is not cached: the next press tries again.
  clientPromise.catch(() => { clientPromise = null; });
  return clientPromise;
}

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
