// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// ApkTable — THE ONE TABLE (ROAD-3494) in React. Every table in this app is an
// APKTable (src/vendor/apk-table, held byte-identical to WEB.Frontend-Assets'
// /FrontEnd/shared/apk-table.js by check.sh webshared), so any script reaches
// it as APKTable.get('<id>') — sort, filter, rows, CSV — the same as on every
// other page of the project. React owns the host <div>; APKTable owns what is
// inside it. A cell is text, or a DOM Node a column builds (never HTML).
import { useEffect, useRef } from 'react';
import '../../vendor/apk-table/apk-table.js';
import '../../vendor/apk-table/apk-table.css';

type Style = Partial<Record<string, string | number>>;

export interface ApkColumn<R> {
  key: string;
  label: string;
  /** The cell's value (text, sort, filter and CSV all use it). Default: row[key]. */
  value?: (row: R, i: number) => string | number;
  /** The text shown, when it is not the value ('120 SFM' for 120). */
  text?: (row: R, i: number) => string;
  /** Inline style for the cell's text (colour, weight, font). */
  style?: (row: R, i: number) => Style | undefined;
  /** A Node instead of text — a swatch, a badge. Built with `h` below. */
  node?: (row: R, i: number) => Node;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
  width?: string;
  /** Edited in place (APKTable's own text edit, committed on Enter / blur) → props.onEdit. */
  editable?: boolean;
  type?: 'text' | 'number';
  placeholder?: string;
}

export interface ApkTableProps<R> {
  id: string;
  columns: ApkColumn<R>[];
  rows: R[];
  /** Extra classes for a row (e.g. 'apk-row-current'). */
  rowClass?: (row: R, i: number) => string;
  /** A row was clicked. */
  onRowClick?: (row: R, i: number) => void;
  /** An editable cell was committed: the source row, its index, the column key, the value. */
  onEdit?: (row: R, i: number, key: string, value: string | number) => void;
  toolbar?: boolean;
  sortable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface ApkHandle { setRows(r: unknown[]): ApkHandle; destroy(): void; el: HTMLElement }
interface ApkTableApi { create(host: HTMLElement, opts: unknown): ApkHandle; get(id: string): ApkHandle | null }
const api = (): ApkTableApi | undefined => (globalThis as unknown as { APKTable?: ApkTableApi }).APKTable;

/** A DOM node for a cell: h('span', { background: '#f00' }, 'text', 'class'). */
export function h(tag: string, style?: Style, text?: string | number | null, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (style) for (const [k, v] of Object.entries(style)) if (v !== undefined) (e.style as unknown as Record<string, string>)[k] = typeof v === 'number' ? `${v}px` : v;
  if (text !== undefined && text !== null) e.textContent = String(text);
  if (className) e.className = className;
  return e;
}

/** Plain rows for APKTable: one key per column, the source row kept under _row. */
export function apkRows<R>(columns: ApkColumn<R>[], rows: R[]): Record<string, unknown>[] {
  return rows.map((row, i) => {
    const out: Record<string, unknown> = { _row: row, _i: i };
    for (const c of columns) out[c.key] = c.value ? c.value(row, i) : (row as Record<string, unknown>)[c.key];
    return out;
  });
}

/** The APKTable options for these props; closures read `latest`, so a re-render needs no re-create. */
export function apkOptions<R>(latest: { current: ApkTableProps<R> }) {
  const p = latest.current;
  return {
    id: p.id,
    editable: p.columns.some((c) => c.editable),
    toolbar: p.toolbar ?? false,
    sortable: p.sortable ?? true,
    columns: p.columns.map((c, ci) => ({
      key: c.key,
      label: c.label,
      align: c.align,
      mono: c.mono,
      width: c.width,
      type: c.type,
      placeholder: c.placeholder,
      editable: !!c.editable,
      render: c.editable ? undefined : (v: unknown, r: { _row: R; _i: number }) => {
        const col = latest.current.columns[ci] || c;
        if (col.node) return col.node(r._row, r._i);
        const txt = col.text ? col.text(r._row, r._i) : (v === undefined || v === null ? '' : String(v));
        const st = col.style ? col.style(r._row, r._i) : undefined;
        return st ? h('span', st, txt) : txt;
      },
    })),
    rows: apkRows(p.columns, p.rows),
    rowClass: (r: { _row: R; _i: number }) => (latest.current.rowClass ? latest.current.rowClass(r._row, r._i) : '') + (latest.current.onRowClick ? ' apk-row-click' : ''),
    onSelect: (_i: number, r: { _row: R; _i: number }) => { if (latest.current.onRowClick) latest.current.onRowClick(r._row, r._i); },
    onEdit: (_i: number, key: string, value: string | number, r: { _row: R; _i: number }) => { if (latest.current.onEdit) latest.current.onEdit(r._row, r._i, key, value); },
  };
}

export function ApkTable<R>(props: ApkTableProps<R>) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<ApkHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // A new id or a new column set is a new table; anything else is new rows.
  const shape = props.id + '\u0001' + props.columns.map((c) => c.key + '\u0002' + c.label).join('\u0001');
  useEffect(() => {
    const T = api();
    if (!host.current || !T) return;
    handle.current = T.create(host.current, apkOptions(latest));
    return () => { handle.current?.destroy(); handle.current = null; };
  }, [shape]);
  useEffect(() => {
    handle.current?.setRows(apkRows(props.columns, props.rows));
  });
  return <div ref={host} className={'apk-table-host ' + (props.className || '')} style={props.style} />;
}
