import api from './api';
import type { DCTF, Cliente } from '../types';

export type DCTFListItem = {
  id: string;
  clienteId: string;
  periodo: string;
  periodoApuracao?: string | null;
  dataDeclaracao: string | Date;
  dataTransmissao?: string | Date | null;
  status: string;
  situacao?: string | null;
  arquivoOriginal?: string;
  cliente?: Pick<Cliente, 'id' | 'nome' | 'razao_social' | 'cnpj' | 'cnpj_limpo'>;
  debitoApurado?: number | null;
  saldoAPagar?: number | null;
  tipoNi?: string | null;
  numeroIdentificacao?: string | null;
  categoria?: string | null;
  origem?: string | null;
  tipoDeclaracao?: string | null;
  observacoes?: string | null;
};

export type DCTFListResponse = {
  items: DCTFListItem[];
  pagination?: { total: number; totalPages: number; page: number; limit: number };
  lastUpdate?: string | null;
  tiposDisponiveis?: string[];
  periodosTransmissaoDisponiveis?: string[];
};

type ListParams = {
  page?: number;
  limit?: number;
  clienteId?: string;
  periodo?: string;
  status?: string;
  situacao?: string;
  tipo?: string;
  periodoTransmissao?: string;
  orderBy?: string;
  order?: 'asc' | 'desc';
  search?: string;
};

