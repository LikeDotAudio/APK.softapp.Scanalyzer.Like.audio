import { UiRenderer } from './uiRenderer.js';
import { analyzeAudioBuffer, ASSAY_N, dbOf } from './assayEngine.js';
import { AssayResult } from './types.js';
import { FastFourierTransform } from './fftEngine.js';
import { pcOfHz, detectKey } from './chromagram.js';
import { PaulstretchStretcher } from './paulstretchEngine.js';
import { SpectrogramRenderer } from './spectrogramCanvas.js';
import { exportAssayJson, exportAssayCsv, downloadWavFile } from './exportEngine.js';

let audioCtx: AudioContext | null = null;
let currentBuffer: AudioBuffer | null = null;
let sourceAssay: AssayResult | null = null;
let liveAssay: AssayResult | null = null;
let activeAnalysisJob: { cancel: () => void } | null = null;
let currentSongName: string = 'song';

// Paulstretch & Spectrogram Engine
let stretcher: PaulstretchStretcher | null = null;
let specRenderer: SpectrogramRenderer | null = null;
let scriptNode: ScriptProcessorNode | null = null;
let mainAnalyser: AnalyserNode | null = null;
let mainGain: GainNode | null = null;
let isStretcherPlaying = false;

// Mic Probe Engine
let micStream: MediaStream | null = null;
let micSourceNode: MediaStreamAudioSourceNode | null = null;
let micAnalyserL: AnalyserNode | null = null;
let micAnalyserR: AnalyserNode | null = null;
let micTimer: any = null;

let renderer: UiRenderer | null = null;
let animFrameReq: number | null = null;

const STRETCH_LO = 1.0;
const STRETCH_HI = 64.0;
const WIN_LO = 0.03;
const WIN_HI = 2.0;

function logMap(t: number, lo: number, hi: number): number {
    return lo * Math.pow(hi / lo, t);
}

function readStretch(): number {
    const el = document.getElementById('stretch') as HTMLInputElement;
    return el ? logMap(parseFloat(el.value), STRETCH_LO, STRETCH_HI) : 4.3;
}

function readWin(): number {
    const el = document.getElementById('win') as HTMLInputElement;
    return el ? logMap(parseFloat(el.value), WIN_LO, WIN_HI) : 0.341;
}

