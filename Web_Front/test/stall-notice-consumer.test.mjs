// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The stall notice reaches the screen, held against the source that ships it.
//
// PLAN-901.01 gave the badge a second qualifier: `stallWarning()` in
// `spaceMouse.ts`, obeyed by `CloudTab.tsx`, which draws `⏸ not reporting`
// beside the state word when the producer has advertised a cadence and missed
// three beats of it. Before that branch, PLAN-625.01's stale guard stopped the
// camera and said NOTHING — the badge went on reading `puck on <host>` in the
// lit colour, because the retained status still said online and no Last Will
// had fired. A screen making a positive claim that the puck is there and fine
// while the loop has decided not to fly it.
//
// That branch was proved once, on 2026-09-09, by 13 assertions driven at the
// built bundle in headless Chrome over CDP — and that harness lived in a
// scratchpad and died with the session. Nothing in this checkout held it.
// THIS FILE IS WHAT HOLDS IT. PLAN-1062.01.
//
// TWO HALVES, CHECKED DIFFERENTLY — the shape `sense-warning-consumer.test.mjs`
// established, and this is deliberately its twin rather than a new idiom.
//
// The RULE is EXECUTED. `spaceMouse.ts` declares no imports, so node's own type
// stripping loads it and `stallWarning` / `stallPollMs` / `staleWindowFor` are
// called with the qualifications that matter. That is behaviour, not text.
//
// The REACHABILITY is READ off `CloudTab.tsx`, because rendering it would need
// React, three.js and a DOM this lane deliberately does not have. What is
// asserted there is structural: the rule is imported rather than restated, its
// answer decides whether an element EXISTS, and the poll behind it is armed off
// the advertised window rather than run always.
//
// WHAT IS DELIBERATELY NOT ASSERTED HERE: the wording, the glyph and the tone.
// `⏸`, `not reporting` and the amber are all free to change — a gate that fails
// the day somebody improves a phrase is a gate sessions learn to route around,
// which is PLAN-431.01's first "must not be broken" and applies to the second
// qualifier exactly as it did to the first. The notice is a non-empty string
// and that is the whole contract on it.
//
// ALSO NOT ASSERTED: that 100 puck frames produce 0 badge DOM mutations. That
// is a measurement, and it needs a browser. What stands in for it is the
// STRUCTURE that makes it true — a poll rather than a subscription, and a
// functional update that returns the identical boolean when nothing moved so
// React bails out. If you want the DOM number again, drive the bundle: the
// `verify` skill in this project says how, with no dependency to install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULE = join(HERE, '..', 'src', 'spaceMouse.ts');
const CONSUMER = join(HERE, '..', 'src', 'components', 'CloudTab', 'CloudTab.tsx');

// A rename this file cannot follow is a hard error naming what it looked for,
// never a silent skip. A skipped parity test reports green, which is worse than
// no test at all.
function loud(what, detail) {
  return new Error(
    `stall-notice-consumer.test.mjs cannot find ${what}.\n${detail}\n` +
    `If it was renamed, update this test — do not delete it: it is the only ` +
    `thing standing between the stall notice and the silence PLAN-625.01 left ` +
    `behind, which \`tsc -b\` and \`vite build\` both accept (PLAN-901.01, ` +
    `PLAN-1062.01).`);
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
    throw loud('`stallWarning` in ' + RULE,
      `The module would not load: ${err.message}`);
  }
  for (const name of ['stallWarning', 'stallPollMs', 'staleWindowFor']) {
    if (typeof rule[name] !== 'function') {
      throw loud('`export function ' + name + '`',
        `${RULE} loaded, but exports no callable \`${name}\`.`);
    }
  }
  return rule;
}

// ---------------------------------------------------------------- the rule

test('an online producer that has gone quiet produces a notice', async () => {
  const { stallWarning } = await theRule();
  const said = stallWarning({ online: true }, true);
  assert.equal(typeof said, 'string',
    `stallWarning() returned ${JSON.stringify(said)} for an ONLINE puck whose ` +
    `frames have stopped. That is the one case the whole branch exists for: ` +
    `the status topic still says online, no Last Will has fired, and the ` +
    `camera has quietly stopped flying.`);
  assert.ok(said.length > 0,
    'stallWarning() returned an empty string, which draws as nothing.');
});

