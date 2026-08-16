import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
      '/webhooks': 'http://localhost:3001',
    },
  },
})
