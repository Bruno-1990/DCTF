/**
 * Serviço para buscar dados de conferências (Nova estrutura modular)
 */

import api from './api';

export interface ClienteSemDCTFVigente {
  id: string;
  cnpj: string;
  razao_social: string;
  regime_tributario?: string | null;
  competencia_vigente: string;
  vencimento: string;
  diasAteVencimento: number;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

export interface ClienteSemDCTFComMovimento {
  cnpj: string;
  razao_social: string;
  regime_tributario?: string | null;
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

export interface DCTFEmAndamento {
  id: string;
  cnpj: string;
  razao_social: string | null;
  periodo_apuracao: string;
  situacao: string | null;
  tipo: string | null;
  data_transmissao: string | null;
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

export interface BaseLegal {
  norma: string;
  descricao: string;
}

export interface ModuloMeta {
  baseLegal?: BaseLegal;
  recomendacao?: string;
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
    dctfsEmAndamento: DCTFEmAndamento[];
    clientesDispensadosDCTF: ClienteDispensadoDCTF[];
  };
  modulosMeta?: {
    clientesSemDCTFVigente: ModuloMeta;
    clientesSemDCTFComMovimento: ModuloMeta;
    dctfsForaDoPrazo: ModuloMeta;
    dctfsPeriodoInconsistente: ModuloMeta;
    clientesSemMovimentacao: ModuloMeta;
    dctfsEmAndamento: ModuloMeta;
    clientesDispensadosDCTF: ModuloMeta;
  };
  estatisticas: {
    totalClientesSemDCTFVigente: number;
    totalClientesSemDCTFComMovimento: number;
    totalDCTFsForaDoPrazo: number;
    totalDCTFsPeriodoInconsistente: number;
    totalClientesSemMovimentacao: number;
    totalDCTFsEmAndamento: number;
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

/**
 * Envia email com o relatório "Clientes sem DCTF mas com Movimento" (corpo HTML formatado).
 * Reutiliza a mesma lógica de validação de destinatário do envio de DCTFs em andamento.
 * @param to - Email completo ou apenas o nome (sufixo @central-rnc.com.br aplicado no backend se faltar)
 */
export async function sendEmailSemDCTFComMovimento(to: string): Promise<{ success: boolean; message: string; total?: number }> {
  const response = await api.post<{ success: boolean; message: string; data?: { total: number; destinatario: string } }>(
    '/conferencias/send-email-sem-dctf-com-movimento',
    { to: to.trim() }
  );
  return {
    success: response.data.success,
    message: response.data.message,
    total: response.data.data?.total,
  };
}



