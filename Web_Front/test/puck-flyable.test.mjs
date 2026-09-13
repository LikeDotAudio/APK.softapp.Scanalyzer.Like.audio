// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ONE STATEMENT OF WHEN A FRAME MAY BE FLOWN — PLAN-901.02.
//
// `puck.moving` is a PRODUCER fact and `puckStale(now)` is a CONSUMER verdict,
// and the contract is ask BOTH. PLAN-901.01 step 4 settled that `moving` stays
// true while the producer is stale, because collapsing the two would destroy
// the only thing separating "the hand came off" (a real zero frame from
// `due_zero()`) from "the wire died with the hand on" (nothing at all).
//
// Writing that on the field was all that held it. A second surface that reads
// `moving` and flies is the runaway PLAN-625.01 stopped, and it typechecks,
// lints and passes every other test here. `relay-puck-to-cloud.js` already
// names the schematic canvas and the CAD elevations as surfaces that will fly
// this puck, so the second consumer is scheduled, not hypothetical.
//
// THIS FILE IS THE GATE. `spaceMouse.ts` exports `puckFlyable`, which is the
// pairing behind one name; every OTHER source in this tree must go through it.
// Reading `moving` for a DIAGNOSTIC is still allowed and is why the field was
// not made private — a panel may legitimately want to draw "deflected, but
// stale", and privatising it would force that panel to invent the fact. What
// is refused is a consumer that reads it and acts on it alone.
//
// WHY THE SOURCES ARE READ RATHER THAN IMPORTED: the same reason
// `puck-qualification.test.mjs` gives at length — these are `.ts` and `.tsx`,
// importing them needs a build step, and what is under test is a USAGE rather
// than a value, so the shipped text is the whole subject.
//
// FAILS LOUDLY, never silently: a rename this file cannot find is a hard error
// naming what it looked for. A skipped parity test reports green, which is
// worse than none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const OWNER = join(SRC, 'spaceMouse.ts');

/** Every `.ts`/`.tsx` under `src/`, recursively. */
function sources(directory) {
  const out = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      out.push(...sources(path));
    } else if (/\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** Comments stripped, so prose ABOUT the rule is not mistaken for a use of it. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('the pairing is exported as one call, and it is the cheap one', () => {
  const owner = readFileSync(OWNER, 'utf8');
  assert.match(
    owner, /export function puckFlyable\(now\?: number\): boolean \{/,
    'puck-flyable.test.mjs cannot find `export function puckFlyable(now?: number): boolean` ' +
    'in spaceMouse.ts. If it was renamed, update this test and the check below — do not ' +
    'delete it: it is the only thing that makes the pairing more than a comment (PLAN-901.02).');

  // `moving` FIRST. The objection that stopped PLAN-901.01 from writing this
  // helper was that a naive `puckFlyable(Date.now())` reads the clock every
  // frame on an idle bench. It does not, because the short-circuit is inside.
  const body = owner.slice(owner.indexOf('export function puckFlyable'));
  const movingAt = body.indexOf('puck.moving');
  const clockAt = body.indexOf('Date.now()');
  assert.ok(movingAt >= 0 && clockAt >= 0,
    'puckFlyable no longer reads both `puck.moving` and the clock');
  assert.ok(movingAt < clockAt,
    'puckFlyable reads the clock before `puck.moving`, so an idle bench now pays ' +
    'a Date.now() every frame — the exact cost PLAN-901.01 refused this helper over');
});

test('no source outside spaceMouse.ts acts on `puck.moving` by itself', () => {
  const offenders = [];
  for (const path of sources(SRC)) {
    if (path === OWNER) continue;
    const text = code(readFileSync(path, 'utf8'));
    if (!/\bpuck\.moving\b/.test(text)) continue;
    // Reading it beside the verdict is the contract honoured longhand, and
    // reading it through the helper is the contract honoured by name. Either
    // is fine; neither present is the runaway.
    if (/\bpuckFlyable\b/.test(text) || /\bpuckStale\b/.test(text)) continue;
    offenders.push(relative(SRC, path));
  }
  assert.deepEqual(
    offenders, [],
    'these sources read `puck.moving` without ever naming `puckFlyable` or `puckStale`. ' +
    '`moving` is what the producer last said; it does not say whether that is still worth ' +
    'believing. Fly on `puckFlyable()` — it short-circuits on `moving` before it reads the ' +
    'clock, so it costs nothing on an idle bench. PLAN-901.02, PLAN-625.01.');
});

test('the surface that flies the puck goes through the helper', () => {
  const flyer = join(SRC, 'components', 'SampleCloud.tsx');
  const text = readFileSync(flyer, 'utf8');
  assert.match(
    text, /import \{[^}]*\bpuckFlyable\b[^}]*\} from '\.\.\/spaceMouse'/,
    'puck-flyable.test.mjs cannot find the `puckFlyable` import in SampleCloud.tsx. ' +
    'PLAN-501.01 is the standing warning against exporting a helper nothing calls: if the ' +
    'one flying surface stops using it, this helper is dead code and the gate above is ' +
    'guarding a rule nobody follows.');
  assert.match(
    code(text), /if \(!puckFlyable\(\)\) return;/,
    'SpaceMouseFly no longer guards on `puckFlyable()`');
});
