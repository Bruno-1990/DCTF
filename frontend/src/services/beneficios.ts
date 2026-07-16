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

export type ProgramaBeneficio = 'compete' | 'invest';

// ─── REOA (conferência de faturamento do grupo SUBSTITUTO) ───
export interface SubstitutoMes {
  ano: number; mes: number; bdref: number;
  faturamento: number | null; abaixo: boolean; semDados: boolean;
}
export interface SubstitutoEstabelecimento {
  codigo_empresa: number; rotulo: string;
  meses: SubstitutoMes[]; temAlgumAbaixo: boolean; mesesSemDados: number;
}
export interface SubstitutoCliente {
  id: string; razao_social: string; cnpj: string; codigo_sci: number | null;
  estabelecimentos: SubstitutoEstabelecimento[]; temAlgumAbaixo: boolean;
  aoVivo?: boolean; // true = dados reais persistidos do SCI; ausente = prévia do cache
}
export interface ConferenciaSubstituto {
  success: boolean;
  threshold: number;
  janela: { ano: number; mes: number; bdref: number }[];
  clientes: SubstitutoCliente[];
  resumo: { totalClientes: number; comAlerta: number; totalEstabelecimentos: number };
}
export interface FaturamentoAoVivoResp {
  success: boolean;
  fonte?: string;
  threshold?: number;
  janela?: { ano: number; mes: number; bdref: number }[];
  cliente?: SubstitutoCliente;
  semCodigoSci?: boolean;
  error?: string;
}

/**
 * Onde está a planilha vigente deste programa no Portal da Transparência.
 * `arquivoUrl` vem null quando o portal não pôde ser lido — nesse caso sobra o
 * `portalUrl`, e o motivo está em `erro`.
 */
export interface FontePlanilhaDto {
  programa: ProgramaBeneficio;
  secao: string;
  descricao: string;
  portalUrl: string;
  arquivoUrl: string | null;
  arquivoLabel: string | null;
  erro: string | null;
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

  // ─── Fonte da planilha ───
  async obterFonte(programa: ProgramaBeneficio): Promise<FontePlanilhaDto> {
    const r = await api.get(`/beneficios/fonte/${programa}`);
    return r.data;
  },

  // ─── REOA (conferência de faturamento SUBSTITUTO) ───
  async conferenciaSubstituto(): Promise<ConferenciaSubstituto> {
    const r = await api.get('/beneficios/substituto/conferencia');
    return r.data;
  },
  /** Faturamento AO VIVO do SCI (Quadro 1) para 1 cliente — lento (~30s). */
  async faturamentoAoVivoSubstituto(clienteId: string): Promise<FaturamentoAoVivoResp> {
    const r = await api.get(`/beneficios/substituto/faturamento/${clienteId}`);
    return r.data;
  },
  /** Envia e-mail com a lista de clientes NÃO OK. */
  async enviarAvisoSubstituto(destinatarios?: string[]): Promise<{ success: boolean; enviado?: boolean; totalNaoOk?: number; destinatarios?: string[]; mensagem?: string; error?: string }> {
    const r = await api.post('/beneficios/substituto/aviso', destinatarios ? { destinatarios } : {});
    return r.data;
  },

  // ─── Tipos (lista mestra de benefícios fiscais) ───
  async listarTipos(): Promise<{ id: number; nome: string }[]> {
    const r = await api.get('/beneficios/tipos');
    return r.data?.data ?? [];
  },
  async criarTipo(nome: string): Promise<{ id: number; nome: string }> {
    const r = await api.post('/beneficios/tipos', { nome });
    return r.data?.data;
  },
};
