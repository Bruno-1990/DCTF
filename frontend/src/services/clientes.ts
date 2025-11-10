import api from './api';
import type { Cliente } from '../types';

export type ClientesListResponse = {
  items: Cliente[];
  pagination?: { total: number; totalPages: number; page: number; limit: number };
};

export const clientesService = {
  async getAll(params?: { page?: number; limit?: number; nome?: string; cnpj?: string; email?: string }): Promise<ClientesListResponse> {
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

