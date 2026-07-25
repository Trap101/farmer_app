import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The forecast engine (src/server.ts) runs separately on :8787 — `npm run serve`.
// Proxying keeps the browser same-origin, so the engine's open CORS is a
// convenience for curl rather than something the demo depends on.
const ENGINE = process.env.ENGINE_ORIGIN ?? 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: ENGINE,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
