// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * SCANALYZER AS A HOST OF THE VISUALIZER VIEWERS (viz.like.audio/host@1).
 *
 * The 2D, 3D, 4D and Analyzer views are not Scanalyzer's code any more: they
 * are VISUALIZER.Like.audio's pages, framed here, and they know nothing about
 * samples. This file is the host's end of the wire and nothing else — what a
 * sample IS (which numbers, which names, which colours) is said by the tab
 * that builds the records (CloudTab/cloudRecords.ts and its siblings).
 *
 *   ready  → send the records (and again whenever they change)
 *   select → whenever the selected sample changes, and `pulse` while it plays
 *   pick   → onPick(id) — the tab plays / examines that sample
 *   view   → onView(patch) — the tab remembers the user's axes
 *   fly    → sendFly(frame) — the tab decides whether a frame is fit to fly
 *
 * WHERE THE VIEWERS ARE: vizBase.ts. In a browser, the relative path between
 * the two dist/ folders in the Softapps tree; in the desktop (Tauri) app, the
 * copy bundled at ./viz/; failing either, the published viewers on apk.audio.
 * `?viz=<base url>` overrides it, and the dev server is pointed at the checkout.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { resolveVizBase, vizBase } from './vizBase';

export const VIZ_PROTOCOL = 'viz.like.audio/host@1';
export type VizPage = '2d' | '3d' | '4d' | 'analyzer';
export type VizView = Record<string, unknown>;
export interface VizSchema { id?: string; label?: string; fields?: Record<string, unknown>; view?: VizView; presets?: { key?: string; name: string; view: VizView }[] }

interface Props {
  page: VizPage;
  records: any[];
  schema?: VizSchema;
  title?: string;
  /** Ids of the records to highlight (an empty list clears it). */
  selectedIds?: (string | number)[];
  pulse?: boolean;
  onPick?: (id: string | number, index: number) => void;
  onSelect?: (ids: (string | number)[], reason?: string) => void;
  onView?: (patch: VizView) => void;
  /** Receives the function that sends one six-axis frame (3d / 4d). */
  flyRef?: React.MutableRefObject<((f: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number }) => void) | null>;
  style?: CSSProperties;
}

/** One framed viewer, fed and listened to. */
export function VizFrame({ page, records, schema, title, selectedIds = [], pulse = false, onPick, onSelect, onView, flyRef, style }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Counts the viewer's `ready`s: a reloaded frame says ready again, and its data must follow it.
  const [ready, setReady] = useState(0);
  // The first guess frames at once; the probe may move it (bundled copy absent → apk.audio).
  const [base, setBase] = useState(vizBase);
  useEffect(() => { let live = true; resolveVizBase().then((b) => { if (live) setBase(b); }); return () => { live = false; }; }, []);
  const cb = useRef({ onPick, onSelect, onView });
  cb.current = { onPick, onSelect, onView };

  const post = useCallback((type: string, body: Record<string, unknown> = {}) => {
    frame.current?.contentWindow?.postMessage({ protocol: VIZ_PROTOCOL, type, ...body }, '*');
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (e.source !== frame.current?.contentWindow || !m || m.protocol !== VIZ_PROTOCOL) return;
      if (m.type === 'ready') setReady((r) => r + 1);
      else if (m.type === 'pick') cb.current.onPick?.(m.id, m.index);
      else if (m.type === 'select') cb.current.onSelect?.(m.ids ?? [], m.reason);
      else if (m.type === 'view') cb.current.onView?.(m.view ?? {});
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  useEffect(() => { if (ready) post('data', { records, schema, title }); }, [ready, records, schema, title, post]);
  const idsKey = JSON.stringify(selectedIds);
  useEffect(() => { if (ready) post('select', { ids: selectedIds, pulse }); }, [ready, idsKey, pulse, post]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flyRef) return;
    flyRef.current = (f) => post('fly', f);
    return () => { flyRef.current = null; };
  }, [flyRef, post]);

  return (
    <iframe
      ref={frame}
      title={`${page} viewer`}
      src={`${base}${page}.html`}
      style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#0B0E14', ...style }}
    />
  );
}
