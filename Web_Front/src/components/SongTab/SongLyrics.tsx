// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useState, useEffect, useRef } from 'react';
import { type ExtractedLyrics, type LyricLine, parseLRC } from './lyricsExtractor';

interface SongLyricsProps {
  lyrics: ExtractedLyrics | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onLyricsUpdate: (lyrics: ExtractedLyrics) => void;
}

export default function SongLyrics({
  lyrics,
  currentTime,
  duration,
  onSeek,
  onLyricsUpdate
}: SongLyricsProps) {
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeNotice, setTranscribeNotice] = useState<string>('');
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to active lyric line
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentTime]);

  // Format seconds to mm:ss
  const formatTime = (sec?: number) => {
    if (sec === undefined || !isFinite(sec) || sec < 0) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Find index of current lyric line
  const activeIndex = (() => {
    if (!lyrics || !lyrics.lines.length) return -1;
    let bestIdx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      const lineTime = lyrics.lines[i].time;
      if (lineTime !== undefined && currentTime >= lineTime) {
        bestIdx = i;
      }
    }
    return bestIdx;
  })();

  // Browser Web Speech API Live Transcription
  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Web Speech API is not supported in this browser. Please try Chrome, Edge, or Safari.');
      return;
    }

    if (isTranscribing) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsTranscribing(false);
      setTranscribeNotice('');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      const accumulatedLines: LyricLine[] = lyrics ? [...lyrics.lines] : [];

      recognition.onstart = () => {
        setIsTranscribing(true);
        setTranscribeNotice('Listening & transcribing lyrics in real time…');
      };

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            const transcript = res[0].transcript.trim();
            if (transcript) {
              accumulatedLines.push({
                time: currentTime,
                text: transcript
              });
              onLyricsUpdate({
                source: 'speech-recognition',
                isSynchronized: true,
                lines: [...accumulatedLines],
                rawText: accumulatedLines.map((l) => l.text).join('\n')
              });
            }
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[SongLyrics] Speech recognition error:', event.error);
        setTranscribeNotice(`Recognition notice: ${event.error}`);
        setIsTranscribing(false);
      };

      recognition.onend = () => {
        setIsTranscribing(false);
        setTranscribeNotice('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('[SongLyrics] Could not start speech recognition:', err);
      setIsTranscribing(false);
    }
  };

  // Handle LRC or text file upload
  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseLRC(text);
        onLyricsUpdate(parsed);
      }
    };
    reader.readAsText(file);
  };

  // Handle manual lyrics paste
  const applyPastedLyrics = () => {
    if (!pastedText.trim()) return;
    const parsed = parseLRC(pastedText);

    // If unsynchronized, evenly distribute across duration
    if (!parsed.isSynchronized && duration > 0 && parsed.lines.length > 0) {
      const step = duration / (parsed.lines.length + 1);
      parsed.lines = parsed.lines.map((l, idx) => ({
        ...l,
        time: Math.round((idx + 0.5) * step * 10) / 10
      }));
      parsed.isSynchronized = true;
    }

    onLyricsUpdate(parsed);
    setShowPasteModal(false);
    setPastedText('');
  };

  // Export lyrics to LRC or TXT
  const exportLyrics = () => {
    if (!lyrics) return;
    let content = '';
    if (lyrics.isSynchronized) {
      content = lyrics.lines
        .map((l) => {
          const t = l.time ?? 0;
          const min = Math.floor(t / 60);
          const sec = (t % 60).toFixed(2);
          const timeTag = `[${min < 10 ? '0' : ''}${min}:${parseFloat(sec) < 10 ? '0' : ''}${sec}]`;
          return `${timeTag} ${l.text}`;
        })
        .join('\n');
    } else {
      content = lyrics.rawText;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lyrics.${lyrics.isSynchronized ? 'lrc' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="song-lyrics-container">
      <div className="song-lyrics-header">
        <div className="song-lyrics-title-group">
          <span className="song-card-title">Lyrics & Vocal Transcription</span>
          {lyrics && (
            <span className="song-lyrics-badge">
              {lyrics.source === 'id3-uslt' && '🏷️ Embedded ID3v2 Tags'}
              {lyrics.source === 'id3-sylt' && '⏱️ Embedded Synchronized (SYLT)'}
              {lyrics.source === 'mp4-atom' && '🍎 Apple MP4 Metadata'}
              {lyrics.source === 'vorbis-comment' && '💿 Vorbis/FLAC Tags'}
              {lyrics.source === 'speech-recognition' && '🎙️ Speech-to-Text Transcribed'}
              {lyrics.source === 'user-loaded' && '📂 User Synchronized LRC'}
            </span>
          )}
        </div>

        <div className="song-lyrics-actions">
          <button
            type="button"
            className={`song-action-btn ${isTranscribing ? 'active' : ''}`}
            onClick={startSpeechRecognition}
            title="Transcribe lyrics in real time using browser Web Speech API"
          >
            {isTranscribing ? '🛑 Stop Transcribing' : '🎙️ Transcribe (Web Speech)'}
          </button>

          <button
            type="button"
            className="song-action-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Load an external .lrc or .txt lyrics file"
          >
            📂 Load LRC/TXT
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".lrc,.txt,.srt"
            style={{ display: 'none' }}
            onChange={handleFileLoad}
          />

          <button
            type="button"
            className="song-action-btn"
            onClick={() => setShowPasteModal(true)}
            title="Paste lyrics directly"
          >
            ✍️ Paste / Edit
          </button>

          {lyrics && lyrics.lines.length > 0 && (
            <button
              type="button"
              className="song-action-btn"
              onClick={exportLyrics}
              title="Download lyrics file"
            >
              📥 Export
            </button>
          )}
        </div>
      </div>

      {transcribeNotice && (
        <div className="song-lyrics-notice">
          <span>{transcribeNotice}</span>
        </div>
      )}

      {/* Lyrics Display Scroll Area */}
      <div className="song-lyrics-body">
        {lyrics && lyrics.lines.length > 0 ? (
          <div className="song-lyrics-lines-wrap">
            {lyrics.lines.map((line, idx) => {
              const isActive = idx === activeIndex;
              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  className={`song-lyric-line ${isActive ? 'is-active' : ''}`}
                  onClick={() => line.time !== undefined && onSeek(line.time)}
                  title={line.time !== undefined ? `Jump to ${formatTime(line.time)}` : undefined}
                >
                  {line.time !== undefined && (
                    <span className="song-lyric-time">{formatTime(line.time)}</span>
                  )}
                  <span className="song-lyric-text">{line.text}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="song-lyrics-empty">
            <span className="song-lyrics-empty-icon">📝</span>
            <span className="song-lyrics-empty-text">No embedded lyrics detected in audio metadata.</span>
            <span className="song-lyrics-empty-sub">
              Click <strong>&quot;🎙️ Transcribe (Web Speech)&quot;</strong> to transcribe lyrics live,
              load a <code>.lrc</code> file, or click <strong>&quot;✍️ Paste / Edit&quot;</strong> to input song lyrics.
            </span>
          </div>
        )}
      </div>

      {/* Modal for Pasting Lyrics */}
      {showPasteModal && (
        <div className="song-modal-overlay">
          <div className="song-modal-card">
            <div className="song-modal-header">
              <h3>Paste or Edit Lyrics</h3>
              <button
                type="button"
                className="song-modal-close"
                onClick={() => setShowPasteModal(false)}
              >
                ✕
              </button>
            </div>
            <textarea
              className="song-modal-textarea"
              placeholder="Paste song lyrics or LRC formatted lines here...&#10;e.g.&#10;[00:15.20] Very superstitious, writing's on the wall&#10;[00:20.10] Very superstitious, ladder's 'bout to fall"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={10}
            />
            <div className="song-modal-footer">
              <button
                type="button"
                className="song-action-btn"
                onClick={() => setShowPasteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="song-action-btn primary"
                onClick={applyPastedLyrics}
              >
                Apply Lyrics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
