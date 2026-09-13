// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// SOLO — one screen of the Scanalyzer, opened as a window of the APK.audio OS
// rather than as a tab inside this application's own tab strip.
//
// APK:OS files each screen as its own display (APK:OS/Scanalyzer 3D/, .../
// Scanalyzer Examiner/, …), and every one of those display.json entries frames
// this same build with `?solo=1#/<tab>` on the end. `?solo=1` is the whole
// contract, and it means two things:
//
//   1. Draw one screen. The window already has a title bar with the screen's
//      name on it, so the branded header and the eight-button tab strip below
//      it are a second and third copy of navigation the shell is doing — and
//      the tab strip is worse than redundant, because pressing a button in it
//      would swap the contents of a window whose title still said 3D.
//
//   2. Push sideways, not inward. "Examine this" from the cloud means open the
//      Examiner window, which is the shell's job; solo asks the shell for it
//      instead of switching its own tab. Standalone (no `?solo=1`) nothing
//      changes: the tabs are there and a push still switches them.
//
// The messages both ways are `{ apkos: 'scanalyzer', … }` on the parent frame,
// answered by APK:OS/Scanalyzer/hand-off/scanalyzer-hand-off.js. Anything else
// listening sees an object it does not recognise and ignores it; if nothing is
// listening at all — this page opened in a plain tab with ?solo=1 on it — the
// push is simply not answered, which is why the tab strip is the thing that
// gets hidden and not the only route between screens.

export const SOLO = (() => {
  try { return new URLSearchParams(window.location.search).has('solo'); }
  catch { return false; }
})();

// Same-origin in every deployment that matters (the OS mounts the repository at
// /repo/), but the offline shell is opened from file:// where the origin is the
// string "null" and no targetOrigin but '*' will ever match it.
const PARENT_ORIGIN = /^https?:/.test(window.location.origin) ? window.location.origin : '*';

function toParent(message: Record<string, unknown>) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ apkos: 'scanalyzer', ...message }, PARENT_ORIGIN); }
  catch { /* a parent that will not be spoken to is a parent that is not the OS */ }
}

/** Ask the shell to open the window for `tab`, landed on `name`. */
export function handOffToWindow(tab: string, name: string) {
  toParent({ action: 'open', tab, name });
}

/**
 * Take delivery of a sample the shell was asked to hand to this window.
 *
 * Announcing `ready` is what makes a just-opened window work: the shell has the
 * name before this iframe has mounted anything that could receive it, so it
 * holds the name until the window says it is listening. A window that was
 * already open is told directly and never sees the pending path.
 */
export function receiveHandOff(tab: string, pick: (name: string) => void) {
  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.apkos !== 'scanalyzer' || data.action !== 'pick') return;
    if (typeof data.name === 'string' && data.name) pick(data.name);
  };
  window.addEventListener('message', onMessage);
  toParent({ action: 'ready', tab });
  return () => window.removeEventListener('message', onMessage);
}
