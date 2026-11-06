// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT A SAMPLE IS TO THE CLOUD — the records Scanalyzer hands the 3D viewer.
 *
 * The cloud itself moved to VISUALIZER.Like.audio (ROAD-3571, 2026-11-06): it
 * draws any records and knows nothing about samples. What it knew moved HERE,
 * to the host: the features a sample is placed by, the depth axis, the UCS
 * colours and the shape heuristic. `cloudRecords()` turns the scoped samples
 * into flat records with those as fields, and `cloudSchema()` says what the
 * viewer could not guess (the UCS colours, the depth axis's order, the default
 * view the tab has always opened on).
 */
import { ucsColor, ucsSubColor } from '../../groupColors';
import { adsrNumber } from '../../envelopeSlices';
import { RECORDING_NUMERIC, RECORDING_CATEGORICAL } from '../../recordings';
import type { VizSchema } from '../../vizHost';

// The subgroup, but only when it is a CURATED level (Perc -> Conga) rather than
// the auto "group + length tier" one; '' when the subgroup merely echoes its
// group. Ported from `graphing_rs/src/main.rs:99` `deeper_sub()`, which held this
// rule until PLAN-109.04 retired that crate — nothing called it, and a lane was
// compiling it anyway. **This function is now the only copy.** What the Rust used
// to prove is proved instead by `test/depth-axis.test.mjs`, which replays the
// retired binary's own captured answers against this source; the crate is in git
// history if the vectors ever need regenerating. The measurement that says so is the
// audit 20260829_GRAPHING_RS_VS_CLOUDTAB.md, filed under Code-Quality-Audits/ in
// the APK:Documentation audits lane. NAMED BY FILENAME ON PURPOSE: that lane was
// renumbered twice on 2026-08-30 alone, so a path here would already be wrong.
//
// The test is a lowercased prefix test in BOTH directions on purpose: it has to
// reject `Perc`/`Perc Long` (subgroup extends the group) as well as
// `Perc Long`/`Perc` (group extends the subgroup). Equality alone would let the
// auto tier through as a level and double every group in the depth axis.
export function deeperSub(group: string, subgroup: string): string {
  const g = (group ?? '').trim();
  const sg = (subgroup ?? '').trim();
  const gl = g.toLowerCase();
  const sgl = sg.toLowerCase();
  if (sg !== '' && sgl !== gl && !sgl.startsWith(gl) && !gl.startsWith(sgl)) return sg;
  return '';
}

// The LEADING U+001F IS LOAD-BEARING, and a plain ' › ' is measurably wrong.
//
// `makeAxis` orders a categorical axis by sorting the distinct set, so the level
// order has to fall out of the string. The Rust built it by hand — a BTreeMap of
// group -> BTreeSet of subgroups, group level emitted before its subgroups — and
// the only way a flat sort reproduces that is if the separator sorts BELOW every
// character a group name can start with. U+001F (unit separator) does; a space
// does not, because a group named `Perc Long` then lands between `Perc` and
// `Perc › Conga` and the hierarchy interleaves. That is the same reason
// `subKey()` in ../groupColors uses charCode 31, and it is the same convention.
//
// The ' › ' after it is cosmetic: nothing renders a categorical value today
// (`makeAxis` only ever calls `cats.indexOf` on it), and if anything ever does,
// it reads as `Perc › Conga` with an invisible byte in front.
const DEPTH_SEP = '\u001f › ';

