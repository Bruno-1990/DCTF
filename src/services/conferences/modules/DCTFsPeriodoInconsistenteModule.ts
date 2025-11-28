/**
 * MÓDULO: DCTFs com Período de Apuração Inconsistente
 * 
 * Objetivo: Identificar DCTFs cujo período de apuração não corresponde ao esperado
 * baseado na data de transmissão.
 * 
 * Regra: DCTF transmitida no mês X deve referir-se à competência X-1 (mês anterior).
 * Se o período informado não corresponder, há inconsistência.
 * 
 * IMPORTANTE: Considera apenas DCTFs do tipo "Original". 
 * DCTFs do tipo "Retificadora" são desconsideradas.
 * 
 * Fonte de dados: MySQL (tabela dctf_declaracoes)
 * Baseado em: IN RFB 1.787/2018
 */

import { randomUUID } from 'crypto';
import { executeQuery } from '../../../config/mysql';
import { parsePeriodo, formatarPeriodo } from '../utils/dateUtils';
import { normalizarCNPJ, formatarCNPJ } from '../utils/cnpjUtils';

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

/**
 * Calcula o período esperado baseado na data de transmissão
 * DCTF transmitida no mês X deve referir-se ao mês X-1
 */
function calcularPeriodoEsperado(dataTransmissao: Date): { mes: number; ano: number; periodo: string } | null {
  const mesTransmissao = dataTransmissao.getMonth() + 1;
  const anoTransmissao = dataTransmissao.getFullYear();
  
  // Período esperado é o mês anterior à transmissão
  const mesEsperado = mesTransmissao === 1 ? 12 : mesTransmissao - 1;
  const anoEsperado = mesTransmissao === 1 ? anoTransmissao - 1 : anoTransmissao;
  
  return {
    mes: mesEsperado,
    ano: anoEsperado,
    periodo: formatarPeriodo(mesEsperado, anoEsperado),
  };
}

/**
 * Lista DCTFs com período de apuração inconsistente
 */
export async function listarDCTFsPeriodoInconsistente(): Promise<DCTFPeriodoInconsistente[]> {
  try {
    console.log('[Conferência - DCTFs Período Inconsistente] 🔍 Iniciando análise...');
    
    // Buscar todas as DCTFs com data de transmissão e período
    // IMPORTANTE: Considerar apenas DCTFs do tipo "Original" (excluir "Retificadora")
    const dctfs = await executeQuery<{
      id: string;
      cnpj: string;
      periodo_apuracao: string | null;
      data_transmissao: string | null;
      situacao: string | null;
      tipo: string | null;
      razao_social: string | null;
    }>(
      `
      SELECT 
        d.id,
        d.cnpj,
        d.periodo_apuracao,
        d.data_transmissao,
        d.situacao,
        d.tipo,
        c.razao_social
      FROM dctf_declaracoes d
      LEFT JOIN clientes c ON REPLACE(REPLACE(REPLACE(COALESCE(c.cnpj_limpo, ''), '.', ''), '/', ''), '-', '') = REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '')
      WHERE d.data_transmissao IS NOT NULL
        AND d.periodo_apuracao IS NOT NULL
        AND TRIM(d.periodo_apuracao) != ''
        AND (d.tipo IS NULL OR UPPER(d.tipo) NOT LIKE '%RETIFICADORA%')
      ORDER BY d.data_transmissao DESC
      `
    );
    
    console.log(`[Conferência - DCTFs Período Inconsistente] 📊 Total de DCTFs encontradas: ${dctfs.length}`);
    
    const dctfsInconsistentes: DCTFPeriodoInconsistente[] = [];
    
    for (const dctf of dctfs) {
      if (!dctf.periodo_apuracao || !dctf.data_transmissao) continue;
      
      // Desconsiderar DCTFs retificadoras (filtro adicional de segurança)
      if (dctf.tipo && dctf.tipo.toUpperCase().includes('RETIFICADORA')) {
        continue;
      }
      
      const dataTransmissao = new Date(dctf.data_transmissao);
      const periodoEsperado = calcularPeriodoEsperado(dataTransmissao);
      if (!periodoEsperado) continue;
      
      const periodoInformado = parsePeriodo(dctf.periodo_apuracao);
      if (!periodoInformado) continue;
      
      // Verificar se o período informado corresponde ao esperado
      const isConsistente = 
        periodoInformado.mes === periodoEsperado.mes &&
        periodoInformado.ano === periodoEsperado.ano;
      
      if (!isConsistente) {
        // Calcular diferença em meses para determinar severidade
        const diffMeses = (periodoEsperado.ano - periodoInformado.ano) * 12 + 
                         (periodoEsperado.mes - periodoInformado.mes);
        
        let severidade: 'high' | 'medium' | 'low' = 'low';
        if (Math.abs(diffMeses) > 3) {
          severidade = 'high';
        } else if (Math.abs(diffMeses) > 1) {
          severidade = 'medium';
        }
        
        const cnpjNormalizado = normalizarCNPJ(dctf.cnpj);
        if (!cnpjNormalizado) continue;
        
        dctfsInconsistentes.push({
          id: randomUUID(),
          cnpj: formatarCNPJ(cnpjNormalizado),
          razao_social: dctf.razao_social,
          periodo_apuracao: dctf.periodo_apuracao,
          periodo_esperado: periodoEsperado.periodo,
          data_transmissao: dataTransmissao.toISOString(),
          situacao: dctf.situacao,
          tipo: dctf.tipo,
          severidade,
          mensagem: `Período informado (${dctf.periodo_apuracao}) não corresponde ao esperado (${periodoEsperado.periodo}) para transmissão em ${dataTransmissao.toLocaleDateString('pt-BR')}. Diferença: ${Math.abs(diffMeses)} mês${Math.abs(diffMeses) !== 1 ? 'es' : ''}.`,
        });
      }
    }
    
    console.log(`[Conferência - DCTFs Período Inconsistente] ⚠️ DCTFs inconsistentes encontradas: ${dctfsInconsistentes.length}`);
    
    return dctfsInconsistentes;
  } catch (error: any) {
    console.error('[Conferência - DCTFs Período Inconsistente] ❌ Erro:', error);
    throw error;
  }
}

