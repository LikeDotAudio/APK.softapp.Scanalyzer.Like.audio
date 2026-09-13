// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The depth axis's rule and its ORDER, held against the Rust that used to own them.
//
// `graphing_rs` computed the hierarchical depth axis — `deeper_sub()` deciding
// whether a subgroup is a curated level, and `BTreeMap<group, BTreeSet<sub>>`
// deciding what order the levels come out in. That crate was the executable
// reference the TypeScript port was checked against, and PLAN-109.04 retired it
// because nothing called it. **This file is what replaces it**: the crate's
// answers, captured from a release build the day before it was deleted, frozen
// into `depth-axis.golden.json`.
//
// WHY THE SOURCE IS READ RATHER THAN IMPORTED
//
// `SampleCloud.tsx` is TSX and pulls in three/react-three-fiber at module load,
// so importing it needs a bundler and a DOM. Extracting the two things under
// test by regex keeps this a `node --test` file with no dependency and no build
// step — and, more importantly, it tests THE SHIPPED SOURCE. A retyped copy of
// `deeperSub` here would pass forever while the component drifted.
//
// The regexes are the fragile part, so they FAIL LOUDLY: a rename that this file
// cannot find is a hard error naming what it looked for, never a silent skip.
// A skipped parity test is worse than no parity test, because it reports green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENT = join(HERE, '..', 'src', 'components', 'SampleCloud.tsx');
const GOLDEN = join(HERE, 'depth-axis.golden.json');

const source = readFileSync(COMPONENT, 'utf8');
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));

function extract(pattern, what) {
  const found = source.match(pattern);
  if (!found) {
    throw new Error(
      `depth-axis.test.mjs cannot find ${what} in ${COMPONENT}.\n` +
      `Looked for: ${pattern}\n` +
      `If it was renamed, update this test — do not delete it: it is the only ` +
      `thing left checking this rule since graphing_rs was retired (PLAN-109.04).`);
  }
  return found;
}

// `deeperSub` — taken from the file and evaluated, so the body under test is the
// body that ships. TypeScript annotations are stripped rather than compiled;
// the function is plain string work and uses no other TS feature.
const body = extract(
  /export function deeperSub\([^)]*\)\s*:\s*string\s*\{([\s\S]*?)\n\}/,
  '`export function deeperSub(...)`')[1];
const deeperSub = new Function('group', 'subgroup', body);

// `DEPTH_SEP` — the separator is load-bearing, not cosmetic. See the test below.
const sep = extract(/const DEPTH_SEP\s*=\s*'([^']*)'/, '`const DEPTH_SEP`')[1]
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

test('deeperSub reproduces the Rust rule on every branch', () => {
  const got = golden.pairs.map(p => deeperSub(p.group, p.subgroup));
  assert.deepEqual(got, golden.expected_deeper_sub);
});

test('the separator sorts below every character a group name can begin with', () => {
  // This is the whole reason the separator is not ' › '. `makeAxis` orders a
  // categorical axis by sorting the distinct set, so the group/subgroup
  // hierarchy has to fall out of ONE string comparison. The Rust never had that
  // constraint — it emitted the group level before its subgroups by hand.
  //
  // With a space-led separator, a group named `Perc Long` sorts BETWEEN `Perc`
  // and `Perc › Conga`, because U+0020 < U+203A. That is a real mis-ordering
  // caught by the index sequence below, and this assertion says why.
  assert.ok(sep.charCodeAt(0) < 0x20,
    `DEPTH_SEP starts with U+${sep.charCodeAt(0).toString(16).padStart(4, '0')}, ` +
    `which does not sort below a printable group name`);
});

test('the depth axis emits levels in the Rust binary order', () => {
  // `makeAxis`'s ordering, reproduced: build each record's depth key, sort the
  // distinct set, and index into it. If this sequence matches the one the Rust
  // binary printed, the port agrees with the crate on grouping AND on order.
  const keys = golden.pairs.map(p => {
    const sub = deeperSub(p.group, p.subgroup);
    return sub ? p.group + sep + sub : p.group;
  });
  const levels = [...new Set(keys)].sort();
  assert.deepEqual(keys.map(k => levels.indexOf(k)), golden.expected_index_sequence);
});

test('the golden vectors still cover every branch of the rule', () => {
  // A vector set that has quietly lost its interesting cases passes forever.
  // Both outcomes must be present, and the four rejection reasons distinct.
  const results = golden.pairs.map((p, i) => [p, golden.expected_deeper_sub[i]]);
  assert.ok(results.some(([, r]) => r !== ''), 'no curated subgroup among the vectors');
  assert.ok(results.some(([, r]) => r === ''), 'no rejected subgroup among the vectors');
  assert.ok(results.some(([p]) => p.subgroup === ''), 'no absent-subgroup vector');
  assert.ok(results.some(([p]) => p.subgroup !== '' &&
    p.subgroup.toLowerCase() === p.group.toLowerCase()), 'no case-only echo vector');
  assert.ok(results.some(([p]) => p.subgroup.toLowerCase().startsWith(p.group.toLowerCase()) &&
    p.subgroup.toLowerCase() !== p.group.toLowerCase()), 'no subgroup-extends-group vector');
  assert.ok(results.some(([p]) => p.group.toLowerCase().startsWith(p.subgroup.toLowerCase()) &&
    p.subgroup !== '' && p.subgroup.toLowerCase() !== p.group.toLowerCase()),
    'no group-extends-subgroup vector');
});
