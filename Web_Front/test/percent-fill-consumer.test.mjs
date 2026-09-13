// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * Header: percent-fill-consumer.test.mjs
 * Purpose: the percent-fill chip's two decisions, executed; and the proof that
 *   the one converted host reaches them, and that every host still drawing a
 *   separate track has said why.
 * Description: PLAN-924.01 landed the primitive and converted the two hosts that
 *   needed no build step. PLAN-924.02 is the React side, and its step 4 is the
 *   one that rots quietly: a host may keep its own track, but only with the
 *   reason written down. Silence is what this file exists to prevent — a
 *   half-converted tree where nobody can tell a decision from an oversight.
 *
 *   Two halves, the shape every file in this directory has: THE RULE, EXECUTED
 *   — `percentFill.ts` is a `.ts` precisely so node's TypeScript stripping can
 *   import it and call it with nothing installed — and THE REACHABILITY, READ,
 *   by regex over the `.tsx` that cannot be imported without a JSX pipeline. A
 *   rename the regexes cannot follow throws NAMING what it looked for; never a
 *   silent skip, because a skipped parity test reports green.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { percentChip, ratioChip } from '../src/percentFill.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (rel) => {
    try {
        return readFileSync(join(SRC, rel), 'utf8');
    } catch {
        throw new Error(`percent-fill: ${rel} is not where this test looked for it`);
    }
};

describe('the percent-fill rule', () => {
    test('clamps the FILL and leaves the TEXT alone', () => {
        // A track cannot be 120% full. The digits must not be quietly rewritten.
        assert.deepEqual(percentChip(120), { fill: 100, text: '120%', none: false });
        assert.deepEqual(percentChip(-5), { fill: 0, text: '-5%', none: false });
        assert.deepEqual(percentChip(57), { fill: 57, text: '57%', none: false });
    });

    test('no data is not zero', () => {
        // A record analysed before a feature existed has NO value, and a
        // full-looking empty track claims a measurement nobody took.
        for (const absent of [null, undefined, NaN, 'not a number']) {
            const chip = percentChip(absent);
            assert.equal(chip.none, true, `${String(absent)} was read as a value`);
            assert.equal(chip.text, '—', `${String(absent)} did not draw an em dash`);
            assert.equal(chip.fill, 0);
        }
        assert.equal(ratioChip(null).none, true, 'a missing ratio was read as a value');
    });

    test('a ratio is converted rather than re-clamped by the caller', () => {
        assert.equal(ratioChip(0.412).text, '41%');
        assert.equal(ratioChip(1).fill, 100);
        assert.equal(ratioChip(2).fill, 100, 'a ratio above 1 still clamps the fill');
        assert.equal(ratioChip(0).text, '0%', 'a real zero is a value, not an absence');
    });
});

describe('the hosts', () => {
    test('SliceTable draws its two shares through the chip, not through `?? 0`', () => {
        const source = read('components/examiner/SliceTable.tsx');
        assert.match(source, /from '\.\.\/Pct'/, 'SliceTable no longer imports the chip');
        for (const field of ['relative_level', 'envelope_sustain_level']) {
            assert.match(source, new RegExp(`<Pct ratio=\\{s\\.${field}\\}`),
                `${field} is no longer drawn through the chip`);
            assert.doesNotMatch(source, new RegExp(`Math\\.round\\(\\(s\\.${field} \\?\\? 0\\) \\* 100\\)`),
                `${field} is back to claiming 0% for a slice that has no value`);
        }
    });

    test('every host that keeps its own fill says why, in the file', () => {
        // Step 4's whole point. A track is allowed; an UNEXPLAINED track is not,
        // because the next reader cannot tell it from a conversion nobody got to.
        const hosts = [
            'components/ScanalyzeTab/ScanalyzeTab.tsx',
            'components/Header.tsx',
            'components/examiner/PropertyBars.tsx',
        ];
        for (const host of hosts) {
            const source = read(host);
            assert.match(source, /width: `\$\{(pct|progress)\}%`/,
                `${host} no longer hand-rolls a fill — retire it from this list`);
            assert.match(source, /apk-pct-allow-fill:/,
                `${host} hand-rolls a fill with no recorded reason`);
        }
    });

    test('the stylesheet is mirrored into this bundle and loaded by it', () => {
        // PLAN-924.03 ruled the duplication (option 3): a shared URL does not
        // survive the hosts, so the file exists more than once and the rule is
        // EDIT ALL OF THEM OR NONE. This asserts the copy is here and reached;
        // that it still MATCHES the canonical one is a `cmp`, and the CSS
        // header is where that rule is written.
        assert.match(read('main.tsx'), /import '\.\/percent-fill\.css'/,
            'the bundle no longer loads the primitive, so every chip is unstyled');
        assert.match(read('percent-fill.css'), /\.apk-pct/,
            'the mirrored stylesheet does not define the chip');
    });
});
