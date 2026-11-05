// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//! The bench's recordings as part of the corpus.
//!
//! Inside APK.audio the capture recorder (WEB.OsApi capture_recorder.py) keeps
//! every device that reports data — readings, NAB ALL settings, screens,
//! attention — timestamped. `GET /api/os/captures/peak` (capture_peak.py) hands
//! all of it back as `.PEAK`-shaped records, one per recorded leaf:
//!
//!   ucs.category RECORDING, ucs.subcategory = the device → one scope chip each
//!   classification.group = protocol, metadata.length_seconds = recorded span
//!   recording.{count, min, max, mean, std, drift, series, changes, pictures, …}
//!
//! The records are held apart from the scanned library (App.tsx) so a scan, a
//! reopen or an unload never writes them into a .PEAK sidecar or drops them,
//! and the file-writing tabs (Scanalyze, Extractor, Rename) never see them.
//! Served same-origin from the portal; on scanalyzer.like.audio there is no
//! recorder, the probe answers nothing and none of this shows.

export const RECORDINGS_URL = '/api/os/captures/peak';
export const RECORDING_CATEGORY = 'RECORDING';

export interface RecordingsLoad {
  records: any[];
  span: [number, number] | null;
  every: boolean;       // every device the rigs hold, not only the ones that report data
  loadedAt: number;
}

export const isRecording = (it: any): boolean => it?.metadata?.source === 'recording';

/** The recordings, or null when this page is not served by an APK.audio portal. */
export async function fetchRecordings(every = false, signal?: AbortSignal): Promise<RecordingsLoad | null> {
  let res: Response;
  try {
    res = await fetch(`${RECORDINGS_URL}${every ? '?all=1' : ''}`, { signal, cache: 'no-store' });
  } catch {
    return null;
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('json')) return null;      // no recorder here (SPA fallback, 404, 501)
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.records)) return null;
  return { records: body.records, span: body.span ?? null, every, loadedAt: Date.now() };
}

const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** Numeric fields of a recording, for the cloud / 2D / 4D axis pickers. */
export const RECORDING_NUMERIC: Record<string, (it: any) => number> = {
  'Rec · Mean': (it) => num(it?.recording?.mean),
  'Rec · Min': (it) => num(it?.recording?.min),
  'Rec · Max': (it) => num(it?.recording?.max),
  'Rec · Spread (σ)': (it) => num(it?.recording?.std),
  'Rec · Drift': (it) => num(it?.recording?.drift),
  'Rec · Now': (it) => num(it?.recording?.last),
  'Rec · Reads': (it) => num(it?.recording?.count),
  'Rec · Reads/min': (it) => num(it?.recording?.rate_per_min),
  'Rec · Distinct values': (it) => num(it?.recording?.distinct),
  'Rec · Attention': (it) => (it?.recording ? (it.recording.attention?.length ?? 0) : NaN),
  'Rec · Last read (s ago)': (it) => (it?.recording?.last_ts ? Date.now() / 1000 - it.recording.last_ts : NaN),
};

/** The same fields as dotted paths, for the tabs that read by path (2D). */
export const RECORDING_PATHS: Record<string, string> = {
  'Rec · Mean': 'recording.mean',
  'Rec · Min': 'recording.min',
  'Rec · Max': 'recording.max',
  'Rec · Spread (σ)': 'recording.std',
  'Rec · Drift': 'recording.drift',
  'Rec · Now': 'recording.last',
  'Rec · Reads': 'recording.count',
  'Rec · Reads/min': 'recording.rate_per_min',
  'Rec · Distinct values': 'recording.distinct',
};

/** Categorical fields of a recording. */
export const RECORDING_CATEGORICAL: Record<string, (it: any) => string> = {
  'Rec · Device': (it) => it?.recording?.device || '—',
  'Rec · Leaf': (it) => it?.recording?.leaf || '—',
  'Rec · Kind': (it) => it?.recording?.kind || '—',
  'Rec · Unit': (it) => it?.recording?.unit || '—',
};

/** A number as the bench shows it: engineering notation past four digits. */
export function showValue(v: any, unit?: string | null): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v == null ? '—' : String(v);
  const a = Math.abs(v);
  const s = a !== 0 && (a >= 1e5 || a < 1e-3) ? v.toExponential(4) : String(+v.toPrecision(6));
  return unit ? `${s} ${unit}` : s;
}

export const showTime = (ts?: number | null): string =>
  ts ? new Date(ts * 1000).toLocaleString(undefined, { hour12: false }) : '—';
