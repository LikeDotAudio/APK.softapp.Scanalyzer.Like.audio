// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './vendor/apk-contracts/apk-tokens.css' // the brand + state tokens (--apk-accent), before index.css reads them
import './index.css'
// THE PERCENT-FILL PRIMITIVE, MIRRORED RATHER THAN LINKED, and that is
// PLAN-924.03's ruling (option 3) applied to a third stack rather than a new
// decision. `APK:OS/core/theme/percent-fill.css` is the canonical file and
// `APK:Softapps/TIME/GANTT/css/percent-fill.css` is the first mirror; the file
// beside this one is the second, and its own header carries the rule: EDIT ALL
// OF THEM, OR NONE — `cmp` any two and they must be byte-identical. A shared
// URL was tried on paper and does not survive the hosts, and this bundle is
// served four ways too. PLAN-924.02.
import './percent-fill.css'
import App from './App.tsx'
import { setupInstallPrompt } from './installPrompt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Progressive Web App: offer the install prompt, and register the service worker so the app
// is installable and runs offline. Only on the web build (not the Tauri desktop app, which
// is already native) and only in a production build (a SW would fight Vite's dev HMR).
setupInstallPrompt()
if ('serviceWorker' in navigator && import.meta.env.PROD && !(window as any).__TAURI_INTERNALS__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* install still works without offline caching */ })
  })
}
