import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The dev server proxies /api to the Express API, so the browser only ever talks
// to http://localhost:5173. That makes every request same-origin, which means the
// HttpOnly SameSite=Strict refresh cookie is sent normally and no CORS is needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: false },
    },
  },
})
