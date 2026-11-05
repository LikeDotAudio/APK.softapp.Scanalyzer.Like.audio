// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { resolveAudioUrl } from '../../audioLinking';
import {
  analyzeSongBuffer,
  type SongAssayResult,
  type SongSection,
  PITCH_CLASSES,
  dbTxt,
  hzTxt
} from './songAssay';
import SongWaveform from './SongWaveform';
import SongLyrics from './SongLyrics';
import { extractLyricsFromAudioBuffer, type ExtractedLyrics } from './lyricsExtractor';
import './SongTab.css';
import { ApkTable, h } from '../common/ApkTable';
import { problem } from '../../apkSoftapp';

interface SongTabProps {
  selectedItem?: any;
  audioFiles: File[];
  onSound?: (name: string) => void;
  analysisResult?: any[];
}

export default function SongTab({
  selectedItem,
  audioFiles,
  onSound,
  analysisResult = []
}: SongTabProps) {
  const [songName, setSongName] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<SongAssayResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [lyrics, setLyrics] = useState<ExtractedLyrics | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // If a sound is selected in Scanalyzer, load its name
  useEffect(() => {
    if (selectedItem?.name || selectedItem?.metadata?.name) {
      const name = selectedItem.name || selectedItem.metadata?.name;
      setSongName(name);
    }
  }, [selectedItem]);

  // Decode ArrayBuffer to AudioBuffer
  const decodeBuffer = useCallback(async (arrayBuf: ArrayBuffer): Promise<AudioBuffer> => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Clone buffer before decoding because decodeAudioData detaches
    const clone = arrayBuf.slice(0);
    return await ctx.decodeAudioData(clone);
  }, []);

  // Run analysis on an AudioBuffer
  const startAnalysis = useCallback((buf: AudioBuffer, name: string) => {
    if (cancelRef.current) {
      cancelRef.current();
    }
    setAnalyzing(true);
    setProgress(0);
    setSongName(name);
    setDuration(buf.duration);

    const handle = analyzeSongBuffer(
      buf,
      (pct) => setProgress(pct),
      (res) => {
        setResult(res);
        setAnalyzing(false);
        setProgress(1);
      }
    );
    cancelRef.current = handle.cancel;
  }, []);

  // Analyze the currently selected item from Scanalyzer
  const analyzeSelected = useCallback(async () => {
    if (!selectedItem) return;
    try {
      setAnalyzing(true);
      setProgress(0.05);
      const url = await resolveAudioUrl(audioFiles, selectedItem);
      if (!url) {
        setAnalyzing(false);
        return;
      }
      setAudioUrl(url);

      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();

      // Extract embedded lyrics from tags if present
      const foundLyrics = extractLyricsFromAudioBuffer(arrayBuf);
      setLyrics(foundLyrics);

      const audioBuf = await decodeBuffer(arrayBuf);
      const name = selectedItem.name || selectedItem.metadata?.name || 'Selected Song';
      startAnalysis(audioBuf, name);
    } catch (err) {
      console.error('[SongTab] Failed to analyze selected sound:', err);
      setAnalyzing(false);
      problem('file_unreadable', { subject: selectedItem?.metadata?.name || selectedItem?.name || 'Selected sound',
        detail: String((err as any)?.message || err),
        fix: ['Re-link the sample folder (Scanalyze tab) so the audio can be found, or drop the song file here instead.'] });
    }
  }, [selectedItem, audioFiles, decodeBuffer, startAnalysis]);

  // User dragged/uploaded a local song file
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      setAnalyzing(true);
      setProgress(0.05);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);

      const arrayBuf = await file.arrayBuffer();

      // Extract embedded lyrics from tags if present
      const foundLyrics = extractLyricsFromAudioBuffer(arrayBuf);
      setLyrics(foundLyrics);

      const audioBuf = await decodeBuffer(arrayBuf);
      startAnalysis(audioBuf, file.name);
    } catch (err) {
      console.error('[SongTab] Failed to process song file:', err);
      setAnalyzing(false);
      problem('file_unreadable', { subject: file.name, detail: String((err as any)?.message || err),
        fix: ['Try WAV, MP3, FLAC or OGG — or convert the song to WAV and drop it again.'] });
    }
  }, [decodeBuffer, startAnalysis]);

  // Generate a synthesized test song (F# Major chord progression + beat) for testing
  const generateDemoSong = useCallback(async () => {
    try {
      setAnalyzing(true);
      setProgress(0.05);
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const sr = 44100;
      const len = sr * 8; // 8 seconds
      const audioBuf = ctx.createBuffer(2, len, sr);
      const L = audioBuf.getChannelData(0);
      const R = audioBuf.getChannelData(1);

      // F# Major (F#4: 369.99Hz, A#4: 466.16Hz, C#5: 554.37Hz) with 120 BPM pulse
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const beat = (t * 2) % 1; // 120 bpm = 2 beats per sec
        const kick = Math.sin(2 * Math.PI * 60 * (1 - beat) * t) * Math.exp(-beat * 10);
        const chord = (
          Math.sin(2 * Math.PI * 369.99 * t) * 0.25 +
          Math.sin(2 * Math.PI * 466.16 * t) * 0.2 +
          Math.sin(2 * Math.PI * 554.37 * t) * 0.2
        );
        const val = chord + (kick * 0.4);
        L[i] = val;
        R[i] = val * 0.95; // Slight stereo spread
      }

      setLyrics({
        source: 'user-loaded',
        isSynchronized: true,
        lines: [
          { time: 0.0, text: '[Intro] F# Major groove initiates' },
          { time: 2.0, text: 'Hear the pulse, feel the rhythm rise' },
          { time: 4.0, text: 'Superstition in the synthesizer chords' },
          { time: 6.0, text: 'Harmonic changes flowing over top' }
        ],
        rawText: 'Hear the pulse, feel the rhythm rise\nSuperstition in the synthesizer chords\nHarmonic changes flowing over top'
      });
      startAnalysis(audioBuf, 'F# Major Synthesized Song Demo');
    } catch (err) {
      console.error('[SongTab] Failed to generate demo song:', err);
      setAnalyzing(false);
      problem(err, { subject: 'Demo song' });
    }
  }, [startAnalysis]);

  // Audio playback toggle
  const togglePlay = useCallback(() => {
    if (!audioRef.current && audioUrl) {
      const audio = new Audio(audioUrl);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onended = () => setIsPlaying(false);
      audioRef.current = audio;
    }
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [audioUrl, isPlaying]);

  const seekAudio = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Format seconds -> mm:ss
  const formatTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Export results
  const exportJson = useCallback(() => {
    if (!result) return;
    const payload = {
      song: songName,
      assay_date: new Date().toISOString(),
      musical_key: result.key ? result.key.name : 'Unknown',
      key_confidence: result.key ? Math.round(result.key.conf * 100) : 0,
      tempo_bpm: result.tempo ? result.tempo.bpm : null,
      duration_seconds: result.dur,
      sample_rate: result.sampleRate,
      channels: result.channels,
      peak_dbfs: result.peak,
      rms_dbfs: result.rms,
      crest_factor_db: result.crest,
      spectral_centroid_hz: result.cent,
      spectral_flatness: result.flat,
      stereo_correlation: result.corr,
      chromagram_12_bins: Array.from(result.chroma),
      sections: result.sections
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${songName || 'song'}.song-assay.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, songName]);

  const exportCsv = useCallback(() => {
    if (!result) return;
    const rows = [
      ['Metric', 'Value', 'Unit'],
      ['Song Name', songName, ''],
      ['Musical Key', result.key ? result.key.name : 'N/A', ''],
      ['Key Confidence', result.key ? `${(result.key.conf * 100).toFixed(1)}%` : '0%', ''],
      ['Tempo', result.tempo ? result.tempo.bpm.toFixed(1) : 'N/A', 'BPM'],
      ['Duration', result.dur.toFixed(2), 'seconds'],
      ['Sample Rate', String(result.sampleRate), 'Hz'],
      ['Channels', String(result.channels), ''],
      ['Peak', result.peak.toFixed(2), 'dBFS'],
      ['RMS Level', result.rms.toFixed(2), 'dBFS'],
      ['Crest Factor', result.crest.toFixed(2), 'dB'],
      ['Spectral Centroid', result.cent.toFixed(1), 'Hz'],
      ['Spectral Flatness', result.flat.toFixed(4), ''],
      ['Stereo Correlation', result.corr.toFixed(3), ''],
    ];
    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${songName || 'song'}.metrics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, songName]);

  // Chromagram normalization
  const maxChroma = useMemo(() => {
    if (!result?.chroma) return 1;
    let m = 0;
    for (let i = 0; i < 12; i++) {
      if (result.chroma[i] > m) m = result.chroma[i];
    }
    return m > 0 ? m : 1;
  }, [result]);

  return (
    <div className="song-tab-container" role="tabpanel" aria-label="Song Analyzer">
      {/* Header Summary Card */}
      <div className="song-header-card">
        <div className="song-title-group">
          <div className="song-title-row">
            <span className="song-glyph">🎵</span>
            <span className="song-title">
              {songName || 'Song Analyzer & Harmonic Assayer'}
            </span>
          </div>
          <span className="song-sub">
            Pitch-Class chromagram profiling, Krumhansl-Schmuckler key estimation, BPM tracking & temporal section breakdown
          </span>
        </div>

        <div className="song-badges">
          <div className="song-badge highlight">
            <span className="song-badge-label">Key</span>
            <span className="song-badge-val">
              {result?.key ? result.key.name : '—'}
            </span>
          </div>
          <div className="song-badge highlight">
            <span className="song-badge-label">Tempo</span>
            <span className="song-badge-val">
              {result?.tempo ? `${Math.round(result.tempo.bpm)} BPM` : '—'}
            </span>
          </div>
          <div className="song-badge">
            <span className="song-badge-label">Duration</span>
            <span className="song-badge-val">
              {result ? formatTime(result.dur) : '—'}
            </span>
          </div>
          <div className="song-badge">
            <span className="song-badge-label">Channels</span>
            <span className="song-badge-val">
              {result ? (result.stereo ? 'Stereo' : 'Mono') : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Ingest & Controls Bar */}
      <div className="song-control-row">
        {selectedItem && (
          <button
            type="button"
            className="song-action-btn primary"
            disabled={analyzing}
            onClick={analyzeSelected}
          >
            ⚡ Analyze Selected ({selectedItem.name || 'Current'})
          </button>
        )}

        {analysisResult.length > 0 && (
          <select
            className="song-action-btn"
            style={{ colorScheme: 'dark', background: '#1c1f26' }}
            value={songName}
            onChange={(e) => {
              const chosen = e.target.value;
              if (chosen && onSound) onSound(chosen);
            }}
          >
            <option value="">-- Choose Loaded Song ({analysisResult.length}) --</option>
            {analysisResult.map((r: any) => {
              const n = r.name || r.metadata?.name || 'Untitled';
              return (
                <option key={n} value={n}>
                  {n}
                </option>
              );
            })}
          </select>
        )}

        <div
          className="song-drop-zone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
        >
          <span className="song-drop-title">📂 Drag & Drop Song File or Click to Load</span>
          <span className="song-drop-hint">WAV, MP3, FLAC, M4A, OGG • Local client-side processing</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
            }}
          />
        </div>

        <button
          type="button"
          className="song-action-btn"
          disabled={analyzing}
          onClick={generateDemoSong}
        >
          🎹 Test F# Major Synthesized Song
        </button>
      </div>

      {/* Progress banner while running FFT */}
      {analyzing && (
        <div className="song-progress-banner">
          <span>Analyzing song spectrum, pitch-classes and beats…</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
      )}

      {/* Audio Waveform with Overlaid Section Changes & Key Shifts */}
      {result && result.waveformPeaks && (
        <SongWaveform
          waveformPeaks={result.waveformPeaks}
          waveformMins={result.waveformMins}
          sections={result.sections}
          duration={duration || result.dur}
          currentTime={currentTime}
          onSeek={seekAudio}
        />
      )}

      {/* Audio Playback Transport Bar */}
      {audioUrl && (
        <div className="song-transport-card">
          <div className="song-transport-bar">
            <button
              type="button"
              className="song-action-btn primary"
              onClick={togglePlay}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <div className="song-scrubber-wrap">
              <div className="song-time-row">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <input
                type="range"
                className="song-slider"
                min="0"
                max={duration || 1}
                step="0.01"
                value={currentTime}
                onChange={(e) => seekAudio(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Lyrics & Vocal Transcription Card */}
      {result && (
        <SongLyrics
          lyrics={lyrics}
          currentTime={currentTime}
          duration={duration || result.dur}
          onSeek={seekAudio}
          onLyricsUpdate={(updated) => setLyrics(updated)}
        />
      )}

      {/* Song Sections & Temporal Structure */}
      {result && result.sections && result.sections.length > 0 && (
        <div className="song-sections-card">
          <span className="song-card-title">Temporal Song Sections & Dynamic Energy Contour</span>
          <div className="song-sections-track">
            {result.sections.map((sec: SongSection) => {
              const isCurrent = currentTime >= sec.start && currentTime < sec.end;
              return (
                <div
                  key={sec.index}
                  className="song-section-block"
                  style={{
                    background: isCurrent ? 'rgba(var(--apk-accent-rgb), 0.25)' : undefined
                  }}
                  title={`${sec.label}: ${formatTime(sec.start)} - ${formatTime(sec.end)} | Pitch ${sec.dominantKey} | Energy: ${Math.round(sec.energy * 100)}%`}
                  onClick={() => seekAudio(sec.start)}
                >
                  <span className="song-section-label">{sec.label}</span>
                  <span className="song-section-key" style={{ color: isCurrent ? 'var(--apk-accent)' : '#fff' }}>
                    {sec.dominantKey}
                  </span>
                  <div
                    className="song-section-energy-bar"
                    style={{ height: `${Math.round(sec.energy * 20)}px` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 12-Bin Pitch-Class Chromagram */}
      {result && result.chroma && (
        <div className="song-chroma-card">
          <span className="song-card-title">
            12-Bin Pitch-Class Chromagram Profile ({result.key ? `Root: ${PITCH_CLASSES[result.key.pc]}` : 'Harmonic Spectrum'})
          </span>
          <div className="song-chroma-grid">
            {PITCH_CLASSES.map((note, idx) => {
              const val = result.chroma[idx];
              const pct = Math.max(4, Math.round((val / maxChroma) * 100));
              const isRoot = result.key?.pc === idx;
              return (
                <div key={note} className="song-chroma-col">
                  <div className="song-chroma-bar-track">
                    <div
                      className={`song-chroma-bar-fill ${isRoot ? 'root' : ''}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className={`song-chroma-label ${isRoot ? 'root' : ''}`}>{note}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spectral Metrics Assay Table & Facts */}
      {result && (
        <div className="song-assay-grid">
          <div className="song-table-card">
            <span className="song-card-title">Spectral & Dynamics Assay</span>
            {/* THE ONE TABLE (ROAD-3494): APKTable 'scanalyzer-song-assay'. */}
            <MetricTable id="scanalyzer-song-assay" rows={[
              ['Peak Level', 'Maximum sample excursion', dbTxt(result.peak)],
              ['RMS Energy', 'Integrated continuous loudness', dbTxt(result.rms)],
              ['Crest Factor', 'Dynamic range (Peak - RMS)', `${result.crest.toFixed(1)} dB`],
              ['Spectral Centroid', 'Centre of spectral gravity / brightness', hzTxt(result.cent)],
              ['Spectral Flatness', 'Wiener entropy (tonal vs noise ratio)', result.flat.toFixed(4)],
              ['Stereo Correlation', 'Phase coherence between L and R',
                result.stereo ? (result.corr >= 0 ? `+${result.corr.toFixed(2)}` : result.corr.toFixed(2)) : 'Mono (+1.00)'],
            ]} />

            <div className="song-export-row">
              <button type="button" className="song-action-btn" onClick={exportCsv}>
                📊 Export CSV
              </button>
              <button type="button" className="song-action-btn" onClick={exportJson}>
                💾 Export JSON Sidecar
              </button>
            </div>
          </div>

          <div className="song-table-card">
            <span className="song-card-title">Analysis Methodology & Facts</span>
            {/* THE ONE TABLE (ROAD-3494): APKTable 'scanalyzer-song-method'. */}
            <MetricTable id="scanalyzer-song-method" rows={[
              ['Key Template Model', 'Krumhansl-Schmuckler 24-key profile', result.key ? `${(result.key.conf * 100).toFixed(0)}% fit` : '—'],
              ['Onset Tempo Detector', 'Autocorrelation of half-wave rectified spectral flux', result.tempo ? `${result.tempo.bpm.toFixed(1)} BPM` : '—'],
              ['STFT FFT Frame Size', 'Cooley-Tukey radix-2 transform', '2048 bins'],
              ['Spectral Resolution', 'Bin width at sample rate', `${(result.sampleRate / 2048).toFixed(1)} Hz`],
              ['Analysis Frames', 'Total processed time slices', `${result.frames} frames`],
            ]} />
          </div>
        </div>
      )}
    </div>
  );
}

/** A metric / reading table in the song card's look (song-metric-*), as an APKTable. */
function MetricTable({ id, rows }: { id: string; rows: [string, string, string][] }) {
  return (
    <ApkTable
      id={id}
      className="song-metric-table"
      sortable={false}
      rows={rows.map(([name, desc, val]) => ({ name, desc, val }))}
      columns={[
        { key: 'name', label: 'Metric', node: (r) => {
          const box = h('div');
          box.appendChild(h('div', undefined, r.name, 'song-metric-name'));
          box.appendChild(h('div', undefined, r.desc, 'song-metric-desc'));
          return box;
        } },
        { key: 'val', label: 'Reading', node: (r) => h('span', undefined, r.val, 'song-metric-val') },
      ]}
    />
  );
}
