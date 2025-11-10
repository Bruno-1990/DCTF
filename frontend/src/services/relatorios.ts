import api from './api';
import type { Relatorio } from '../types';

export type RelatorioListItem = {
  id: string;
  declaracaoId: string;
  tipoRelatorio: string;
  titulo: string;
  conteudo?: string;
  arquivoPdf?: string;
  createdAt?: string | Date;
};

export type RelatoriosListResponse = {
  items: RelatorioListItem[];
  pagination?: { total: number; totalPages: number; page: number; limit: number };
};

export const relatoriosService = {
  async getAll(params?: { page?: number; limit?: number; tipoRelatorio?: string; declaracaoId?: string }): Promise<RelatoriosListResponse> {
    const response = await api.get<any>('/relatorios', { params });
    const body = response.data;
    if (Array.isArray(body)) {
      return { items: body as RelatorioListItem[] };
    }
    if (body && Array.isArray(body.data)) {
      return { items: body.data as RelatorioListItem[], pagination: body.pagination };
    }
    return { items: [] };
  },

  async getById(id: string): Promise<Relatorio> {
    const response = await api.get<Relatorio>(`/relatorios/${id}`);
    return response.data;
  },

  async getByClienteId(clienteId: string): Promise<Relatorio[]> {
    const response = await api.get<Relatorio[]>(`/relatorios/cliente/${clienteId}`);
    return response.data;
  },

  async create(relatorio: Omit<Relatorio, 'id' | 'createdAt' | 'updatedAt'>): Promise<Relatorio> {
    const response = await api.post<Relatorio>('/relatorios', relatorio);
    return response.data;
  },

  async update(id: string, relatorio: Partial<Relatorio>): Promise<Relatorio> {
    const response = await api.put<Relatorio>(`/relatorios/${id}`, relatorio);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/relatorios/${id}`);
  },

  async generate(clienteId: string, tipo: Relatorio['tipo'], formato: Relatorio['formato']): Promise<Relatorio> {
    const response = await api.post<Relatorio>('/relatorios/generate', {
      clienteId,
      tipo,
      formato,
    });
    return response.data;
  },

  async download(id: string): Promise<Blob> {
    const response = await api.get(`/relatorios/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

