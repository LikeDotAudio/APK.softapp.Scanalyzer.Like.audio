// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// Where the graphics micro-API lives, resolved once at load.
//
// EVERY /api/ CALL IN THIS BUNDLE GOES THROUGH apiUrl(). Root-relative fetches
// were correct for exactly one deployment — the one where graphics_suite_rs
// serves this bundle itself, so /api/ocr and /index.html share an origin. The
// same bundle opened as an APK:OS window is served by the PORTAL, where /api/ocr
// is a route nobody answers, and every analysis silently fails with a 404 that
// looks like a broken image rather than a missing server.
//
// Resolution order, most specific first. Each is a deliberate deployment:
//   1. ?api=http://host:port   — one-off, and what a window's src can carry
//   2. <meta name="folder-scan-api" content="...">  — baked into a build
//   3. localStorage folderScanApi  — a bench operator's sticky override
//   4. same origin  — the Rust server hosting its own dashboard
//
// A trailing slash is trimmed so callers can pass '/api/ocr' unchanged.

function resolveBase(): string {
  const raw = readConfiguredBase();
  return raw ? raw.replace(/\/+$/, '') : '';
}

function readConfiguredBase(): string {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('api');
    if (fromQuery) return fromQuery;

    const meta = document.querySelector('meta[name="folder-scan-api"]');
    const fromMeta = meta?.getAttribute('content');
    if (fromMeta) return fromMeta;

    // localStorage throws outright in some embedded contexts rather than
    // returning null, so this whole read is guarded and not just this line.
    const fromStorage = window.localStorage?.getItem('folderScanApi');
    if (fromStorage) return fromStorage;
  } catch {
    // Any of the three unavailable means "not configured", which is the
    // same-origin default below — never a hard failure at module load.
  }
  return '';
}

const API_BASE = resolveBase();

/** Absolute URL for one micro-API route. Pass the route with its leading slash. */
export function apiUrl(route: string): string {
  return API_BASE + route;
}

/** Where this bundle believes the micro-API is. '' means same origin. */
export function apiBase(): string {
  return API_BASE;
}
