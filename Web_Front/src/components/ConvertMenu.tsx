// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// The ⚙ Convert dropdown, living in the global footer beside Download (opens
// upward, like 🎚 Layers). It sends the SELECTED sample to Worker-SAMPLE_CONVERSION
// (PROCESSOR.SampleConversion, POD.workers) as one job on the bus and offers
// the converted file back: play it here, or download it. ffmpeg runs in the
// worker, never in this tab; the conversation is sampleConversion.ts, the job
// and its rules are sampleConversionJob.ts.
//
// The result belongs to the sample it was made from: selecting another sample
// drops it (and its object URL), and an answer that lands after the selection
// moved on is discarded rather than shown against the wrong file.

import { useEffect, useRef, useState } from 'react';
import { useIsNarrow } from '../useIsNarrow';
import { convertSample } from '../sampleConversion';
import {
  canConvert, DEFAULT_OPTIONS, sanitizeOptions,
  TARGET_BIT_DEPTHS, TARGET_CHANNELS, TARGET_FORMATS, TARGET_SAMPLE_RATES,
  type ConversionOptions,
} from '../sampleConversionJob';

interface ConvertMenuProps {
  /** The selected record; its metadata.name is the file the worker is asked about. */
  item: any | null;
  /** The selected sample's audio, read the same way Download reads it. */
  getAudio: () => Promise<File | null>;
  /** The footer's button style, so this sits flush with its neighbours. */
  buttonStyle: React.CSSProperties;
}

interface Done {
  filename: string;
  format: string;
  bytes: number;
  elapsedMs: number | null;
  url: string;
}

const FIELDS: { key: keyof ConversionOptions; label: string; values: readonly string[] }[] = [
  { key: 'target_format', label: 'Format', values: TARGET_FORMATS },
  { key: 'target_channels', label: 'Channels', values: TARGET_CHANNELS },
  { key: 'target_sample_rate', label: 'Sample rate', values: TARGET_SAMPLE_RATES },
  { key: 'target_bit_depth', label: 'Bit depth', values: TARGET_BIT_DEPTHS },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function ConvertMenu({ item, getAudio, buttonStyle }: ConvertMenuProps) {
  const narrow = useIsNarrow();
  const name: string = item?.metadata?.name || '';
  const convertible = !!name && canConvert(name);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_OPTIONS);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Which press is current: a press for an earlier selection must not paint.
  const runRef = useRef(0);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // A new selection starts clean: the last result was another file's.
  useEffect(() => {
    runRef.current += 1;
    setStage('');
    setError('');
    setDone(null);
  }, [name]);

  // The converted file lives as an object URL only while it is shown.
  useEffect(() => {
    if (!done) return;
    return () => URL.revokeObjectURL(done.url);
  }, [done]);

  const run = async () => {
    const run = ++runRef.current;
    const current = () => runRef.current === run;
    setError('');
    setDone(null);
    setStage('reading the sample');
    try {
      const file = await getAudio();
      if (!current()) return;
      if (!file) throw new Error('no audio for this sample — link its folder first');
      const result = await convertSample(file, sanitizeOptions(options), s => { if (current()) setStage(s); });
      if (!current()) return;
      if (!result.ok) throw new Error(`the converter refused it: ${result.error || 'no reason given'}`);
      // By URL (schema 2) or inline (the one-release fallback): sampleConversion.ts hands back the file.
      const blob = result.blob;
      setDone({ filename: result.filename, format: result.format, bytes: blob.size, elapsedMs: result.elapsedMs, url: URL.createObjectURL(blob) });
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (current()) setStage('');
    }
  };

  const busy = stage !== '';
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button className="btn secondary" style={buttonStyle} disabled={!convertible} onClick={() => setOpen(!open)}
        title={convertible ? 'Convert this sample on the bench (Worker-SAMPLE_CONVERSION)' : 'Select an audio sample the converter reads'}>
        {narrow ? '⚙' : '⚙ Convert'}
      </button>
      {open && (
        <div className="glass-panel" style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: '0.5rem', width: 'min(300px, calc(100vw - 32px))',
          padding: '0.75rem', background: 'rgba(11,14,20,0.95)', border: '1px solid var(--border-color)', borderRadius: '6px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)', zIndex: 110, color: 'var(--text-primary)', fontSize: '0.78rem',
        }}>
          <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem' }}>⚙ Convert</h4>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginBottom: '0.5rem', overflowWrap: 'anywhere' }}>
            {name} → sent as one job to <code>Worker-SAMPLE_CONVERSION</code>; ffmpeg runs there.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.3rem 0.5rem', alignItems: 'center' }}>
            {FIELDS.map(f => (
              <label key={f.key} style={{ display: 'contents' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                <select value={options[f.key]} disabled={busy}
                  onChange={e => setOptions({ ...options, [f.key]: e.target.value })}>
                  {f.values.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button className="btn primary" style={{ marginTop: '0.6rem', width: '100%' }} disabled={busy || !convertible} onClick={run}>
            {busy ? `⏳ ${stage}…` : 'Convert'}
          </button>
          {error && <div style={{ marginTop: '0.5rem', color: 'var(--accent-secondary)', overflowWrap: 'anywhere' }}>❌ {error}</div>}
          {done && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ overflowWrap: 'anywhere' }}>
                ✅ <strong>{done.filename}</strong> · {done.format} · {formatBytes(done.bytes)}
                {done.elapsedMs !== null ? ` · ${done.elapsedMs} ms` : ''}
              </div>
              <audio controls src={done.url} style={{ width: '100%', height: 28, marginTop: '0.35rem' }} />
              <a className="btn secondary" href={done.url} download={done.filename}
                style={{ display: 'block', textAlign: 'center', marginTop: '0.35rem' }}>⬇ Download converted</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
