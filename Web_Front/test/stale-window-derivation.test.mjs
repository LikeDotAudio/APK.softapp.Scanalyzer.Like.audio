// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The stale window is DERIVED from what the producer advertised, and this is
// what says so.
//
// PLAN-625.01 landed `staleWindowFor`, and the whole value of that guard is in
// one property: the window comes from the producer's own `pacing`, and an
// unbounded producer gets no window at all. `tsc -b` and `vite build` are both
// green against a `staleWindowFor` rewritten to `return 250`, and both are green
// against one whose `heartbeat_s <= 0` branch returns 6000 instead of 0. The
// second is the dangerous one: it silently re-creates the defect that blocked
// PLAN-625.01 for a day — a window against a producer that publishes one frame
// on a held deflection and then legitimately says nothing, measured at one frame
// in 10.06 s on the real puck and at 39.1 s of total silence in that plan's own
// `heartbeat_s: 0` run. PLAN-900.01.
//
// `PLAN-780.01` is the same hole one hop upstream and does not cover this: it
// asserts the PRODUCER still publishes `pacing`. Nothing asserted that the
// CONSUMER still reads it correctly, and both halves can be green while the
// guard is wrong.
//
// WHY THIS FILE AND NOT A NEW RUNNER. PLAN-900.01 was carved saying this project
// has no unit-test surface at all. It has one now: `npm test` here is
// `node --test test/*.test.mjs`, and five files already sit beside this one. So
// step 1's real instruction — do not add a test runner to a project that has
// none — is satisfied by adding no runner. `spaceMouse.ts` declares no imports,
// so node's own type stripping loads it and the rule is EXECUTED rather than
// read as text. Nothing here needs a puck, which is PLAN-900.01's second "must
// not be broken".
//
// WHY IT IS NOT FOLDED INTO `stall-notice-consumer.test.mjs`. That file holds a
// different claim — that the NOTICE reaches the screen (PLAN-1062.01) — and it
// asserts two points of this derivation in passing, as inputs to the poll it is
// really about. This file holds the derivation itself, including the two things
// nothing anywhere asserted: that `rate_hz` participates at all, and that the
// multiple is `PUCK_STALE_BEATS` rather than a 3 typed into the expression.
//
// WHAT IS DELIBERATELY NOT ASSERTED: the VALUE of `PUCK_STALE_BEATS`. Three is a
// judgement with its reasoning recorded next to it, not a constant of nature,
// and a gate that freezes it makes the next person's revision a test failure
// rather than a decision. PLAN-900.01 §4. Every assertion below that involves
// the multiple is written in terms of the exported constant, so raising it to
// four moves this file's expectations with it and moves nothing else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULE = join(HERE, '..', 'src', 'spaceMouse.ts');

// A rename this file cannot follow is a hard error naming what it looked for,
// never a silent skip. A skipped parity test reports green, which is worse than
// no test at all.
function loud(what, detail) {
  return new Error(
    `stale-window-derivation.test.mjs cannot find ${what}.\n${detail}\n` +
    `If it was renamed, update this test — do not delete it: it is the only ` +
    `thing that proves the stale window is derived from the producer rather ` +
    `than typed, which \`tsc -b\` and \`vite build\` both accept either way ` +
    `(PLAN-625.01, PLAN-900.01).`);
}

let rule;
async function theRule() {
  if (rule) return rule;
  try {
    rule = await import(pathToFileURL(RULE).href);
  } catch (err) {
    // Node strips types from `.ts` natively. It cannot do that for a module
    // that has grown a non-erasable construct or an import of its own, and
    // either would be a real change to a file this test exists to hold.
    throw loud('`staleWindowFor` in ' + RULE, `The module would not load: ${err.message}`);
  }
  if (typeof rule.staleWindowFor !== 'function') {
    throw loud('`export function staleWindowFor`',
      `${RULE} loaded, but exports no callable \`staleWindowFor\`.`);
  }
  if (!Number.isFinite(rule.PUCK_STALE_BEATS) || rule.PUCK_STALE_BEATS <= 0) {
    throw loud('`export const PUCK_STALE_BEATS`',
      `${RULE} loaded, but \`PUCK_STALE_BEATS\` is ` +
      `${JSON.stringify(rule.PUCK_STALE_BEATS)}. It exists so the multiple has ` +
      `one home with a reason written next to it; inlining it is the regression ` +
      `this file is here to catch.`);
  }
  return rule;
}

// --------------------------------------------- the three measured cases (§2)

test('the producer default derives a window three beats wide', async () => {
  const { staleWindowFor, PUCK_STALE_BEATS } = await theRule();
  // `heartbeat_s: 2, rate_hz: 20` is what `spacenavigator_probe.py` advertises
  // once an operator turns the heartbeat on. The beat is 2 s and the coalescing
  // period is 50 ms, so the beat wins and the window is three beats of it.
  assert.equal(staleWindowFor({ heartbeat_s: 2, rate_hz: 20 }), 2000 * PUCK_STALE_BEATS,
    'The advertised 2 s heartbeat must produce a window of three of them. A ' +
    'window that stops tracking the advertised beat is a consumer timing out ' +
    'against a cadence nobody offered.');
});

