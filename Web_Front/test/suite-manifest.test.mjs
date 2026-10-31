// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// suite.json replaced 40 symlinks into sibling repositories (audit 2026-10-30).
// Hold it: no symlink comes back, every entry is well formed, and — when this
// checkout sits inside APK.audio — every portal path still resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, lstatSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const suite = JSON.parse(readFileSync(path.join(repo, 'suite.json'), 'utf8'));
const softapps = path.resolve(repo, '../..');   // …/PODS/POD.THIN/Softapps in a monorepo checkout

test('suite.json is a scanalyzer-suite document with well-formed members', () => {
  assert.equal(suite.format, 'scanalyzer-suite');
  const ids = new Set();
  for (const [stage, members] of Object.entries(suite.stages)) {
    assert.match(stage, /^0[1-8]_[A-Z]+$/);
    assert.ok(existsSync(path.join(repo, stage, 'README.md')), `${stage}/README.md describes the stage`);
    for (const m of members) {
      assert.match(m.portal, /^APK:Softapps\/[^/]+\/[^/]+/, m.id);
      assert.ok(!ids.has(m.id), `${m.id} listed twice`);
      ids.add(m.id);
    }
  }
});

test('no symlink reaches out of this repository any more', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.git', 'target', 'dist', 'pkg'].includes(name)) continue;
      const p = path.join(dir, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) offenders.push(path.relative(repo, p));
      else if (st.isDirectory() && !existsSync(path.join(p, '.git'))) walk(p);
    }
  };
  walk(repo);
  assert.deepEqual(offenders, []);
});

test('every portal path resolves in a monorepo checkout', (t) => {
  if (path.basename(softapps) !== 'Softapps') { t.skip('standalone clone: no Softapps tree around it'); return; }
  const missing = [];
  for (const members of Object.values(suite.stages)) {
    for (const m of members) {
      const rel = m.portal.replace(/^APK:Softapps\//, '');
      if (!existsSync(path.join(softapps, rel))) missing.push(m.portal);
    }
  }
  assert.deepEqual(missing, [], 'moved or retired: update suite.json');
});
