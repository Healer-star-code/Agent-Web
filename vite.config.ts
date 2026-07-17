import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/superking-api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/superking-api/, ''),
      },
      '/auth-api': {
        target: 'https://7960db9e.r8.cpolar.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/auth-api/, ''),
      },
    },
  },
})
