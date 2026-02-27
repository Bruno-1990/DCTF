/**
 * Serviço API do módulo IRPF Produção (PRD-IRPF-001)
 * Base: /api/irpf-producao
 */

import api from './api';

export interface IrpfProducaoCaseDocument {
  id: number;
  doc_type: string;
  source: string | null;
  version: number;
  file_path: string | null;
  file_size: number | null;
  created_at: string;
}

export interface IrpfProducaoCase {
  id: number;
  case_code: string;
  exercicio: number;
  ano_base: number;
  status: string;
  perfil: string | null;
  risk_score: string | null;
  assigned_to: string | null;
  cliente_id: number | null;
  triagem_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  people?: IrpfProducaoCasePerson[];
  documents?: IrpfProducaoCaseDocument[];
}

export interface IrpfProducaoCasePerson {
  id: number;
  case_id: number;
  cpf: string;
  nome: string | null;
  tipo: string;
  created_at: string;
  updated_at: string;
}

export interface ListCasesParams {
  status?: string;
  exercicio?: number;
  ano_base?: number;
  assigned_to?: string;
}

export const irpfProducaoService = {
  listCases(params?: ListCasesParams) {
    return api.get<{ success: boolean; data: IrpfProducaoCase[] }>('/irpf-producao/cases', { params }).then(r => r.data);
  },

  getCase(id: number) {
    return api.get<{ success: boolean; data: IrpfProducaoCase }>(`/irpf-producao/cases/${id}`).then(r => r.data);
  },

  createCase(body: { exercicio: number; ano_base: number; perfil?: string; assigned_to?: string; cliente_id?: number }) {
    return api.post<{ success: boolean; data: IrpfProducaoCase }>('/irpf-producao/cases', body).then(r => r.data);
  },

  updateCase(id: number, body: { perfil?: string; risk_score?: string; assigned_to?: string; triagem_json?: Record<string, unknown> }) {
    return api.patch<{ success: boolean; data: IrpfProducaoCase }>(`/irpf-producao/cases/${id}`, body).then(r => r.data);
  },

  updateCaseStatus(id: number, status: string) {
    return api.post<{ success: boolean; data: IrpfProducaoCase }>(`/irpf-producao/cases/${id}/status`, { status }).then(r => r.data);
  },

  deleteCase(id: number) {
    return api.delete<{ success: boolean; message?: string }>(`/irpf-producao/cases/${id}`).then(r => r.data);
  },

  /** Gera o arquivo .dec do case (para importar na Receita depois). Retorna file_path e document_id. */
  generateDec(caseId: number, retificacao = false) {
    return api.post<{ success: boolean; file_path?: string; document_id?: number }>(`/irpf-producao/cases/${caseId}/generate-dec`, retificacao ? { retificacao: true } : {}).then(r => r.data);
  },

  /** Retorna a URL para download do documento (arquivo .dec ou outro). Use em <a href download> ou fetch. */
  getDocumentFileUrl(documentId: number): string {
    const base = api.defaults.baseURL || '';
    return `${base.replace(/\/$/, '')}/irpf-producao/documents/${documentId}/file`;
  },

  /** Baixa o documento (ex.: .dec) disparando o download no navegador. */
  async downloadDocument(documentId: number, suggestedFilename?: string) {
    const res = await api.get(`/irpf-producao/documents/${documentId}/file`, { responseType: 'blob' });
    const blob = res.data as Blob;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedFilename || `documento-${documentId}.dec`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },
};
