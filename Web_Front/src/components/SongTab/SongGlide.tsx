// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// SONG GLIDE — chords across the top, the sounding notes as gliding lines, the
// rhythm (beat grid, bar downbeats, every onset) along the bottom; a playhead with
// the notes it is on. Past is lit, what is coming is dimmed. The song's waveform
// sits underneath (SongWaveform) on the same clock.
import { useRef, useEffect, useState, useCallback } from 'react';
import { noteName, GLIDE_VOICES, type GlideResult } from './songGlide';

interface SongGlideProps {
  glide: GlideResult;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

// lowest line → highest line
const VOICE_COLOURS = ['#f5c542', '#ece27a', '#d6ec8c', '#7fe3f0', '#f4f4ef'];
const BG_TOP = '#5c3610'; // rgb(244,144,44) at 38 %, a dark orange
const BG_BOT = '#3a220a'; // rgb(244,144,44) at 24 %
const CHORD_BAND = 28;
const RHYTHM_BAND = 44;
const PLAY_AT = 0.4;      // playhead sits 40 % across once the song is under way
const TRANSITION_S = 0.16;

export default function SongGlide({ glide, duration, currentTime, isPlaying, onSeek }: SongGlideProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [span, setSpan] = useState<number>(() => Math.min(12, Math.max(2, duration)));
  // the transport reports ~4×/s; between reports the clock runs on here so lines move smoothly
  const clock = useRef({ t: currentTime, at: performance.now(), playing: isPlaying });
  useEffect(() => { clock.current = { t: currentTime, at: performance.now(), playing: isPlaying }; }, [currentTime, isPlaying]);
  useEffect(() => { setSpan(Math.min(12, Math.max(2, duration))); }, [duration]);

  const viewStart = useCallback((t: number) =>
    Math.max(0, Math.min(t - span * PLAY_AT, Math.max(0, duration - span))), [span, duration]);

  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const c = clock.current;
    const t = Math.min(duration, c.playing ? c.t + (now - c.at) / 1000 : c.t);
    const t0 = viewStart(t);
    const t1 = t0 + span;
    const x = (s: number) => ((s - t0) / span) * W;
    const px = x(t);

    const top = CHORD_BAND, bot = H - RHYTHM_BAND;
    const lo = Math.floor(glide.minMidi) - 2;
    const hi = Math.ceil(Math.max(glide.maxMidi, glide.minMidi + 12)) + 2;
    const y = (m: number) => bot - ((m - lo) / (hi - lo)) * (bot - top - 8) - 4;

    ctx.save();
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, BG_TOP); g.addColorStop(1, BG_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // semitone grid, C lines a touch stronger
    for (let m = lo; m <= hi; m++) {
      ctx.strokeStyle = m % 12 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Math.round(y(m)) + 0.5); ctx.lineTo(W, Math.round(y(m)) + 0.5); ctx.stroke();
    }

    // beat grid inside the note field (faint), downbeats stronger
    for (const b of glide.beats) {
      if (b.t < t0 || b.t > t1) continue;
      ctx.strokeStyle = b.down ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath(); ctx.moveTo(Math.round(x(b.t)) + 0.5, top); ctx.lineTo(Math.round(x(b.t)) + 0.5, bot); ctx.stroke();
    }

