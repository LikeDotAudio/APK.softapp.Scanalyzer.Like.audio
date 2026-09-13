// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * scripts/check-discovery.mjs — a deleted gate or test must not read as a pass.
 *
 * Owns one rule over two globbed lists: `scripts/check-*.mjs` and
 * `test/*.test.mjs` are DISCOVERED rather than named, and the count of each may
 * rise freely and may never fall by accident.
 *
 * WHY A COUNT AND NOT A LIST. A written list of gate names is what PLAN-624.01
 * removed, and for a good reason: a test that needs an edit somewhere else to
 * run is a test that runs never. The glob is right. What the glob costs is the
 * one thing the list gave away for free — **a literal list turns a deleted file
 * into a failure; a glob turns it into a shorter list.** Deleting
 * `test/puck-qualification.test.mjs` — the file PLAN-624.01 wrote precisely
 * because that qualification could be tidied away — leaves `npm test` green
 * with one suite fewer and nothing said. PLAN-828.01.
 *
 * A BASELINE NAMING THE FILES WOULD BE THE LITERAL LIST AGAIN, with an extra
 * file to keep in step. So this holds the NUMBER: new files raise it with
 * `--seed`, and a deletion fails until somebody lowers it on purpose and says
 * why in the same commit.
 *
 * ONE FILE, TWO NUMBERS. `scripts/` and `test/` grow at different rates and are
 * discovered separately, so a single count over both would let a new gate pay
 * for a deleted test. They are two independent floors in one baseline — one
 * place to look, and no coupling.
 *
 * DEPENDENCY-FREE ON PURPOSE. This is `readdir` and a JSON read, and it answers
 * on a tree where `npm install` has never run — the same property the lane it
 * replaces was built around. It must not grow past that.
 *
 * Usage: node scripts/check-discovery.mjs [--seed]
 * Exit:  0 pass · 1 a discovered list shrank · 3 a path is missing
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    EXIT_OK, EXIT_FAILED, packageRoot, required, loadBaseline, saveBaseline, runGate,
} from './gatelib.mjs';

const ROOT = packageRoot();
const BASELINE = path.join(ROOT, 'scripts', 'discovery.baseline.json');

/** The two globbed lists, each as `[label, directory, predicate]`. */
const LISTS = [
    ['gates', path.join(ROOT, 'scripts'), (n) => n.startsWith('check-') && n.endsWith('.mjs')],
    ['tests', path.join(ROOT, 'test'), (n) => n.endsWith('.test.mjs')],
];

function discovered(dir, matches) {
    return fs.readdirSync(dir).filter(matches).sort();
}

function main() {
    const seeding = process.argv.includes('--seed');
    const found = {};
    for (const [label, dir, matches] of LISTS) {
        required(dir, `the ${label} directory`);
        found[label] = discovered(dir, matches);
        // An empty glob is a hard failure and never a pass, for the same reason
        // the lane this replaces exited 3 on one: a gate that reads a vanished
        // list as clean is worse than no gate.
        if (found[label].length === 0) {
            console.error(`check-discovery: MISSING — no ${label} discovered under ${dir}`);
            return EXIT_FAILED;
        }
    }

    // THE ECHO IS PRINTED ON A PASS, WHICH IS THE WHOLE POINT. The lane this
    // replaces wrote its `source gates:` line to a temp log and showed it only
    // when the lane FAILED — that is, only to a reader who already knew
    // something was wrong. A list that is auditable when it is already broken
    // is not auditable.
    for (const [label] of LISTS) {
        console.log(`    ${label} (${found[label].length}): ${found[label].join(', ')}`);
    }

    if (seeding) {
        saveBaseline(BASELINE, {
            note: 'FLOORS, not ceilings. scripts/check-*.mjs and test/*.test.mjs are discovered by '
                + 'a glob, so a deleted file is a shorter list rather than an error. These two '
                + 'numbers may rise freely and may not fall by accident. Raise with '
                + '`node scripts/check-discovery.mjs --seed` in the commit that adds the file; '
                + 'lower it by hand, in the commit that retires one, and say why there.',
            rule: 'the count of each discovered list never falls',
            gates: found.gates.length,
            tests: found.tests.length,
        });
        console.log(`  ✅ seeded ${BASELINE}: ${found.gates.length} gate(s), ${found.tests.length} test(s)`);
        return EXIT_OK;
    }

    const baseline = loadBaseline(BASELINE, 'the discovery baseline');
    let failed = false;
    for (const [label] of LISTS) {
        const floor = baseline[label];
        const now = found[label].length;
        if (typeof floor !== 'number') {
            console.error(`check-discovery: the baseline carries no \`${label}\` floor.`);
            failed = true;
        } else if (now < floor) {
            console.error(
                `\n  ❌ ${label}: ${now} discovered, floor is ${floor} — ${floor - now} `
                + `file(s) went away and the glob said nothing.\n`
                + `     Still here: ${found[label].join(', ')}\n`
                + `     If one was retired on purpose, lower \`${label}\` in\n`
                + `       ${BASELINE}\n`
                + `     by hand in that same commit and say why. If this is a mistake, restore the file.\n`
                + `     A NEW file raises the floor: node scripts/check-discovery.mjs --seed\n`);
            failed = true;
        }
    }
    if (failed) return EXIT_FAILED;
    console.log(`  ✅ ${found.gates.length} gate(s) and ${found.tests.length} test(s), neither list has shrunk`);
    return EXIT_OK;
}

runGate('check-discovery', main);
