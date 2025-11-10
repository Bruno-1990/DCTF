import axios from 'axios';

// Prefer VITE_API_BASE_URL; fallback to VITE_API_URL (append /api if missing);
// final fallback: http://localhost:3000/api
const baseFromEnv = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
const legacyBase = (import.meta as any).env?.VITE_API_URL as string | undefined;
const computedLegacy = legacyBase ? (legacyBase.endsWith('/api') ? legacyBase : `${legacyBase.replace(/\/$/, '')}/api`) : undefined;
const API_BASE_URL = baseFromEnv || computedLegacy || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptors para tratamento de erros
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    
    // Melhorar mensagem de erro quando não consegue conectar
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
      const friendlyError = new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000.');
      friendlyError.name = 'ConnectionError';
      return Promise.reject(friendlyError);
    }
    
    // Erro de rede
    if (!error.response) {
      const friendlyError = new Error('Erro de conexão. Verifique sua internet e se o servidor está disponível.');
      friendlyError.name = 'NetworkError';
      return Promise.reject(friendlyError);
    }
    
    // Erro do servidor (4xx, 5xx)
    const message = error.response?.data?.error || error.response?.data?.message || error.message || 'Erro ao processar requisição';
    const friendlyError = new Error(message);
    friendlyError.name = error.response?.status >= 500 ? 'ServerError' : 'ClientError';
    return Promise.reject(friendlyError);
  }
);

export default api;

