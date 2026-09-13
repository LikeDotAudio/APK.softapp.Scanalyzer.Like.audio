import { KeyResult } from './types.js';

export const PITCH_CLASSES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

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
        conf: best.c,
        name: `${PITCH_CLASSES[best.pc]}${best.mode ? " minor" : " major"}`
    };
}
