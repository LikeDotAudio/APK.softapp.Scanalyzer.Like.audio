// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// SONG GLIDE — the Song Analyzer's chord / note-line / rhythm graph.
// songGlide.ts has no imports, so Node's type stripping loads it; the FFT is handed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlideAnalyzer, detectChord, pickOnsets, beatGrid, noteName, GLIDE_N } from '../src/components/SongTab/songGlide.ts';

function fft(n) {
  return { n, transform(re, im) {
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k), s = Math.sin(a * k), l = i + k + len / 2;
        const tr = re[l] * c - im[l] * s, ti = re[l] * s + im[l] * c;
        re[l] = re[i + k] - tr; im[l] = im[i + k] - ti; re[i + k] += tr; im[i + k] += ti; } } } };
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

test('chord names: Em9, B7(♭9), Am', () => {
  const ch = (pcs) => { const c = new Float64Array(12); pcs.forEach((p) => { c[p] = 1; }); return c; };
  const name = (r) => ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][r.root] + r.suffix;
  assert.equal(name(detectChord(ch([4, 7, 11, 2, 6]))), 'Em9');
  assert.equal(name(detectChord(ch([11, 3, 6, 9, 0]))), 'B7(♭9)');
  assert.equal(name(detectChord(ch([9, 0, 4]))), 'Am');
  assert.equal(detectChord(new Float64Array(12)), null);
});

test('note names read like the playhead labels', () => {
  assert.equal(noteName(40), 'E2'); assert.equal(noteName(66), 'F♯4'); assert.equal(noteName(71), 'B4');
});

test('two chords of harmonic tones → right notes on the lines, right chord names', () => {
  const sr = 22050, dur = 4, len = sr * dur, L = new Float32Array(len);
  const A = [40, 55, 59, 67];   // E2 G3 B3 G4  (Em)
  const B = [45, 52, 60, 69];   // A2 E3 C4 A4  (Am)
  for (let i = 0; i < len; i++) {
    const t = i / sr, notes = t < 2 ? A : B; let v = 0;
    for (const m of notes) for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * hz(m) * h * t) * 0.12 / h;
    L[i] = v;
  }
  const g = createGlideAnalyzer(L, null, sr, fft(GLIDE_N));
  while (!g.step(1e9, () => 0));
  const r = g.result(new Float32Array(0), 100, null);
  const at = (s) => r.voices.map((v) => v[Math.round(s / r.hop)]).filter((m) => !isNaN(m)).sort((a, b) => a - b);
  assert.deepEqual(at(1.0), A);
  assert.deepEqual(at(3.0), B);
  assert.deepEqual(r.chords.map((c) => c.name), ['Em', 'Am']);
  assert.ok(Math.abs(r.chords[1].start - 2) < 0.35, `change at ${r.chords[1].start}`);
});

test('rhythm: onsets picked from a flux curve, beat grid locks to them with downbeats', () => {
  const fr = 100, n = 800, flux = new Float32Array(n);
  for (let i = 0; i < n; i++) flux[i] = 0.05 + 0.02 * Math.sin(i);
  for (let b = 0; b * 50 + 7 < n; b++) flux[b * 50 + 7] = b % 4 === 0 ? 3 : 1.5;  // 120 BPM, accent each bar
  const on = pickOnsets(flux, fr);
  assert.equal(on.length, 16);
  assert.ok(Math.abs(on[0].t - 0.07) < 0.011);
  const beats = beatGrid(on, 120, 8);
  assert.ok(Math.abs(beats[0].t - 0.07) < 0.03, `phase ${beats[0].t}`);
  assert.deepEqual(beats.filter((b) => b.down).map((b) => Math.round(beats.indexOf(b))), [0, 4, 8, 12]);
});
