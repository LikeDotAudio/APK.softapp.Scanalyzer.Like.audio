// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHERE THE VISUALIZER VIEWERS ARE (ROAD-3586). Pure: no DOM, no JSX, so
 * test/viz-base.test.mjs imports it straight from source.
 *
 * In order, the first that applies:
 *   1. `?viz=<base url>` — an explicit override always wins, unprobed.
 *   2. the dev server's /@fs/ path to the checkout (vite.config.ts, `vite serve`).
 *   3. otherwise a list, tried in order, the first whose `2d.html` answers wins:
 *        desktop (Tauri): the copy bundled into the app at `./viz/` (vite.config.ts
 *                         copies VISUALIZER's dist there on a Tauri build) — the
 *                         relative Softapps path means nothing inside a bundle;
 *        browser:         the relative path between the two dist/ folders in the
 *                         Softapps tree (:8080, apk.audio);
 *      and last, never probed (another origin may refuse the probe while still
 *      serving the frame): the published viewers on apk.audio.
 */

declare const __VIZ_DEV_BASE__: string | undefined;
declare const __VIZ_BUNDLED_BASE__: string | undefined;

/** dist/ → Web_Front → SCANALYZER.Like.audio → SCANALYZER_SUITE → Softapps */
export const VIZ_RELATIVE_BASE = '../../../../VISUALIZER/VISUALIZER.Like.audio/dist/';
/** The published viewers — the fallback when no local copy answers. */
export const VIZ_PUBLISHED_BASE = 'https://apk.audio/APK:Softapps/VISUALIZER/VISUALIZER.Like.audio/dist/';

export interface VizEnv {
  /** The page's query string (`location.search`). */
  search?: string;
  /** The dev server's base, '' when built. */
  devBase?: string;
  /** Where a Tauri build put its copy of the viewers, '' when it has none. */
  bundledBase?: string;
  /** Running inside the desktop (Tauri) webview. */
  tauri?: boolean;
}

const slash = (s: string) => (s.endsWith('/') ? s : s + '/');

/** The bases to try, best first. A single entry means "use it, do not probe". */
export function vizCandidates(env: VizEnv): string[] {
  const q = new URLSearchParams(env.search ?? '').get('viz');
  if (q) return [slash(q)];
  if (env.devBase) return [slash(env.devBase)];
  const local = env.tauri ? (env.bundledBase ? [slash(env.bundledBase)] : []) : [VIZ_RELATIVE_BASE];
  return [...local, VIZ_PUBLISHED_BASE];
}

/** True when a viewer page answers at `url`. */
export type VizProbe = (url: string) => Promise<boolean>;

/** The first candidate whose 2d.html answers; the last one is taken unprobed. */
export async function pickVizBase(candidates: string[], probe: VizProbe): Promise<string> {
  for (let i = 0; i < candidates.length - 1; i++) {
    try { if (await probe(`${candidates[i]}2d.html`)) return candidates[i]; } catch { /* absent: try the next */ }
  }
  return candidates[candidates.length - 1];
}

/** This page's environment, from the build's defines and the running window. */
export function currentVizEnv(): VizEnv {
  const w = globalThis as any;
  return {
    search: w.location?.search ?? '',
    devBase: typeof __VIZ_DEV_BASE__ === 'string' ? __VIZ_DEV_BASE__ : '',
    bundledBase: typeof __VIZ_BUNDLED_BASE__ === 'string' ? __VIZ_BUNDLED_BASE__ : '',
    tauri: typeof w.__TAURI_INTERNALS__ !== 'undefined' || typeof w.__TAURI__ !== 'undefined',
  };
}

/** The best first guess, synchronously: what a frame shows before the probe settles. */
export function vizBase(): string {
  return vizCandidates(currentVizEnv())[0];
}

const fetchProbe: VizProbe = async (url) => {
  const r = await fetch(url, { cache: 'no-store' });
  return r.ok && (r.headers.get('content-type') ?? 'text/html').includes('html');
};

let resolved: Promise<string> | null = null;
/** The base that answers, probed once per page load. */
export function resolveVizBase(probe: VizProbe = fetchProbe): Promise<string> {
  return (resolved ??= pickVizBase(vizCandidates(currentVizEnv()), probe));
}
