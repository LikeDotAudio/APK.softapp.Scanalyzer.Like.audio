export class SpectrogramRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private ramp: [number, number, number][] = [];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.initPalette();
        this.clear();
    }

    public initPalette(): void {
        // Dark purple to bright rose/pink heat map matching DroneKiln theme
        this.ramp = [
            [20, 17, 28],    // #14111c - ground
            [46, 35, 64],    // #2e2340 - dark violet
            [141, 63, 107],  // #8d3f6b - rose dark
            [212, 113, 143], // #d4718f - rose primary
            [244, 230, 236]  // #f4e6ec - rose highlight
        ];
    }

    public clear(): void {
        this.fit();
        this.ctx.fillStyle = `rgb(${this.ramp[0].join(',')})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    public fit(): boolean {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            return true;
        }
        return false;
    }

    private rampAt(v: number): string {
        const val = Math.max(0, Math.min(1, v)) * (this.ramp.length - 1);
        const idx = Math.min(this.ramp.length - 2, Math.floor(val));
        const f = val - idx;
        const a = this.ramp[idx];
        const b = this.ramp[idx + 1];
        const r = Math.round(a[0] + (b[0] - a[0]) * f);
        const g = Math.round(a[1] + (b[1] - a[1]) * f);
        const bl = Math.round(a[2] + (b[2] - a[2]) * f);
        return `rgb(${r},${g},${bl})`;
    }

    public drawColumn(freqData: Uint8Array, sampleRate: number): void {
        this.fit();
        const W = this.canvas.width;
        const H = this.canvas.height;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const col = Math.max(1, Math.round(1.5 * dpr));

        // Shift left
        this.ctx.drawImage(this.canvas, -col, 0);

        const nyq = sampleRate / 2;
        const bins = freqData.length;

        for (let y = 0; y < H; y++) {
            const fFrac = 1 - (y / H); // top = high freq
            // Log mapped frequency axis from 60Hz to 16kHz
            const hz = 60 * Math.pow(Math.min(16000, nyq) / 60, fFrac);
            const binIdx = Math.min(bins - 1, Math.max(0, Math.round((hz / nyq) * bins)));
            const v = freqData[binIdx] / 255;
            this.ctx.fillStyle = this.rampAt(Math.pow(v, 0.85));
            this.ctx.fillRect(W - col, y, col, 1);
        }
    }
}
