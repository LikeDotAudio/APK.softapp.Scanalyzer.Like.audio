import { useState } from 'react';
import { ApkTable } from '../common/ApkTable';

// The bottom-left field/value explorer for the selected sample. A COMPLETE, dynamic dump:
// it walks the record recursively, so every field at every depth shows — nested objects
// and arrays-of-objects included (e.g. ucs.alternatives → alt 1/2/3, each with its own
// category / subcategory / id / probability). A button bar (in place of the old
// Field/Value header) isolates a single top-level parent group.
interface Props {
  item: any;
}

const isObj = (v: any) => typeof v === 'object' && v !== null;
const isPlainObj = (v: any) => isObj(v) && !Array.isArray(v);
// Expandable = has structure worth recursing into: a non-empty object, or an array that
// holds at least one object. A primitive, or an array of only primitives, is a leaf.
const isExpandable = (v: any) =>
  (isPlainObj(v) && Object.keys(v).length > 0) ||
  (Array.isArray(v) && v.some(isObj));

/** Format a leaf value: primitive-arrays flattened, numbers fixed, absent shown as a dash. */
function format(v: any): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.map(format).join(', ') : '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

// Array elements that are objects get a friendly 1-based label (alt "#1", region "#2", …);
// object keys keep their name.
const childEntries = (v: any): [string, any][] =>
  Array.isArray(v) ? v.map((e, i) => [`#${i + 1}`, e] as [string, any]) : Object.entries(v);

/** One explorer row: a field and its value, a group heading, or a not-analyzed note. */
interface FieldRow { field: string; value: string; depth: number; kind: 'leaf' | 'heading' | 'empty' }

/** Recursively flatten one (label, value) into rows. Depth drives the indent. */
function flatten(label: string, value: any, depth: number): FieldRow[] {
  if (!isExpandable(value)) return [{ field: label, value: format(value), depth, kind: 'leaf' }];
  return [{ field: label, value: '', depth, kind: 'heading' },
    ...childEntries(value).flatMap(([k, cv]) => flatten(k, cv, depth + 1))];
}

export default function FieldValueTable({ item }: Props) {
  // Top-level groups (the objects) drive the isolation buttons; any stray top-level leaf
  // (a bare number/string on the record) is shown too so nothing is hidden.
  const entries: [string, any][] = item ? Object.entries(item) : [];
  const groups = entries.filter(([, v]) => isPlainObj(v));
  const loose = entries.filter(([, v]) => !isPlainObj(v));

  // Isolate a single parent group (null = show all). If the remembered group is absent
  // from the newly selected record, fall back to showing everything.
  const [only, setOnly] = useState<string | null>(null);
  const activeOnly = only && groups.some(([g]) => g === only) ? only : null;
  const shownGroups = activeOnly ? groups.filter(([g]) => g === activeOnly) : groups;

  const groupBtn: React.CSSProperties = { padding: '0.1rem 0.4rem', fontSize: '0.68rem' };

  return (
    <>
      {/* Parent-group isolation buttons — the replacement for the Field/Value header. */}
      {item && (
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#1A1D24', display: 'flex', flexWrap: 'wrap', gap: '3px', padding: '0.3rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>
          <button className={`btn ${!activeOnly ? 'primary' : 'secondary'}`} style={groupBtn} onClick={() => setOnly(null)}>All</button>
          {groups.map(([g]) => (
            <button key={g} className={`btn ${activeOnly === g ? 'primary' : 'secondary'}`} style={groupBtn}
              onClick={() => setOnly(activeOnly === g ? null : g)}>{g}</button>
          ))}
        </div>
      )}
      {/* THE ONE TABLE (ROAD-3494): APKTable 'scanalyzer-fields', the record walked to rows. */}
      <ApkTable
        id="scanalyzer-fields"
        toolbar
        sortable={false}
        style={{ fontSize: '0.75rem' }}
        rows={[
          ...shownGroups.flatMap(([group, fields]): FieldRow[] => (isPlainObj(fields) && Object.keys(fields).length === 0
            ? [{ field: group, value: '', depth: 0, kind: 'heading' }, { field: '', value: 'not analyzed — re-scan to fill in', depth: 1, kind: 'empty' }]
            : flatten(group, fields, 0))),
          ...(activeOnly ? [] : loose.map(([k, v]): FieldRow => ({ field: k, value: format(v), depth: 0, kind: 'leaf' }))),
        ]}
        rowClass={(r) => (r.kind === 'heading' ? 'scan-row-group' : '')}
        columns={[
          { key: 'field', label: 'Field', width: '38%', style: (r) => (r.kind === 'heading'
            ? { color: 'var(--text-secondary)', fontWeight: '600', letterSpacing: '0.03em', paddingLeft: `${r.depth * 0.85}rem` }
            : { color: '#3B82F6', wordBreak: 'break-word', paddingLeft: `${r.depth * 0.85}rem` }) },
          { key: 'value', label: 'Value', style: (r) => (r.kind === 'empty'
            ? { color: 'var(--text-secondary)', fontStyle: 'italic' } : { color: '#FCD34D', wordBreak: 'break-word' }) },
        ]}
      />
      {!item && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Select a sample</div>}
    </>
  );
}
