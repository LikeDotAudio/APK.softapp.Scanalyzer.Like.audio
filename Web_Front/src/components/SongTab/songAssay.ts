// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

export interface KeyResult {
  pc: number;
  mode: number; // 0 = major, 1 = minor
  conf: number;
  name: string;
}

export interface TempoResult {
  bpm: number;
  conf: number;
}

export interface SongSection {
  index: number;
  start: number; // seconds
  end: number;   // seconds
  energy: number; // 0..1
  dominantPc: number;
  dominantKey: string;
  label: string;
}

export interface SongAssayResult {
  peak: number;        // dBFS
  rms: number;         // dBFS
  crest: number;       // dB
  cent: number;        // Hz
  flat: number;        // 0 to 1
  corr: number;        // -1 to +1
  stereo: boolean;
  tempo: TempoResult | null;
  key: KeyResult | null;
  chroma: Float64Array; // 12 chromatic bins
  frames: number;
  frameRate: number;
  capped: boolean;
  dur: number;
  sampleRate: number;
  channels: number;
  sections: SongSection[];
}

export const PITCH_CLASSES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// Krumhansl-Schmuckler Key Profile Templates (Major / Minor)
export const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function pcOfHz(freq: number): number {
  if (freq < 55 || freq > 2200) return -1;
  return ((Math.round(12 * Math.log(freq / 440) / Math.LN2) % 12) + 21) % 12;
}

export function detectKey(chroma: Float64Array): KeyResult | null {
  let mean = 0;
  let tot = 0;
  for (let i = 0; i < 12; i++) {
    mean += chroma[i];
    tot += chroma[i];
  }
  if (tot <= 0) return null;
  mean /= 12;

  let best: { c: number; pc: number; mode: number } | null = null;

  for (let r = 0; r < 12; r++) {
    for (let m = 0; m < 2; m++) {
      const prof = m ? KS_MINOR : KS_MAJOR;
      let pm = 0;
      for (let i = 0; i < 12; i++) pm += prof[i];
      pm /= 12;

      let sn = 0;
      let d1 = 0;
      let d2 = 0;
      for (let i = 0; i < 12; i++) {
        const x = chroma[(r + i) % 12] - mean;
        const y = prof[i] - pm;
        sn += x * y;
        d1 += x * x;
        d2 += y * y;
      }
      const c = (d1 > 0 && d2 > 0) ? sn / Math.sqrt(d1 * d2) : 0;
      if (!best || c > best.c) {
        best = { c, pc: r, mode: m };
      }
    }
  }

  if (!best) return null;

  return {
    pc: best.pc,
    mode: best.mode,
    conf: Math.max(0, Math.min(1, best.c)),
    name: `${PITCH_CLASSES[best.pc]}${best.mode ? ' Minor' : ' Major'}`
  };
}

export function detectTempo(flux: Float32Array, frameRate: number): TempoResult | null {
  const n = flux.length;
  if (n < 60 || !isFinite(frameRate) || frameRate <= 0) return null;

  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + flux[i];

  const w = Math.max(4, Math.round(frameRate * 0.5));
  const env = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n, i + w + 1);
    env[i] = Math.max(0, flux[i] - (pre[b] - pre[a]) / (b - a));
  }

  const lagLo = Math.max(2, Math.round(frameRate * 60 / 210));
  const lagHi = Math.min(n - 4, Math.round(frameRate * 60 / 55));
  if (lagHi <= lagLo) return null;

  let best = -1;
  let bestLag = 0;
  let tot = 0;
  let cnt = 0;

  for (let lag = lagLo; lag <= lagHi; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) {
      sum += env[i] * env[i + lag];
    }
    sum /= (n - lag);
    tot += sum;
    cnt++;
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || best <= 0) return null;

  let bpm = (60 * frameRate) / bestLag;
  while (bpm < 65) bpm *= 2;
  while (bpm > 185) bpm /= 2;

  const avg = cnt > 0 ? tot / cnt : 1;
  return {
    bpm: Math.round(bpm * 10) / 10,
    conf: Math.min(1, Math.max(0, (best / (avg || 1) - 1) / 3))
  };
}

