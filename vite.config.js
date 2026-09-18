import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Perfox key must never reach the browser bundle, so the app always calls
// same-origin `/api/*` and the dev server forwards those calls to the proxy in
// server/. `npm run dev` therefore needs `node server/index.js` running too.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 is occupied by another project on this machine; 5180 keeps
    // `npm run dev` deterministic instead of silently drifting to a free port.
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
