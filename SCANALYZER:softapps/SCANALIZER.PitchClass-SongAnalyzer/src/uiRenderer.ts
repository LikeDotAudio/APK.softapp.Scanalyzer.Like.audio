import { AssayResult, MetricDefinition } from './types.js';
import { PITCH_CLASSES } from './chromagram.js';
import { dbTxt, hzTxt, signedTxt, flatTxt } from './assayEngine.js';

export const METRICS: MetricDefinition[] = [
    { k: "peak", label: "Peak", note: "loudest single sample" },
    { k: "rms", label: "RMS level", note: "average energy" },
    { k: "crest", label: "Crest factor", note: "how far peaks sit above the average" },
    { k: "cent", label: "Spectral centroid", note: "where the brightness sits" },
    { k: "flat", label: "Spectral flatness", note: "pure tone (0) to noise (1)" },
    { k: "corr", label: "Stereo correlation", note: "mono (+1) to fully decorrelated (0)" },
    { k: "tempo", label: "Tempo", note: "pulse found in the onset envelope" },
    { k: "key", label: "Key", note: "pitch-class profile against key templates" }
];

export class UiRenderer {
    private headlineEl: HTMLElement;
    private mrowsEl: HTMLElement;
    private chromaBarsEl: HTMLElement;
    private statusEl: HTMLElement;

    private metricCells: Record<string, { s: HTMLElement; d: HTMLElement; f: HTMLElement }> = {};

    constructor(
        headlineEl: HTMLElement,
        mrowsEl: HTMLElement,
        chromaBarsEl: HTMLElement,
        statusEl: HTMLElement
    ) {
        this.headlineEl = headlineEl;
        this.mrowsEl = mrowsEl;
        this.chromaBarsEl = chromaBarsEl;
        this.statusEl = statusEl;

        this.initTableAndChromagram();
    }

