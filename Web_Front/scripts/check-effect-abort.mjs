// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * scripts/check-effect-abort.mjs — ABORT: work started on screen must stop when the screen goes.
 *
 * Owns two rules over `src/`:
 *   WORKER — a module that does `new Worker(...)` must have a teardown path that
 *            runs when the thing that started it goes away: a `.terminate()`
 *            inside a `useEffect` cleanup, or an exported/declared disposer.
 *   EFFECT — a `useEffect` that starts asynchronous work (await, .then, fetch,
 *            postMessage, a timer, a listener, a frame loop, a worker) must
 *            return a cleanup, or guard its continuation on a cancellation flag.
 *
 * Must not: judge anything outside `src/`, or pass a file it could not read.
 *
 * Why this tree wants ABORT more than a form-driven front end does: the
 * Scanalyze screen fans a whole sound library across `navigator.hardwareConcurrency`
 * workers, each decoding and analysing audio. Leaving the tab mid-scan with no
 * teardown is not a stale `setState` warning — it is N threads chewing a library
 * nobody is watching, holding file handles, for as long as the page lives.
 *
 * Non-obvious constraints:
 *   - Rules run on comment- and string-stripped text, so prose cannot trip them.
 *   - `return;` at the top of an effect is an early exit, not a cleanup. Only a
 *     `return` followed by something counts, and only at the effect body's own
 *     depth — a `return` inside a nested closure is that closure's.
 *   - The baseline counts findings PER FILE, not per line. A ratchet keyed on
 *     line numbers goes red on an unrelated edit above it.
 *   - A file whose count FALLS is reported, never fatal, and asks to be reseeded.
 *
 * Usage: node scripts/check-effect-abort.mjs [--seed]
 * Exit:  0 pass · 1 a new or grown un-cancellable site · 3 a path is missing
 */

import path from 'node:path';
import {
    EXIT_OK, EXIT_FAILED, packageRoot, required, sourceFiles, read,
    stripInert, balanced, loadBaseline, saveBaseline, runGate,
} from './gatelib.mjs';

const ROOT = packageRoot();
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(ROOT, 'scripts', 'effect-abort.baseline.json');

