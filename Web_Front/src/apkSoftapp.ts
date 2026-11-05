// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * Scanalyzer's door onto THE ONE SOFTAPP CLIENT (FrontEnd/shared/apk-softapp.js,
 * vendored in ./vendor/apk-softapp and held to its source by check.sh webshared).
 *
 * apk-softapp.js is a classic script that reads `window.APKContracts` for the
 * problems catalogue (contracts/problems/problems.json). The bundle imports the
 * contracts as an ES module, so this file hangs that module on window first —
 * apk-softapp only reads it at call time, so import order does not matter.
 *
 * `problem()` is the one way this app says something went wrong: what
 * happened / why / do this, with Retry where retrying helps — never alert().
 */
// @ts-expect-error TS7016 — untyped vendored ES module (a .d.ts beside it would fail the vendor check)
import * as Contracts from './vendor/apk-contracts/apk-contracts.mjs';
import './vendor/apk-softapp/apk-softapp.js';

const w = window as any;
if (!w.APKContracts) w.APKContracts = Contracts;

export interface ProblemOpts {
  subject?: string;
  detail?: string;
  fix?: string[];
  onRetry?: () => void;
  into?: HTMLElement | null;
}

/** Show a problem card; falls back to alert() only if the SDK did not load. */
export function problem(codeOrError: unknown, opts: ProblemOpts = {}): void {
  const sdk = w.APKSoftapp;
  if (sdk && typeof sdk.showProblem === 'function') { sdk.showProblem(codeOrError, opts); return; }
  alert([opts.subject, opts.detail || String(codeOrError), ...(opts.fix || [])].filter(Boolean).join('\n'));
}

/** What Scanalyzer takes in, puts out and lets you control — the ? button (F1). */
export function describeScanalyzer(): void {
  const sdk = w.APKSoftapp;
  if (!sdk || typeof sdk.describe !== 'function') return;
  sdk.describe({
    name: 'Scanalyzer',
    does: 'Browses, analyses, classifies and slices an audio-sample library in the browser; the audio never leaves the machine unless you choose to contribute peaks or convert.',
    inputs: [
      { name: 'Sample folder', from: 'Scanalyze tab — pick a folder (WAV, AIFF, FLAC… and their .PEAK sidecars)', kind: 'file' },
      { name: '.PEAK / .json analysis files', from: 'drop them on the page', kind: 'file' },
      { name: 'Shared cloud corpus', from: 'api/get_peaks.php, api/db_status.php (scanalyzer.like.audio on desktop)', kind: 'http' },
      { name: 'Song file', from: 'Song tab — a song to assay against the library', kind: 'file' },
      { name: 'Microphone (lyrics)', from: 'Song tab — Web Speech recognition' },
      { name: 'Devices, SpaceMouse, conversion results', from: 'the APK.audio bus (only when opened from a bench)', kind: 'bus' }
    ],
    outputs: [
      { name: 'Contributed peaks', to: 'api/upload_peak.php (asked first)', kind: 'http' },
      { name: 'Downloads', to: 'samples, slices (Extractor), rename script (Rename), song assay .json / metrics .csv, lyrics .lrc/.txt', kind: 'file' },
      { name: 'Favorites, manifest, sidecars', to: 'the picked folder (desktop / File System Access)', kind: 'file' },
      { name: 'Conversion jobs', to: 'Worker-SAMPLE_CONVERSION over the bus (…/outgoing/job)', kind: 'bus' }
    ],
    controls: [
      { name: 'Tabs', how: 'Scanalyze, Song, Devices, Cloud, FaceBall, Stats, Groups, Examiner, Favorites, Extractor, Rename (also #tab in the URL)' },
      { name: 'Scanalyze', how: 'pick a folder, choose analyse or open existing, ■ Stop scan; ☁️ Reload All Cloud Records from Database' },
      { name: 'Footer transport', how: 'play / download the selected sample' },
      { name: 'Cloud', how: 'drag to orbit the 3D sample cloud; a SpaceMouse flies it when one is on the bus' }
    ],
    problems: ['file_unreadable', 'bad_json', 'fetch_failed', 'http_server_error', 'save_failed',
      'unsupported_browser', 'permission_denied', 'broker_unreachable', 'timeout']
  });
}
