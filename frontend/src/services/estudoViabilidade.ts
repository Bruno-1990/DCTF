import api from './api';

export interface DocumentoResumo {
  id: number;
  nome_original: string;
  mime_type: string;
  tamanho_bytes: number;
  status: 'processando' | 'concluido' | 'erro';
  erro_mensagem: string | null;
  total_cnaes: number;
  criado_em: string;
  processado_em: string | null;
}

export interface ClienteMatch {
  cliente_id: string | number;
  cnpj_limpo: string;
  razao_social: string;
  cnae_match: string;
  origem_cnae: 'principal' | 'secundario';
  denominacao: string | null;
  grau_risco: string | null;
  compreende_atuacao: string | null;
  condicao_classificacao_risco: string | null;
  orgao_vigilancia: string | null;
  descricao: string | null;
  trecho: string | null;
  documento_id: number;
  documento_nome: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// URL absoluta do backend para EventSource (axios baseURL nao funciona aqui).
const SSE_BASE = (import.meta as any).env?.VITE_API_BASE_URL
  || ((import.meta as any).env?.VITE_API_URL
        ? `${(import.meta as any).env.VITE_API_URL.replace(/\/$/, '')}/api`
        : 'http://localhost:38572/api');

export type ProgressPhase =
  | 'snapshot' | 'parse' | 'llm_start' | 'llm_progress'
  | 'persist' | 'done' | 'error';

export interface ProgressMessage {
  phase: ProgressPhase;
  message?: string;
  model?: string;
  chars_received?: number;
  cnaes_parciais?: number;
  total?: number;
  total_cnaes?: number;
  // Para evento 'snapshot' carrega o registro completo do DocumentoResumo
  status?: 'processando' | 'concluido' | 'erro';
  nome_original?: string;
  erro_mensagem?: string | null;
}

export function subscribeProgress(
  documentoId: number,
  onEvent: (evt: ProgressMessage) => void,
): { close: () => void } {
  const url = `${SSE_BASE}/estudo-viabilidade/documentos/${documentoId}/stream`;
  const es = new EventSource(url);
  const phases: ProgressPhase[] = ['snapshot', 'parse', 'llm_start', 'llm_progress', 'persist', 'done', 'error'];
  for (const phase of phases) {
    es.addEventListener(phase, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data || '{}');
        onEvent({ phase, ...data });
      } catch {
        onEvent({ phase });
      }
    });
  }
  es.addEventListener('error', () => {
    // EventSource normalmente reconecta sozinho; se acabou (done) ja foi fechado pelo backend.
    if (es.readyState === EventSource.CLOSED) onEvent({ phase: 'error', message: 'Conexao SSE encerrada' });
  });
  return { close: () => es.close() };
}

export const estudoViabilidadeService = {
  async uploadDocumento(arquivo: File): Promise<{ documentoId: number; status: string }> {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    const r = await api.post('/estudo-viabilidade/documentos', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return r.data;
  },

  async listarDocumentos(page = 1, limit = 50): Promise<PaginatedResponse<DocumentoResumo>> {
    const r = await api.get('/estudo-viabilidade/documentos', { params: { page, limit } });
    return r.data;
  },

  async obterStatus(id: number): Promise<DocumentoResumo> {
    const r = await api.get(`/estudo-viabilidade/documentos/${id}/status`);
    return r.data;
  },

  async excluirDocumento(id: number): Promise<void> {
    await api.delete(`/estudo-viabilidade/documentos/${id}`);
  },

  async listarClientes(params: { cnpj?: string; nome?: string; municipio?: string; documentoId?: number; page?: number; limit?: number }): Promise<PaginatedResponse<ClienteMatch>> {
    const r = await api.get('/estudo-viabilidade/clientes', { params });
    return r.data;
  },

  async listarCidades(q: string, limit = 20): Promise<{ items: Array<{ municipio: string; uf: string | null; total: number }> }> {
    const r = await api.get('/estudo-viabilidade/cidades', { params: { q, limit } });
    return r.data;
  },
};
