/**
 * Serviço API da área IRPF 2026 (Central).
 * Todas as chamadas usam o token no header quando disponível.
 */

import { api } from './api';

const BASE = '/irpf2026';

function getToken(): string | null {
  return localStorage.getItem('irpf2026_token');
}

function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Irpf2026Role = 'admin' | 'cliente';

export interface Irpf2026User {
  id: string;
  email: string;
  nome_exibicao?: string | null;
  status_declaracao?: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  role?: Irpf2026Role;
  user?: Irpf2026User;
  error?: string;
}

export interface MeResponse {
  success: boolean;
  role?: Irpf2026Role;
  user?: Irpf2026User;
  error?: string;
}

export interface DocumentoItem {
  id: string;
  usuario_id: string;
  nome_original: string;
  categoria: string;
  tamanho_bytes?: number;
  mime_type?: string | null;
  created_at: string;
}

export interface MensagemItem {
  id: string;
  tipo: string;
  titulo: string;
  texto: string;
  lida: boolean;
  created_at: string;
}

export interface VisaoGeralData {
  total_usuarios: number;
  total_documentos: number;
  por_categoria: Record<string, number>;
  ultimos_documentos: DocumentoItem[];
}

export interface UsuarioAdminItem {
  id: string;
  email: string;
  nome_exibicao?: string | null;
  status_declaracao: string;
  documentos_count: number;
  updated_at: string;
}

/** Dados cadastrais do usuário (retorno de GET /admin/usuarios/:id) */
export interface UsuarioCadastroItem {
  id: string;
  email: string;
  nome_exibicao?: string | null;
  status_declaracao: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export const irpf2026Api = {
  async login(login: string, senha: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>(`${BASE}/auth/login`, { login, senha });
    return data;
  },

  async getMe(): Promise<MeResponse> {
    const { data } = await api.get<MeResponse>(`${BASE}/me`, { headers: getAuthHeaders() });
    return data;
  },

  async listarDocumentos(params?: { categoria?: string; usuario_id?: string; limit?: number; offset?: number }): Promise<{ success: boolean; data?: DocumentoItem[]; error?: string }> {
    const { data } = await api.get(`${BASE}/documentos`, { params, headers: getAuthHeaders() });
    return data as { success: boolean; data?: DocumentoItem[]; error?: string };
  },

  async uploadDocumento(file: File, categoria: string): Promise<{ success: boolean; data?: DocumentoItem; error?: string }> {
    const form = new FormData();
    form.append('arquivo', file);
    form.append('categoria', categoria);
    const { data } = await api.post(`${BASE}/documentos/upload`, form, {
      headers: getAuthHeaders(),
    });
    return data as { success: boolean; data?: DocumentoItem; error?: string };
  },

  getDownloadUrl(id: string): string {
    const token = getToken();
    const baseURL = api.defaults.baseURL || '';
    return `${baseURL}${BASE}/documentos/${id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  async downloadDocumento(id: string): Promise<Blob> {
    const { data } = await api.get<Blob>(`${BASE}/documentos/${id}/download`, {
      headers: getAuthHeaders(),
      responseType: 'blob',
    });
    return data;
  },

  async listarMensagens(params?: { usuario_id?: string }): Promise<{ success: boolean; data?: MensagemItem[]; error?: string }> {
    const { data } = await api.get(`${BASE}/mensagens`, { params, headers: getAuthHeaders() });
    return data as { success: boolean; data?: MensagemItem[]; error?: string };
  },

  async marcarMensagemLida(id: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await api.patch(`${BASE}/mensagens/${id}/lida`, {}, { headers: getAuthHeaders() });
    return data as { success: boolean; error?: string };
  },

  // Admin
  async getVisaoGeral(): Promise<{ success: boolean; data?: VisaoGeralData; error?: string }> {
    const { data } = await api.get(`${BASE}/admin/visao-geral`, { headers: getAuthHeaders() });
    return data as { success: boolean; data?: VisaoGeralData; error?: string };
  },

  async getAdminUsuarios(): Promise<{ success: boolean; data?: UsuarioAdminItem[]; error?: string }> {
    const { data } = await api.get(`${BASE}/admin/usuarios`, { headers: getAuthHeaders() });
    return data as { success: boolean; data?: UsuarioAdminItem[]; error?: string };
  },

  async getUsuarioById(usuarioId: string): Promise<{ success: boolean; data?: UsuarioCadastroItem; error?: string }> {
    const { data } = await api.get(`${BASE}/admin/usuarios/${usuarioId}`, { headers: getAuthHeaders() });
    return data as { success: boolean; data?: UsuarioCadastroItem; error?: string };
  },

  /** Baixa todos os documentos do usuário em um único ZIP (apenas admin). */
  async downloadDocumentosZip(usuarioId: string): Promise<Blob> {
    const { data } = await api.get<Blob>(`${BASE}/admin/usuarios/${usuarioId}/documentos/zip`, {
      headers: getAuthHeaders(),
      responseType: 'blob',
    });
    return data;
  },

  async setStatusUsuario(usuarioId: string, status_declaracao: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await api.put(`${BASE}/admin/usuarios/${usuarioId}/status`, { status_declaracao }, { headers: getAuthHeaders() });
    return data as { success: boolean; error?: string };
  },

  async enviarMensagem(usuario_id: string, tipo: string, titulo: string, texto: string): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
    const { data } = await api.post(`${BASE}/admin/mensagens`, { usuario_id, tipo, titulo, texto }, { headers: getAuthHeaders() });
    return data as { success: boolean; data?: { id: string }; error?: string };
  },
};

export function setIrpf2026Token(token: string | null): void {
  if (token) localStorage.setItem('irpf2026_token', token);
  else localStorage.removeItem('irpf2026_token');
}

export function getIrpf2026Token(): string | null {
  return getToken();
}
