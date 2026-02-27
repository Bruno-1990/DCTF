/**
 * SERVIÇO PRINCIPAL DE CONFERÊNCIAS - ESTRUTURA MODULAR
 *
 * Este serviço orquestra todos os módulos de conferência de forma organizada.
 * Cada módulo é responsável por uma verificação específica.
 */

import { listarClientesSemDCTFVigente, ClienteSemDCTFVigente } from './modules/ClientesSemDCTFVigenteModule';
import { listarClientesSemDCTFComMovimento, ClienteSemDCTFComMovimento } from './modules/ClientesSemDCTFComMovimentoModule';
import { listarDCTFsForaDoPrazo, DCTFForaDoPrazo } from './modules/DCTFsForaDoPrazoModule';
import { listarDCTFsPeriodoInconsistente, DCTFPeriodoInconsistente } from './modules/DCTFsPeriodoInconsistenteModule';
import { listarClientesSemMovimentacao, ClienteSemMovimentacao } from './modules/ClientesSemMovimentacaoModule';
import { listarDCTFsEmAndamento, DCTFEmAndamento } from './modules/ClientesEmAndamentoModule';
import { listarClientesDispensadosDCTF, ClienteDispensadoDCTF } from './modules/ClientesDispensadosDCTFModule';
import type { BaseLegal } from './legislacao-dctf';
import {
  BASE_LEGAL_SEM_DCTF_VIGENTE,
  BASE_LEGAL_SEM_DCTF_COM_MOVIMENTO,
  BASE_LEGAL_FORA_DO_PRAZO,
  BASE_LEGAL_PERIODO_INCONSISTENTE,
  BASE_LEGAL_SEM_MOVIMENTACAO,
  BASE_LEGAL_EM_ANDAMENTO,
  BASE_LEGAL_DISPENSADOS,
  getRecomendacaoSemDCTFVigente,
  RECOMENDACAO_SEM_DCTF_COM_MOVIMENTO,
  RECOMENDACAO_FORA_DO_PRAZO,
  RECOMENDACAO_PERIODO_INCONSISTENTE,
  RECOMENDACAO_SEM_MOVIMENTACAO,
  RECOMENDACAO_EM_ANDAMENTO,
  RECOMENDACAO_DISPENSADOS,
} from './legislacao-dctf';
import { calcularVencimento } from './utils/dateUtils';

export interface ModuloMeta {
  baseLegal?: BaseLegal;
  recomendacao?: string;
}

export interface ConferenceSummary {
  generatedAt: string;
  competenciaVigente: {
    mes: number;
    ano: number;
    competencia: string; // MM/YYYY
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
  /** Base legal e recomendação por módulo, para exibição no frontend. */
  modulosMeta: {
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
 * Gera o resumo completo de conferências usando todos os módulos
 */
export async function gerarResumoConferencias(): Promise<ConferenceSummary> {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const competenciaMes = currentMonth === 1 ? 12 : currentMonth - 1;
  const competenciaAno = currentMonth === 1 ? currentYear - 1 : currentYear;
  const competencia = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
  
  console.log('\n========== INICIANDO CONFERÊNCIAS ==========');
  console.log(`[Conferências] 📅 Competência vigente: ${competencia}`);
  console.log(`[Conferências] 🔄 Consultando apenas MySQL (não Supabase)\n`);
  
  // Executar todos os módulos em paralelo com tratamento de erro individual
  const results = await Promise.allSettled([
    listarClientesSemDCTFVigente(),
    listarClientesSemDCTFComMovimento(competenciaAno, competenciaMes),
    listarDCTFsForaDoPrazo(),
    listarDCTFsPeriodoInconsistente(),
    listarClientesSemMovimentacao(),
    listarDCTFsEmAndamento(),
    listarClientesDispensadosDCTF(),
  ]);

  // Extrair resultados com tratamento de erro individual
  const getResult = <T extends any[]>(result: PromiseSettledResult<T>, moduleName: string): T => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`[Conferências] Erro no módulo ${moduleName}:`, result.reason);
      return [] as T;
    }
  };

  const clientesSemDCTFVigente = getResult<ClienteSemDCTFVigente[]>(results[0], 'ClientesSemDCTFVigente');
  const clientesSemDCTFComMovimento = getResult<ClienteSemDCTFComMovimento[]>(results[1], 'ClientesSemDCTFComMovimento');
  const dctfsForaDoPrazo = getResult<DCTFForaDoPrazo[]>(results[2], 'DCTFsForaDoPrazo');
  const dctfsPeriodoInconsistente = getResult<DCTFPeriodoInconsistente[]>(results[3], 'DCTFsPeriodoInconsistente');
  const clientesSemMovimentacao = getResult<ClienteSemMovimentacao[]>(results[4], 'ClientesSemMovimentacao');
  const dctfsEmAndamento = getResult<DCTFEmAndamento[]>(results[5], 'DCTFsEmAndamento');
  const clientesDispensadosDCTF = getResult<ClienteDispensadoDCTF[]>(results[6], 'ClientesDispensadosDCTF');
  
