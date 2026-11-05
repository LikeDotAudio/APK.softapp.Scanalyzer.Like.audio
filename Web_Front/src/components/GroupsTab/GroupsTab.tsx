import { useMemo } from 'react';
import { ApkTable, h } from '../common/ApkTable';
import { taxonomyKeys, ucsColor, ucsSubColor } from '../../groupColors';
import { categoryLabel, subcategoryLabel } from '../../categoryEmoji';

interface GroupsTabProps {
  // The current scoped/filtered view (honours the scope bar, text filter and the Groups
  // hide set), so this table always describes exactly what the rest of the app is showing.
  filteredData: any[];
}

// A count of the current view broken down by UCS CATEGORY → SUBCATEGORY. This used to bucket
// on the removed `classification.group` field and ignore every filter, so it showed the wrong
// taxonomy against a whole-library population; it now speaks UCS off `filteredData`.
export default function GroupsTab({ filteredData }: GroupsTabProps) {
  const groups = useMemo(() => {
    const map = new Map<string, { count: number; subs: Map<string, number> }>();
    for (const it of filteredData) {
      const [g, sg] = taxonomyKeys(it, 'UCS');
      const entry = map.get(g) || { count: 0, subs: new Map<string, number>() };
      entry.count++;
      if (sg) entry.subs.set(sg, (entry.subs.get(sg) || 0) + 1);
      map.set(g, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .map(([group, { count, subs }]) => ({
        group,
        count,
        subs: Array.from(subs.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([name, c]) => ({ name, count: c })),
      }));
  }, [filteredData]);

  const total = filteredData.length;

  if (total === 0) {
    return (
      <div style={{ marginTop: '1rem', padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No samples in the current view.
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', overflowX: 'auto' }}>
      <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
        {groups.length} categories · {total.toLocaleString()} samples in view
      </div>
      {/* THE ONE TABLE (ROAD-3494): APKTable 'scanalyzer-groups' — a category row, then its subcategories. */}
      <ApkTable
        id="scanalyzer-groups"
        toolbar
        sortable={false}
        rows={groups.flatMap(({ group, count, subs }) => [
          { group, sub: null as string | null, count },
          ...subs.map(sg => ({ group, sub: sg.name as string | null, count: sg.count })),
        ])}
        rowClass={(r) => (r.sub === null ? 'scan-row-group' : '')}
        columns={[
          { key: 'category', label: 'UCS Category', value: (r) => (r.sub === null ? categoryLabel(r.group) : ''), node: (r) => {
            if (r.sub !== null) return h('span');
            const box = h('span', { fontWeight: '600' });
            box.appendChild(h('span', { display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: ucsColor(r.group), marginRight: '0.5rem', verticalAlign: 'middle' }));
            box.appendChild(document.createTextNode(categoryLabel(r.group)));
            return box;
          } },
          { key: 'subcategory', label: 'Subcategory', value: (r) => (r.sub === null ? '—' : subcategoryLabel(r.group, r.sub)), node: (r) => {
            if (r.sub === null) return h('span', { color: 'var(--text-secondary)' }, '—');
            const box = h('span', { color: 'var(--text-secondary)', paddingLeft: '1rem' });
            box.appendChild(h('span', { display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: ucsSubColor(r.group, r.sub), marginRight: '0.5rem', verticalAlign: 'middle' }));
            box.appendChild(document.createTextNode(subcategoryLabel(r.group, r.sub)));
            return box;
          } },
          { key: 'count', label: 'Count', align: 'right', text: (r) => r.count.toLocaleString(),
            style: (r) => (r.sub === null ? { fontWeight: '600' } : { color: 'var(--text-secondary)' }) },
        ]}
      />
    </div>
  );
}
