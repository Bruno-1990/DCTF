/**
 * Serviço API do módulo IRPF Produção (PRD-IRPF-001)
 * Base: /api/irpf-producao
 */

import api from './api';

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
};
