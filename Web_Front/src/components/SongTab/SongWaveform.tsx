// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useRef, useEffect, useCallback, useState } from 'react';
import type { SongSection } from './songAssay';

interface SongWaveformProps {
  waveformPeaks?: Float32Array;
  waveformMins?: Float32Array;
  sections?: SongSection[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export default function SongWaveform({
  waveformPeaks,
  waveformMins,
  sections = [],
  duration,
  currentTime,
  onSeek
}: SongWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverSection, setHoverSection] = useState<SongSection | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Redraw waveform and overlays
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Dark sleek background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, width, height);

    const midY = height * 0.58; // Center slightly lower to give header badges room
    const maxAmp = (height - 36) * 0.45;

    // 1. Draw Section Bands & Key Change Boundaries over top of background
    if (sections && sections.length > 0 && duration > 0) {
      sections.forEach((sec, idx) => {
        const x1 = (sec.start / duration) * width;
        const x2 = (sec.end / duration) * width;
        const secW = Math.max(1, x2 - x1);
        const isCurrent = currentTime >= sec.start && currentTime < sec.end;

        // Shaded alternate band
        if (isCurrent) {
          ctx.fillStyle = 'rgba(var(--apk-accent-rgb), 0.12)';
          ctx.fillRect(x1, 0, secW, height);
        } else if (idx % 2 === 1) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
          ctx.fillRect(x1, 0, secW, height);
        }

        // Section Boundary divider line
        ctx.strokeStyle = isCurrent ? 'rgba(var(--apk-accent-rgb), 0.5)' : 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, height);
        ctx.stroke();

        // Top Badge / Pill for Section & Key Change
        if (secW > 45) {
          ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const pillText = `${sec.label.replace(/ \/ .*/, '')} · ${sec.dominantKey}`;
          const textW = ctx.measureText(pillText).width;
          const badgeX = x1 + 6;
          const badgeY = 6;
          const badgeH = 18;
          const badgeW = Math.min(secW - 12, textW + 12);

          ctx.fillStyle = isCurrent ? 'rgba(var(--apk-accent-rgb), 0.25)' : 'rgba(0, 0, 0, 0.6)';
          ctx.strokeStyle = isCurrent ? 'var(--apk-accent)' : 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3) : ctx.rect(badgeX, badgeY, badgeW, badgeH);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isCurrent ? '#fff' : '#cbd5e1';
          ctx.fillText(pillText, badgeX + 6, badgeY + 13);
        }
      });
    }

    // 2. Draw Waveform Peaks
    if (waveformPeaks && waveformPeaks.length > 0) {
      const numPoints = waveformPeaks.length;
      const grad = ctx.createLinearGradient(0, midY - maxAmp, 0, midY + maxAmp);
      grad.addColorStop(0, 'rgba(51, 161, 253, 0.9)');
      grad.addColorStop(0.5, 'rgba(100, 200, 255, 0.7)');
      grad.addColorStop(1, 'rgba(51, 161, 253, 0.85)');

      ctx.fillStyle = grad;

      for (let i = 0; i < numPoints; i++) {
        const x = (i / numPoints) * width;
        const w = Math.max(1, width / numPoints);
        const p = waveformPeaks[i];
        const m = waveformMins ? waveformMins[i] : -p;

        const topH = Math.max(1, p * maxAmp);
        const botH = Math.max(1, Math.abs(m) * maxAmp);

        ctx.fillRect(x, midY - topH, w, topH + botH);
      }

      // Center zero-crossing hairline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
    }

    // 3. Playhead scrubber line
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;

      // Glow line
      ctx.strokeStyle = 'var(--apk-accent)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'var(--apk-accent)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top triangle handle
      ctx.fillStyle = 'var(--apk-accent)';
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 7);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Hover time line
    if (hoverTime !== null && duration > 0) {
      const hX = (hoverTime / duration) * width;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hX, 0);
      ctx.lineTo(hX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [waveformPeaks, waveformMins, sections, duration, currentTime, hoverTime]);

  useEffect(() => {
    render();
  }, [render]);

  // Pointer interactions for scrubbing
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seekFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const t = (x / rect.width) * duration;
    setHoverTime(t);

    const foundSec = sections.find((s) => t >= s.start && t < s.end) || null;
    setHoverSection(foundSec);

    if (isDraggingRef.current) {
      seekFromEvent(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerLeave = () => {
    if (!isDraggingRef.current) {
      setHoverTime(null);
      setHoverSection(null);
    }
  };

  const seekFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = (x / rect.width) * duration;
    onSeek(targetTime);
  };

  return (
    <div className="song-waveform-container" ref={containerRef}>
      <div className="song-waveform-header">
        <span className="song-card-title">
          Audio Waveform with Section Changes & Key Shifts Overlaid
        </span>
        <div className="song-waveform-legend">
          {hoverTime !== null ? (
            <span className="song-waveform-hover-info">
              {formatTime(hoverTime)}
              {hoverSection && ` · ${hoverSection.label} (${hoverSection.dominantKey})`}
            </span>
          ) : (
            <span className="song-waveform-hint">Click or drag waveform to scrub</span>
          )}
        </div>
      </div>

      <div className="song-waveform-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="song-waveform-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
      </div>
    </div>
  );
}
