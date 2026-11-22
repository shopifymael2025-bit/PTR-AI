import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    build: {
      // Explicit entry: required by electron-vite 6 / Vite 8 in dev mode.
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') }, external: ['@lydell/node-pty', 'sql.js'] }
    }
  },
  preload: {
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
