// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// SONG GLIDE — the harmony and rhythm a song moves through, as lines you can follow.
//
//   voices  — up to GLIDE_VOICES sounding pitches per 0.1 s window, kept as lines
//             (lowest line = lowest note) so a chord change reads as notes gliding
//   chords  — one named chord per stretch (Em9, B7(♭9), Am …) from the window chroma
//   onsets  — every rhythmic attack the spectral flux shows (the "parsing moments")
//   beats   — the beat grid at the detected tempo, bar downbeats marked
//
// Plain TypeScript with no imports so Node's type stripping loads it in the tests.
// The FFT is handed in (songAssay's FastFourierTransform) to keep it that way.

export const GLIDE_N = 8192;          // long frame: ~5 Hz bins, enough to tell E2 from F2
export const GLIDE_HOP_S = 0.1;       // one window every 100 ms
export const GLIDE_VOICES = 5;        // lines drawn
export const MIDI_LO = 28;            // E1
export const MIDI_HI = 100;           // E7
const NB = MIDI_HI - MIDI_LO + 1;

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export interface GlideChord { start: number; end: number; root: number; suffix: string; name: string; }
export interface GlideOnset { t: number; s: number; }          // s = strength 0..1
export interface GlideBeat { t: number; down: boolean; }
export interface GlideResult {
  hop: number;                   // seconds per window
  windows: number;
  voices: Float32Array[];        // GLIDE_VOICES lines, MIDI per window, NaN = silent
  chords: GlideChord[];
  onsets: GlideOnset[];
  beats: GlideBeat[];
  minMidi: number;
  maxMidi: number;
}

export interface Fft { n: number; transform(re: Float64Array, im: Float64Array): void; }

export function noteName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

// ── Chords ─────────────────────────────────────────────────────────────────────
// Intervals above the root. The small prior keeps a plain triad winning unless
// the extra tones are really there.
export const CHORD_TYPES: { suffix: string; iv: number[]; prior: number }[] = [
  { suffix: '',       iv: [0, 4, 7],         prior: 1.0 },
  { suffix: 'm',      iv: [0, 3, 7],         prior: 1.0 },
  { suffix: '7',      iv: [0, 4, 7, 10],     prior: 0.97 },
  { suffix: 'maj7',   iv: [0, 4, 7, 11],     prior: 0.97 },
  { suffix: 'm7',     iv: [0, 3, 7, 10],     prior: 0.97 },
  { suffix: 'm9',     iv: [0, 3, 7, 10, 2],  prior: 0.94 },
  { suffix: '9',      iv: [0, 4, 7, 10, 2],  prior: 0.94 },
  { suffix: '7(♭9)',  iv: [0, 4, 7, 10, 1],  prior: 0.93 },
  { suffix: 'dim',    iv: [0, 3, 6],         prior: 0.95 },
  { suffix: 'sus4',   iv: [0, 5, 7],         prior: 0.95 },
  { suffix: 'sus2',   iv: [0, 2, 7],         prior: 0.95 },
];

/** Best chord for a 12-bin chroma (C = 0); null when there is nothing to name. */
export function detectChord(chroma: ArrayLike<number>): { root: number; suffix: string; score: number } | null {
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  if (!(norm > 0)) return null;
  norm = Math.sqrt(norm);
  let best: { root: number; suffix: string; score: number } | null = null;
  for (let r = 0; r < 12; r++) {
    for (const ct of CHORD_TYPES) {
      let dot = 0;
      for (const iv of ct.iv) dot += chroma[(r + iv) % 12];
      const score = (dot / (norm * Math.sqrt(ct.iv.length))) * ct.prior;
      if (!best || score > best.score) best = { root: r, suffix: ct.suffix, score };
    }
  }
  return best && best.score > 0.45 ? best : null;
}