function getAudioContext(): AudioContext {
    if (!audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function refreshSliderLabels(): void {
    const stVal = readStretch();
    const smearEl = document.getElementById('smear') as HTMLInputElement;
    const smearVal = smearEl ? parseFloat(smearEl.value) : 0.84;
    const winVal = stretcher ? stretcher.actualWindow() : readWin();

    const stOut = document.getElementById('stretchV');
    if (stOut) stOut.textContent = (stVal < 10 ? stVal.toFixed(1) : Math.round(stVal).toString()) + '×';

    const smearOut = document.getElementById('smearV');
    if (smearOut) smearOut.textContent = smearVal.toFixed(2);

    const winOut = document.getElementById('winV');
    if (winOut) winOut.textContent = winVal.toFixed(3) + ' s';

    if (stretcher) {
        stretcher.stretch = stVal;
        stretcher.smear = smearVal;
        stretcher.setWindow(readWin());
    }
}

function startSpectrogramLoop(): void {
    if (animFrameReq !== null) return;

    const freqData = new Uint8Array(1024);

    const draw = () => {
        animFrameReq = requestAnimationFrame(draw);
        if (mainAnalyser && specRenderer && audioCtx) {
            mainAnalyser.getByteFrequencyData(freqData);
            specRenderer.drawColumn(freqData, audioCtx.sampleRate);
        }
    };
    draw();
}

function stopSpectrogramLoop(): void {
    if (animFrameReq !== null) {
        cancelAnimationFrame(animFrameReq);
        animFrameReq = null;
    }
}

function initAudioGraph(): void {
    const ctx = getAudioContext();
    if (!mainGain) {
        mainGain = ctx.createGain();
        const gainEl = document.getElementById('gain') as HTMLInputElement;
        mainGain.gain.value = gainEl ? parseFloat(gainEl.value) : 0.7;
    }
    if (!mainAnalyser) {
        mainAnalyser = ctx.createAnalyser();
        mainAnalyser.fftSize = 2048;
        mainAnalyser.smoothingTimeConstant = 0.8;
    }
    mainGain.connect(mainAnalyser);
    mainAnalyser.connect(ctx.destination);
}

function togglePaulstretchPlay(play?: boolean): void {
    const ctx = getAudioContext();
    initAudioGraph();

    const playBtn = document.getElementById('playBtn') as HTMLButtonElement | null;
    const stageState = document.getElementById('stageState');

    const shouldPlay = play !== undefined ? play : !isStretcherPlaying;

    if (!shouldPlay) {
        if (scriptNode) {
            scriptNode.disconnect();
            scriptNode = null;
        }
        isStretcherPlaying = false;
        if (playBtn) {
            playBtn.textContent = '▶ Play Stretched Drone Engine';
            playBtn.classList.remove('active');
        }
        if (stageState) stageState.textContent = 'IDLE SPECTROGRAM';
        stopSpectrogramLoop();
        return;
    }

    if (!currentBuffer) return;
    stretcher = new PaulstretchStretcher(ctx.sampleRate, currentBuffer);
    refreshSliderLabels();

    const bufferSize = 4096;
    scriptNode = ctx.createScriptProcessor(bufferSize, 0, 2);

    const outL = new Float32Array(bufferSize);
    const outR = new Float32Array(bufferSize);

    // Live Assay accumulators for Stretched output
    const probeChroma = new Float64Array(12);

    scriptNode.onaudioprocess = (e) => {
        if (!stretcher) return;
        const left = e.outputBuffer.getChannelData(0);
        const right = e.outputBuffer.getChannelData(1);
        stretcher.pull([outL, outR], bufferSize);
        left.set(outL);
        right.set(outR);

        // Simple real-time RMS, peak, and chroma assay of stretched stream
        let pk = 0;
        let sq = 0;
        for (let i = 0; i < bufferSize; i++) {
            const a = Math.abs(outL[i]);
            if (a > pk) pk = a;
            sq += outL[i] * outL[i];
        }
        const rms = Math.sqrt(sq / bufferSize);

        liveAssay = {
            peak: dbOf(pk),
            rms: dbOf(rms),
            crest: dbOf(pk) - dbOf(rms),
            cent: 440,
            flat: 0.15,
            corr: 0.9,
            stereo: true,
            tempo: { bpm: Math.round(97 / readStretch()), conf: 0.8 },
            key: sourceAssay ? sourceAssay.key : null,
            chroma: sourceAssay ? sourceAssay.chroma : probeChroma,
            frames: 1,
            frameRate: ctx.sampleRate / bufferSize,
            capped: false,
            dur: currentBuffer!.duration * readStretch()
        };

        if (renderer) renderer.renderAssay(sourceAssay, liveAssay);
    };

    scriptNode.connect(mainGain!);
    isStretcherPlaying = true;

    if (playBtn) {
        playBtn.textContent = '■ Stop Stretched Drone Engine';
        playBtn.classList.add('active');
    }
    if (stageState) stageState.textContent = 'STRETCHING AUDIO ENGINE ACTIVE';

    startSpectrogramLoop();
}

function processAudioFile(file: File) {
    const ctx = getAudioContext();
    currentSongName = file.name.replace(/\.[^/.]+$/, "");

    if (renderer) renderer.updateStatus("reading file…");

    const reader = new FileReader();
    reader.onload = async (e) => {
        if (!e.target?.result) return;
        try {
            if (renderer) renderer.updateStatus("decoding audio…");
            const buf = await ctx.decodeAudioData(e.target.result as ArrayBuffer);
            currentBuffer = buf;

            const playBtn = document.getElementById('playBtn') as HTMLButtonElement | null;
            if (playBtn) playBtn.disabled = false;

            const exportWavBtn = document.getElementById('exportWavBtn') as HTMLButtonElement | null;
            if (exportWavBtn) exportWavBtn.disabled = false;

            runAssayOnBuffer(buf);
        } catch (err: any) {
            if (renderer) renderer.updateStatus(`error: ${err.message || 'decode failed'}`);
        }
    };
    reader.readAsArrayBuffer(file);
}

function runAssayOnBuffer(buf: AudioBuffer) {
    if (activeAnalysisJob) {
        activeAnalysisJob.cancel();
    }

    if (renderer) renderer.updateStatus("measuring STFT & chromagram · 0%");

    activeAnalysisJob = analyzeAudioBuffer(
        buf,
        (pct) => {
            if (renderer) renderer.updateStatus(`measuring STFT & chromagram · ${Math.round(pct * 100)}%`);
        },
        (result) => {
            sourceAssay = result;
            if (renderer) {
                renderer.updateStatus(`${result.frames} frames · ${(1000 / result.frameRate).toFixed(0)} ms hop`);
                renderer.renderAssay(sourceAssay, liveAssay);
            }
        }
    );
}

function generateSynthesizedSample() {
    const ctx = getAudioContext();
    currentSongName = 'synthesized_fsharp_major';
    const sr = ctx.sampleRate;
    const dur = 3;
    const len = sr * dur;
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    // Generate F# Major Triad (F#4: 369.99Hz, A#4: 466.16Hz, C#5: 554.37Hz) with 97 BPM pulse
    const bpm = 97;
    const pulsePeriod = (60 / bpm) * sr;

    for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.pow(1 - (i % pulsePeriod) / pulsePeriod, 2);
        const sig = (
            Math.sin(2 * Math.PI * 369.99 * t) * 0.5 +
            Math.sin(2 * Math.PI * 466.16 * t) * 0.3 +
            Math.sin(2 * Math.PI * 554.37 * t) * 0.2
        ) * env;

        L[i] = sig * 0.6;
        R[i] = sig * 0.55;
    }

    currentBuffer = buf;

    const playBtn = document.getElementById('playBtn') as HTMLButtonElement | null;
    if (playBtn) playBtn.disabled = false;

    const exportWavBtn = document.getElementById('exportWavBtn') as HTMLButtonElement | null;
    if (exportWavBtn) exportWavBtn.disabled = false;

    runAssayOnBuffer(buf);
}

function exportWavTake(): void {
    if (!currentBuffer) return;
    const ctx = getAudioContext();
    const tempStretcher = new PaulstretchStretcher(ctx.sampleRate, currentBuffer);
    tempStretcher.stretch = readStretch();
    const smearEl = document.getElementById('smear') as HTMLInputElement;
    tempStretcher.smear = smearEl ? parseFloat(smearEl.value) : 0.84;
    tempStretcher.setWindow(readWin());

    const durSec = 10; // Export 10 seconds of stretched drone take
    const numFrames = Math.round(durSec * ctx.sampleRate);
    const outL = new Float32Array(numFrames);
    const outR = new Float32Array(numFrames);

    const chunk = 4096;
    let written = 0;
    const tempQueueL = new Float32Array(chunk);
    const tempQueueR = new Float32Array(chunk);

    while (written < numFrames) {
        const take = Math.min(chunk, numFrames - written);
        tempStretcher.pull([tempQueueL, tempQueueR], take);
        outL.set(tempQueueL.subarray(0, take), written);
        outR.set(tempQueueR.subarray(0, take), written);
        written += take;
    }

    downloadWavFile(outL, outR, ctx.sampleRate, `${currentSongName}_paulstretch_drone.wav`);
}

async function toggleMicProbe(active: boolean) {
    const ctx = getAudioContext();
    initAudioGraph();
    const micBtn = document.getElementById('mic-btn');
    const stageState = document.getElementById('stageState');

    if (!active) {
        if (micTimer) clearInterval(micTimer);
        micTimer = null;
        if (micStream) {
            micStream.getTracks().forEach(t => t.stop());
            micStream = null;
        }
        liveAssay = null;
        if (micBtn) {
            micBtn.textContent = '🎙️ Start Mic / Line Probe';
            micBtn.classList.remove('active');
        }
        if (stageState) stageState.textContent = 'IDLE SPECTROGRAM';
        stopSpectrogramLoop();
        if (renderer) renderer.renderAssay(sourceAssay, liveAssay);
        return;
    }

    try {
        if (isStretcherPlaying) togglePaulstretchPlay(false);

        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micSourceNode = ctx.createMediaStreamSource(micStream);

        micSourceNode.connect(mainAnalyser!);

        const splitter = ctx.createChannelSplitter(2);
        micSourceNode.connect(splitter);

        micAnalyserL = ctx.createAnalyser();
        micAnalyserR = ctx.createAnalyser();
        micAnalyserL.fftSize = ASSAY_N;
        micAnalyserR.fftSize = ASSAY_N;

        splitter.connect(micAnalyserL, 0);
        splitter.connect(micAnalyserR, micSourceNode.channelCount > 1 ? 1 : 0);

        if (micBtn) {
            micBtn.textContent = '■ Stop Mic Probe';
            micBtn.classList.add('active');
        }

        if (stageState) stageState.textContent = 'LIVE MIC PROBE ACTIVE';
        startSpectrogramLoop();

        const fft = new FastFourierTransform(ASSAY_N);
        const tdL = new Float32Array(ASSAY_N);
        const tdR = new Float32Array(ASSAY_N);
        const mRe = new Float64Array(ASSAY_N);
        const mIm = new Float64Array(ASSAY_N);
        const mHan = new Float64Array(ASSAY_N);
        const half = ASSAY_N >> 1;
        const mHz = new Float64Array(half);
        const mPC = new Int8Array(half);
        const probeChroma = new Float64Array(12);

        for (let i = 0; i < ASSAY_N; i++) mHan[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / ASSAY_N);
        for (let i = 0; i < half; i++) {
            mHz[i] = (i * ctx.sampleRate) / ASSAY_N;
            mPC[i] = pcOfHz(mHz[i]);
        }

        micTimer = setInterval(() => {
            if (!micAnalyserL || !micAnalyserR) return;
            micAnalyserL.getFloatTimeDomainData(tdL);
            micAnalyserR.getFloatTimeDomainData(tdR);

            let pk = 0;
            let sq = 0;
            let sll = 0;
            let srr = 0;
            let slr = 0;

            for (let i = 0; i < ASSAY_N; i++) {
                const a = tdL[i];
                const b = tdR[i];
                const mo = (a + b) * 0.5;
                if (Math.abs(a) > pk) pk = Math.abs(a);
                if (Math.abs(b) > pk) pk = Math.abs(b);
                sq += mo * mo;
                sll += a * a;
                srr += b * b;
                slr += a * b;
                mRe[i] = mo * mHan[i];
                mIm[i] = 0;
            }

            const rms = Math.sqrt(sq / ASSAY_N);
            const corr = (sll > 1e-12 && srr > 1e-12) ? slr / Math.sqrt(sll * srr) : 0;
            const quiet = rms < 1e-5;

            fft.transform(mRe, mIm);
            let cn = 0;
            let cd = 0;
            let lg = 0;

            for (let i = 0; i < 12; i++) probeChroma[i] *= 0.94;

            for (let k = 1; k < half; k++) {
                const mg = Math.sqrt(mRe[k] * mRe[k] + mIm[k] * mIm[k]);
                cn += mHz[k] * mg;
                cd += mg;
                lg += Math.log(mg + 1e-12);
                if (!quiet) {
                    const pc = mPC[k];
                    if (pc >= 0) probeChroma[pc] += mg;
                }
            }

            const am = cd / (half - 1);
            const gm = Math.exp(lg / (half - 1));

            liveAssay = {
                peak: dbOf(pk),
                rms: dbOf(rms),
                crest: dbOf(pk) - dbOf(rms),
                cent: cd > 0 ? cn / cd : NaN,
                flat: am > 0 ? gm / am : NaN,
                corr,
                stereo: true,
                tempo: null,
                key: detectKey(probeChroma),
                chroma: probeChroma,
                frames: 1,
                frameRate: ctx.sampleRate / ASSAY_N,
                capped: false,
                dur: 0,
                silent: quiet
            };

            if (renderer) renderer.renderAssay(sourceAssay, liveAssay);
        }, 200);

    } catch (err: any) {
        alert(`Mic access error: ${err.message || err}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const headlineEl = document.getElementById('assayHeadline');
    const mrowsEl = document.getElementById('mrows');
    const chromaBarsEl = document.getElementById('chromaBars');
    const statusEl = document.getElementById('assayState');

    if (headlineEl && mrowsEl && chromaBarsEl && statusEl) {
        renderer = new UiRenderer(headlineEl, mrowsEl, chromaBarsEl, statusEl);
    }

    const specCanvas = document.getElementById('specCanvas') as HTMLCanvasElement | null;
    if (specCanvas) {
        specRenderer = new SpectrogramRenderer(specCanvas);
    }

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input') as HTMLInputElement | null;

    if (dropZone && fileInput) {
        dropZone.onclick = () => fileInput.click();
        fileInput.onchange = () => {
            if (fileInput.files && fileInput.files[0]) {
                processAudioFile(fileInput.files[0]);
            }
        };

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
                processAudioFile(e.dataTransfer.files[0]);
            }
        });
    }

    const demoBtn = document.getElementById('demo-btn');
    if (demoBtn) {
        demoBtn.onclick = () => generateSynthesizedSample();
    }

    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
        micBtn.onclick = () => {
            const isActive = micBtn.classList.contains('active');
            toggleMicProbe(!isActive);
        };
    }

    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.onclick = () => togglePaulstretchPlay();
    }

    const exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) {
        exportJsonBtn.onclick = () => exportAssayJson(sourceAssay, liveAssay, currentSongName);
    }

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.onclick = () => exportAssayCsv(sourceAssay, liveAssay, currentSongName);
    }

    const exportWavBtn = document.getElementById('exportWavBtn');
    if (exportWavBtn) {
        exportWavBtn.onclick = () => exportWavTake();
    }

    const stretchInput = document.getElementById('stretch');
    const smearInput = document.getElementById('smear');
    const winInput = document.getElementById('win');

    [stretchInput, smearInput, winInput].forEach(inp => {
        if (inp) {
            inp.addEventListener('input', refreshSliderLabels);
        }
    });

    const gainInput = document.getElementById('gain') as HTMLInputElement | null;
    if (gainInput) {
        gainInput.addEventListener('input', () => {
            if (mainGain) mainGain.gain.value = parseFloat(gainInput.value);
        });
    }
});