export const dctfService = {
  async getAll(params?: ListParams): Promise<DCTFListResponse> {
    const response = await api.get<any>('/dctf', { params });
    const body = response.data;
    if (Array.isArray(body)) {
      return { items: body.map(normalizeItem) as DCTFListItem[], lastUpdate: null, tiposDisponiveis: [], periodosTransmissaoDisponiveis: [] };
    }
    if (body && Array.isArray(body.data)) {
      return { 
        items: body.data.map(normalizeItem) as DCTFListItem[], 
        pagination: body.pagination,
        lastUpdate: body.lastUpdate || null,
        tiposDisponiveis: body.tiposDisponiveis || [],
        periodosTransmissaoDisponiveis: body.periodosTransmissaoDisponiveis || [],
      };
    }
    return { items: [], lastUpdate: null, tiposDisponiveis: [], periodosTransmissaoDisponiveis: [] };
  },

  async getById(id: string): Promise<DCTF> {
    const response = await api.get<DCTF>(`/dctf/${id}`);
    return normalizeItem(response.data) as DCTF;
  },

  async getByClienteId(clienteId: string): Promise<DCTF[]> {
    const response = await api.get<any>(`/dctf/cliente/${clienteId}`);
    // O endpoint retorna { success: true, data: [...] }
    if (response.data && response.data.success && Array.isArray(response.data.data)) {
      return response.data.data.map(normalizeItem) as DCTF[];
    }
    // Fallback: se retornar array diretamente
    if (Array.isArray(response.data)) {
      return response.data.map(normalizeItem) as DCTF[];
    }
    return [];
  },

  async create(payload: Partial<DCTFListItem>) {
    const res = await api.post('/dctf', payload);
    return res.data;
  },

  async update(id: string, dctf: Partial<DCTF>): Promise<DCTF> {
    const response = await api.put<DCTF>(`/dctf/${id}`, dctf);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/dctf/${id}`);
  },

  async clearAll(): Promise<{ success: boolean; message: string; data?: { deletedDeclarations: number; deletedData: number } }> {
    const response = await api.post('/dctf/admin/clear', {
      confirm: true,
      confirmationCode: 'LIMPAR_TODAS_DECLARACOES',
    });
    return response.data;
  },

  async syncFromSupabase(): Promise<{ 
    success: boolean; 
    message?: string; 
    error?: string;
    data?: {
      total: number;
      processed: number;
      inserted: number;
      updated: number;
      errors: number;
      currentBatch: number;
      totalBatches: number;
      errorLog?: string[];
    };
  }> {
    const response = await api.post('/dctf/admin/sync');
    return response.data;
  },

  async fixSchema(): Promise<{ 
    success: boolean; 
    message?: string; 
    error?: string;
    data?: {
      foreignKeyRemoved: boolean;
      clienteIdNullable: boolean;
    };
  }> {
    const response = await api.post('/dctf/admin/fix-schema');
    return response.data;
  },

  async deleteFromSupabase(): Promise<{ 
    success: boolean; 
    message?: string; 
    error?: string;
    data?: {
      deletedDeclarations: number;
      deletedData: number;
    };
  }> {
    const response = await api.post('/dctf/admin/delete-supabase', {
      confirm: true,
      confirmationCode: 'DELETAR_SUPABASE',
    });
    return response.data;
  },

  /**
   * Baixa o log de erros de sincronização
   */
  async downloadSyncErrorsLog(): Promise<Blob> {
    const response = await api.get('/dctf/admin/sync-errors-log', {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Tenta sincronizar novamente os registros com erro
   */
  async retrySyncErrors(): Promise<{ 
    success: boolean; 
    message?: string; 
    error?: string;
    data?: {
      total: number;
      processed: number;
      inserted: number;
      updated: number;
      errors: number;
      currentBatch: number;
      totalBatches: number;
      errorLog?: string[];
    };
  }> {
    const response = await api.post('/dctf/admin/retry-sync-errors');
    return response.data;
  },

  async processSpreadsheet(file: File): Promise<{ dctfId: string; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post<{ dctfId: string; message: string }>('/dctf/process-spreadsheet', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  },

  async getDadosByDeclaracao(id: string): Promise<any> {
    const response = await api.get<any>(`/dctf/${id}/dados`);
    const body = response.data;
    if (body && body.success && Array.isArray(body.data)) {
      return body.data;
    }
    return [];
  },

  /**
   * Envia email com DCTFs em andamento para o destinatário informado.
   * @param to - Email completo (ex: ti@central-rnc.com.br) ou apenas o nome (ex: ti) — sufixo @central-rnc.com.br é aplicado no backend se faltar.
   */
  async sendEmailPending(to: string): Promise<{ success: boolean; message: string; total?: number }> {
    const response = await api.post<{ success: boolean; message: string; data?: { total: number; destinatario: string } }>(
      '/dctf/admin/send-email-pending',
      { to: to.trim() }
    );
    return {
      success: response.data.success,
      message: response.data.message,
      total: response.data.data?.total,
    };
  },

  /**
   * Importa declarações DCTF a partir de imagens PNG (OCR).
   * Envia os arquivos para o backend que extrai a tabela e persiste em teste_png (MySQL).
   */
  async importFromPng(files: File[]): Promise<{
    success: boolean;
    inserted: number;
    updated: number;
    errors: number;
    details?: { perFile: { filename: string; rows: number; inserted: number; error?: string }[] };
  }> {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    // Não definir Content-Type: o axios define multipart/form-data com boundary automaticamente
    const response = await api.post('/dctf/admin/import-from-png', formData);
    return response.data;
  },
};

function normalizeItem(item: any): DCTFListItem {
  const dataDeclaracao = item.dataDeclaracao || item.data_declaracao || item.data_transmissao || null;
  const dataTransmissao = item.dataTransmissao || item.data_transmissao || null;

  const debitoRaw = item.debitoApurado ?? item.debito_apurado;
  const saldoRaw = item.saldoAPagar ?? item.saldo_a_pagar;
  const debitoApurado = debitoRaw !== undefined && debitoRaw !== null ? Number(debitoRaw) : null;
  const saldoAPagar = saldoRaw !== undefined && saldoRaw !== null ? Number(saldoRaw) : null;

  const cliente =
    item.cliente && typeof item.cliente === 'object'
      ? {
          id: item.cliente.id,
          nome: item.cliente.nome,
          razao_social: item.cliente.razao_social,
          cnpj: item.cliente.cnpj,
          cnpj_limpo: item.cliente.cnpj_limpo,
        }
      : undefined;

  return {
    id: item.id,
    clienteId: item.clienteId || item.cliente_id,
    periodo: item.periodo,
    periodoApuracao: item.periodoApuracao || item.periodo_apuracao || item.periodo,
    dataDeclaracao: dataDeclaracao || new Date().toISOString(),
    dataTransmissao,
    status: item.status,
    situacao: item.situacao || item.status,
    arquivoOriginal: item.arquivoOriginal || item.arquivo_original,
    cliente,
    debitoApurado,
    saldoAPagar,
    tipoNi: item.tipoNi || item.tipo_ni || (cliente?.cnpj ? 'CNPJ' : undefined),
    numeroIdentificacao:
      item.numeroIdentificacao ||
      item.numero_identificacao ||
      item.identificacao ||
      cliente?.cnpj ||
      cliente?.cnpj_limpo ||
      undefined,
    categoria: item.categoria || item.category,
    origem: item.origem || item.source,
    tipoDeclaracao: item.tipoDeclaracao || item.tipo || item.tipo_declaracao,
    observacoes: item.observacoes ?? null,
  };
}

