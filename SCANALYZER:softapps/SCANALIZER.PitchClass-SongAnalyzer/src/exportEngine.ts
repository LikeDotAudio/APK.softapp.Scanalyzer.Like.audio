import { AssayResult } from './types.js';

export function exportAssayJson(sourceAssay: AssayResult | null, liveAssay: AssayResult | null, songName: string = 'song'): void {
    const payload = {
        app: "PitchClass-SongAnalyzer",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        songName,
        sourceAssay: sourceAssay ? formatAssayForExport(sourceAssay) : null,
        liveProbeAssay: liveAssay ? formatAssayForExport(liveAssay) : null
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `${slugify(songName)}_assay_sidecar.json`);
}

export function exportAssayCsv(sourceAssay: AssayResult | null, liveAssay: AssayResult | null, songName: string = 'song'): void {
    const lines: string[] = [];
    lines.push("MEASURE,SOURCE_SONG,PROBE_DRONE,UNIT");
    
    if (sourceAssay) {
        lines.push(`Peak Level,${sourceAssay.peak.toFixed(1)},${liveAssay ? liveAssay.peak.toFixed(1) : ''},dBFS`);
        lines.push(`RMS Level,${sourceAssay.rms.toFixed(1)},${liveAssay ? liveAssay.rms.toFixed(1) : ''},dBFS`);
        lines.push(`Crest Factor,${sourceAssay.crest.toFixed(1)},${liveAssay ? liveAssay.crest.toFixed(1) : ''},dB`);
        lines.push(`Spectral Centroid,${isNaN(sourceAssay.cent) ? '' : Math.round(sourceAssay.cent)},${liveAssay && !isNaN(liveAssay.cent) ? Math.round(liveAssay.cent) : ''},Hz`);
        lines.push(`Spectral Flatness,${isNaN(sourceAssay.flat) ? '' : sourceAssay.flat.toFixed(3)},${liveAssay && !isNaN(liveAssay.flat) ? liveAssay.flat.toFixed(3) : ''},ratio`);
        lines.push(`Stereo Correlation,${sourceAssay.corr.toFixed(2)},${liveAssay ? liveAssay.corr.toFixed(2) : ''},r`);
        lines.push(`Detected Key,${sourceAssay.key ? sourceAssay.key.name : 'Unknown'},${liveAssay && liveAssay.key ? liveAssay.key.name : ''},key`);
        lines.push(`Detected Tempo,${sourceAssay.tempo ? sourceAssay.tempo.bpm : ''},${liveAssay && liveAssay.tempo ? liveAssay.tempo.bpm : ''},BPM`);
    }

    lines.push("");
    lines.push("PITCH_CLASS,NOTE_NAME,SOURCE_WEIGHT,PROBE_WEIGHT");
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    for (let i = 0; i < 12; i++) {
        const srcW = sourceAssay ? sourceAssay.chroma[i].toFixed(4) : "0";
        const prbW = liveAssay ? liveAssay.chroma[i].toFixed(4) : "0";
        lines.push(`${i},${notes[i]},${srcW},${prbW}`);
    }

    const blob = new Blob([lines.join("\n")], { type: 'text/csv' });
    triggerDownload(blob, `${slugify(songName)}_assay_metrics.csv`);
}

export function encodeWavBlob(samplesL: Float32Array, samplesR: Float32Array, sampleRate: number): Blob {
    const numChannels = 2;
    const length = samplesL.length;
    const buffer = new ArrayBuffer(44 + length * 2 * numChannels);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length * 2 * numChannels, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
    view.setUint16(32, numChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, length * 2 * numChannels, true);

    // Write interleaved PCM 16-bit audio
    let offset = 44;
    for (let i = 0; i < length; i++) {
        const sL = Math.max(-1, Math.min(1, samplesL[i]));
        const sR = Math.max(-1, Math.min(1, samplesR[i]));
        view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
        offset += 2;
        view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

export function downloadWavFile(samplesL: Float32Array, samplesR: Float32Array, sampleRate: number, filename: string): void {
    const blob = encodeWavBlob(samplesL, samplesR, sampleRate);
    triggerDownload(blob, filename);
}

function writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function formatAssayForExport(assay: AssayResult) {
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const chromaObj: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
        chromaObj[notes[i]] = parseFloat(assay.chroma[i].toFixed(4));
    }

    return {
        peak_dBFS: parseFloat(assay.peak.toFixed(1)),
        rms_dBFS: parseFloat(assay.rms.toFixed(1)),
        crest_dB: parseFloat(assay.crest.toFixed(1)),
        centroid_Hz: isNaN(assay.cent) ? null : Math.round(assay.cent),
        flatness: isNaN(assay.flat) ? null : parseFloat(assay.flat.toFixed(4)),
        stereoCorrelation: parseFloat(assay.corr.toFixed(2)),
        detectedKey: assay.key ? assay.key.name : null,
        keyConfidence: assay.key ? parseFloat(assay.key.conf.toFixed(2)) : null,
        detectedTempoBpm: assay.tempo ? assay.tempo.bpm : null,
        pitchClasses: chromaObj
    };
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
