// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The UCS synonym library reaches what it says it reaches, and a broken one
// never stops the search.
//
// Issue #1 ("Synonyms to the UCS") asked for words for the UCS's own words. The
// library has two rings (src/ucsSynonyms.ts says why): the UCS's own synonyms,
// generated into src/ucsSynonyms.json, and the hand-kept src/ucsThesaurus.json.
// `ucsSynonyms.ts` declares no imports, so node's own type stripping loads it and
// the matching rule is EXECUTED here against the real shipped data — the same
// pattern stale-window-derivation.test.mjs uses for spaceMouse.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildSynonymIndex, compileQuery, expandTerm, normalize, stem, subKey, EMPTY_INDEX,
} from '../src/ucsSynonyms.ts';

const here = dirname(fileURLToPath(import.meta.url));
const library = JSON.parse(readFileSync(join(here, '../src/ucsSynonyms.json'), 'utf8'));
const thesaurus = JSON.parse(readFileSync(join(here, '../src/ucsThesaurus.json'), 'utf8'));
const index = buildSynonymIndex(library.subcategories, thesaurus.rings);

const DOOR_ANTIQUE = subKey('DOORS', 'ANTIQUE');
const hasCategory = (keys, cat) => [...keys].some(k => k.startsWith(cat + '\u001f'));

test('the shipped library builds with nothing skipped', () => {
  assert.equal(index.skipped, 0);
  assert.ok(library.subcategories.length >= 800, 'the generated rows cover the UCS');
  assert.ok(index.words.size > 10000, 'the UCS words are indexed');
});

test('every thesaurus ring touches the UCS — a ring that reaches nothing is dead weight', () => {
  const dead = thesaurus.rings.filter(ring =>
    !ring.some(w => index.words.has(normalize(w)) || index.words.has(stem(normalize(w)))));
  assert.deepEqual(dead, [], 'each ring needs at least one category, subcategory or UCS synonym');
});

test('first ring: a UCS synonym reaches its subcategory', () => {
  assert.ok(expandTerm(index, 'abbey').keys.has(DOOR_ANTIQUE));
  assert.ok(expandTerm(index, 'victorian').keys.has(DOOR_ANTIQUE));
});

test('second ring: a word the UCS does not know reaches through one it does', () => {
  const sedan = expandTerm(index, 'sedan');
  assert.ok(sedan.keys.size > 0, '"sedan" reaches something');
  assert.ok(hasCategory(sedan.keys, 'VEHICLES'), '"sedan" reaches VEHICLES via "car"');
  assert.ok(sedan.via.includes('car'));
  assert.ok(hasCategory(expandTerm(index, 'automobile').keys, 'VEHICLES'));
});

test('plurals fold: "sedans" reaches what "sedan" does', () => {
  assert.deepEqual([...expandTerm(index, 'sedans').keys].sort(), [...expandTerm(index, 'sedan').keys].sort());
});

test('rings are one hop, never chained', () => {
  const idx = buildSynonymIndex([['A', 'X', 'AX', ['alpha']], ['B', 'Y', 'BY', ['gamma']]],
    [['alpha', 'beta'], ['beta', 'gamma']]);
  // alpha → beta (ring 1) is fine; beta → gamma is a second ring, so alpha must NOT reach B.
  assert.deepEqual([...expandTerm(idx, 'alpha').keys], [subKey('A', 'X')]);
  // beta sits in both rings, so it reaches both — that is one hop each way.
  assert.equal(expandTerm(idx, 'beta').keys.size, 2);
});

test('the compiled filter: substring, whole-query synonym, and every-word match', () => {
  const sedan = compileQuery(index, 'Sedan');
  assert.ok(sedan.test('unrelated name', [subKey('VEHICLES', [...sedan.keys][0].split('\u001f')[1])]));
  assert.ok(!sedan.test('unrelated name', [subKey('BIRDS', 'SONGBIRD')]));
  assert.ok(sedan.test('my sedan pass', []), 'the old substring filter still works');
  // "old door": neither the phrase nor a substring, but each word reaches DOORS › ANTIQUE.
  assert.ok(compileQuery(index, 'old door').test('take 3', [DOOR_ANTIQUE]));
  assert.ok(compileQuery(index, '').test('', []), 'an empty filter passes everything');
});

test('KEEPS GOING ON ERRORS: malformed data is skipped, not thrown', () => {
  const idx = buildSynonymIndex([null, 7, ['ok', 'SUB', 'id', ['word']], ['x'], 'junk'],
    [null, ['solo'], 'nope', ['word', 'other']]);
  assert.equal(idx.skipped, 7);
  assert.ok(expandTerm(idx, 'other').keys.has(subKey('ok', 'SUB')));
  assert.doesNotThrow(() => buildSynonymIndex(undefined, { not: 'an array' }));
});

test('KEEPS GOING ON ERRORS: an empty or broken index degrades to the plain filter', () => {
  const q = compileQuery(EMPTY_INDEX, 'sedan');
  assert.ok(q.test('a sedan by', []));
  assert.ok(!q.test('a bird', [subKey('VEHICLES', 'CAR')]));
  const broken = { words: { get() { throw new Error('boom'); } }, rings: new Map(), skipped: 0 };
  const warn = console.warn; console.warn = () => {};
  try {
    const p = compileQuery(broken, 'sedan');
    assert.ok(p.test('sedan', []));
    assert.ok(!p.test('bird', []));
  } finally { console.warn = warn; }
});
