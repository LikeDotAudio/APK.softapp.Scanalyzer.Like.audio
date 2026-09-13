// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The rung-2 browser driver: system Chrome over the DevTools Protocol.
 *
 * THIS FILE EXISTS BECAUSE IT USED TO BE A CODE FENCE. `.claude/skills/verify/SKILL.md`
 * carried the whole driver inline, and prose in a Markdown file is exactly what
 * the skill before it was: it named `playwright`, which was not installed, and a
 * session found out only after reaching for it. Replacing one uninstallable
 * recipe with one that happens to work today, still written as prose, is the
 * same defect with a longer fuse — nothing imports a fence, nothing runs it, and
 * no lane fails the day it stops working. The skill now POINTS here.
 * PLAN-1062.01 is what was closed; PLAN-1062.02 is this.
 *
 * ZERO DEPENDENCIES, AND THAT IS THE WHOLE PURCHASE. `/usr/bin/google-chrome` is
 * on the bench and node has had a global `WebSocket` since v22, so driving a real
 * browser costs an import of `node:child_process` and nothing else. Adding
 * `puppeteer` to run this would close the plan by reopening the one before it.
 *
 * NOT A TEST, AND NOT IN `test/`. Rung 1 (`npm test`) must keep running in under
 * a second with no `dist/`, no Chrome and no network, and `package.json`'s test
 * script is the glob `test/*.test.mjs` — so a file that needs a browser cannot
 * live there. It is a tool a rung-2 script imports.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where the browser is. Named once so a bench that puts it elsewhere has one edit. */
export const CHROME = process.env.APK_CHROME || '/usr/bin/google-chrome';

/**
 * The flags that make this app render headless, with the reason each is here.
 *
 * The first three are not optional and not tuning: drop any of them and the 3D
 * cloud reports `3D view unavailable`, which reads as a broken `WebGLBoundary`
 * rather than as a missing GPU. The last two let audio play without a gesture,
 * which is what the loop/gap checks poll.
 */
export const RENDER_FLAGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
];

/**
 * Launch Chrome on `url` and return `{ evaluate, until, send, close }`.
 *
 * `evaluate` is the whole API most checks need; everything else is a DOM
 * expression handed to it. THERE IS NO `waitFor` IN THE PROTOCOL, so `until`
 * polls — a `setTimeout` guess is where rung-2 flake comes from.
 */
export async function chrome(url, flags = []) {
  const port = 9222 + (process.pid % 900); // parallel sessions must not collide

  // CHROME IS LAUNCHED ON `about:blank` AND NAVIGATED AFTERWARDS, DELIBERATELY.
  // Passing `url` on the command line races: Chrome publishes a debuggable
  // `page` target for the initial blank tab as well as for the one that will
  // hold the site, `/json/list` may show either first, and the version of this
  // driver that took `list.find(t => t.type === 'page')` attached to whichever
  // arrived. MEASURED, against a static page with a `<nav>`, a `<button>` and a
  // `<canvas>`: `location.href` came back `about:blank`, `document.title` empty
  // and `querySelectorAll('canvas').length` `0`, on a page that had all three —
  // and on a re-run it attached correctly. A driver that is right most of the
  // time is the worst kind, because the failure reads as "the app is broken".
  // Navigating an attached target has no second candidate to pick wrong.
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`,
    '--no-first-run', '--no-default-browser-check',
    ...RENDER_FLAGS, ...flags, 'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error('Chrome never opened a debuggable page'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { ok, no } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? no(new Error(m.error.message)) : ok(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((ok, no) => {
    pending.set(++id, { ok, no });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'page threw');
    }
    return r.result.value;
  };

  /** Poll `expr` until it is truthy. Throws NAMING the expression, never silently. */
  const until = async (expr, ms = 10000) => {
    for (let t = 0; t < ms; t += 100) {
      if (await evaluate(expr)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`never became true within ${ms}ms: ${expr}`);
  };

  // THE DOCUMENT IS WAITED FOR HERE, ONCE, RATHER THAN BY EVERY CALLER.
  // `/json/list` shows a debuggable page as soon as the tab exists, which is
  // BEFORE the document is parsed: measured, on a static page with three
  // `nav button`s and a `<canvas>` — the first `evaluate` came back `[]` and
  // `0` while a later poll on the same page saw everything. That is precisely
  // the flake the skill used to apologise for with "~2 s before the first
  // assertion", and a sleep is a guess that is either too short on a cold cache
  // or wasted on a warm one.
  //
  // It does NOT throw on timeout. A page that never reaches `complete` — one
  // holding a stream open, say — is a page a caller may still want to drive,
  // and a driver that refuses to hand it over is worse than one that hands it
  // over early and lets `until` do the rest.
  await send('Page.enable');
  await send('Page.navigate', { url });

  // THE DOCUMENT IS WAITED FOR HERE, ONCE, RATHER THAN BY EVERY CALLER.
  // `Page.navigate` resolves when the navigation is COMMITTED, not when the
  // document is parsed, so the first `evaluate` would still be racing the DOM —
  // which is the flake the skill used to apologise for with "~2 s before the
  // first assertion". A sleep is a guess that is either too short on a cold
  // cache or wasted on a warm one; this is the condition itself.
  //
  // It does NOT throw on timeout. A page that never reaches `complete` — one
  // holding a stream open, say — is a page a caller may still want to drive,
  // and a driver that refuses to hand it over is worse than one that hands it
  // over early and lets `until` do the rest.
  await until('document.readyState === "complete"', 15000).catch(() => {});

  return { evaluate, until, send, close: () => { ws.close(); proc.kill(); } };
}

/**
 * Whether a rung-2 run can happen at all, as a SENTENCE rather than a boolean.
 *
 * Returns `null` when everything is present, otherwise why not. A caller that
 * cannot run must print this and say so loudly — a silent skip reports green,
 * which is the one failure mode this whole family of plans is named after.
 */
export function unavailable() {
  if (!existsSync(CHROME)) return `${CHROME} is not on this host`;
  return null;
}
