import api from './api';
import type { Cliente } from '../types';

export type ClientesListResponse = {
  items: Cliente[];
  pagination?: { total: number; totalPages: number; page: number; limit: number };
};

export const clientesService = {
  async getAll(params?: { page?: number; limit?: number; nome?: string; cnpj?: string; email?: string; search?: string; socio?: string; payments?: 'all' | 'with' | 'without' }): Promise<ClientesListResponse> {
    const response = await api.get<any>('/clientes', { params });
    const body = response.data;
    if (Array.isArray(body)) {
      return { items: body };
    }
    if (body && Array.isArray(body.data)) {
      return { items: body.data as Cliente[], pagination: body.pagination };
    }
    return { items: [] };
  },

  async getById(id: string): Promise<Cliente> {
    const response = await api.get<Cliente>(`/clientes/${id}`);
    return response.data;
  },

  async create(cliente: Partial<Cliente>): Promise<Cliente> {
    const response = await api.post<Cliente>('/clientes', cliente);
    return response.data;
  },

  async update(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
    const response = await api.put<Cliente>(`/clientes/${id}`, cliente);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/clientes/${id}`);
  },

  async consultarReceitaWS(cnpj: string) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const response = await api.get(`/clientes/receita-ws/cnpj/${cnpjLimpo}`);
    return response.data; // { success, data }
  },

  async importarReceitaWS(cnpj: string, overwrite?: boolean) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const response = await api.post(`/clientes/import-receita-ws`, { cnpj: cnpjLimpo, overwrite: overwrite === true });
    return response.data; // { success, data: Cliente }
  },

  async listarSociosDistinct() {
    const response = await api.get('/clientes/socios');
    return response.data; // { success, data: [{nome}] }
  },

  async obterCliente(id: string) {
    const response = await api.get(`/clientes/${id}`);
    // O backend retorna { success, data: Cliente } ou diretamente Cliente
    return response.data; // { success, data: Cliente } ou Cliente
  },

  async atualizarSociosPorSituacaoFiscal(id: string) {
    const response = await api.put(`/clientes/${id}/atualizar-socios-situacao-fiscal`);
    return response.data; // { success, data: { clienteId, sociosAtualizados, message } }
  },

  async buscarPorCNPJ(cnpj: string) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const response = await api.get(`/clientes/cnpj/${cnpjLimpo}`);
    return response.data; // { success, data: Cliente }
  },

  async atualizarTodosReceitaWS() {
    const response = await api.post('/clientes/atualizar-todos-receita-ws');
    return response.data; // { success, data: { total, sucessos, erros, resultados } }
  },

};

export const spreadsheetService = {
  async validate(file: File) {
    const form = new FormData();
    form.append('arquivo', file);
    const res = await api.post('/spreadsheet/validate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  async upload(file: File, payload: { clienteId: string; periodo: string }, onProgress?: (percent: number) => void) {
    const form = new FormData();
    form.append('arquivo', file);
    form.append('clienteId', payload.clienteId);
    form.append('periodo', payload.periodo);
    const res = await api.post('/spreadsheet/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) {
          const percent = Math.round((e.loaded * 100) / e.total);
          onProgress?.(percent);
        }
      },
    });
    return res.data;
  },
  async downloadTemplate(filename: string = 'template_dctf.xlsx') {
    const res = await api.get('/spreadsheet/template', { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  async getUploads(params?: { page?: number; limit?: number; clienteId?: string; periodo?: string }) {
    const res = await api.get('/spreadsheet/uploads', { params });
    return res.data; // { success, data, pagination }
  }
};

