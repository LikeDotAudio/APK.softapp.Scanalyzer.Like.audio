// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// WHERE THE VIEWERS ARE — ROAD-3586.
//
// The desktop (Tauri) app holds only Scanalyzer's dist/, so the relative Softapps
// path to VISUALIZER's dist/ leads nowhere there. src/vizBase.ts picks: the
// override, the dev server, then the local copy (bundled ./viz/ on desktop, the
// relative path in a browser) if its 2d.html answers, else the published viewers.
// vizBase.ts is plain TypeScript with no imports, so Node's type stripping loads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vizCandidates, pickVizBase, VIZ_RELATIVE_BASE, VIZ_PUBLISHED_BASE } from '../src/vizBase.ts';

const yes = async () => true;
const no = async () => false;
const throws = async () => { throw new TypeError('Failed to fetch'); };

test('?viz= overrides everything and is not probed', async () => {
  const c = vizCandidates({ search: '?viz=https://x.test/v', tauri: true, bundledBase: './viz/' });
  assert.deepEqual(c, ['https://x.test/v/']);
  assert.equal(await pickVizBase(c, throws), 'https://x.test/v/');
});

test('the dev server base wins over the bundle', () => {
  assert.deepEqual(vizCandidates({ devBase: '/@fs/a/dist/', tauri: true, bundledBase: './viz/' }), ['/@fs/a/dist/']);
});

test('desktop with a bundled copy: the bundle, then apk.audio', async () => {
  const c = vizCandidates({ tauri: true, bundledBase: './viz/' });
  assert.deepEqual(c, ['./viz/', VIZ_PUBLISHED_BASE]);
  assert.equal(await pickVizBase(c, yes), './viz/');
  assert.equal(await pickVizBase(c, no), VIZ_PUBLISHED_BASE);
  assert.equal(await pickVizBase(c, throws), VIZ_PUBLISHED_BASE);
});

test('desktop without a bundled copy never tries the relative Softapps path', async () => {
  const c = vizCandidates({ tauri: true, bundledBase: '' });
  assert.deepEqual(c, [VIZ_PUBLISHED_BASE]);
  assert.equal(await pickVizBase(c, throws), VIZ_PUBLISHED_BASE);
});

test('browser: the relative Softapps path, then apk.audio', async () => {
  const c = vizCandidates({ tauri: false, bundledBase: './viz/' });
  assert.deepEqual(c, [VIZ_RELATIVE_BASE, VIZ_PUBLISHED_BASE]);
  assert.equal(await pickVizBase(c, yes), VIZ_RELATIVE_BASE);
  assert.equal(await pickVizBase(c, no), VIZ_PUBLISHED_BASE);
});

test('the probe asks for 2d.html under the candidate, and the last is never probed', async () => {
  const asked = [];
  await pickVizBase(['./viz/', VIZ_PUBLISHED_BASE], async (u) => { asked.push(u); return false; });
  assert.deepEqual(asked, ['./viz/2d.html']);
});