/** Window labels → merged chord stretches; stretches shorter than minDur fold into a neighbour. */
export function chordSegments(labels: ({ root: number; suffix: string } | null)[], hop: number, minDur = 0.5): GlideChord[] {
  const key = (l: { root: number; suffix: string } | null) => (l ? `${l.root}|${l.suffix}` : '');
  // mode filter over ±2 windows steadies the label
  const sm = labels.map((_, i) => {
    const count = new Map<string, number>();
    let bestK = key(labels[i]); let bestC = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(labels.length - 1, i + 2); j++) {
      const k = key(labels[j]); const c = (count.get(k) || 0) + (j === i ? 1.5 : 1);
      count.set(k, c);
      if (c > bestC) { bestC = c; bestK = k; }
    }
    return bestK;
  });
  let segs: { k: string; a: number; b: number }[] = [];
  for (let i = 0; i < sm.length; i++) {
    const last = segs[segs.length - 1];
    if (last && last.k === sm[i]) last.b = i + 1; else segs.push({ k: sm[i], a: i, b: i + 1 });
  }
  const minW = Math.max(1, Math.round(minDur / hop));
  let changed = true;
  while (changed && segs.length > 1) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].b - segs[i].a >= minW) continue;
      const into = i > 0 ? i - 1 : i + 1;
      segs[into].a = Math.min(segs[into].a, segs[i].a);
      segs[into].b = Math.max(segs[into].b, segs[i].b);
      segs.splice(i, 1);
      changed = true;
      break;
    }
    const merged: typeof segs = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && last.k === s.k) last.b = s.b; else merged.push({ ...s });
    }
    segs = merged;
  }
  return segs.filter((s) => s.k).map((s) => {
    const [root, suffix] = s.k.split('|');
    const r = Number(root);
    return { start: s.a * hop, end: s.b * hop, root: r, suffix, name: NOTE_NAMES[r] + suffix };
  });
}

// ── Voices ─────────────────────────────────────────────────────────────────────

/** Sounding pitches in one window's MIDI magnitudes (linear): greedy peaks, each pick taking its expected harmonics out. */
export function pickPitches(energy: Float32Array, maxVoices = GLIDE_VOICES, rel = 0.03): number[] {
  const e = Float32Array.from(energy);
  let top = 0;
  for (let i = 0; i < e.length; i++) if (e[i] > top) top = e[i];
  if (!(top > 0)) return [];
  const picks: number[] = [];
  const HARM = [12, 19, 24, 28, 31];            // harmonics 2..6 in semitones
  const HW = [0.6, 0.45, 0.35, 0.3, 0.25];      // how much of each a typical tone carries
  while (picks.length < maxVoices) {
    let bi = -1; let bv = top * rel;
    for (let i = 0; i < e.length; i++) {
      if (e[i] > bv && (i === 0 || e[i] >= e[i - 1]) && (i === e.length - 1 || e[i] >= e[i + 1])) { bv = e[i]; bi = i; }
    }
    if (bi < 0) break;
    picks.push(MIDI_LO + bi);
    e[bi] = 0;
    // the window's main lobe spills into the next semitone down low: take that spill out
    if (bi > 0) e[bi - 1] = Math.max(0, e[bi - 1] - bv * 0.8);
    if (bi < e.length - 1) e[bi + 1] = Math.max(0, e[bi + 1] - bv * 0.8);
    HARM.forEach((h, n) => { const j = bi + h; if (j < e.length) e[j] = Math.max(0, e[j] - bv * HW[n]); });
  }
  return picks.sort((a, b) => a - b);
}

/** Per-window pitch sets → GLIDE_VOICES continuous lines (sorted, nearest-voice fill, short gaps held, median-smoothed). */
export function trackVoices(frames: number[][], voices = GLIDE_VOICES): Float32Array[] {
  const n = frames.length;
  const out = Array.from({ length: voices }, () => new Float32Array(n).fill(NaN));
  const prev = new Array<number>(voices).fill(NaN);
  const gap = new Array<number>(voices).fill(0);
  for (let i = 0; i < n; i++) {
    const p = frames[i].slice(-voices); // keep the top ones if somehow more
    let slots: number[];
    if (p.length === voices) slots = p.map((_, k) => k);
    else slots = bestSubset(p, prev, voices);
    const got = new Array<number>(voices).fill(NaN);
    p.forEach((m, k) => { got[slots[k]] = m; });
    for (let v = 0; v < voices; v++) {
      if (!isNaN(got[v])) { out[v][i] = got[v]; prev[v] = got[v]; gap[v] = 0; }
      else if (!isNaN(prev[v]) && p.length > 0 && ++gap[v] <= 3) out[v][i] = prev[v];
      else gap[v] = 99;
    }
  }
  return out.map(median5);
}

