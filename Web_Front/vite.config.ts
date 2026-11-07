import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { cpSync, existsSync } from 'node:fs'

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
//
// THE DESKTOP APP (ROAD-3586). A Tauri bundle holds only this dist/, so the relative
// path leads nowhere there. A Tauri build (the CLI sets TAURI_ENV_PLATFORM for its
// beforeBuildCommand; APK_BUNDLE_VIZ=1 forces it) copies the viewers' dist into
// dist/viz/, which the app serves as its own pages. If the viewers were not built,
// nothing is copied and vizBase.ts falls back to the published viewers on apk.audio.
const VIZ_DIST = resolve(import.meta.dirname, '../../../VISUALIZER/VISUALIZER.Like.audio/dist')
const BUNDLE_VIZ = !!(process.env.TAURI_ENV_PLATFORM || process.env.APK_BUNDLE_VIZ)
  && existsSync(resolve(VIZ_DIST, '2d.html'))

const bundleViewers = (): Plugin => {
  let outDir = 'dist'
  return {
    name: 'apk-bundle-viz',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    closeBundle() { cpSync(VIZ_DIST, resolve(outDir, 'viz'), { recursive: true }) },
  }
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), ...(BUNDLE_VIZ ? [bundleViewers()] : [])],
  define: {
    __VIZ_DEV_BASE__: JSON.stringify(command === 'serve' ? `/@fs${VIZ_DIST}/` : ''),
    __VIZ_BUNDLED_BASE__: JSON.stringify(BUNDLE_VIZ ? './viz/' : ''),
  },
  server: { fs: { allow: [import.meta.dirname, VIZ_DIST] } },
}))