  const totalIssues = 
    clientesSemDCTFVigente.length + 
    clientesSemDCTFComMovimento.length +
    dctfsForaDoPrazo.length +
    dctfsPeriodoInconsistente.length +
    clientesSemMovimentacao.length +
    dctfsEmAndamento.length;
  // Nota: clientesDispensadosDCTF não conta como "issue", é apenas informativo
  
  console.log('\n========== RESUMO DAS CONFERÊNCIAS ==========');
  console.log(`[Conferências] 📊 Módulo 1 - Clientes sem DCTF vigente: ${clientesSemDCTFVigente.length}`);
  console.log(`[Conferências] 📊 Módulo 2 - Clientes sem DCTF com movimento: ${clientesSemDCTFComMovimento.length}`);
  console.log(`[Conferências] 📊 Módulo 2.1 - DCTFs enviadas fora do prazo: ${dctfsForaDoPrazo.length}`);
  console.log(`[Conferências] 📊 Módulo 2.2 - DCTFs com período inconsistente: ${dctfsPeriodoInconsistente.length}`);
  console.log(`[Conferências] 📊 Módulo 5.1 - Clientes sem movimentação há mais de 12 meses: ${clientesSemMovimentacao.length}`);
  console.log(`[Conferências] 📊 Módulo 6.2 - Em Andamento: ${dctfsEmAndamento.length}`);
  console.log(`[Conferências] 📊 Módulo 7 - Clientes dispensados de DCTF: ${clientesDispensadosDCTF.length}`);
  console.log(`[Conferências] 📊 Total de issues: ${totalIssues}`);
  console.log('========== FIM DAS CONFERÊNCIAS ==========\n');

  const vencimentoDate = calcularVencimento(competenciaAno, competenciaMes);
  const vencimentoFormatado =
    String(vencimentoDate.getUTCDate()).padStart(2, '0') +
    '/' +
    String(vencimentoDate.getUTCMonth() + 1).padStart(2, '0') +
    '/' +
    vencimentoDate.getUTCFullYear();

  return {
    generatedAt: today.toISOString(),
    competenciaVigente: {
      mes: competenciaMes,
      ano: competenciaAno,
      competencia,
    },
    modulos: {
      clientesSemDCTFVigente,
      clientesSemDCTFComMovimento,
      dctfsForaDoPrazo,
      dctfsPeriodoInconsistente,
      clientesSemMovimentacao,
      dctfsEmAndamento,
      clientesDispensadosDCTF,
    },
    modulosMeta: {
      clientesSemDCTFVigente: {
        baseLegal: BASE_LEGAL_SEM_DCTF_VIGENTE,
        recomendacao: getRecomendacaoSemDCTFVigente(competencia, vencimentoFormatado),
      },
      clientesSemDCTFComMovimento: {
        baseLegal: BASE_LEGAL_SEM_DCTF_COM_MOVIMENTO,
        recomendacao: RECOMENDACAO_SEM_DCTF_COM_MOVIMENTO,
      },
      dctfsForaDoPrazo: {
        baseLegal: BASE_LEGAL_FORA_DO_PRAZO,
        recomendacao: RECOMENDACAO_FORA_DO_PRAZO,
      },
      dctfsPeriodoInconsistente: {
        baseLegal: BASE_LEGAL_PERIODO_INCONSISTENTE,
        recomendacao: RECOMENDACAO_PERIODO_INCONSISTENTE,
      },
      clientesSemMovimentacao: {
        baseLegal: BASE_LEGAL_SEM_MOVIMENTACAO,
        recomendacao: RECOMENDACAO_SEM_MOVIMENTACAO,
      },
      dctfsEmAndamento: {
        baseLegal: BASE_LEGAL_EM_ANDAMENTO,
        recomendacao: RECOMENDACAO_EM_ANDAMENTO,
      },
      clientesDispensadosDCTF: {
        baseLegal: BASE_LEGAL_DISPENSADOS,
        recomendacao: RECOMENDACAO_DISPENSADOS,
      },
    },
    estatisticas: {
      totalClientesSemDCTFVigente: clientesSemDCTFVigente.length,
      totalClientesSemDCTFComMovimento: clientesSemDCTFComMovimento.length,
      totalDCTFsForaDoPrazo: dctfsForaDoPrazo.length,
      totalDCTFsPeriodoInconsistente: dctfsPeriodoInconsistente.length,
      totalClientesSemMovimentacao: clientesSemMovimentacao.length,
      totalDCTFsEmAndamento: dctfsEmAndamento.length,
      totalClientesDispensadosDCTF: clientesDispensadosDCTF.length,
      totalIssues,
    },
  };
}







