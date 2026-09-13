// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The unconfirmed-sense warning reaches the screen, held against the source.
//
// PLAN-394.01 replaced an eleven-character suffix on a `title=` attribute with a
// real branch: `senseWarning()` in `spaceMouse.ts`, obeyed by `CloudTab.tsx`,
// which paints the puck badge amber and draws a notice when the producer says
// the sense is unconfirmed. Every lane in `check.sh` was green with that branch
// deleted — `scan-web` runs `tsc -b` and `vite build`, so it proves the file
// compiles and says nothing about what it draws. THIS FILE IS WHAT MAKES THE
// DELETION FAIL. PLAN-431.01.
//
// TWO HALVES, AND THEY ARE CHECKED DIFFERENTLY ON PURPOSE.
//
// The RULE is executed. `spaceMouse.ts` declares no imports, so node's own type
// stripping loads it and `senseWarning` is called with the four qualifications
// that matter. That is behaviour, not text.
//
// The REACHABILITY is read off `CloudTab.tsx`, because rendering it would need
// React, three.js and a DOM this lane deliberately does not have. What is
// asserted there is structural: the value is bound, it is used somewhere other
// than the `title` attribute, and it decides whether an element exists.
//
// WHAT IS DELIBERATELY NOT ASSERTED: the wording. Nothing here looks for
// `sense unverified`, for `⚠`, or for any sentence. A gate that fails the day
// somebody improves a phrase is a gate sessions learn to route around —
// PLAN-431.01's first "must not be broken". The warning is a non-empty string
// and that is the whole contract on it.
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
    `sense-warning-consumer.test.mjs cannot find ${what}.\n${detail}\n` +
    `If it was renamed, update this test — do not delete it: it is the only ` +
    `thing standing between the unconfirmed-sense branch and a return to the ` +
    `caption it replaced, which \`tsc -b\` and \`vite build\` both accept ` +
    `(PLAN-394.01, PLAN-431.01).`);
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
    throw loud('`senseWarning` in ' + RULE,
      `The module would not load: ${err.message}`);
  }
  if (typeof rule.senseWarning !== 'function') {
    throw loud('`export function senseWarning`',
      `${RULE} loaded, but exports no callable \`senseWarning\`.`);
  }
  return rule;
}

// ---------------------------------------------------------------- the rule

test('an online puck whose sense is unconfirmed produces a warning', async () => {
  const { senseWarning } = await theRule();
  const said = senseWarning({ online: true, senseConfirmed: false });
  assert.equal(typeof said, 'string',
    `senseWarning() returned ${JSON.stringify(said)} for an ONLINE puck whose ` +
    `sense is UNCONFIRMED. That is the one case the whole branch exists for: ` +
    `the camera is flying on six declared axes nobody has checked.`);
  assert.ok(said.length > 0,
    'senseWarning() returned an empty string, which draws as nothing.');
});

test('a confirmed sense says nothing, and neither does a puck that is not flying', async () => {
  const { senseWarning } = await theRule();
  assert.equal(senseWarning({ online: true, senseConfirmed: true }), null,
    'A confirmed sense must be silent — a permanent notice is a notice nobody reads.');
  assert.equal(senseWarning({ online: false, senseConfirmed: false }), null,
    'An offline puck is not flying anything, so there is nothing to qualify.');
  assert.equal(senseWarning(null), null,
    'No status at all is not a warning.');
});

// -------------------------------------------------------- the reachability

const consumer = readFileSync(CONSUMER, 'utf8');

/** The identifier `CloudTab` binds `senseWarning`'s answer to, and where. */
function binding() {
  const bound = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*senseWarning\s*\(/.exec(consumer);
  if (!bound) {
    throw loud('a call to `senseWarning` in ' + CONSUMER,
      'Nothing in the component asks the rule, so the producer can say the ' +
      'sense is unconfirmed and the viewport will never mention it.');
  }
  return { name: bound[1], at: bound.index };
}

function boundName() { return binding().name; }

/**
 * The render of the component that asked, from its `return (` to end of file.
 *
 * Measured from the BINDING rather than from the top of the file, because this
 * one holds three components: `CloudCrashed` and `WebGLUnavailable` both return
 * JSX above it, and a search from the top lands on the first of them — which
 * put the binding itself inside the "render" and made a caption-only consumer
 * look like a drawn one. The component that reads the warning is the only one
 * whose render can obey it.
 */
function render() {
  const at = consumer.indexOf('\n  return (', binding().at);
  if (at < 0) {
    throw loud("a `return (` after the `senseWarning` binding in " + CONSUMER,
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

/**
 * What is DRAWN: the render with every attribute expression removed.
 *
 * Passing the warning to `title=` is the caption this branch replaced, and
 * passing it to `style=` tints an element that was going to be there anyway.
 * Neither is the same as an element existing because the sense is unconfirmed.
 */
function childrenOnly(jsx) {
  return stripAttributes(jsx, '[A-Za-z_$][\\w$-]*');
}

test('the component imports the rule rather than restating it', () => {
  assert.match(consumer, /import\s*\{[^}]*\bsenseWarning\b[^}]*\}\s*from/,
    `${CONSUMER} no longer imports \`senseWarning\`. The rule for an ` +
    `unconfirmed frame is stated once, in spaceMouse.ts; a consumer that ` +
    `re-derives it from two bare booleans is the second copy that drifts.`);
  boundName();
});

test('the warning is not only a caption', () => {
  const id = boundName();
  const drawn = render();
  const withoutTitle = stripAttributes(drawn, 'title');
  assert.ok(new RegExp(`\\b${id}\\b`).test(withoutTitle),
    `\`${id}\` is used ONLY inside a \`title=\` attribute. That is exactly the ` +
    `state PLAN-394.01 found and replaced: the camera flew on six ` +
    `possibly-inverted axes and the only trace was a hover tooltip. A flag ` +
    `that qualifies the convention and changes nothing on screen is ` +
    `indistinguishable from no flag.`);
});

test('the warning decides whether something is drawn', () => {
  const id = boundName();
  const children = childrenOnly(render());
  assert.ok(new RegExp(`\\{\\s*${id}\\s*(&&|\\?)`).test(children),
    `\`${id}\` no longer guards any JSX child — it survives only in ` +
    `attributes. Tinting a border that was going to be drawn anyway is not ` +
    `the same as the viewport SAYING the sense is unverified. Keep an element ` +
    `whose existence depends on it; the wording of that element is yours.`);
});
