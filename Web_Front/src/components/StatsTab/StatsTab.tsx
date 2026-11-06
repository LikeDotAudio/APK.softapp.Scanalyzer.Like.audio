// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE 2D TAB — the flat read of whatever the scope bar has narrowed the corpus to.
 *
 * It was two recharts scatters gated at 3,000 points, a UCS donut and a
 * subcategory bar. Since ROAD-3571 (2026-11-06) it frames VISUALIZER.Like.audio's
 * 2d.html, a canvas scatter with no point limit, and sends it the same flat
 * records as the 3D cloud (CloudTab/cloudRecords.ts). The two old charts are its
 * presets 1 (Pitch × Brightness) and 2 (Attack × Sustain). The category counts
 * are the Analyzer's (Examiner tab, focus UCS Category), which reads them for any
 * field, not only this one.
 */
import { useMemo, useState } from 'react';
import { VizFrame } from '../../vizHost';
import { cloudRecords, cloudSchema, sampleId } from '../CloudTab/cloudRecords';

interface StatsTabProps {
  analysisResult: any[];
  filteredData: any[];
  audioFiles: File[];
  onSound?: (name: string) => void;
  selectedItem?: any;
}

const PREF = 'scanalyzer_2d_v1_';
const KEYS = ['x', 'y', 'color', 'size'];

function savedView(): Record<string, unknown> {
  const v: Record<string, unknown> = { x: 'Pitch', y: 'Brightness (centroid)', color: 'UCS shade', size: null };
  for (const k of KEYS) {
    try { const s = localStorage.getItem(PREF + k); if (s !== null) v[k] = JSON.parse(s); } catch { /* storage off */ }
  }
  return v;
}
function saveView(patch: Record<string, unknown>) {
  for (const k of KEYS) if (k in patch) {
    try { localStorage.setItem(PREF + k, JSON.stringify(patch[k])); } catch { /* storage off */ }
  }
}

export default function StatsTab({ filteredData, onSound, selectedItem }: StatsTabProps) {
  const records = useMemo(() => cloudRecords(filteredData), [filteredData]);
  const [initialView] = useState(savedView);
  const schema = useMemo(() => ({
    ...cloudSchema(records, initialView),
    presets: [
      { key: '1', name: 'Pitch × Brightness', view: { x: 'Pitch', y: 'Brightness (centroid)' } },
      { key: '2', name: 'Attack × Sustain', view: { x: 'Attack', y: 'Sustain' } },
    ],
  }), [records, initialView]);
  const selectedIds = useMemo(() => (selectedItem ? [sampleId(selectedItem)] : []), [selectedItem]);
  return (
    <div style={{ display: 'flex', flex: 1, width: '100%', height: '100%', minHeight: 0 }}>
      <VizFrame page="2d" records={records} schema={schema} title="Scanalyzer — scoped samples"
        selectedIds={selectedIds} onPick={(id) => onSound?.(String(id))} onView={saveView} />
    </div>
  );
}
