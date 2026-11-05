// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// THE ONE TABLE (ROAD-3494): every table in src/ is an APKTable — drawn through
// components/common/ApkTable.tsx under its own id — except the virtualized
// sample list, which draws itself and REGISTERS as 'scanalyzer-samples'. The
// vendored apk-table (in a stub DOM, apk-table-shim.cjs) takes that handle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src', import.meta.url));
const { loadApkTable } = createRequire(import.meta.url)('./apk-table-shim.cjs');
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = path.join(d, n);
  return statSync(p).isDirectory() ? (n === 'vendor' ? [] : walk(p)) : [p];
});
const tsx = walk(src).filter((f) => f.endsWith('.tsx'));

test('each converted table is an ApkTable under its own id', () => {
  const ids = tsx.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<(?:ApkTable|MetricTable)\s+id="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ['scanalyzer-envelope-slices', 'scanalyzer-fields', 'scanalyzer-groups', 'scanalyzer-rename-preview',
    'scanalyzer-song-assay', 'scanalyzer-song-method', 'scanalyzer-regions']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('only the sample list keeps its own <table>, and it registers', () => {
  const own = tsx.filter((f) => /<table|createElement\(['"]table/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(own.map((f) => path.relative(src, f)), [path.join('components', 'ExaminerTab', 'ExaminerTab.tsx')]);
  assert.match(readFileSync(own[0], 'utf8'), /T\.register\('scanalyzer-samples'/);
});

test('the vendored apk-table takes a registered renderer\'s handle and fills in CSV', () => {
  const { window } = loadApkTable(path.join(src, 'vendor/apk-table/apk-table.js'));
  const rows = [{ name: 'kick.wav', bpm: 120 }];
  const h = window.APKTable.register('scanalyzer-samples', {
    columns: () => [{ key: 'name', label: 'Name' }, { key: 'bpm', label: 'BPM' }],
    rows: () => rows,
  });
  assert.equal(window.APKTable.get('scanalyzer-samples'), h);
  assert.equal(h.toCsv(), 'Name,BPM\nkick.wav,120');
  h.unregister();
  assert.equal(window.APKTable.get('scanalyzer-samples'), null);
});
