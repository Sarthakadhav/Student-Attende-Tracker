import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Sends /api requests to the Express backend, so no CORS setup is needed in development.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})