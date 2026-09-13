"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaulstretchStretcher = void 0;
const fftEngine_js_1 = require("./fftEngine.js");
class PaulstretchStretcher {
    sr;
    ch;
    src = [];
    len;
    stretch = 4.3;
    smear = 0.84;
    pos = 0; // fractional read head in source samples
    queue = [[], []]; // per-channel chunk queues
    qOff = 0;
    qLen = 0;
    N = 0;
    half = 0;
    fft;
    win;
    re;
    im;
    tail = [];
    constructor(sampleRate, buffer) {
        this.sr = sampleRate;
        this.ch = Math.min(2, buffer.numberOfChannels);
        for (let c = 0; c < this.ch; c++) {
            this.src.push(buffer.getChannelData(c));
        }
        this.len = buffer.length;
        this.setWindow(0.341);
    }
    setWindow(sec) {
        const target = Math.max(256, Math.min(65536, sec * this.sr));
        const n = 1 << Math.round(Math.log(target) / Math.LN2);
        if (n === this.N)
            return;
        this.N = n;
        this.half = n >> 1;
        this.fft = new fftEngine_js_1.FastFourierTransform(n);
        this.win = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const x = (2 * i / (n - 1)) - 1; // -1 .. 1
            this.win[i] = Math.pow(1 - x * x, 1.25); // Paulstretch bell window
        }
        this.re = new Float64Array(n);
        this.im = new Float64Array(n);
        this.tail = [];
        for (let c = 0; c < this.ch; c++) {
            this.tail.push(new Float64Array(this.half));
        }
        this.queue = [[], []];
        this.qOff = 0;
        this.qLen = 0;
    }
    actualWindow() {
        return this.N / this.sr;
    }
    seek(frac) {
        this.pos = Math.max(0, Math.min(0.999, frac)) * this.len;
        for (let c = 0; c < this.ch; c++) {
            this.tail[c].fill(0);
        }
        this.queue = [[], []];
        this.qOff = 0;
        this.qLen = 0;
    }
    grain() {
        const n = this.N;
        const half = this.half;
        const win = this.win;
        const re = this.re;
        const im = this.im;
        const smear = this.smear;
        const PI = Math.PI;
        const len = this.len;
        const base = this.pos;
        for (let c = 0; c < this.ch; c++) {
            const d = this.src[c];
            for (let i = 0; i < n; i++) {
                let p = base + i;
                if (p >= len)
                    p -= len * Math.floor(p / len); // loop source
                const i0 = p | 0;
                const fr = p - i0;
                let i1 = i0 + 1;
                if (i1 >= len)
                    i1 = 0;
                const s = d[i0] * (1 - fr) + d[i1] * fr;
                re[i] = s * win[i];
                im[i] = 0;
            }
            this.fft.transform(re, im);
            // Magnitude kept, phase scattered (smear)
            for (let k = 1; k < half; k++) {
                const a = re[k];
                const b = im[k];
                const mag = Math.sqrt(a * a + b * b);
                let ph;
                if (smear >= 1) {
                    ph = Math.random() * 2 * PI;
                }
                else {
                    ph = Math.atan2(b, a) + (Math.random() * 2 - 1) * PI * smear;
                }
                const rr = mag * Math.cos(ph);
                const ii = mag * Math.sin(ph);
                re[k] = rr;
                im[k] = ii;
                re[n - k] = rr;
                im[n - k] = -ii;
            }
            im[0] = 0;
            im[half] = 0;
            this.fft.transform(im, re); // IFFT real part lands in re
            const inv = 1 / n;
            const tail = this.tail[c];
            const out = new Float32Array(half);
            for (let i = 0; i < half; i++) {
                out[i] = tail[i] + re[i] * inv * win[i];
            }
            for (let i = 0; i < half; i++) {
                tail[i] = re[half + i] * inv * win[half + i];
            }
            this.queue[c].push(out);
        }
        this.qLen += half;
        this.pos += half / this.stretch;
        if (this.pos >= len)
            this.pos -= len;
    }
    pull(outs, frames) {
        while (this.qLen < frames) {
            this.grain();
        }
        let written = 0;
        while (written < frames) {
            const chunkLen = this.queue[0][0].length;
            const take = Math.min(frames - written, chunkLen - this.qOff);
            for (let c = 0; c < outs.length; c++) {
                const src = this.queue[Math.min(c, this.ch - 1)][0];
                const dst = outs[c];
                for (let i = 0; i < take; i++) {
                    dst[written + i] = src[this.qOff + i];
                }
            }
            this.qOff += take;
            written += take;
            this.qLen -= take;
            if (this.qOff >= chunkLen) {
                for (let c2 = 0; c2 < this.ch; c2++) {
                    this.queue[c2].shift();
                }
                this.qOff = 0;
            }
        }
    }
}
exports.PaulstretchStretcher = PaulstretchStretcher;
