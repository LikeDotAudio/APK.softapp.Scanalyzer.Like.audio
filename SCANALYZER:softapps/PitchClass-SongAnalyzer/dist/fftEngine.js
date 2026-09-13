"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FastFourierTransform = void 0;
class FastFourierTransform {
    n;
    rev;
    cos;
    sin;
    constructor(n) {
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
    transform(re, im) {
        const n = this.n;
        const rev = this.rev;
        const co = this.cos;
        const si = this.sin;
        for (let i = 0; i < n; i++) {
            const j = rev[i];
            if (j > i) {
                let t = re[i];
                re[i] = re[j];
                re[j] = t;
                t = im[i];
                im[i] = im[j];
                im[j] = t;
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
exports.FastFourierTransform = FastFourierTransform;
