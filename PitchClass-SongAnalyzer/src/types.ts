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

export interface AssayResult {
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
    silent?: boolean;
}

export interface MetricDefinition {
    k: string;
    label: string;
    note: string;
}
