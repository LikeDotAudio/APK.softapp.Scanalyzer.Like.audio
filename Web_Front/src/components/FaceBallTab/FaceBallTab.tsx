//! The 4D tab: the response ball plus the blendshape inspector.
//!
//! Two halves of one idea. The ball shows WHICH facial response each sound
//! routes to (the 4th dimension, as geometry). The inspector shows WHAT that
//! response does over time for the selected sound — and that timeline is driven
//! by the per-transient ADSR slices, one trigger per hit, because a single
//! file-level envelope would make a 15-round burst wince once, slowly.
//!
//! THE BALL IS A VIEWER NOW (ROAD-3571, 2026-11-06): VISUALIZER.Like.audio's
//! 4d.html, framed here and fed one flat record per sample (faceRecords.ts says
//! what a sample is to it: its features, its Response face, its Family colour).
//! Its own bars carry the axes, the A–H views, the pull sliders, the faces list
//! and the corner weighting; this tab keeps what only Scanalyzer knows — the
//! selected sound's response and its blendshape timeline — and the EYE.
import { useEffect, useMemo, useState } from 'react';
import { blendshapeTimeline } from '../../facialResponse';
import AudioEye from '../AudioEye';
import { resolveAudioUrl } from '../../audioLinking';
import { ucsColor } from '../../groupColors';
import { decodePreview, previewShimSamples } from '../../peakPreview';
import { VizFrame } from '../../vizHost';
import { faceRecords, faceSchema, savedFaceView, saveFaceView } from './faceRecords';

interface Props {
  filteredData: any[];
  selectedItem?: any;
  onSound?: (name: string) => void;
  /** Needed to resolve the picked sample's audio for the EYE overlay. */
  audioFiles?: File[];
  /** The shared footer <audio>. The eye steers this rather than owning a second
   *  element, so ring, playhead and sound stay one transport. */
  eyeAudio?: HTMLAudioElement | null;
  onEyePlay?: () => void;
}

const panel: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  padding: '0.5rem 0.7rem',
};

export default function FaceBallTab({
  filteredData, selectedItem, onSound, audioFiles = [], eyeAudio, onEyePlay,
}: Props) {
  const [picked, setPicked] = useState<any>(null);
  const records = useMemo(() => faceRecords(filteredData), [filteredData]);
  const [initialView] = useState(savedFaceView);
  const schema = useMemo(() => faceSchema(initialView), [initialView]);
  const byName = useMemo(() => new Map(filteredData.map((it) => [it?.metadata?.name || '', it])), [filteredData]);

  const item = picked ?? selectedItem;
  const selectedIds = useMemo(() => (item?.metadata?.name ? [item.metadata.name] : []), [item]);
  const timeline = useMemo(() => (item ? blendshapeTimeline(item) : null), [item]);

  // ---- the EYE overlay, wired exactly as the 3D cloud wires it.
  //
  // The picked record's stored peak map, so the ring paints the instant a dot is
  // clicked rather than waiting on a decode.
  const eyePreview = useMemo(() => {
    const pv = item ? decodePreview(item) : null;
    return pv ? previewShimSamples(pv) : null;
  }, [item]);

  // Resolve the picked sample's URL for the ring's decode. A second blob URL over
  // the same bytes the footer plays — ours, so ours to revoke when it changes.
  const [eyeSrc, setEyeSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = item ? await resolveAudioUrl(audioFiles, item) : null;
      if (cancelled) {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      setEyeSrc((prev) => {
        if (prev?.startsWith('blob:') && prev !== url) URL.revokeObjectURL(prev);
        return url;
      });
    })();
    return () => { cancelled = true; };
  }, [item, audioFiles]);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <VizFrame
          page="4d"
          records={records}
          schema={schema}
          title="Scanalyzer — response ball"
          selectedIds={selectedIds}
          onPick={(id) => { const it = byName.get(String(id)); setPicked(it ?? null); onSound?.(String(id)); }}
          onView={saveFaceView}
        />
        {/* EYE player — the picked sample's scrubbable radial waveform, overlaid
            bottom-left (the viewer's faces list is on its right). Drives the shared
            footer audio, so ring, playhead and sound are one transport. */}
        {eyeSrc && item && (
          <div style={{ position: 'absolute', bottom: '0.75rem', right: '17.5rem', zIndex: 15 }}>
            <AudioEye
              src={eyeSrc}
              name={item.metadata?.name || ''}
              color={ucsColor(item.ucs?.category || '')}
              size={150}
              audioEl={eyeAudio}
              onTogglePlay={onEyePlay}
              autoPlay={false}
              previewSamples={eyePreview}
            />
          </div>
        )}
      </div>

      {/* ---- the selected sound's response, over time */}
      {timeline && item && (
        <aside style={{ width: 280, borderLeft: '1px solid var(--border-color)', overflowY: 'auto', padding: '0.6rem' }}>
          <div style={{ ...panel, borderColor: '#4dd0e1' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Selected</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
              {item?.metadata?.name}
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
              → <b>{timeline.response.name}</b>{' '}
              <span style={{ opacity: 0.6 }}>({timeline.response.family})</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {timeline.response.actionUnits.length
                ? timeline.response.actionUnits.join(', ')
                : 'decoupled — drives no blendshape'}
            </div>
            <div style={{ fontSize: '0.7rem', marginTop: 6, color: 'var(--text-secondary)' }}>
              {timeline.keys.length} trigger{timeline.keys.length === 1 ? '' : 's'} from{' '}
              {item?.envelope?.slices?.length ?? 0} transient slice
              {(item?.envelope?.slices?.length ?? 0) === 1 ? '' : 's'}
              {timeline.response.cooldownMs > 0 && ` · ${timeline.response.cooldownMs} ms cooldown`}
            </div>
            <BlendshapeStrip keys={timeline.keys} duration={item?.metadata?.length_seconds ?? 0} />
          </div>
        </aside>
      )}
    </div>
  );
}

/** The blendshape weight over time: one spike per surviving transient trigger,
 *  each rising over that slice's measured attack and falling over its release. */
function BlendshapeStrip({ keys, duration }: { keys: { timeSeconds: number; weight: number; attackSeconds: number; releaseSeconds: number }[]; duration: number }) {
  if (!keys.length || duration <= 0) return null;
  const W = 260, H = 46;
  const x = (t: number) => (t / duration) * W;
  const y = (w: number) => H - w * (H - 4) - 2;

  const path = keys
    .map((k) => {
      const x0 = x(k.timeSeconds);
      const x1 = x(k.timeSeconds + k.attackSeconds);
      const x2 = x(k.timeSeconds + k.attackSeconds + k.releaseSeconds);
      return `M ${x0.toFixed(1)} ${y(0)} L ${x1.toFixed(1)} ${y(k.weight)} L ${x2.toFixed(1)} ${y(0)}`;
    })
    .join(' ');

  return (
    <svg width={W} height={H} style={{ marginTop: 6, display: 'block', maxWidth: '100%' }}>
      <line x1={0} y1={y(0)} x2={W} y2={y(0)} stroke="rgba(255,255,255,0.18)" />
      <path d={path} fill="none" stroke="#4dd0e1" strokeWidth={1.4} />
    </svg>
  );
}