// Feature registry: label → how to read it off a sample. This is what a sample
// IS to the cloud: the viewer (VISUALIZER.Like.audio 3d.html) is sent one flat
// record per sample with these as its fields, and reads their kinds itself.
// A missing number is sent as null, not 0: the viewer puts it at the centre of
// its axis rather than at the bottom (absent is not "lowest").
type Feature = { categorical?: boolean; get: (it: any) => number | string | null };
export const CLOUD_FEATURES: Record<string, Feature> = {
  Group: { categorical: true, get: (it) => it.classification?.group || 'Unclassified' },
  Subgroup: { categorical: true, get: (it) => it.classification?.subgroup || '—' },
  // Hierarchical depth: a group, and its curated subgroups one level deeper.
  // `Group` and `Subgroup` above are two independent FLAT axes — pick one and
  // the other is ignored — so neither can show a sample sitting at the group
  // level beside its siblings that are one level down. This is the axis that
  // can. The group fallback is 'Unclassified' rather than the Rust's 'Other'
  // so that one record does not answer to two different names on two axes.
  Depth: {
    categorical: true,
    get: (it) => {
      const g = it.classification?.group || 'Unclassified';
      const sub = deeperSub(g, it.classification?.subgroup || '');
      return sub ? g + DEPTH_SEP + sub : g;
    },
  },
  Timbre: { categorical: true, get: (it) => it.classification?.timbre || '?' },
  Cluster: { categorical: true, get: (it) => it.unsupervised?.cluster != null && it.unsupervised.cluster !== -1 ? 'C' + it.unsupervised.cluster : '—' },
  Length: { get: (it) => it.metadata?.length_seconds ?? null },
  Complexity: { get: (it) => it.spectral_features?.complexity ?? null },
  'Brightness (centroid)': { get: (it) => it.spectral_features?.spectral_centroid_hz ?? null },
  Harmonicity: { get: (it) => it.spectral_features?.harmonicity ?? null },
  // Peak-relative, so null on a multi-event file — read the loudest slice
  // rather than 0, which would stack every loop at the origin of this axis.
  Sustain: { get: (it) => { const v = adsrNumber(it, 'envelope_sustain_level', NaN); return Number.isFinite(v) ? v : null; } },
  Attack: { get: (it) => it.envelope?.attack_seconds ?? null },
  Pitch: { get: (it) => it.musicality?.pitch_hz ?? null },
  BPM: { get: (it) => it.musicality?.beats_per_minute ?? null },
  RMS: { get: (it) => it.spectral_features?.root_mean_square_level ?? null },
  ZCR: { get: (it) => it.spectral_features?.zero_crossings_per_second ?? null },
  Transients: { get: (it) => it.envelope?.transient_count ?? null },
  'Crest Factor': { get: (it) => it.spectral_features?.crest_factor ?? null },
  Flatness: { get: (it) => it.spectral_features?.spectral_flatness ?? null },
  // The bench's recordings (recordings.ts): what a device read, as numbers and names.
  ...Object.fromEntries(Object.entries(RECORDING_CATEGORICAL).map(([k, get]) => [k, { categorical: true, get }])),
  ...Object.fromEntries(Object.entries(RECORDING_NUMERIC).map(([k, get]) => [k, { get: (it: any) => { const v = get(it); return Number.isFinite(v) ? v : null; } }])),
};


// The shape heuristic: a category whose VALUES are shape names, which the viewer
// draws literally ('Uniform' is simply choosing no shape field).
export function getShapeFor(it: any, shapeBy: string): string {
  if (shapeBy === 'Uniform') return 'sphere';

  const g = (it.classification?.group || '').toLowerCase();
  // Not a scope taxonomy — just a shape heuristic. `role` is the record's stored
  // music-production field when present, else its UCS category — which now carries the
  // instrument family (DRUMS, CYMBALS, …) since MUSICPROD folded into UCS.
  const role = it.classification?.music_production_category
    || it.ucs?.category || '';
  const t = (it.classification?.timbre || '').toLowerCase();
  const transient_count = it.envelope?.transient_count ?? 0;

  if (shapeBy === 'Timbre') {
    if (t === 'percussive') return 'pyramid';
    if (t === 'loop') return 'torus';
    if (t === 'bass') return 'cylinder';
    if (t === 'tonal') return 'cube';
    if (t === 'noise') return 'diamond';
    if (t === 'bright') return 'icosahedron';
    if (t === 'pad') return 'dodecahedron';
    return 'sphere';
  }

  // Instrument (default). Group-name substrings first, then the UCS-category / role name.
  if (g.includes('kick') || g.includes('snare') || g.includes('tom') || g.includes('clap') || role === 'DRUMS') return 'cylinder';
  if (g.includes('cymbal') || g.includes('hi-hat') || g.includes('ride') || g.includes('crash') || g.includes('hihat') || role === 'CYMBALS') return 'disc';
  if (g === 'ir' || role === 'IMPULSE RESPONSE') return 'diamond';
  if (g === 'perc' || role === 'PERCUSSION' || role === 'PERCUSSION TUNED' || role === 'SHAKEN' || role === 'MALLET') return 'pyramid';
  if (transient_count > 1 || role === 'LOOP' || role === 'LOOPS' || role === 'EXPERIMENTAL' || g.includes('loop') || g === 'fx') return 'torus';
  if (g === 'bass' || g.includes('synth') || role === 'SYNTHESIZED' || role === 'KEYED' || role === 'INSTRUMENT'
      || role === 'SYNTH' || role === 'KEYBOARD' || role === 'PIANO' || role === 'STRINGS' || role === 'GUITAR'
      || role === 'BRASS' || role === 'WOODWIND') return 'cube';
  if (g === 'voice' || g.includes('voice') || role === 'PERFORMANCE' || role === 'VOCALS') return 'icosahedron';
  return 'sphere'; // default for unclassified
}


