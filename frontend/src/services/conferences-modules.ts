/**
 * Serviço para buscar dados de conferências (Nova estrutura modular)
 */

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
  };
  estatisticas: {
    totalClientesSemDCTFVigente: number;
    totalClientesSemDCTFComMovimento: number;
    totalIssues: number;
  };
}

/**
 * Busca o resumo completo de conferências
 */
export async function fetchConferenceSummary(): Promise<ConferenceSummary> {
  try {
    const response = await fetch('/api/conferences/summary');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || errorData.message || `Erro ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    const data = await response.json();
    return data.data; // A resposta vem como { success: true, data: {...} }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro ao conectar com o servidor. Verifique se o backend está rodando.');
  }
}