export class FastFourierTransform {
  public n: number;
  private rev: Uint32Array;
  private cos: Float64Array;
  private sin: Float64Array;

  constructor(n: number) {
    this.n = n;
    const levels = Math.round(Math.log(n) / Math.LN2);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let x = i;
      let r = 0;
      for (let j = 0; j < levels; j++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r >>> 0;
    }
    this.cos = new Float64Array(n >> 1);
    this.sin = new Float64Array(n >> 1);
    for (let k = 0; k < (n >> 1); k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / n);
      this.sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
  }

  public transform(re: Float64Array, im: Float64Array): void {
    const n = this.n;
    const rev = this.rev;
    const co = this.cos;
    const si = this.sin;

    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const t = re[i]; re[i] = re[j]; re[j] = t;
        const tm = im[i]; im[i] = im[j]; im[j] = tm;
      }
    }

    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const c = co[k];
          const s = si[k];
          const tre = re[l] * c + im[l] * s;
          const tim = -re[l] * s + im[l] * c;
          re[l] = re[j] - tre;
          im[l] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  }
}

export function dbOf(x: number): number {
  return x > 1e-9 ? 20 * Math.log10(x) : -Infinity;
}

export function dbTxt(x: number): string {
  return isFinite(x) ? `${x.toFixed(1)} dBFS` : '−∞';
}

export function hzTxt(f: number): string {
  if (!isFinite(f) || f <= 0) return '—';
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
}

export const ASSAY_N = 2048;

