import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
// base './': the bundle is served from a folder, never a site root —
// /APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/ on apk.audio and
// the bench, a sub-path on scanalyzer.like.audio, the Tauri asset protocol — so every
// asset URL is relative. This was `--base ./` on the CI and image command lines; the
// recipe is the repository's now (Docker/dist.Dockerfile builds with plain `vite build`).
//
// THE VIEWERS (ROAD-3571). The 2D/3D/4D/Analyzer views are VISUALIZER.Like.audio's
// pages, framed by src/vizHost.tsx. A built bundle finds them by the relative path
// between the two dist/ folders in the Softapps tree; the dev server serves this
// folder as its root, so in dev they are reached through /@fs/ on the checkout.
const VIZ_DIST = resolve(import.meta.dirname, '../../../VISUALIZER/VISUALIZER.Like.audio/dist')

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react()],
  define: { __VIZ_DEV_BASE__: JSON.stringify(command === 'serve' ? `/@fs${VIZ_DIST}/` : '') },
  server: { fs: { allow: [import.meta.dirname, VIZ_DIST] } },
}))
