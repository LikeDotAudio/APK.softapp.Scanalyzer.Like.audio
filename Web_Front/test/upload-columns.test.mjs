// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ONE upload column list (audit 2026-10-30): public/api/upload_columns.json is
// what upload_peak.php stores, what slimForUpload keeps and what the analyzer's
// db.rs asks the endpoint for. These hold the three to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slimForUpload, slimWith, UPLOAD_COLUMNS } from '../src/peakUpload.ts';

const here = new URL('.', import.meta.url);
const php = readFileSync(new URL('../public/api/upload_peak.php', here), 'utf8');
const columns = JSON.parse(readFileSync(new URL('../public/api/upload_columns.json', here), 'utf8'));

test('slimForUpload trims to the bundled upload_columns.json', () => {
  assert.deepEqual(UPLOAD_COLUMNS.sections, columns.sections);
  const record = {
    metadata: { name: 'kick.wav', analyzer_version: 'abc', schema_version: '1.1.0', path: '/x/kick.wav' },
    ucs: { category: 'DRUMS', confidence: 0.9, alternatives: [{ category: 'A', score: 1 }, { category: 'B' }, { category: 'C' }, { category: 'D' }] },
    regions: { count: 2, regions: [{ index: 0 }] },
    preview: { peak_data_base64: 'AAAA' },
  };
  const out = slimForUpload(record);
  assert.deepEqual(out.metadata, { name: 'kick.wav', analyzer_version: 'abc', path: '/x/kick.wav' });
  assert.deepEqual(out.ucs, { category: 'DRUMS', alternatives: [{ category: 'A' }, { category: 'B' }, { category: 'C' }] });
  assert.deepEqual(out.regions, { count: 2 });
  assert.equal(out.preview, undefined, 'an unlisted section never goes up');
  assert.deepEqual(Object.keys(out).sort(), Object.keys(columns.sections).sort());
});

test('records.map(slimForUpload) is safe (the index is not a column list)', () => {
  const [a] = [{ metadata: { name: 'a.wav' } }].map(slimForUpload);
  assert.equal(a.metadata.name, 'a.wav');
});

test('slimWith follows whatever list the endpoint serves', () => {
  const out = slimWith({ metadata: { name: 'n', path: 'p' } }, { sections: { metadata: { fields: ['path'] } } });
  assert.deepEqual(out, { metadata: { path: 'p' } });
});

test('upload_peak.php reads every listed field and serves the list on GET ?columns', () => {
  assert.match(php, /isset\(\$_GET\['columns'\]\)/);
  assert.match(php, /upload_columns\.json/);
  const missing = [];
  for (const [section, rule] of Object.entries(columns.sections)) {
    for (const f of rule.fields ?? []) if (!php.includes(`['${f}']`)) missing.push(`${section}.${f}`);
    for (const [list, spec] of Object.entries(rule.lists ?? {})) {
      if (!php.includes(`['${list}']`)) missing.push(`${section}.${list}`);
      for (const f of spec.fields) if (!php.includes(`['${f}']`)) missing.push(`${section}.${list}[].${f}`);
    }
  }
  assert.deepEqual(missing, [], 'listed but never read by upload_peak.php — the column would silently stay NULL');
});

test('no endpoint opens CORS to every origin; all connect through db.php', () => {
  for (const name of ['upload_peak.php', 'get_peaks.php', 'db_status.php']) {
    const text = readFileSync(new URL(`../public/api/${name}`, here), 'utf8');
    assert.doesNotMatch(text, /Access-Control-Allow-Origin: \*/, name);
    assert.doesNotMatch(text, /new PDO\(/, `${name} builds its own connection`);
    assert.match(text, /require __DIR__ \. '\/db\.php'/, name);
  }
  assert.match(php, /scan_require_upload_token\(\)/);
});