test('it is not gated on `moving` — a dead relay goes stale at rest', async () => {
  const { stallWarning } = await theRule();
  // `due_heartbeat()` in `spacenavigator_probe.py` has no `moving` term: a
  // frame is owed even with nothing moving. Gating this notice on a held
  // deflection would stay silent in the case the operator meets first — a
  // puck that was never going to answer the next push, on a bench that looks
  // fine. This was the near miss PLAN-901.01 records.
  assert.equal(typeof stallWarning({ online: true, moving: false }, true), 'string',
    'A stalled producer with the hand OFF the puck drew nothing. The heartbeat ' +
    'fires unconditionally at rest, so silence at rest is exactly as dead as ' +
    'silence under a push.');
});

test('it clears itself, and it does not double-report an announced death', async () => {
  const { stallWarning } = await theRule();
  assert.equal(stallWarning({ online: true }, false), null,
    'A fresh producer must be silent. There is nothing to reset and nothing to ' +
    'latch — recovery is the next frame arriving, and the notice simply stops.');
  assert.equal(stallWarning({ online: false }, true), null,
    'An ANNOUNCED death already has its own words (`puck gone`), and a stall ' +
    'notice on top of it reports the same absence twice in two vocabularies. ' +
    'This is only ever the death nobody announced.');
  assert.equal(stallWarning(null, true), null,
    'No status at all is not a stall.');
});

test('an unbounded producer arms no timer, so it can draw nothing', async () => {
  const { stallPollMs, staleWindowFor } = await theRule();
  // PLAN-625.01's third "must not be broken", made structural rather than left
  // as a branch somebody has to remember: with no advertised window there is no
  // poll, so there is no verdict, so there is no notice.
  assert.equal(staleWindowFor({ heartbeat_s: 0 }), 0,
    '`heartbeat_s: 0` is a producer promising no heartbeat. It must yield NO ' +
    'stale window — a consumer may not time out against a cadence nobody offered.');
  assert.equal(stallPollMs(staleWindowFor({ heartbeat_s: 0 })), 0,
    'Zero window must mean zero poll. A notice armed anyway would be a lie.');
  assert.equal(stallPollMs(staleWindowFor(null)), 0,
    'A producer too old to declare its pacing has not thereby promised a beat.');
});

test('the poll is derived from the window, not typed, and has a floor', async () => {
  const { stallPollMs, staleWindowFor } = await theRule();
  assert.equal(staleWindowFor({ heartbeat_s: 2 }), 6000,
    'Three missed beats of the default 2 s cadence is a 6 s window.');
  assert.equal(stallPollMs(6000), 1000,
    'A sixth of the window: ~1 s of lateness on a notice about a 6 s silence.');
  assert.equal(stallPollMs(600), 250,
    'The 250 ms floor is what stops a producer advertising an absurdly tight ' +
    'cadence talking a consumer into a spin.');
  assert.ok(stallPollMs(180000) > 1000,
    '`heartbeat_s: 60` is a 180 s window and must get a lazy poll, not 360 ' +
    'needless wakeups. Deriving the poll rather than typing 500 ms is the ' +
    'whole reason a slow producer stays cheap.');
});

// -------------------------------------------------------- the reachability

const consumer = readFileSync(CONSUMER, 'utf8');

