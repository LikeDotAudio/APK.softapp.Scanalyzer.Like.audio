import { TempoResult } from './types.js';

export function detectTempo(flux: Float32Array, frameRate: number): TempoResult | null {
    const n = flux.length;
    if (n < 80 || !isFinite(frameRate)) return null;

    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + flux[i];

    const w = Math.max(4, Math.round(frameRate * 0.5));
    const env = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - w);
        const b = Math.min(n, i + w + 1);
        env[i] = Math.max(0, flux[i] - (pre[b] - pre[a]) / (b - a));
    }

    const lagLo = Math.max(2, Math.round(frameRate * 60 / 200));
    const lagHi = Math.min(n - 4, Math.round(frameRate * 60 / 50));
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
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;

    return {
        bpm,
        conf: tot > 0 ? best / (tot / cnt) : 0
    };
}
