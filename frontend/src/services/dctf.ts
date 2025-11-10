import api from './api';
import type { DCTF, Cliente } from '../types';

export type DCTFListItem = {
  id: string;
  clienteId: string;
  periodo: string;
  dataDeclaracao: string | Date;
  status: string;
  situacao?: string | null;
  arquivoOriginal?: string;
  cliente?: Pick<Cliente, 'id' | 'nome' | 'razao_social' | 'cnpj' | 'cnpj_limpo'>;
  debitoApurado?: number | null;
  saldoAPagar?: number | null;
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
};

export const dctfService = {
  async getAll(params?: ListParams): Promise<DCTFListResponse> {
    const response = await api.get<any>('/dctf', { params });
    const body = response.data;
    if (Array.isArray(body)) {
      return { items: body as DCTFListItem[] };
    }
    if (body && Array.isArray(body.data)) {
      return { items: body.data as DCTFListItem[], pagination: body.pagination };
    }
    return { items: [] };
  },

  async getById(id: string): Promise<DCTF> {
    const response = await api.get<DCTF>(`/dctf/${id}`);
    return response.data;
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

