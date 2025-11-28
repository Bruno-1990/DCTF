/**
 * SERVIÇO PRINCIPAL DE CONFERÊNCIAS - ESTRUTURA MODULAR
 * 
 * Este serviço orquestra todos os módulos de conferência de forma organizada.
 * Cada módulo é responsável por uma verificação específica.
 */

import { listarClientesSemDCTFVigente, ClienteSemDCTFVigente } from './modules/ClientesSemDCTFVigenteModule';
import { listarClientesSemDCTFComMovimento, ClienteSemDCTFComMovimento } from './modules/ClientesSemDCTFComMovimentoModule';

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
  };
  estatisticas: {
    totalClientesSemDCTFVigente: number;
    totalClientesSemDCTFComMovimento: number;
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
  
  // Executar todos os módulos em paralelo
  const [
    clientesSemDCTFVigente,
    clientesSemDCTFComMovimento,
  ] = await Promise.all([
    listarClientesSemDCTFVigente(),
    listarClientesSemDCTFComMovimento(competenciaAno, competenciaMes),
  ]);
  
  const totalIssues = 
    clientesSemDCTFVigente.length + 
    clientesSemDCTFComMovimento.length;
  
  console.log('\n========== RESUMO DAS CONFERÊNCIAS ==========');
  console.log(`[Conferências] 📊 Módulo 1 - Clientes sem DCTF vigente: ${clientesSemDCTFVigente.length}`);
  console.log(`[Conferências] 📊 Módulo 2 - Clientes sem DCTF com movimento: ${clientesSemDCTFComMovimento.length}`);
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
    },
    estatisticas: {
      totalClientesSemDCTFVigente: clientesSemDCTFVigente.length,
      totalClientesSemDCTFComMovimento: clientesSemDCTFComMovimento.length,
      totalIssues,
    },
  };
}






