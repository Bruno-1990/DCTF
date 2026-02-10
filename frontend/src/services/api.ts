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

// Função para remover campos undefined de objetos (recursiva)
const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        cleaned[key] = removeUndefined(obj[key]);
      }
    }
    return cleaned;
  }
  
  return obj;
};

// Interceptor de requisição para remover campos undefined
api.interceptors.request.use(
  (config) => {
    // Não alterar FormData (ex.: upload de arquivos) — senão vira objeto vazio e o backend não recebe os arquivos.
    // Remover Content-Type para o axios/navegador definir multipart/form-data com boundary.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      return config;
    }
    // Limpar campos undefined do body (data)
    if (config.data && typeof config.data === 'object') {
      config.data = removeUndefined(config.data);
    }
    
    // Limpar campos undefined dos params
    if (config.params && typeof config.params === 'object') {
      config.params = removeUndefined(config.params);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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
    const status = error.response?.status;
    const friendlyError = new Error(message) as Error & {
      status?: number;
      data?: any;
      headers?: any;
    };
    friendlyError.name = (status && status >= 500) ? 'ServerError' : 'ClientError';
    // Preservar metadados úteis (ex: status 429) para permitir retry/backoff no frontend
    friendlyError.status = status;
    friendlyError.data = error.response?.data;
    friendlyError.headers = error.response?.headers;
    return Promise.reject(friendlyError);
  }
);

export default api;

