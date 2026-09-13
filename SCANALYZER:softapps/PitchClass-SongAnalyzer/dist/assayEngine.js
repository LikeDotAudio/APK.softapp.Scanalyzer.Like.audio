"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSAY_N = void 0;
exports.dbOf = dbOf;
exports.dbTxt = dbTxt;
exports.hzTxt = hzTxt;
exports.signedTxt = signedTxt;
exports.flatTxt = flatTxt;
exports.analyzeAudioBuffer = analyzeAudioBuffer;
const fftEngine_js_1 = require("./fftEngine.js");
const chromagram_js_1 = require("./chromagram.js");
const tempoDetector_js_1 = require("./tempoDetector.js");
function dbOf(x) {
    return x > 1e-9 ? 20 * Math.log10(x) : -Infinity;
}
function dbTxt(x) {
    return isFinite(x) ? `${x.toFixed(1)} dBFS` : "−∞";
}
function hzTxt(f) {
    if (!isFinite(f) || f <= 0)
        return "—";
    return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
}
function signedTxt(x, d) {
    return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);
}
function flatTxt(v) {
    if (!isFinite(v))
        return "—";
    return v >= 0.01 ? v.toFixed(3) : v.toPrecision(2);
}
exports.ASSAY_N = 2048;
function analyzeAudioBuffer(buf, onProgress, onComplete) {
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
        if (aa > peak)
            peak = aa;
        if (R) {
            const bb = Math.abs(b);
            if (bb > peak)
                peak = bb;
        }
        sq += mo * mo;
        sll += a * a;
        srr += b * b;
        slr += a * b;
    }
    const rms = Math.sqrt(sq / Math.max(1, len));
    const corr = R ? ((sll > 0 && srr > 0) ? slr / Math.sqrt(sll * srr) : 0) : 1;
    // Pass 2: STFT Spectral Centroid, Flatness, Chromagram & Flux
    let N = exports.ASSAY_N;
    while (N > 256 && N * 2 > len)
        N >>= 1;
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
    const fft = new fftEngine_js_1.FastFourierTransform(N);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    const han = new Float64Array(N);
    for (let i = 0; i < N; i++)
        han[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const pcTab = new Int8Array(half);
    for (let i = 0; i < half; i++)
        pcTab[i] = (0, chromagram_js_1.pcOfHz)((i * sr) / N);
    const mag = new Float64Array(half);
    const prev = new Float64Array(half);
    const flux = new Float32Array(nf);
    const chroma = new Float64Array(12);
    let cenN = 0;
    let cenD = 0;
    let flatS = 0;
    let flatW = 0;
    let fi = 0;
    function step() {
        if (canceled)
            return;
        const t0 = performance.now();
        while (fi < nf && performance.now() - t0 < 12) {
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
                if (d > 0)
                    fl += d;
            }
            flux[fi] = fl;
            if (e > 0) {
                cenN += cn;
                cenD += e;
                const am = e / (half - 1);
                const gm = Math.exp(lg / (half - 1));
                flatS += (am > 0 ? gm / am : 0) * e;
                flatW += e;
                for (let k = 1; k < half; k++) {
                    const pc = pcTab[k];
                    if (pc >= 0)
                        chroma[pc] += mag[k];
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
        const tempo = (0, tempoDetector_js_1.detectTempo)(flux, frameRate);
        const key = (0, chromagram_js_1.detectKey)(chroma);
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
            dur: buf.duration
        });
    }
    requestAnimationFrame(step);
    return {
        cancel: () => { canceled = true; }
    };
}
