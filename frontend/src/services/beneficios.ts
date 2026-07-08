import api from './api';

export interface ComparacaoItem {
  cnpj: string;
  razao_social: string;
  beneficio_sistema: string | null;
  beneficio_planilha: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const beneficiosService = {
  // ─── Compete ───
  async listarCompete(page = 1, limit = 50, busca?: string): Promise<PaginatedResponse<any>> {
    const params: Record<string, any> = { page, limit };
    if (busca) params.busca = busca;
    const r = await api.get('/beneficios/compete', { params });
    return r.data;
  },
  async importarCompete(arquivo: File) {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    const r = await api.post('/beneficios/compete/importar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data;
  },
  async comparacaoCompete(page = 1, limit = 50, busca?: string): Promise<PaginatedResponse<ComparacaoItem>> {
    const params: Record<string, any> = { page, limit };
    if (busca) params.busca = busca;
    const r = await api.get('/beneficios/compete/comparacao', { params });
    return r.data;
  },
  async limparCompete() { const r = await api.delete('/beneficios/compete/limpar'); return r.data; },

  // ─── Invest ───
  async listarInvest(page = 1, limit = 50, busca?: string): Promise<PaginatedResponse<any>> {
    const params: Record<string, any> = { page, limit };
    if (busca) params.busca = busca;
    const r = await api.get('/beneficios/invest', { params });
    return r.data;
  },
  async importarInvest(arquivo: File) {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    const r = await api.post('/beneficios/invest/importar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data;
  },
  async comparacaoInvest(page = 1, limit = 50, busca?: string): Promise<PaginatedResponse<ComparacaoItem>> {
    const params: Record<string, any> = { page, limit };
    if (busca) params.busca = busca;
    const r = await api.get('/beneficios/invest/comparacao', { params });
    return r.data;
  },
  async limparInvest() { const r = await api.delete('/beneficios/invest/limpar'); return r.data; },
};
