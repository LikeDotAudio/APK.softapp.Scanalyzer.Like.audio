// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT A SAMPLE IS TO THE 4D BALL — the records Scanalyzer hands VISUALIZER's 4d.html.
 *
 * The ball moved to VISUALIZER.Like.audio (ROAD-3571, 2026-11-06). It draws any
 * records, and it deals a category's values onto its 32 faces in the order the
 * host declares. That makes Scanalyzer's 4th dimension three fields and a schema:
 *
 *   Response   the facial response a sample's UCS category routes to (faceOfItem),
 *              declared in RESPONSES order, so face i is RESPONSES[i] exactly
 *              as before: 12 pentagons, then 20 hexagons
 *   Family     the response's family, which colours the faces (FAMILY_COLOR)
 *   UCS shade  the dot's colour: the UCS subcategory shade, as the ball always drew
 *
 * plus every feature in axes.ts as a number (null when unmeasured). The A–H views
 * are presets, and the corner schemes are the presets' `corners`.
 */
import { AXES, AXIS_GROUPS, CORNER_SCHEMES } from './axes';
import { RESPONSES, faceOfItem, type ResponseFamily } from '../../facialResponse';
import { ucsColor, ucsSubColor, taxonomyKeys } from '../../groupColors';
import type { VizSchema } from '../../vizHost';

/** One colour per response family, so the ball reads as regions at a glance. */
export const FAMILY_COLOR: Record<ResponseFamily, string> = {
  Viseme: '#4dd0e1',
  Startle: '#ff5252',
  Effort: '#ffb74d',
  Aversion: '#ba68c8',
  Attend: '#81c784',
  Ambient: '#78909c',
};

export function faceRecords(data: any[]): Record<string, unknown>[] {
  return data.map((it) => {
    const name = it?.metadata?.name || '';
    const r: Record<string, unknown> = { id: name, name };
    for (const [label, get] of Object.entries(AXES)) {
      const v = get(it);
      r[label] = Number.isFinite(v) ? v : null;
    }
    const resp = RESPONSES[faceOfItem(it)];
    const [category, subcategory] = taxonomyKeys(it);
    r.Response = resp.name;
    r.Family = resp.family;
    r['UCS Category'] = category;
    r['UCS shade'] = ucsSubColor(category === '(unclassified)' ? '' : category, subcategory);
    return r;
  });
}

/** A–H view presets: three axes (with directions), a corner scheme and its pull. */
export const PRESETS: { key: string; name: string; x: string; y: string; z: string; signs: [number, number, number]; corners: string; cornerPull: number; pull: number }[] = [
  { key: 'A', name: 'Classic — brightness / harmonicity / transients', x: 'Brightness', y: 'Harmonicity', z: 'Transients', signs: [1, 1, 1], corners: 'Off', cornerPull: 0, pull: 0.85 },
  { key: 'B', name: 'Envelope shape — attack / sustain / release', x: 'Attack', y: 'Sustain', z: 'Release', signs: [1, 1, 1], corners: 'Envelope', cornerPull: 0.7, pull: 0.9 },
  { key: 'C', name: 'Spectral balance — low / high / flatness', x: 'Low band', y: 'High band', z: 'Flatness', signs: [1, 1, 1], corners: 'Spectral balance', cornerPull: 0.8, pull: 0.9 },
  { key: 'D', name: 'Timbre fingerprint — the MFCC space', x: 'MFCC 1', y: 'MFCC 2', z: 'MFCC 3', signs: [1, 1, 1], corners: 'Timbre (MFCC)', cornerPull: 0.8, pull: 0.85 },
  { key: 'E', name: 'Material — harmonicity / inharmonicity / stationarity', x: 'Harmonicity', y: 'Inharmonicity', z: 'Stationarity', signs: [1, 1, 1], corners: 'Material', cornerPull: 0.7, pull: 0.9 },
  { key: 'F', name: 'Sequence — slices / vocabulary / determinism', x: 'Slices', y: 'Vocabulary size', z: 'Determinism', signs: [1, 1, 1], corners: 'Sequence', cornerPull: 0.75, pull: 0.9 },
  { key: 'G', name: 'Loudness & space — LUFS / crest / stereo width', x: 'LUFS', y: 'Crest factor', z: 'Stereo width', signs: [1, 1, 1], corners: 'Off', cornerPull: 0, pull: 0.8 },
  { key: 'H', name: 'Free scatter — no category pull, pure acoustics', x: 'Brightness', y: 'Length', z: 'Pitch', signs: [1, -1, 1], corners: 'Off', cornerPull: 0, pull: 0 },
];

const presetView = (p: (typeof PRESETS)[number]) => ({
  x: p.x, y: p.y, z: p.z, signs: p.signs, corners: CORNER_SCHEMES[p.corners] ?? [], cornerPull: p.cornerPull, pull: p.pull,
});

const PREF = 'scanalyzer_faceball_v2_';
const KEYS = ['x', 'y', 'z', 'signs', 'color', 'corners', 'cornerPull', 'pull', 'outline', 'faceIntensity'];

/** The view the ball was last left on (else preset A, coloured by UCS shade). */
export function savedFaceView(): Record<string, unknown> {
  const v: Record<string, unknown> = { ...presetView(PRESETS[0]), color: 'UCS shade', face: 'Response', faceGroup: 'Family', outline: 0.75, faceIntensity: 1 };
  for (const k of KEYS) {
    try { const s = localStorage.getItem(PREF + k); if (s !== null) v[k] = JSON.parse(s); } catch { /* storage off */ }
  }
  return v;
}

export function saveFaceView(patch: Record<string, unknown>): void {
  for (const k of KEYS) if (k in patch) {
    try { localStorage.setItem(PREF + k, JSON.stringify(patch[k])); } catch { /* storage off */ }
  }
}

export function faceSchema(view: Record<string, unknown>): VizSchema {
  const cats = [...new Set(RESPONSES.flatMap((r) => r.categories))];
  return {
    id: 'id',
    label: 'name',
    fields: {
      ...Object.fromEntries(AXIS_GROUPS.flatMap((g) => g.axes.map((a) => [a, { kind: 'number', group: g.label }]))),
      Response: { kind: 'category', order: RESPONSES.map((r) => r.name) },
      Family: { kind: 'category', colors: FAMILY_COLOR },
      'UCS Category': { kind: 'category', colors: Object.fromEntries(cats.map((c) => [c, ucsColor(c)])) },
      'UCS shade': { kind: 'color', label: 'UCS subcategory shade' },
    },
    view,
    presets: PRESETS.map((p) => ({ key: p.key, name: p.name, view: presetView(p) })),
  };
}
