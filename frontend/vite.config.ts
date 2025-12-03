import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_URL || 'http://localhost:3000'
  
  return {
    plugins: [react()],
    base: '/',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      hmr: {
        overlay: true,
      },
      fs: {
        strict: true,
      },
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
  }
})
