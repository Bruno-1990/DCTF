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
};

type ListParams = {
  page?: number;
  limit?: number;
  clienteId?: string;
  periodo?: string;
  status?: string;
  situacao?: string;
  orderBy?: string;
  order?: 'asc' | 'desc';
  search?: string;
};

export const dctfService = {
  async getAll(params?: ListParams): Promise<DCTFListResponse> {
    const response = await api.get<any>('/dctf', { params });
    const body = response.data;
    if (Array.isArray(body)) {
      return { items: body.map(normalizeItem) as DCTFListItem[] };
    }
    if (body && Array.isArray(body.data)) {
      return { items: body.data.map(normalizeItem) as DCTFListItem[], pagination: body.pagination };
    }
    return { items: [] };
  },

  async getById(id: string): Promise<DCTF> {
    const response = await api.get<DCTF>(`/dctf/${id}`);
    return normalizeItem(response.data) as DCTF;
  },

  async getByClienteId(clienteId: string): Promise<DCTF[]> {
    const response = await api.get<DCTF[]>(`/dctf/cliente/${clienteId}`);
    return response.data;
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

