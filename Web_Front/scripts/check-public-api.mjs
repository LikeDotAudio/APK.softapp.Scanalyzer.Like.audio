// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * scripts/check-public-api.mjs — every endpoint Vite publishes must have a caller.
 *
 * Owns one rule over `public/`: a `.php` file under `publicDir` is copied into
 * `dist/` verbatim and served, so it is public surface. It may exist only if
 * something in `src/` fetches it.
 *
 * Must not: judge `tools/api/`, which is outside `publicDir` on purpose — those
 * are the hand-run database scripts, and `Database_Architecture.md` names
 * deploying `init_db.php` as a step. Out of the bundle is the fix; deleted is
 * not, because the repository has no other record of that schema.
 *
 * Non-obvious constraints:
 *   - The caller scan reads `src/` with strings KEPT, not stripped: a fetch
 *     target IS a string literal, so `stripInert` would report zero callers for
 *     all twelve and pass an empty bundle as a clean one.
 *   - A file with a caller is still unauthenticated. This gate holds the count,
 *     not the posture — `PLAN-109.09` step 2 owns the gate in front of the three.
 *   - An empty `public/api/` is a hard failure, not a pass: the three that stay
 *     are load-bearing, and a gate that reads a vanished tree as clean is worse
 *     than none.
 *
 * Usage: node scripts/check-public-api.mjs [--seed]
 * Exit:  0 pass · 1 a published endpoint has no caller · 3 a path is missing
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    EXIT_OK, EXIT_FAILED, packageRoot, required, sourceFiles, read,
    stripComments, loadBaseline, saveBaseline, runGate,
} from './gatelib.mjs';

const ROOT = packageRoot();
const PUBLIC = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(ROOT, 'scripts', 'public-api.baseline.json');

/** Every `.php` under `publicDir`, relative to the package root, sorted. */
function publishedEndpoints(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const child = path.join(dir, ent.name);
        if (ent.isDirectory()) publishedEndpoints(child, out);
        else if (path.extname(ent.name) === '.php') out.push(path.relative(ROOT, child));
    }
    return out.sort();
}

/**
 * Basenames named by a fetch in `src/`. Comments are blanked so the header line
 * `Keep in sync with public/api/upload_peak.php` does not count as a call, and
 * `init_db.php` in a prose header does not keep a dead endpoint alive.
 */
function calledBasenames() {
    const called = new Set();
    for (const rel of sourceFiles(ROOT, SRC)) {
        for (const m of stripComments(read(ROOT, rel)).matchAll(/([a-z0-9_]+\.php)/gi)) {
            called.add(m[1]);
        }
    }
    return called;
}

function survey() {
    required(PUBLIC, "Web_Front's public/ tree");
    required(SRC, "Web_Front's src/ tree");
    const endpoints = publishedEndpoints(PUBLIC);
    const called = calledBasenames();
    const uncalled = endpoints.filter(e => !called.has(path.basename(e)));
    return { endpoints, called, uncalled };
}

function seed() {
    const { endpoints, uncalled } = survey();
    saveBaseline(BASELINE, {
        note: 'Published .php endpoints under publicDir with no caller in src/. A ceiling, '
            + 'and it is meant to stay empty: an endpoint nothing calls is surface nothing needs. '
            + 'Move a hand-run script to tools/api/ rather than listing it here.',
        rule: 'a .php file under public/ is copied into dist/ verbatim, so it is served; it must be fetched from src/',
        publishedCount: endpoints.length,
        uncalled,
    });
    console.log(`PublicAPI: seeded ${endpoints.length} published endpoint(s), ${uncalled.length} with no caller.`);
    for (const e of uncalled) console.log(`   ${e}`);
    return EXIT_OK;
}

function check() {
    const baseline = loadBaseline(BASELINE, 'the public-api baseline');
    const known = new Set(baseline.uncalled ?? []);
    const { endpoints, uncalled } = survey();

    if (!endpoints.length) {
        console.error('PUBLIC API EMPTY  public/ holds no .php endpoint at all.'
            + '\n  The three the app fetches are load-bearing. This is a moved or deleted tree,'
            + '\n  not a clean one — see PLAN-109.09.');
        return EXIT_FAILED;
    }

    const fell = [...known].filter(e => !uncalled.includes(e));
    if (fell.length) {
        console.log(`PublicAPI: ${fell.length} endpoint(s) no longer unreachable. Reseed so the gain is held:\n  `
            + fell.join('\n  '));
    }

    const grown = uncalled.filter(e => !known.has(e));
    if (grown.length) {
        console.error(`PUBLIC API GREW   ${grown.length} published endpoint(s) have no caller in src/:\n  `
            + grown.join('\n  ')
            + '\n\n  Vite copies publicDir into dist/ verbatim, so each of these is served to anyone.'
            + '\n  Give it a caller, or move it to tools/api/ where the bundle cannot reach it.'
            + '\n  Raising public-api.baseline.json is a decision, and it belongs in the commit message.');
        return EXIT_FAILED;
    }

    console.log(`PublicAPI: OK — ${endpoints.length} published endpoint(s), `
        + `${uncalled.length} with no caller, none new.`);
    return EXIT_OK;
}

runGate('PublicAPI', () => (process.argv.includes('--seed') ? seed() : check()));
