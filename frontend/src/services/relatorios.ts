import api from './api';
import type { Relatorio } from '../types';

export type RelatorioListItem = {
  id: string;
  declaracaoId?: string;
  tipoRelatorio: string;
  titulo: string;
  conteudo?: string;
  arquivoPdf?: string;
  arquivoXlsx?: string;
  formato?: 'pdf' | 'xlsx';
  downloadUrl?: string;
  createdAt?: string | Date;
  period?: string;
  responsible?: string;
  notes?: string;
  filters?: Record<string, unknown>;
};

export type RelatoriosListResponse = {
  items: RelatorioListItem[];
  pagination?: { total: number; totalPages: number; page: number; limit: number };
};

type ListParams = {
  page?: number;
  limit?: number;
  tipoRelatorio?: string;
  declaracaoId?: string;
  identification?: string;
  period?: string;
};

type GenerateReportOptions = {
  reportType: 'gerencial' | 'clientes' | 'dctf' | 'conferencia' | 'pendentes' | 'pagamentos-pendentes';
  format: 'pdf' | 'xlsx';
  months?: number;
  period?: string;
  identification?: string;
  title?: string;
  logoUrl?: string;
  responsible?: string;
  notes?: string;
};

export const relatoriosService = {
  async getAll(params?: ListParams): Promise<RelatoriosListResponse> {
    try {
      const historyResponse = await api.get('/dashboard/admin/reports/history', { params });
      const historyBody = historyResponse.data;
      if (historyBody && Array.isArray(historyBody.data)) {
        const items = (historyBody.data as Array<any>).map(item => ({
          id: item.id,
          declaracaoId: item.declaracaoId ?? '-',
          tipoRelatorio: item.tipoRelatorio ?? item.tipo ?? 'gerencial',
          titulo: item.titulo ?? 'Relatório',
          conteudo: item.notes ?? '',
          arquivoPdf: item.arquivoPdf,
          arquivoXlsx: item.arquivoXlsx,
          formato: item.formato,
          downloadUrl: item.downloadUrl,
          createdAt: item.createdAt,
          period: item.period,
          responsible: item.responsible,
          notes: item.notes,
          filters: item.filters,
        })) as RelatorioListItem[];
        return { items, pagination: historyBody.pagination };
      }
    } catch (error) {
      console.warn('Falha ao carregar histórico de relatórios gerenciais, usando endpoint legacy /relatorios', error);
    }

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

  async downloadHistory(id: string): Promise<Blob> {
    const response = await api.get(`/dashboard/admin/reports/history/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async generateAndDownload(options: GenerateReportOptions): Promise<Blob> {
    const { reportType, format, ...filters } = options;
    const response = await api.get(`/dashboard/admin/reports/${reportType}.${format}`, {
      params: filters,
      responseType: 'blob',
    });
    return response.data;
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