test('`heartbeat_s: 0` derives NO window, which is the case every window is wrong for', async () => {
  const { staleWindowFor } = await theRule();
  // The producer's default before an operator turns it on, and PLAN-625.01's
  // first "must not be broken": 0 means NEVER TIME OUT. A puck holding a
  // deflection publishes one frame and then legitimately says nothing —
  // measured at one frame in 10.06 s, and at 39.1 s of total silence.
  assert.equal(staleWindowFor({ heartbeat_s: 0 }), 0,
    '`heartbeat_s: 0` is a producer promising no heartbeat at all. Any window ' +
    'here is a consumer calling a living puck dead for holding still.');
  assert.equal(staleWindowFor({ heartbeat_s: 0, rate_hz: 20 }), 0,
    'A coalescing rate is not a promise that anything is SENT. `rate_hz` beside ' +
    '`heartbeat_s: 0` must not manufacture the window the heartbeat withheld.');
});

test('pacing that is absent, empty or malformed derives no window either', async () => {
  const { staleWindowFor } = await theRule();
  // A producer too old to declare its pacing has not thereby promised a beat,
  // and neither has one whose value did not survive the wire. Every one of
  // these is the same safe direction: no window at all rather than a window
  // nobody advertised.
  for (const pacing of [null, undefined, {}, { rate_hz: 20 }, { heartbeat_s: -1 },
                        { heartbeat_s: 'soon' }, { heartbeat_s: NaN }]) {
    assert.equal(staleWindowFor(pacing), 0,
      `staleWindowFor(${JSON.stringify(pacing)}) invented a window out of a ` +
      `producer that advertised no usable heartbeat.`);
  }
});

// ------------------------------- the multiple is not inlined (§3), not frozen (§4)

test('the window scales with the advertised beat rather than being a fixed number', async () => {
  const { staleWindowFor, PUCK_STALE_BEATS } = await theRule();
  // This is what `return 250` and every other constant fails. Two different
  // advertised cadences must produce two different windows, each three beats
  // of ITS OWN beat — a derivation, not a number.
  assert.equal(staleWindowFor({ heartbeat_s: 1 }), 1000 * PUCK_STALE_BEATS);
  assert.equal(staleWindowFor({ heartbeat_s: 5 }), 5000 * PUCK_STALE_BEATS);
  assert.equal(staleWindowFor({ heartbeat_s: 60 }), 60000 * PUCK_STALE_BEATS,
    'A slow producer gets a proportionally slow window. A `heartbeat_s: 60` ' +
    'puck timed out against anything shorter is reported dead every minute it ' +
    'is alive.');
});

test('the multiple is `PUCK_STALE_BEATS`, and this does not say what it should be', async () => {
  const { staleWindowFor, PUCK_STALE_BEATS } = await theRule();
  // §3 and §4 of PLAN-900.01, in one assertion. The window is tied to the
  // EXPORTED constant, so a 3 typed into the expression breaks this the moment
  // the constant moves — and raising the constant to four moves the expectation
  // with it rather than failing. Nothing here asserts the number is three.
  const advertised = 4;
  assert.equal(staleWindowFor({ heartbeat_s: advertised }),
    advertised * 1000 * PUCK_STALE_BEATS,
    'The window is no longer `PUCK_STALE_BEATS × advertised`. That constant ' +
    'exists so the multiple has one home with its reasoning beside it; a ' +
    'window computed from a literal is the regression, whatever the literal is.');
});

test('`rate_hz` is the floor under the beat, and it participates', async () => {
  const { staleWindowFor, PUCK_STALE_BEATS } = await theRule();
  // `Math.max(beat, period)`: a producer advertising a heartbeat SHORTER than
  // the interval it coalesces at cannot be held to the heartbeat, because it
  // physically cannot emit that fast. 20 Hz is a 50 ms period, so a 10 ms
  // heartbeat is floored to 50 ms and the window is three of THOSE.
  //
  // Nothing anywhere asserted that `rate_hz` was read at all. A `staleWindowFor`
  // that dropped the `Math.max` passed every check in this tree.
  assert.equal(staleWindowFor({ heartbeat_s: 0.01, rate_hz: 20 }), 50 * PUCK_STALE_BEATS,
    'A heartbeat faster than the coalescing period must be floored to the ' +
    'period. Holding a producer to a cadence it told you it cannot emit is the ' +
    'same fault as timing out against one it never offered.');
  assert.equal(staleWindowFor({ heartbeat_s: 0.01 }), 10 * PUCK_STALE_BEATS,
    'With no `rate_hz` there is no floor, and the advertised beat stands alone.');
});

test('and the expression names the constant, which executing it cannot show', async () => {
  await theRule();
  // THE ONE ASSERTION HERE THAT READS SOURCE, and it reads it because the
  // behaviour cannot distinguish the two states. `* 3` and `* PUCK_STALE_BEATS`
  // compute the identical number for as long as the constant IS three, so every
  // executed assertion above passes against an inlined literal. What breaks is
  // the NEXT revision: somebody raises the constant, the window does not move,
  // and nothing says so. Same split as `stall-notice-consumer.test.mjs`, which
  // executes the rule and reads the consumer.
  const source = readFileSync(RULE, 'utf8');
  const body = source.slice(source.indexOf('export function staleWindowFor'));
  const end = body.indexOf('\n}');
  assert.ok(end > 0, loud('the body of `staleWindowFor`',
    'Found the export but no closing brace at column 0 after it.'));
  assert.match(body.slice(0, end), /PUCK_STALE_BEATS/,
    '`staleWindowFor` no longer names `PUCK_STALE_BEATS`. The constant exists so ' +
    'the multiple has one home with its reasoning beside it; a literal in the ' +
    'expression makes the constant a comment.');
});