/** A sample's id on the wire: its name, which is what the footer, Examiner and Extractor key on. */
export const sampleId = (it: any): string => it?.metadata?.name || '';

/** One flat record per sample: its id and name, every cloud feature, the UCS pair and its colours, its shapes. */
export function cloudRecords(data: any[]): Record<string, unknown>[] {
  return data.map((it) => {
    const r: Record<string, unknown> = { id: sampleId(it), name: sampleId(it) };
    for (const [label, f] of Object.entries(CLOUD_FEATURES)) r[label] = f.get(it);
    const cat = it.ucs?.category || '(unclassified)';
    const sub = (it.ucs?.subcategory || '').trim();
    r['UCS Category'] = cat;
    r['UCS Subcategory'] = sub || null;
    r['UCS shade'] = ucsSubColor(it.ucs?.category || '', sub);
    r['Instrument shape'] = getShapeFor(it, 'Instrument');
    r['Timbre shape'] = getShapeFor(it, 'Timbre');
    return r;
  });
}

const PREF = 'scanalyzer_cloud_v3_';
const VIEW_KEYS = ['x', 'y', 'z', 'size', 'color', 'shape', 'signs'];

/** The view the user last left the cloud on (or the one it has always opened on). */
export function savedCloudView(): Record<string, unknown> {
  const v: Record<string, unknown> = { x: 'Pitch', y: 'Group', z: 'Complexity', size: 'Length', color: 'UCS Category', shape: 'Instrument shape' };
  for (const k of VIEW_KEYS) {
    try { const s = localStorage.getItem(PREF + k); if (s !== null) v[k] = JSON.parse(s); } catch { /* storage off */ }
  }
  return v;
}

/** Remember a change the user made in the viewer. */
export function saveCloudView(patch: Record<string, unknown>): void {
  for (const k of VIEW_KEYS) if (k in patch) {
    try { localStorage.setItem(PREF + k, JSON.stringify(patch[k])); } catch { /* storage off */ }
  }
}

/**
 * What the viewer cannot read from the values: the UCS colour of each category,
 * the depth axis's order (a plain code-unit sort, which is what makes the U+001F
 * separator put each group before its subgroups), and the default view.
 */
export function cloudSchema(records: Record<string, unknown>[], view: Record<string, unknown>): VizSchema {
  const cats = [...new Set(records.map((r) => String(r['UCS Category'])))];
  const depth = [...new Set(records.map((r) => String(r.Depth)))].sort();
  return {
    id: 'id',
    label: 'name',
    fields: {
      'UCS Category': { kind: 'category', colors: Object.fromEntries(cats.map((c) => [c, ucsColor(c === '(unclassified)' ? '' : c)])) },
      Depth: { kind: 'category', order: depth },
      'UCS shade': { kind: 'color', label: 'UCS subcategory shade' },
    },
    view,
  };
}
