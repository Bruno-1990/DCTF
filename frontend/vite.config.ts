import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_URL || 'http://localhost:3000'
  
  // Para GitHub Pages, usa o nome do repositório como base path
  // Para produção local ou outros ambientes, usa '/'
  const getBase = () => {
    if (mode === 'production') {
      // Se estiver no GitHub Actions, usa o nome do repositório
      if (process.env.GITHUB_REPOSITORY) {
        const repoName = process.env.GITHUB_REPOSITORY.split('/')[1]
        return `/${repoName}/`
      }
      // Caso contrário, verifica variável de ambiente ou usa '/'
      return process.env.VITE_BASE_PATH || '/'
    }
    return '/'
  }
  
  return {
    plugins: [react()],
    base: getBase(),
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
      },
    },
  }
})