/** The identifier `CloudTab` binds `stallWarning`'s answer to, and where. */
function binding() {
  const bound = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*stallWarning\s*\(/.exec(consumer);
  if (!bound) {
    throw loud('a call to `stallWarning` in ' + CONSUMER,
      'Nothing in the component asks the rule, so the producer can stop ' +
      'sending and the viewport will never mention it — which is the exact ' +
      'state PLAN-901.01 was carved on.');
  }
  return { name: bound[1], at: bound.index };
}

function boundName() { return binding().name; }

/**
 * The render of the component that asked, from its `return (` to end of file.
 *
 * Measured from the BINDING rather than from the top of the file, for the
 * reason `sense-warning-consumer.test.mjs` records: this file holds three
 * components, and a search from the top lands on `CloudCrashed`'s render.
 */
function render() {
  const at = consumer.indexOf('\n  return (', binding().at);
  if (at < 0) {
    throw loud("a `return (` after the `stallWarning` binding in " + CONSUMER,
      'The component asks the rule and then renders nothing this test can read.');
  }
  return consumer.slice(at);
}

/**
 * Delete every JSX attribute expression whose name matches, braces balanced.
 *
 * A regex cannot do this: `title={[ … ].join('\n\n')}` and `style={{ … }}`
 * both nest, and a non-greedy match stops at the first `}` inside them and
 * leaves the rest of the render looking like an attribute. Counting braces is
 * the whole difference between this gate failing on a caption and passing one.
 */
function stripAttributes(jsx, name) {
  const attribute = new RegExp(`\\b${name}=\\{`, 'g');
  let out = '', i = 0;
  for (;;) {
    attribute.lastIndex = i;
    const found = attribute.exec(jsx);
    if (!found) return out + jsx.slice(i);
    out += jsx.slice(i, found.index);
    let depth = 1, j = found.index + found[0].length;
    while (j < jsx.length && depth > 0) {
      if (jsx[j] === '{') depth++;
      else if (jsx[j] === '}') depth--;
      j++;
    }
    i = j;
  }
}

/** What is DRAWN: the render with every attribute expression removed. */
function childrenOnly(jsx) {
  return stripAttributes(jsx, '[A-Za-z_$][\\w$-]*');
}

test('the component imports the rule rather than restating it', () => {
  for (const name of ['stallWarning', 'stallPollMs', 'staleWindowFor']) {
    assert.match(consumer, new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`),
      `${CONSUMER} no longer imports \`${name}\`. The stale window is derived ` +
      `once, in spaceMouse.ts, because the render loop and this poll must not ` +
      `be able to time out against different milliseconds. A consumer that ` +
      `re-derives it is the second copy that drifts.`);
  }
  boundName();
});

test('the notice is not only a caption', () => {
  const id = boundName();
  const withoutTitle = stripAttributes(render(), 'title');
  assert.ok(new RegExp(`\\b${id}\\b`).test(withoutTitle),
    `\`${id}\` is used ONLY inside a \`title=\` attribute. A stall that is ` +
    `visible only on hover leaves the badge making the same positive claim it ` +
    `made before PLAN-901.01: \`puck on <host>\`, lit, while nothing is flying.`);
});

test('the notice decides whether something is drawn', () => {
  const id = boundName();
  const children = childrenOnly(render());
  assert.ok(new RegExp(`\\{\\s*${id}\\s*(&&|\\?)`).test(children),
    `\`${id}\` no longer guards any JSX child — it survives only in ` +
    `attributes. Tinting a badge that was going to be drawn anyway is not the ` +
    `same as the viewport SAYING the producer has stopped. Keep an element ` +
    `whose existence depends on it; the wording of that element is yours.`);
});

test('the poll is armed off the advertised window, so `heartbeat_s: 0` cannot draw', () => {
  // The structural half of the rule the executed tests above prove: it is not
  // enough that `stallPollMs(0)` returns 0 — the component has to ASK it with
  // the derived window rather than with a typed interval, or an unbounded
  // producer gets polled anyway and the zero is decoration.
  assert.match(consumer, /stallPollMs\s*\(\s*staleWindowFor\s*\(/,
    `${CONSUMER} no longer arms its poll with \`stallPollMs(staleWindowFor(…))\`. ` +
    `A typed interval here re-opens PLAN-625.01's third "must not be broken": ` +
    `a producer advertising no heartbeat would be timed out against a cadence ` +
    `it never promised.`);
});

test('frames do not become renders: the stall verdict is set only on a transition', () => {
  // The structural stand-in for "100 puck frames produced 0 badge DOM
  // mutations", which was measured in headless Chrome on 2026-09-09 and needs a
  // browser to measure again. What can be held here is the shape that makes it
  // true: a functional update that hands React back the IDENTICAL boolean when
  // nothing moved, so it bails out of the render.
  const setter = /\bset([A-Z][\w$]*)\(\s*(?:prev|previous)\s*=>/.exec(consumer);
  if (!setter) {
    throw loud('a functional update `setX(prev => …)` for the stall verdict in ' + CONSUMER,
      'The poll writes state on every tick instead of on a transition. At a ' +
      '1 s poll that is cosmetic; the rule it breaks is not, and the next ' +
      'reader will copy whatever is here.');
  }
  const tick = consumer.slice(setter.index, setter.index + 400);
  assert.match(tick, /\bprev\b[^;]*\?\s*prev\s*:/,
    `The functional update at \`set${setter[1]}\` no longer returns \`prev\` ` +
    `unchanged when the verdict has not moved. React bails out of a render ` +
    `only when it is handed the identical value; returning a fresh one on ` +
    `every tick turns a poll into a re-render loop. Frames must not become ` +
    `renders — both \`spaceMouse.ts\` and \`CloudTab.tsx\` argue this at length.`);
});