function bestSubset(p: number[], prev: number[], voices: number): number[] {
  // choose increasing slot indices for the sorted pitches, minimising distance to each slot's last note
  let best: number[] = []; let bestCost = Infinity;
  const pick: number[] = [];
  const rec = (k: number, from: number) => {
    if (k === p.length) {
      let c = 0;
      for (let j = 0; j < p.length; j++) {
        const pv = prev[pick[j]];
        c += isNaN(pv) ? 6 + Math.abs(pick[j] - (j + (voices - p.length) / 2)) : Math.abs(pv - p[j]);
      }
      if (c < bestCost) { bestCost = c; best = pick.slice(); }
      return;
    }
    for (let s = from; s <= voices - (p.length - k); s++) { pick.push(s); rec(k + 1, s + 1); pick.pop(); }
  };
  rec(0, 0);
  return best;
}

function median5(a: Float32Array): Float32Array {
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    if (isNaN(a[i])) { o[i] = NaN; continue; }
    const w: number[] = [];
    for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < a.length && !isNaN(a[j])) w.push(a[j]);
    w.sort((x, y) => x - y);
    o[i] = w[w.length >> 1];
  }
  return o;
}

// ── Rhythm ─────────────────────────────────────────────────────────────────────

/** Attacks in an onset (spectral-flux) curve: peaks above a moving mean + k·σ, ≥ 60 ms apart. */
export function pickOnsets(flux: ArrayLike<number>, frameRate: number, k = 1.4): GlideOnset[] {
  const n = flux.length;
  if (n < 3 || !(frameRate > 0)) return [];
  const w = Math.max(3, Math.round(frameRate * 0.25));
  const minGap = Math.max(1, Math.round(frameRate * 0.06));
  let top = 0;
  for (let i = 0; i < n; i++) if (flux[i] > top) top = flux[i];
  if (!(top > 0)) return [];
  const out: GlideOnset[] = [];
  let last = -minGap;
  for (let i = 1; i < n - 1; i++) {
    const v = flux[i];
    if (v < flux[i - 1] || v < flux[i + 1]) continue;
    let s = 0, s2 = 0, c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += flux[j]; s2 += flux[j] * flux[j]; c++; }
    const mean = s / c; const sd = Math.sqrt(Math.max(0, s2 / c - mean * mean));
    if (v <= mean + k * sd || v < top * 0.05) continue;
    if (i - last < minGap) {
      const prev = out[out.length - 1];
      if (prev && v / top > prev.s) { prev.t = i / frameRate; prev.s = v / top; last = i; }
      continue;
    }
    out.push({ t: i / frameRate, s: v / top });
    last = i;
  }
  return out;
}

/** Beat grid at bpm, phase fitted to the onsets; every `perBar`-th beat (the strongest phase) is a downbeat. */
export function beatGrid(onsets: GlideOnset[], bpm: number, dur: number, perBar = 4): GlideBeat[] {
  if (!(bpm > 0) || !(dur > 0)) return [];
  const p = 60 / bpm;
  let bestPh = 0, bestS = -1;
  for (let k = 0; k < 40; k++) {
    const ph = (k / 40) * p;
    let s = 0;
    for (const o of onsets) {
      const d = ((o.t - ph) % p + p) % p;
      const e = Math.min(d, p - d) / p;
      s += o.s * Math.exp(-(e * e) / 0.004);
    }
    if (s > bestS) { bestS = s; bestPh = ph; }
  }
  const times: number[] = [];
  for (let t = bestPh; t < dur; t += p) times.push(t);
  // downbeat phase: the beat slot (mod perBar) carrying the most onset strength
  const slot = new Array<number>(perBar).fill(0);
  for (const o of onsets) {
    const i = Math.round((o.t - bestPh) / p);
    if (i >= 0 && Math.abs(o.t - (bestPh + i * p)) < p * 0.2) slot[i % perBar] += o.s;
  }
  const down = slot.indexOf(Math.max(...slot));
  return times.map((t, i) => ({ t, down: i % perBar === down }));
}

