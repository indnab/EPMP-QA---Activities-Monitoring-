import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// On GitHub Pages the app is served from https://<user>.github.io/<repo>/, so the
// production build needs a matching `base`. The base is read from the VITE_BASE env
// var (the Pages workflow sets it to '/<repo>/') and defaults to the repo name, so
// nothing is hard-coded. The hash router means in-app routing works under any base.
const repoBase = process.env.VITE_BASE ?? '/qa-activity-tracker/'

export default defineConfig(({ command }) => ({
  // Only the production build needs the subpath; the dev server stays at '/'.
  base: command === 'serve' ? '/' : repoBase,
  build: {
    // The lazy-loaded dashboard chunk bundles Recharts + react-grid-layout (~510 kB, loaded only on /dashboards)
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    tailwindcss(),
    react(),
  ],
}))
