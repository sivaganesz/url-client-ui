import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The app and the API are ONE ORIGIN, which is what lets the session cookie
// stay SameSite=Lax and the browser block CSRF for us. In development Vite
// serves the app and forwards /api to the backend; in production the backend
// serves the built app itself. Either way the browser sees a single origin.
//
// `npm run dev` therefore needs the backend running too — see ../backend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 is occupied by another project on this machine; 5180 keeps
    // `npm run dev` deterministic instead of silently drifting to a free port.
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4400',
        // Left false so the Host header reaches the backend unchanged, which
        // is what `trust proxy` and the cookie domain expect in production.
        changeOrigin: false,
      },
    },
  },
})
