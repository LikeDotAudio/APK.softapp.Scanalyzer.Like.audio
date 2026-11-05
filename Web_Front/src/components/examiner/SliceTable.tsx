// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The per-transient ADSR table — the numbers behind the `transient slices` layer.
//
// The record's file-level envelope_* fields are null whenever a file holds more
// than one transient, because a peak-relative measurement has no defined peak on
// a multi-event file. The real measurements are one-per-slice, and this is where
// they are read. The header states which case the open file is in, so a row of
// blanks upstairs is explained rather than looking like missing data.

import { envelopeSlices, isMultiEvent, type EnvelopeSlice } from '../../envelopeSlices';
// THE FIRST SCAN HOST ON THE PERCENT-FILL PRIMITIVE, and the one with no
// decision attached: both figures below are shares of a bounded whole, neither
// had a separate track, and both were `?? 0` — a slice with no level drew a
// hard 0%, which is the "no data is not zero" claim the primitive exists to
// stop. The fill sits behind digits that were already there, so the column is
// no wider than it was. PLAN-924.02 step 3.
import { ApkTable } from '../common/ApkTable';
import { pctNode } from '../common/pctNode';

interface Props {
  item: any;
}

/** ms under a second, seconds above — an attack reads in ms, a ring in seconds. */
function dur(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`;
}

export default function SliceTable({ item }: Props) {
  const slices = envelopeSlices(item);
  if (!slices.length) return null;

  const multi = isMultiEvent(item);
  const loudest = slices.reduce(
    (b, s) => ((s.relative_level ?? 0) > (b.relative_level ?? 0) ? s : b),
    slices[0],
  );

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.5rem 0.6rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
        ADSR per transient · {slices.length} slice{slices.length === 1 ? '' : 's'}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 6 }}>
        {multi ? (
          <>
            Multi-event: the file-level ADSR is <b>null</b> by design — there is no
            single peak to measure against. Each slice below is measured against
            its own peak. The loudest ({dur(loudest.start_seconds)} in) is the one
            the classifiers read.
          </>
        ) : (
          <>One-shot: this slice spans the whole file, so the file-level ADSR is this row.</>
        )}
      </div>
      <ApkTable
        id="scanalyzer-envelope-slices"
        style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.66rem' }}
        rows={slices as EnvelopeSlice[]}
        rowClass={(s) => (s === loudest ? 'scan-row-loudest' : '')}
        columns={[
          { key: 'index', label: '#', value: (s) => s.index + 1, style: () => ({ color: '#F59E0B' }) },
          { key: 'start', label: 'start', value: (s) => s.start_seconds, text: (s) => `${s.start_seconds.toFixed(2)}s` },
          { key: 'lvl', label: 'lvl', align: 'right', value: (s) => s.relative_level ?? '', node: (s) => pctNode({ ratio: s.relative_level }) },
          { key: 'a', label: 'A', align: 'right', value: (s) => s.envelope_attack_seconds ?? '', text: (s) => dur(s.envelope_attack_seconds) },
          { key: 'd', label: 'D', align: 'right', value: (s) => s.envelope_decay_seconds ?? '', text: (s) => dur(s.envelope_decay_seconds) },
          { key: 's', label: 'S', align: 'right', value: (s) => s.envelope_sustain_level ?? '', node: (s) => pctNode({ ratio: s.envelope_sustain_level }) },
          { key: 'r', label: 'R', align: 'right', value: (s) => s.envelope_release_seconds ?? '', text: (s) => dur(s.envelope_release_seconds) },
          { key: 'shape', label: 'shape', value: (s) => s.envelope_shape, style: () => ({ color: 'var(--text-secondary)' }) },
          { key: 'ring', label: 'ring', align: 'right', value: (s) => s.decay_time_seconds_60db ?? '', text: (s) => dur(s.decay_time_seconds_60db), style: () => ({ color: 'var(--text-secondary)' }) },
        ]}
      />
    </div>
  );
}
