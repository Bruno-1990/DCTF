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
import { listarClientesHistoricoAtraso, ClienteHistoricoAtraso } from './modules/ClientesHistoricoAtrasoModule';
import { listarClientesDispensadosDCTF, ClienteDispensadoDCTF } from './modules/ClientesDispensadosDCTFModule';

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
    listarClientesHistoricoAtraso(),
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
  const clientesHistoricoAtraso = getResult<ClienteHistoricoAtraso[]>(results[5], 'ClientesHistoricoAtraso');
  const clientesDispensadosDCTF = getResult<ClienteDispensadoDCTF[]>(results[6], 'ClientesDispensadosDCTF');
  
  const totalIssues = 
    clientesSemDCTFVigente.length + 
    clientesSemDCTFComMovimento.length +
    dctfsForaDoPrazo.length +
    dctfsPeriodoInconsistente.length +
    clientesSemMovimentacao.length +
    clientesHistoricoAtraso.length;
  // Nota: clientesDispensadosDCTF não conta como "issue", é apenas informativo
  
  console.log('\n========== RESUMO DAS CONFERÊNCIAS ==========');
  console.log(`[Conferências] 📊 Módulo 1 - Clientes sem DCTF vigente: ${clientesSemDCTFVigente.length}`);
  console.log(`[Conferências] 📊 Módulo 2 - Clientes sem DCTF com movimento: ${clientesSemDCTFComMovimento.length}`);
  console.log(`[Conferências] 📊 Módulo 2.1 - DCTFs enviadas fora do prazo: ${dctfsForaDoPrazo.length}`);
  console.log(`[Conferências] 📊 Módulo 2.2 - DCTFs com período inconsistente: ${dctfsPeriodoInconsistente.length}`);
  console.log(`[Conferências] 📊 Módulo 5.1 - Clientes sem movimentação há mais de 12 meses: ${clientesSemMovimentacao.length}`);
  console.log(`[Conferências] 📊 Módulo 6.2 - Clientes com histórico de atraso: ${clientesHistoricoAtraso.length}`);
  console.log(`[Conferências] 📊 Módulo 7 - Clientes dispensados de DCTF: ${clientesDispensadosDCTF.length}`);
  console.log(`[Conferências] 📊 Total de issues: ${totalIssues}`);
  console.log('========== FIM DAS CONFERÊNCIAS ==========\n');
  
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
      clientesHistoricoAtraso,
      clientesDispensadosDCTF,
    },
    estatisticas: {
      totalClientesSemDCTFVigente: clientesSemDCTFVigente.length,
      totalClientesSemDCTFComMovimento: clientesSemDCTFComMovimento.length,
      totalDCTFsForaDoPrazo: dctfsForaDoPrazo.length,
      totalDCTFsPeriodoInconsistente: dctfsPeriodoInconsistente.length,
      totalClientesSemMovimentacao: clientesSemMovimentacao.length,
      totalClientesHistoricoAtraso: clientesHistoricoAtraso.length,
      totalClientesDispensadosDCTF: clientesDispensadosDCTF.length,
      totalIssues,
    },
  };
}







