// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The puck's frame qualification, held against the source that ships it.
//
// `puck.online` and `puck.senseConfirmed` are written by `receivePuck` and read
// by no surface in this tree — the rule in force is fly-and-say-so
// (PLAN-394.01), so nothing here refuses a frame. PLAN-501.01 made them
// load-bearing to `tsc -b` by spelling the object's type
// `{ frame; moving; at; staleAfterMs } & FrameQualification` rather than as two
// more booleans, and that defends them against the lint sweep and the
// bundle-size pass.
//
// It does NOT defend them against a reader who deletes the annotation ALONG
// WITH the fields. Removing the `& FrameQualification` clause, the two
// initialisers and the two assignments is three edits in one file — which is
// what tidying an unfamiliar module actually looks like — and it exits `tsc -b`
// **0**. Measured 2026-09-06 and again 2026-09-07. The JSDoc above `puck` says
// the annotation is load-bearing, and prose is the thing PLAN-501.01 was carved
// to stop relying on. THIS FILE IS WHAT MAKES THE THREE-EDIT DELETION FAIL.
// PLAN-624.01.
//
// WHY THE SOURCE IS READ RATHER THAN IMPORTED
//
// Same reason as `depth-axis.test.mjs`, which is the model: `spaceMouse.ts` is
// TypeScript, so importing it needs a build step, and a `.d.ts` or a retyped
// copy of the shape here would pass forever while the module drifted. What is
// under test is a DECLARATION, not a value, so there is nothing to execute —
// the shipped text is the whole subject.
//
// The regexes are the fragile part, so they FAIL LOUDLY: a rename this file
// cannot find is a hard error naming what it looked for, never a silent skip.
// A skipped parity test reports green, which is worse than none.
//
// WHAT IS DELIBERATELY NOT ASSERTED: the wording of any comment. A gate that
// fails on a rewritten sentence is a gate sessions learn to route around —
// PLAN-431.01's second constraint, and it applies here unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = join(HERE, '..', 'src', 'spaceMouse.ts');

const source = readFileSync(MODULE, 'utf8');

function extract(pattern, what) {
  const found = source.match(pattern);
  if (!found) {
    throw new Error(
      `puck-qualification.test.mjs cannot find ${what} in ${MODULE}.\n` +
      `Looked for: ${pattern}\n` +
      `If it was renamed, update this test — do not delete it: it is the only ` +
      `thing standing between the qualification and a three-edit tidy-up that ` +
      `\`tsc -b\` accepts (PLAN-624.01).`);
  }
  return found;
}

// The three things, and any one of them missing is the defect. They are the
// three edits of the deletion, in the order a tidying session makes them.

test('FrameQualification declares both facts that qualify a frame', () => {
  const body = extract(
    /export interface FrameQualification\s*\{([\s\S]*?)\n\}/,
    '`export interface FrameQualification`')[1];
  for (const field of ['online', 'senseConfirmed']) {
    assert.match(body, new RegExp(`\\b${field}\\s*:\\s*boolean`),
      `FrameQualification no longer declares \`${field}: boolean\`. It is one ` +
      `idea carried on two objects for two readers; dropping half of it here ` +
      `silently drops it from \`puck\` and from \`PuckStatus\` at once.`);
  }
});

test('the puck object is typed by FrameQualification, not by two loose booleans', () => {
  // The annotation IS the mechanism. Spelled as two more properties on the
  // object literal's type, the fields are indistinguishable from dead code to
  // every automated reader — which is how they were deleted clean once already.
  const annotation = extract(
    /export const puck\s*:\s*\{([\s\S]*?)\n\}\s*([^=]*)=/,
    '`export const puck: { … } = …`');
  assert.match(annotation[2], /&\s*FrameQualification/,
    `\`puck\`'s type no longer names FrameQualification. Whatever else it says, ` +
    `the qualification is now optional to \`tsc -b\` and the next tidy-up ` +
    `takes it. See PLAN-501.01 and PLAN-624.01.`);
});

test('the puck-status branch assigns both facts onto the puck', () => {
  // A declared field nobody writes is a lie with a type on it: the render loop
  // would read `false` forever and no compiler would say so.
  const branch = extract(
    /if \(data\.action === 'puck-status'\) \{([\s\S]*?)\n    \}/,
    "the `data.action === 'puck-status'` branch of `receivePuck`")[1];
  for (const field of ['online', 'senseConfirmed']) {
    assert.match(branch, new RegExp(`puck\\.${field}\\s*=`),
      `The puck-status branch no longer assigns \`puck.${field}\`. The field ` +
      `still type-checks and is now frozen at its initialiser, which is the ` +
      `one failure mode the type cannot catch.`);
  }
});
