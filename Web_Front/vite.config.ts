import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base './': the bundle is served from a folder, never a site root —
// /APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/ on apk.audio and
// the bench, a sub-path on scanalyzer.like.audio, the Tauri asset protocol — so every
// asset URL is relative. This was `--base ./` on the CI and image command lines; the
// recipe is the repository's now (Docker/dist.Dockerfile builds with plain `vite build`).
export default defineConfig({
  base: './',
  plugins: [react()],
})
