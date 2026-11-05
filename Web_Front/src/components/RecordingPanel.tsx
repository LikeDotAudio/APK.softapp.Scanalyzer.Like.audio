// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//! What one recorded leaf holds, drawn over the footer on whichever tab picked it.
//!
//! A recording has no audio to play, so the footer transport has nothing to say
//! about it. This says the rest: its numbers, its trace over the recorded span
//! (mean line inside the min–max band, one bucket per point), what a text leaf
//! changed to and when, the attention it raised, and a device's latest screen.

import { showTime, showValue } from '../recordings'

function Trace({ series, unit }: { series: number[][]; unit?: string | null }) {
  if (!series?.length) return null;
  const W = 360, H = 64, P = 2;
  const t0 = series[0][0], t1 = series[series.length - 1][0];
  let lo = Infinity, hi = -Infinity;
  for (const [, , mn, mx] of series) { lo = Math.min(lo, mn); hi = Math.max(hi, mx); }
  const dt = t1 - t0 || 1, dv = hi - lo || 1;
  const x = (t: number) => P + ((t - t0) / dt) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / dv) * (H - 2 * P);
  const band = series.map(([t, , , mx]) => `${x(t)},${y(mx)}`).join(' ') + ' '
    + [...series].reverse().map(([t, , mn]) => `${x(t)},${y(mn)}`).join(' ');
  const line = series.map(([t, m]) => `${x(t)},${y(m)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
      aria-label={`Recorded trace from ${showValue(lo, unit)} to ${showValue(hi, unit)}`}
      style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, flex: '0 0 auto', maxWidth: '100%' }}>
      <polygon points={band} fill="rgba(59,130,246,0.18)" />
      <polyline points={line} fill="none" stroke="#60a5fa" strokeWidth={1.5} />
      {series.length === 1 && <circle cx={x(t0)} cy={y(series[0][1])} r={3} fill="#60a5fa" />}
      <text x={W - 4} y={11} textAnchor="end" fontSize={10} fill="var(--text-secondary)">{showValue(hi, unit)}</text>
      <text x={W - 4} y={H - 4} textAnchor="end" fontSize={10} fill="var(--text-secondary)">{showValue(lo, unit)}</text>
    </svg>
  );
}

export default function RecordingPanel({ item, onClose }: { item: any; onClose: () => void }) {
  const r = item?.recording;
  if (!r) return null;
  const cell = (label: string, value: string) => (
    <span style={{ whiteSpace: 'nowrap' }}><span style={{ color: 'var(--text-secondary)' }}>{label}</span> {value}</span>
  );
  const latest = r.kind === 'pictures' ? r.pictures?.[r.pictures.length - 1] : null;
  return (
    <section aria-label="Recorded data" style={{
      display: 'flex', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap', padding: '0.45rem 0.9rem',
      background: '#0d1017', borderTop: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.78rem',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, flex: '1 1 280px' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.metadata?.name}>
            📼 {r.device} › {r.leaf}
          </strong>
          <span style={{ color: 'var(--text-secondary)' }}>{r.kind}{r.unit ? ` · ${r.unit}` : ''}</span>
          <button className="btn" onClick={onClose} aria-label="Close the recorded data"
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0 0.5rem' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
          {cell('now', r.kind === 'pictures' ? `${r.count} shots` : showValue(r.kind === 'numeric' ? r.last : r.now, r.unit))}
          {r.kind === 'numeric' && <>
            {cell('min', showValue(r.min, r.unit))}
            {cell('mean', showValue(r.mean, r.unit))}
            {cell('max', showValue(r.max, r.unit))}
            {cell('σ', showValue(r.std, r.unit))}
            {cell('drift', showValue(r.drift, r.unit))}
          </>}
          {cell('reads', String(r.count))}
          {r.rate_per_min != null && cell('per min', String(r.rate_per_min))}
          {cell('from', showTime(r.first_ts))}
          {cell('to', showTime(r.last_ts))}
        </div>
        {r.attention?.length > 0 && (
          <div style={{ color: '#f59e0b' }}>
            ⚠ {r.attention.slice(-3).map((a: any) => `${a.was ?? '?'} → ${a.word} at ${showTime(a.ts)}`).join(' · ')}
            {r.attention.length > 3 ? ` (+${r.attention.length - 3} earlier)` : ''}
          </div>
        )}
        {r.kind === 'text' && r.changes?.length > 0 && (
          <div style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={r.changes.map((c: any[]) => `${showTime(c[0])}  ${c[1]}`).join('\n')}>
            changes: {r.changes.slice(-4).map((c: any[]) => `${showTime(c[0])} ${c[1]}`).join(' → ')}
          </div>
        )}
      </div>
      {r.kind === 'numeric' && <Trace series={r.series} unit={r.unit} />}
      {latest && (
        <a href={latest.url} target="_blank" rel="noreferrer" title={`Latest screen, ${showTime(latest.ts)}`}>
          <img src={latest.url} alt={`${r.device} screen at ${showTime(latest.ts)}`} style={{ height: 96, borderRadius: 4 }} />
        </a>
      )}
    </section>
  );
}
