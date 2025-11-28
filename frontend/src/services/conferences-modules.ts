/**
 * Serviço para buscar dados de conferências (Nova estrutura modular)
 */

import api from './api';

export interface ClienteSemDCTFVigente {
  id: string;
  cnpj: string;
  razao_social: string;
  competencia_vigente: string;
  vencimento: string;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

export interface ClienteSemDCTFComMovimento {
  cnpj: string;
  razao_social: string;
  cod_emp: number | null;
  competencia_obrigacao: string;
  competencia_movimento: string;
  ano_movimento: number;
  mes_movimento: number;
  tipos_movimento: string[];
  total_movimentacoes: number;
  prazoVencimento: string;
  diasAteVencimento: number;
  possivelObrigacaoEnvio: boolean;
  motivoObrigacao?: string;
}

export interface DCTFForaDoPrazo {
  id: string;
  cnpj: string;
  razao_social: string | null;
  periodo_apuracao: string;
  data_transmissao: string;
  data_vencimento: string;
  dias_atraso: number;
  situacao: string | null;
  tipo: string | null;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

export interface DCTFPeriodoInconsistente {
  id: string;
  cnpj: string;
  razao_social: string | null;
  periodo_apuracao: string;
  periodo_esperado: string;
  data_transmissao: string;
  situacao: string | null;
  tipo: string | null;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

export interface ClienteSemMovimentacao {
  id: string;
  cnpj: string;
  razao_social: string;
  ultima_movimentacao: string | null;
  meses_sem_movimentacao: number;
  ultima_dctf: string | null;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

export interface ClienteHistoricoAtraso {
  id: string;
  cnpj: string;
  razao_social: string | null;
  total_dctfs_atrasadas: number;
  total_dctfs: number;
  percentual_atraso: number;
  ultima_dctf_atrasada: string | null;
  dias_atraso_medio: number;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

export interface ClienteDispensadoDCTF {
  id: string;
  cnpj: string;
  razao_social: string;
  periodo_original_sem_movimento: string;
  data_transmissao_original: string;
  competencia_vigente: string;
  tem_movimentacao_atual: boolean;
  mensagem: string;
}

export interface ConferenceSummary {
  generatedAt: string;
  competenciaVigente: {
    mes: number;
    ano: number;
    competencia: string;
  };
  modulos: {
    clientesSemDCTFVigente: ClienteSemDCTFVigente[];
    clientesSemDCTFComMovimento: ClienteSemDCTFComMovimento[];
    dctfsForaDoPrazo: DCTFForaDoPrazo[];
    dctfsPeriodoInconsistente: DCTFPeriodoInconsistente[];
    clientesSemMovimentacao: ClienteSemMovimentacao[];
    clientesHistoricoAtraso: ClienteHistoricoAtraso[];
    clientesDispensadosDCTF: ClienteDispensadoDCTF[];
  };
  estatisticas: {
    totalClientesSemDCTFVigente: number;
    totalClientesSemDCTFComMovimento: number;
    totalDCTFsForaDoPrazo: number;
    totalDCTFsPeriodoInconsistente: number;
    totalClientesSemMovimentacao: number;
    totalClientesHistoricoAtraso: number;
    totalClientesDispensadosDCTF: number;
    totalIssues: number;
  };
}

/**
 * Busca o resumo completo de conferências
 */
export async function fetchConferenceSummary(): Promise<ConferenceSummary> {
  try {
    const response = await api.get('/conferencias/summary');
    return response.data.data; // A resposta vem como { success: true, data: {...} }
  } catch (error: any) {
    console.error('Erro ao buscar conferências:', error);
    if (error.response) {
      // Erro da API
      throw new Error(error.response.data?.error || `Erro ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      // Requisição feita mas sem resposta
      throw new Error('Erro ao conectar com o servidor. Verifique se o backend está rodando.');
    } else {
      // Erro ao configurar a requisição
      throw new Error(error.message || 'Erro desconhecido ao carregar conferências.');
    }
  }
}






