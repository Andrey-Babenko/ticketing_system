import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only: proxy API calls to the backend (host `npm run dev` or Dockerized on :3000).
    // In production, nginx handles this (see frontend/nginx.conf); Vite is not used there.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
