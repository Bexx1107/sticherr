import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3002,
    host: true,
    proxy: {
      '/api/floyo': {
        target: 'https://api.floyo.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/floyo/, ''),
      },
      '/cdn/floyo': {
        target: 'https://cdn.floyo.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cdn\/floyo/, ''),
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