    // chord changes + names
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const ch of glide.chords) {
      if (ch.end < t0 || ch.start > t1) continue;
      const cx = x(ch.start);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, 6); ctx.lineTo(Math.round(cx) + 0.5, bot); ctx.stroke();
      const lx = Math.max(cx + 6, 4);
      if (lx < x(ch.end) - 10) {
        ctx.fillStyle = ch.start <= t ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)';
        ctx.fillText(ch.name, lx, CHORD_BAND / 2 + 2);
      }
    }

    // voice lines: whole path, drawn lit (clipped left of playhead) and dim (right of it)
    const hop = glide.hop;
    const i0 = Math.max(0, Math.floor(t0 / hop) - 1);
    const i1 = Math.min(glide.windows - 1, Math.ceil(t1 / hop) + 1);
    const tr = Math.min(TRANSITION_S, hop * 0.9);
    const path = (v: Float32Array) => {
      const p = new Path2D();
      let open = false;
      for (let i = i0; i <= i1; i++) {
        const m = v[i];
        if (isNaN(m)) { open = false; continue; }
        const ts = i * hop;
        if (!open) { p.moveTo(x(ts), y(m)); open = true; }
        else if (m !== v[i - 1]) {
          const xs = x(ts - tr / 2), xe = x(ts + tr / 2), xm = (xs + xe) / 2;
          p.lineTo(xs, y(v[i - 1]));
          p.bezierCurveTo(xm, y(v[i - 1]), xm, y(m), xe, y(m));
        }
        if (i === i1 || isNaN(v[i + 1])) p.lineTo(x(ts + hop), y(m));
      }
      return p;
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    glide.voices.forEach((v, k) => {
      const col = VOICE_COLOURS[k % VOICE_COLOURS.length];
      const p = path(v);
      ctx.save(); ctx.beginPath(); ctx.rect(px, 0, W - px, bot); ctx.clip();
      ctx.globalAlpha = 0.38; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke(p);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, px, bot); ctx.clip();
      ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.stroke(p);
      ctx.restore();
    });

    // rhythm strip: beats (downbeats with bar numbers) and onsets (height = strength)
    const rTop = bot + 6, rBot = H - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, bot, W, H - bot);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(0, bot + 0.5); ctx.lineTo(W, bot + 0.5); ctx.stroke();
    let bar = 0;
    ctx.font = '600 10px system-ui, sans-serif'; ctx.textBaseline = 'top';
    for (const b of glide.beats) {
      if (b.down) bar++;
      if (b.t < t0 || b.t > t1) continue;
      const bx = Math.round(x(b.t)) + 0.5;
      ctx.strokeStyle = b.down ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.moveTo(bx, b.down ? rTop : rBot - 10); ctx.lineTo(bx, rBot); ctx.stroke();
      if (b.down) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(String(bar), bx + 3, rTop); }
    }
    for (const o of glide.onsets) {
      if (o.t < t0 || o.t > t1) continue;
      const ox = x(o.t);
      const h = 4 + o.s * (rBot - rTop - 14);
      const age = t - o.t;
      const hit = age >= 0 && age < 0.18;   // the moment it lands
      ctx.fillStyle = hit ? '#ffffff' : age >= 0 ? 'rgba(127,227,240,0.85)' : 'rgba(127,227,240,0.35)';
      if (hit) { ctx.shadowColor = '#7fe3f0'; ctx.shadowBlur = 12; }
      ctx.fillRect(ox - 1, rBot - h, 2.5, h);
      ctx.shadowBlur = 0;
    }

    // playhead + the notes it is on
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, H); ctx.stroke();
    const wi = Math.min(glide.windows - 1, Math.max(0, Math.floor(t / hop)));
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    glide.voices.forEach((v, k) => {
      const m = v[wi];
      if (isNaN(m)) return;
      const col = VOICE_COLOURS[k % VOICE_COLOURS.length];
      const vy = y(m);
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, vy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      const label = noteName(m);
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(58,34,10,0.85)'; ctx.fillRect(px + 10, vy - 8, lw + 8, 16);
      ctx.fillStyle = col; ctx.fillText(label, px + 14, vy);
    });
    ctx.restore();
  }, [glide, duration, span, viewStart]);

  // animate while playing, redraw once when idle
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => { draw(now); if (clock.current.playing) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, isPlaying, currentTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw(performance.now()));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // wheel zooms the time span (2 s … whole song); passive:false so the page does not scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSpan((s) => Math.min(Math.max(2, duration), Math.max(2, s * Math.pow(1.0015, e.deltaY))));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [duration]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const c = clock.current;
    const t = c.playing ? c.t + (performance.now() - c.at) / 1000 : c.t;
    const t0 = viewStart(t);
    onSeek(Math.max(0, Math.min(duration, t0 + ((e.clientX - r.left) / r.width) * span)));
  };

  return (
    <div className="song-glide-card">
      <div className="song-waveform-header">
        <span className="song-card-title">Song Glide</span>
        <span className="song-waveform-legend">
          {glide.chords.length} chord changes · {GLIDE_VOICES} voices · {glide.beats.length} beats · {glide.onsets.length} onsets
          <span className="song-waveform-hint"> · wheel = zoom ({span.toFixed(0)} s) · click = seek</span>
        </span>
      </div>
      <canvas ref={canvasRef} className="song-glide-canvas" onClick={onClick}
        aria-label="Song Glide: chords, note lines and rhythm over time" />
    </div>
  );
}