/** Work that outlives the statement that starts it. */
const ASYNC_START = [
    /\bawait\s/, /\.then\s*\(/, /\bfetch\s*\(/, /\.postMessage\s*\(/,
    /\bsetInterval\s*\(/, /\bsetTimeout\s*\(/, /\baddEventListener\s*\(/,
    /\brequestAnimationFrame\s*\(/, /\bnew\s+Worker\s*\(/,
];

/**
 * A continuation guard: the effect asks whether it still matters before it acts.
 * The last form is the epoch-ref idiom this tree actually uses — capture
 * `++genRef.current` on entry and bail when the live ref has moved past it. It
 * cancels a decode as effectively as an AbortController and reads nothing like
 * one, which is why it is named here rather than discovered by a word list.
 */
const CANCEL_GUARD = [
    /\bAbortController\b/, /\.abort\s*\(/,
    /\b(?:cancell?ed|disposed|stale|aborted|dead)\b/,
    /\b(?:alive|mounted|active|live)\s*=\s*(?:true|false)\b/,
    /\b\w+\s*!==\s*\w+\.current\b/,
];

/**
 * Find each `useEffect(` / `useLayoutEffect(` callback body in `code`, as
 * `[start, end)` offsets into it. Brace-matched, so a nested closure or an
 * object literal inside the effect does not end it early.
 */
function effectBodies(code) {
    const out = [];
    for (const m of code.matchAll(/\buse(?:Layout)?Effect\s*\(/g)) {
        const call = balanced(code, m.index + m[0].length - 1);
        if (!call) continue;
        const [argStart, argEnd] = call;
        const arg = code.slice(argStart, argEnd);
        // The callback's own body: the first `{` after the arrow or `function`.
        const brace = arg.indexOf('{');
        if (brace === -1) continue;                       // `useEffect(() => doThing(), [])`
        const body = balanced(arg, brace, '{}');
        if (!body) continue;
        out.push([argStart + body[0], argStart + body[1]]);
    }
    return out;
}

/**
 * A cleanup return: `return` at the body's own depth, followed by something.
 * `if (!ref.current) return;` is an early exit and must not count as one.
 */
function hasCleanupReturn(body) {
    let depth = 0;
    for (const m of body.matchAll(/[{}()[\]]|\breturn\b/g)) {
        const t = m[0];
        if (t === '{' || t === '(' || t === '[') { depth++; continue; }
        if (t === '}' || t === ')' || t === ']') { depth--; continue; }
        if (depth !== 0) continue;
        const rest = body.slice(m.index + 6).trimStart();
        if (rest && !rest.startsWith(';')) return true;
    }
    return false;
}

/** Does this file terminate a worker from somewhere an unmount can reach? */
function workerTeardown(code) {
    if (!/\.terminate\s*\(/.test(code)) return false;
    for (const [s, e] of effectBodies(code)) {
        const body = code.slice(s, e);
        if (hasCleanupReturn(body) && /\.terminate\s*\(/.test(body)) return true;
    }
    // A non-component module owns its worker through a named disposer instead.
    return /\b(?:dispose|destroy|shutdown|teardown|stopAll|close)\s*(?:\(|=|:)/.test(code);
}

function findings(rel, source) {
    const code = stripInert(source);
    const hits = [];

    if (/\bnew\s+Worker\s*\(/.test(code) && !workerTeardown(code)) {
        hits.push('a worker is started here and nothing terminates it on unmount');
    }
    for (const [s, e] of effectBodies(code)) {
        const body = code.slice(s, e);
        if (!ASYNC_START.some(r => r.test(body))) continue;
        if (hasCleanupReturn(body)) continue;
        if (CANCEL_GUARD.some(r => r.test(body))) continue;
        const line = source.slice(0, s).split('\n').length;
        hits.push(`an effect at line ~${line} starts async work it cannot stop`);
    }
    return hits.map(h => ({ file: rel, why: h }));
}

function survey() {
    required(SRC, "Web_Front's src/ tree");
    const files = sourceFiles(ROOT, SRC);
    const all = files.flatMap(f => findings(f, read(ROOT, f)));
    const counts = {};
    for (const h of all) counts[h.file] = (counts[h.file] ?? 0) + 1;
    return { files, all, counts };
}

function seed() {
    const { files, all, counts } = survey();
    saveBaseline(BASELINE, {
        note: 'Un-cancellable async starts per file. A ceiling: a file may not grow one, '
            + 'and a file not listed here may not gain one. Lower a number by fixing the site.',
        rules: {
            WORKER: 'new Worker(...) with no .terminate() reachable from an unmount cleanup or a named disposer',
            EFFECT: 'useEffect that awaits, fetches, posts, times, listens or animates and neither returns a cleanup nor guards on a cancellation flag',
        },
        files: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    });
    console.log(`Abort: seeded ${all.length} un-cancellable site(s) across ${Object.keys(counts).length} `
        + `of ${files.length} source file(s).`);
    for (const h of all) console.log(`   ${h.file}: ${h.why}`);
    return EXIT_OK;
}

function check() {
    const baseline = loadBaseline(BASELINE, 'the abort baseline');
    const known = baseline.files ?? {};
    const { files, all, counts } = survey();

    const grown = [];
    for (const [file, n] of Object.entries(counts)) {
        const was = known[file] ?? 0;
        if (n > was) grown.push({ file, was, now: n });
    }
    const fell = Object.entries(known).filter(([f, n]) => (counts[f] ?? 0) < n);
    if (fell.length) {
        console.log(`Abort: ${fell.length} file(s) improved. Reseed so the gain is held:\n  `
            + fell.map(([f, n]) => `${f}: ${n} -> ${counts[f] ?? 0}`).join('\n  '));
    }

    if (grown.length) {
        console.error(`ABORT ROSE      ${grown.length} file(s) started work they cannot stop:\n  `
            + grown.map(g => `${g.file}: ${g.was} -> ${g.now}`).join('\n  ')
            + '\n'
            + all.filter(h => grown.some(g => g.file === h.file)).map(h => `\n    ${h.file}: ${h.why}`).join('')
            + '\n\n  Return a cleanup from the effect, terminate the worker, or guard the continuation.'
            + '\n  Raising effect-abort.baseline.json is a decision, and it belongs in the commit message.');
        return EXIT_FAILED;
    }

    console.log(`Abort: OK — ${files.length} source file(s) checked, ${all.length} known un-cancellable site(s), `
        + 'none new and none grown.');
    return EXIT_OK;
}

runGate('Abort', () => (process.argv.includes('--seed') ? seed() : check()));