export function analyzeSongBuffer(
  buf: AudioBuffer,
  onProgress: (pct: number) => void,
  onComplete: (result: SongAssayResult) => void
): { cancel: () => void } {
  let canceled = false;

  const sr = buf.sampleRate;
  const len = buf.length;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;

  // Pass 1: Time domain Peak, RMS, Stereo Correlation
  let peak = 0;
  let sq = 0;
  let sll = 0;
  let srr = 0;
  let slr = 0;

  for (let i = 0; i < len; i++) {
    const a = L[i];
    const b = R ? R[i] : a;
    const mo = (a + b) * 0.5;
    const aa = Math.abs(a);
    if (aa > peak) peak = aa;
    if (R) {
      const bb = Math.abs(b);
      if (bb > peak) peak = bb;
    }
    sq += mo * mo;
    sll += a * a;
    srr += b * b;
    slr += a * b;
  }

  const rms = Math.sqrt(sq / Math.max(1, len));
  const corr = R ? ((sll > 0 && srr > 0) ? slr / Math.sqrt(sll * srr) : 0) : 1;

  // Pass 2: STFT Spectral Centroid, Flatness, Chromagram & Flux
  let N = ASSAY_N;
  while (N > 256 && N * 2 > len) N >>= 1;
  let hop = N >> 1;
  let nf = Math.max(1, Math.floor((len - N) / hop) + 1);
  let capped = false;
  if (nf > 9000) {
    hop = Math.ceil((len - N) / 9000);
    nf = Math.floor((len - N) / hop) + 1;
    capped = true;
  }

  const frameRate = sr / hop;
  const half = N >> 1;

  const fft = new FastFourierTransform(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  const han = new Float64Array(N);
  for (let i = 0; i < N; i++) han[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const pcTab = new Int8Array(half);
  for (let i = 0; i < half; i++) pcTab[i] = pcOfHz((i * sr) / N);

  const mag = new Float64Array(half);
  const prev = new Float64Array(half);
  const flux = new Float32Array(nf);
  const chroma = new Float64Array(12);

  // Per-section tracking (8 to 16 temporal blocks across the duration)
  const numSections = Math.min(16, Math.max(4, Math.round(buf.duration / 8)));
  const framesPerSection = Math.ceil(nf / numSections);
  const sectionChroma = Array.from({ length: numSections }, () => new Float64Array(12));
  const sectionEnergy = new Float64Array(numSections);

  let cenN = 0;
  let cenD = 0;
  let flatS = 0;
  let flatW = 0;
  let fi = 0;

  function step() {
    if (canceled) return;
    const t0 = performance.now();
    while (fi < nf && performance.now() - t0 < 14) {
      const off = fi * hop;
      for (let i = 0; i < N; i++) {
        const pp = off + i;
        const v = pp < len ? (R ? (L[pp] + R[pp]) * 0.5 : L[pp]) : 0;
        re[i] = v * han[i];
        im[i] = 0;
      }

      fft.transform(re, im);

      let e = 0;
      let cn = 0;
      let lg = 0;

      for (let k = 1; k < half; k++) {
        const mg = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        mag[k] = mg;
        e += mg;
        cn += (k * sr / N) * mg;
        lg += Math.log(mg + 1e-12);
      }

      let fl = 0;
      for (let k = 1; k < half; k++) {
        const d = mag[k] - prev[k];
        if (d > 0) fl += d;
      }
      flux[fi] = fl;

      const secIdx = Math.min(numSections - 1, Math.floor(fi / framesPerSection));

      if (e > 0) {
        cenN += cn;
        cenD += e;
        const am = e / (half - 1);
        const gm = Math.exp(lg / (half - 1));
        flatS += (am > 0 ? gm / am : 0) * e;
        flatW += e;
        sectionEnergy[secIdx] += e;

        for (let k = 1; k < half; k++) {
          const pc = pcTab[k];
          if (pc >= 0) {
            chroma[pc] += mag[k];
            sectionChroma[secIdx][pc] += mag[k];
          }
        }
      }

      prev.set(mag);
      fi++;
    }

    if (fi < nf) {
      onProgress(fi / nf);
      requestAnimationFrame(step);
      return;
    }

    const tempo = detectTempo(flux, frameRate);
    const key = detectKey(chroma);

    // Build Song Sections
    const maxEnergy = Math.max(1, ...sectionEnergy);
    const sections: SongSection[] = [];
    const secDur = buf.duration / numSections;

    for (let s = 0; s < numSections; s++) {
      const nrg = sectionEnergy[s] / maxEnergy;
      let domPc = 0;
      let domVal = 0;
      for (let p = 0; p < 12; p++) {
        if (sectionChroma[s][p] > domVal) {
          domVal = sectionChroma[s][p];
          domPc = p;
        }
      }

      let label = `Section ${s + 1}`;
      if (s === 0) label = 'Intro';
      else if (s === numSections - 1) label = 'Outro';
      else if (nrg > 0.8) label = 'Climax / Chorus';
      else if (nrg > 0.5) label = 'Verse / Movement';
      else label = 'Bridge / Breakdown';

      sections.push({
        index: s,
        start: s * secDur,
        end: Math.min(buf.duration, (s + 1) * secDur),
        energy: Math.round(nrg * 100) / 100,
        dominantPc: domPc,
        dominantKey: PITCH_CLASSES[domPc],
        label
      });
    }

    onComplete({
      peak: dbOf(peak),
      rms: dbOf(rms),
      crest: dbOf(peak) - dbOf(rms),
      cent: cenD > 0 ? cenN / cenD : NaN,
      flat: flatW > 0 ? flatS / flatW : NaN,
      corr,
      stereo: !!R,
      tempo,
      key,
      chroma,
      frames: nf,
      frameRate,
      capped,
      dur: buf.duration,
      sampleRate: sr,
      channels: buf.numberOfChannels,
      sections
    });
  }

  requestAnimationFrame(step);

  return {
    cancel: () => { canceled = true; }
  };
}
