import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// On GitHub Pages the app is served from https://<user>.github.io/<repo>/, so the
// production build needs a matching `base`. The base is read from the VITE_BASE env
// var (the Pages workflow sets it to '/<repo>/') and defaults to the repo name, so
// nothing is hard-coded. The hash router means in-app routing works under any base.
const repoBase = process.env.VITE_BASE ?? '/qa-activity-tracker/'

// Build stamp: the commit (on CI) or a timestamp. Baked into the bundle and also written to version.json, so a
// running tab can tell a newer deploy is live (GitHub Pages caches index.html for 10 min) and offer a reload.
const buildId = (process.env.GITHUB_SHA ?? '').slice(0, 7) || `local-${Date.now().toString(36)}`
const versionFile = (): Plugin => ({
  name: 'emit-version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: buildId }) })
  },
})

export default defineConfig(({ command }) => ({
  // Only the production build needs the subpath; the dev server stays at '/'.
  base: command === 'serve' ? '/' : repoBase,
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: {
    // The lazy-loaded dashboard chunk bundles Recharts + react-grid-layout (~510 kB, loaded only on /dashboards)
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    tailwindcss(),
    react(),
    versionFile(),
  ],
}))
