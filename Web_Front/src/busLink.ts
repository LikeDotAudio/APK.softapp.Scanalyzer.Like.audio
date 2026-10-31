// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * Scanalyzer's one door onto the bus, shared by every worker conversation
 * (Worker-SAMPLE_CONVERSION, Worker-GRAPHICS_SUITE): one link, opened on first
 * use and kept.
 *
 * THE BUS IS THE SHARED SOFTAPP HELPER, not a copy of its rules:
 * `/FrontEnd/shared/apk-bus.js` (WEB.Frontend-Assets) → `window.APKBus`. It
 * owns where the broker is (localStorage `oa_bus_url`, the framing OS shell's
 * `OS.brokerUrl()`, the gateway's same-origin `/mqtt`, public brokers only on
 * opt-in) and the one vendored mqtt.js. This used to probe four mqtt.js paths
 * and guess ws://<host>:9001 itself (SDK audit WS-05). The published site
 * serves no helper and has no broker, so there every caller says so.
 */
import type { BusClientLike } from './sampleConversionJob';

/** Where every page on the bench (and apk.audio) serves the shared helper. */
const APK_BUS_SRC = '/FrontEnd/shared/apk-bus.js';


function loadBusHelper(): Promise<any> {
  const w = window as any;
  if (w.APKBus) return Promise.resolve(w.APKBus);
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = APK_BUS_SRC;
    // A server with an SPA fallback answers a missing path with index.html and a
    // 200, which "loads" and defines nothing — so check, not just onload.
    tag.onload = () => (w.APKBus ? resolve(w.APKBus) : reject(new Error('no bus helper on this server')));
    tag.onerror = () => reject(new Error('no bus helper on this server — open Scanalyzer from a bench'));
    document.head.appendChild(tag);
  });
}

let clientPromise: Promise<BusClientLike> | null = null;

/** The page's one bus link (raw mqtt.js client), opened on first use and kept. */
export function connectedClient(): Promise<BusClientLike> {
  if (clientPromise) return clientPromise;
  clientPromise = loadBusHelper()
    .then(bus => bus.connect({ clientId: 'scanalyzer-' + Math.random().toString(16).slice(2, 8) }))
    .then((link: any) => {
      if (!link) throw new Error('no broker for this page — open Scanalyzer from a bench');
      // The raw mqtt.js client: requestConversion subscribes, publishes and
      // listens for 'message' on it directly.
      return link.client as BusClientLike;
    });
  // A failed connect is not cached: the next press tries again.
  clientPromise.catch(() => { clientPromise = null; });
  return clientPromise;
}