// ── Driver ─────────────────────────────────────────────────────────────────────

/** Chunked analyser: call step() until it returns true, then result(). */
export function createGlideAnalyzer(L: Float32Array, R: Float32Array | null, sr: number, fft: Fft) {
  const N = fft.n;
  const hop = Math.max(1, Math.round(sr * GLIDE_HOP_S));
  const len = L.length;
  const windows = Math.max(1, Math.ceil(len / hop));
  const half = N >> 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const han = new Float64Array(N);
  for (let i = 0; i < N; i++) han[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  // bin → MIDI slot (nearest semitone); a slot keeps its peak bin, so a low note
  // (few bins per semitone) weighs the same as a high one (many)
  const binMidi = new Int16Array(half).fill(-1);
  for (let k = 1; k < half; k++) {
    const f = (k * sr) / N;
    const m = 69 + 12 * Math.log2(f / 440);
    const r = Math.round(m);
    if (r >= MIDI_LO && r <= MIDI_HI) binMidi[k] = r - MIDI_LO;
  }
  const frames: Float32Array[] = [];
  const labels: ({ root: number; suffix: string } | null)[] = [];
  const rmsW = new Float32Array(windows);
  let wi = 0;

  function step(budgetMs: number, now: () => number): boolean {
    const t0 = now();
    while (wi < windows && now() - t0 < budgetMs) {
      const centre = wi * hop + (hop >> 1);
      const off = centre - half;
      let sq = 0;
      for (let i = 0; i < N; i++) {
        const p = off + i;
        const v = p >= 0 && p < len ? (R ? (L[p] + R[p]) * 0.5 : L[p]) : 0;
        sq += v * v;
        re[i] = v * han[i];
        im[i] = 0;
      }
      rmsW[wi] = Math.sqrt(sq / N);
      fft.transform(re, im);
      const e = new Float32Array(NB);
      for (let k = 1; k < half; k++) {
        const b = binMidi[k];
        if (b < 0) continue;
        const mg = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        if (mg > e[b]) e[b] = mg;
      }
      frames.push(e);
      wi++;
    }
    return wi >= windows;
  }

  function result(flux: ArrayLike<number>, frameRate: number, bpm: number | null): GlideResult {
    let loud = 0;
    for (let i = 0; i < windows; i++) if (rmsW[i] > loud) loud = rmsW[i];
    const gate = loud * 0.03; // ~ −30 dB under the loudest window is silence
    const pitchFrames: number[][] = [];
    for (let i = 0; i < windows; i++) {
      const e = frames[i];
      if (rmsW[i] < gate) { pitchFrames.push([]); labels.push(null); continue; }
      pitchFrames.push(pickPitches(e));
      const chroma = new Float64Array(12);
      for (let b = 0; b < NB; b++) {
        const m = MIDI_LO + b;
        if (m >= 40 && m <= 88) chroma[m % 12] += e[b];
      }
      labels.push(detectChord(chroma));
    }
    const voices = trackVoices(pitchFrames);
    let minM = Infinity, maxM = -Infinity;
    for (const v of voices) for (let i = 0; i < v.length; i++) if (!isNaN(v[i])) { if (v[i] < minM) minM = v[i]; if (v[i] > maxM) maxM = v[i]; }
    if (!isFinite(minM)) { minM = 48; maxM = 72; }
    const dur = len / sr;
    const onsets = pickOnsets(flux, frameRate);
    return {
      hop: hop / sr,
      windows,
      voices,
      chords: chordSegments(labels, hop / sr),
      onsets,
      beats: bpm ? beatGrid(onsets, bpm, dur) : [],
      minMidi: minM,
      maxMidi: maxM,
    };
  }

  return { step, result, windows: () => windows, done: () => wi };
}
