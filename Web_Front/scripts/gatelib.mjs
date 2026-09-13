// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * scripts/gatelib.mjs — the shared floor under Web_Front's two source gates.
 *
 * Owns: locating the package root, enumerating `src/`, stripping comments and
 * string literals so a rule never matches its own documentation, brace-matched
 * block extraction, and loading/saving a baseline JSON.
 *
 * Must not: read outside the package root, resolve a bare npm specifier, or
 * treat an absent root as "nothing to check". A path that stopped existing is a
 * hard failure here — EXIT_MISSING, never EXIT_OK — because a gate that skips
 * when its subject moves reports green forever.
 *
 * Non-obvious constraints:
 *   - Exit codes are a contract, not a convention: 0 pass, 1 the checked rule
 *     failed, 3 a path the gate needs is not on disk. `check.sh` and a human
 *     both need to tell "the tree is wrong" from "the gate is wrong".
 *   - `stripInert` preserves byte offsets (it blanks, it does not delete) so a
 *     match found in the stripped text indexes the original text.
 *   - No dependencies. These run before `npm install` has necessarily resolved
 *     the WASM `file:` packages, so anything imported from `node_modules` would
 *     make the gate unrunnable exactly when it is most wanted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_MISSING = 3;

/** The package root — the directory holding `src/`, one above `scripts/`. */
export function packageRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/**
 * Assert a path is on disk and return it. The whole point of this helper is
 * that it throws rather than returning a falsy value: three outages in this
 * repository came from a path written as a string and verified by nothing.
 */
export function required(p, what) {
    if (!fs.existsSync(p)) {
        const e = new Error(`${what} is not on disk: ${p}`);
        e.missing = true;
        throw e;
    }
    return p;
}

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs']);
const SKIP_DIR = new Set(['node_modules', 'dist', 'pkg', 'target', '.git', '.claude', '__pycache__']);

/** Every source file under `dir`, as paths relative to `root`, sorted. */
export function sourceFiles(root, dir) {
    const out = [];
    const walk = (abs) => {
        for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
            if (ent.name.startsWith('.') || SKIP_DIR.has(ent.name)) continue;
            const child = path.join(abs, ent.name);
            if (ent.isDirectory()) walk(child);
            else if (SOURCE_EXT.has(path.extname(ent.name))) out.push(path.relative(root, child));
        }
    };
    walk(dir);
    return out.sort();
}

export function read(root, rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

/**
 * Blank out comments only, keeping every string literal. This is what the
 * import walk reads: an import specifier IS a string literal, so a stripper
 * that blanked strings would report an application of 44 components with one
 * reachable file — which is exactly what it did before this existed.
 */
export function stripComments(src) {
    const out = Array.from(src);
    const blank = (i) => { if (out[i] !== '\n') out[i] = ' '; };
    let i = 0;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') {
            while (i < src.length && src[i] !== '\n') blank(i++);
        } else if (c === '/' && d === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end === -1 ? src.length : end + 2;
            while (i < stop) blank(i++);
        } else if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            i++;
            while (i < src.length) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === quote) { i++; break; }
                i++;
            }
        } else {
            i++;
        }
    }
    return out.join('');
}

/**
 * Blank out comments, string literals and template bodies, keeping length and
 * newlines. The structural rules run on the result, so a `// new Worker(...)` in
 * a contract header and the word `terminate` in a sentence cannot be counted as
 * code. Regex literals are left alone: telling `/` division from `/` regex
 * needs a parser, and neither gate matches on anything a regex body contains.
 */
export function stripInert(src) {
    const out = Array.from(src);
    const blank = (i) => { if (out[i] !== '\n') out[i] = ' '; };
    let i = 0;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') {
            while (i < src.length && src[i] !== '\n') blank(i++);
        } else if (c === '/' && d === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end === -1 ? src.length : end + 2;
            while (i < stop) blank(i++);
        } else if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            blank(i++);
            while (i < src.length) {
                if (src[i] === '\\') { blank(i); blank(i + 1); i += 2; continue; }
                if (src[i] === quote) { blank(i++); break; }
                // A `${...}` hole holds real code; leave it readable.
                if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
                    let depth = 0;
                    blank(i); blank(i + 1); i += 2; depth = 1;
                    while (i < src.length && depth > 0) {
                        if (src[i] === '{') depth++;
                        else if (src[i] === '}') { depth--; if (depth === 0) { blank(i++); break; } }
                        i++;
                    }
                    continue;
                }
                blank(i++);
            }
        } else {
            i++;
        }
    }
    return out.join('');
}

/**
 * From the `(` at `open`, return `[start, end]` of the balanced span, ends
 * exclusive. Run this on stripped text only — it counts brackets blindly.
 */
export function balanced(text, open, pair = '()') {
    const [L, R] = pair;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === L) depth++;
        else if (text[i] === R) { depth--; if (depth === 0) return [open + 1, i]; }
    }
    return null;
}

export function loadBaseline(file, what) {
    required(file, what);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveBaseline(file, data) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** Run a gate's main, turning a missing path into EXIT_MISSING and a message. */
export function runGate(name, fn) {
    try {
        process.exitCode = fn();
    } catch (e) {
        if (e && e.missing) {
            console.error(`${name}: MISSING — ${e.message}`);
            console.error('  This is not a skip. The gate cannot judge a tree it cannot find.');
            process.exitCode = EXIT_MISSING;
            return;
        }
        throw e;
    }
}
