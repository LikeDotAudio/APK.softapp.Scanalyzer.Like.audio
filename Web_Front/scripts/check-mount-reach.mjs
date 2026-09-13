// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * scripts/check-mount-reach.mjs — MOUNT: a screen nothing can open is not shipped.
 *
 * Owns: the reachability walk from `src/main.tsx` over static imports, dynamic
 * `import()`, re-exports and `new URL(..., import.meta.url)` worker entries, and
 * the verdict on every `.tsx` that exports something and sits off that graph.
 *
 * Must not: judge a file by its own contents. An unmounted component is a
 * missing edge somewhere else, which is why no per-file lint can see it.
 *
 * Non-obvious constraints:
 *   - `mount-reach.baseline.json` is a debt list that only shrinks. A file that
 *     becomes reachable is REPORTED, never fatal — telling somebody their fix
 *     worked must not be able to break their build.
 *   - Reachability is not rendering: a component imported and never returned
 *     passes. Closing that needs an AST, and this gate takes no dependencies.
 *   - `src/main.tsx` missing exits 3, not 0. The graph has no root without it.
 *   - Worker entries are edges. `wasmWorker.ts` and `extractorWorker.ts` reach
 *     the app only through `new URL('./x.ts', import.meta.url)`, and a walk that
 *     ignored that form would call both of them orphans.
 *
 * Usage: node scripts/check-mount-reach.mjs [--seed]
 * Exit:  0 pass · 1 an unreachable component that is not grandfathered · 3 a path is missing
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    EXIT_OK, EXIT_FAILED, packageRoot, required, sourceFiles, read,
    stripComments, loadBaseline, saveBaseline, runGate,
} from './gatelib.mjs';

const ROOT = packageRoot();
const SRC = path.join(ROOT, 'src');
const ENTRY = 'src/main.tsx';
const BASELINE = path.join(ROOT, 'scripts', 'mount-reach.baseline.json');

const RESOLVE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

/** Every relative specifier a file names, in any of the four forms that are edges. */
function specifiers(code) {
    const found = new Set();
    const add = (m) => { for (const r of code.matchAll(m)) if (r[1]) found.add(r[1]); };
    add(/\bfrom\s*['"]([^'"]+)['"]/g);              // import x from './y' · export * from './y'
    add(/\bimport\s*['"]([^'"]+)['"]/g);            // import './y.css'
    add(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g);  // await import('./y')
    add(/\bnew\s+URL\s*\(\s*['"]([^'"]+)['"]/g);    // new Worker(new URL('./y.ts', import.meta.url))
    return [...found].filter(s => s.startsWith('.'));
}

/** Resolve a relative specifier to a path relative to the package root, or null. */
function resolve(fromRel, spec) {
    const base = path.resolve(ROOT, path.dirname(fromRel), spec);
    const tries = [base, ...RESOLVE_EXT.map(e => base + e), ...RESOLVE_EXT.map(e => path.join(base, `index${e}`))];
    for (const t of tries) {
        if (fs.existsSync(t) && fs.statSync(t).isFile()) return path.relative(ROOT, t);
    }
    return null;
}

/**
 * A component module: a `.tsx` under `src/` that exports anything. JSX in a file
 * that exports nothing is dead by inspection; JSX in a file that exports is a
 * screen, a panel or a control, and every one of those is meant to be mounted.
 */
function isComponentModule(rel, code) {
    return rel.endsWith('.tsx') && /^\s*export\s/m.test(code);
}

function walk() {
    const entry = path.relative(ROOT, required(path.join(ROOT, ENTRY), 'the mount graph entry point'));
    const reached = new Set([entry]);
    const queue = [entry];
    while (queue.length) {
        const rel = queue.pop();
        let code;
        try { code = stripComments(read(ROOT, rel)); } catch { continue; }
        for (const spec of specifiers(code)) {
            const next = resolve(rel, spec);
            if (next && !reached.has(next)) { reached.add(next); queue.push(next); }
        }
    }
    return reached;
}

function survey() {
    required(SRC, "Web_Front's src/ tree");
    const reached = walk();
    const files = sourceFiles(ROOT, SRC);
    const components = files.filter(f => isComponentModule(f, read(ROOT, f)));
    const unreachable = components.filter(f => !reached.has(f));
    return { reached, components, unreachable };
}

function seed() {
    const { components, unreachable, reached } = survey();
    saveBaseline(BASELINE, {
        note: 'Components with no path from src/main.tsx. A debt list: it only shrinks. '
            + 'Delete a line when the component is wired up — that is what makes the fix permanent.',
        entry: ENTRY,
        unmountedComponents: unreachable,
    });
    console.log(`Mount: seeded ${unreachable.length} unmounted component(s) of ${components.length} checked, `
        + `${reached.size} files reachable from ${ENTRY}.`);
    return EXIT_OK;
}

function check() {
    const baseline = loadBaseline(BASELINE, "the mount baseline");
    const known = new Set(baseline.unmountedComponents ?? []);
    const { components, unreachable, reached } = survey();
    const orphaned = new Set(unreachable);

    const remounted = [...known].filter(f => !orphaned.has(f)).sort();
    if (remounted.length) {
        console.log(`Mount: ${remounted.length} grandfathered component(s) are reachable again. `
            + `Delete them from mount-reach.baseline.json:\n  ${remounted.join('\n  ')}`);
    }

    const fresh = unreachable.filter(f => !known.has(f));
    if (fresh.length) {
        console.error(`MOUNT FAILED    ${fresh.length} component(s) export a screen nothing can open:\n  `
            + fresh.join('\n  ')
            + `\n\n  ${components.length} component files checked, ${reached.size} files reachable from ${ENTRY}.`
            + '\n  Wire it up, or argue it in mount-reach.baseline.json and say why in the commit.');
        return EXIT_FAILED;
    }

    console.log(`Mount: OK — ${components.length} component file(s) checked, ${reached.size} reachable from ${ENTRY}; `
        + `${known.size} grandfathered and none multiplied.`);
    return EXIT_OK;
}

runGate('Mount', () => (process.argv.includes('--seed') ? seed() : check()));