    private initTableAndChromagram(): void {
        this.mrowsEl.innerHTML = '';
        METRICS.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="m"><b>${m.label}</b><span>${m.note}</span></td>
                <td class="v src pend">—</td>
                <td class="v dr pend">—</td>
                <td><span class="chip none">—</span></td>
            `;
            this.mrowsEl.appendChild(tr);
            this.metricCells[m.k] = {
                s: tr.children[1] as HTMLElement,
                d: tr.children[2] as HTMLElement,
                f: (tr.children[3] as HTMLElement).firstChild as HTMLElement
            };
        });

        this.chromaBarsEl.innerHTML = '';
        for (let i = 0; i < 12; i++) {
            const d = document.createElement('div');
            d.className = 'pc';
            d.innerHTML = `
                <div class="col">
                    <div class="fill" id="chroma-fill-${i}"></div>
                    <div class="mark" id="chroma-mark-${i}"></div>
                </div>
                <span class="lab">${PITCH_CLASSES[i]}</span>
            `;
            this.chromaBarsEl.appendChild(d);
        }
    }

    public updateStatus(text: string): void {
        this.statusEl.textContent = text;
    }

    public renderAssay(source: AssayResult | null, probe: AssayResult | null): void {
        // Summary Sentence Headline
        if (source) {
            const keyStr = source.key ? source.key.name : "unknown key";
            const bpmStr = source.tempo ? `${Math.round(source.tempo.bpm)} BPM` : "unpitched tempo";
            const centStr = hzTxt(source.cent);
            const flatStr = flatTxt(source.flat);
            const corrStr = signedTxt(source.corr, 2);

            let sentence = `The audio reads <em>${keyStr}</em> · ${bpmStr} · centroid ${centStr}.`;
            if (probe && !probe.silent) {
                const probeKeyStr = probe.key ? probe.key.name : "unknown key";
                sentence += ` The probe reads <em>${probeKeyStr}</em> — flatness ${flatStr} → ${flatTxt(probe.flat)}, correlation ${corrStr} → ${signedTxt(probe.corr, 2)}.`;
            } else {
                sentence += ` Spectral flatness ${flatStr}, stereo correlation ${corrStr}.`;
            }

            this.headlineEl.innerHTML = sentence;
        } else {
            this.headlineEl.innerHTML = "Load an audio file or start live microphone probe to measure song pitch classes, key, tempo and spectral metrics.";
        }

        // Update Table Rows
        METRICS.forEach(m => {
            const cell = this.metricCells[m.k];
            let sv = "—";
            let dv = "—";

            if (source) {
                if (m.k === "peak") sv = dbTxt(source.peak);
                else if (m.k === "rms") sv = dbTxt(source.rms);
                else if (m.k === "crest") sv = isFinite(source.crest) ? `${source.crest.toFixed(1)} dB` : "—";
                else if (m.k === "cent") sv = hzTxt(source.cent);
                else if (m.k === "flat") sv = flatTxt(source.flat);
                else if (m.k === "corr") sv = source.stereo ? signedTxt(source.corr, 2) : "mono";
                else if (m.k === "tempo") sv = source.tempo ? `${Math.round(source.tempo.bpm)} BPM` : "none found";
                else if (m.k === "key") sv = source.key ? source.key.name : "—";
            }

            const liveProbe = probe && !probe.silent;
            if (liveProbe && probe) {
                if (m.k === "peak") dv = dbTxt(probe.peak);
                else if (m.k === "rms") dv = dbTxt(probe.rms);
                else if (m.k === "crest") dv = isFinite(probe.crest) ? `${probe.crest.toFixed(1)} dB` : "—";
                else if (m.k === "cent") dv = hzTxt(probe.cent);
                else if (m.k === "flat") dv = flatTxt(probe.flat);
                else if (m.k === "corr") dv = signedTxt(probe.corr, 2);
                else if (m.k === "tempo") dv = "live";
                else if (m.k === "key") dv = probe.key ? probe.key.name : "—";
            }

            cell.s.textContent = sv;
            cell.s.classList.toggle('pend', !source);
            cell.d.textContent = dv;
            cell.d.classList.toggle('pend', !liveProbe);

            // Fate Evaluation
            if (source && liveProbe && probe) {
                if (m.k === "crest") {
                    const diff = probe.crest - source.crest;
                    cell.f.textContent = Math.abs(diff) < 1.5 ? "HELD" : (diff < 0 ? "COMPRESSED" : "EXPANDED");
                    cell.f.className = Math.abs(diff) < 1.5 ? "chip keep" : "chip shift";
                } else if (m.k === "cent") {
                    const ratio = probe.cent / source.cent;
                    cell.f.textContent = (ratio > 0.8 && ratio < 1.25) ? "HELD" : (ratio > 1 ? "BRIGHTER" : "DARKER");
                    cell.f.className = (ratio > 0.8 && ratio < 1.25) ? "chip keep" : "chip shift";
                } else if (m.k === "key") {
                    const match = probe.key && source.key && (probe.key.pc === source.key.pc && probe.key.mode === source.key.mode);
                    cell.f.textContent = match ? "HELD" : "DRIFTED";
                    cell.f.className = match ? "chip keep" : "chip shift";
                } else {
                    cell.f.textContent = "PROBED";
                    cell.f.className = "chip keep";
                }
            } else {
                cell.f.textContent = "—";
                cell.f.className = "chip none";
            }
        });

        // 12 Pitch-Class Bars Rendering
        let maxS = 0;
        let maxD = 0;
        if (source) {
            for (let i = 0; i < 12; i++) if (source.chroma[i] > maxS) maxS = source.chroma[i];
        }
        if (probe) {
            for (let i = 0; i < 12; i++) if (probe.chroma[i] > maxD) maxD = probe.chroma[i];
        }

        for (let i = 0; i < 12; i++) {
            const fillEl = document.getElementById(`chroma-fill-${i}`);
            const markEl = document.getElementById(`chroma-mark-${i}`);

            if (fillEl) {
                const sPct = (source && maxS > 0) ? (source.chroma[i] / maxS) * 100 : 0;
                fillEl.style.height = `${sPct.toFixed(1)}%`;
            }
            if (markEl) {
                const dPct = (probe && maxD > 0) ? (probe.chroma[i] / maxD) * 100 : 0;
                markEl.style.bottom = `${dPct.toFixed(1)}%`;
                markEl.style.display = (probe && !probe.silent) ? 'block' : 'none';
            }
        }
    }
}
