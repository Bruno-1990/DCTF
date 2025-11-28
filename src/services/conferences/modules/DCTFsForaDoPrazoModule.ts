/**
 * MÓDULO: DCTFs Enviadas Fora do Prazo
 * 
 * Objetivo: Identificar DCTFs que foram enviadas após o prazo legal de vencimento.
 * 
 * Regra: DCTF da competência X deve ser enviada até o último dia útil do mês X+1.
 * Se a data de transmissão for posterior ao vencimento, está fora do prazo.
 * 
 * IMPORTANTE: Considera apenas DCTFs do tipo "Original". 
 * DCTFs do tipo "Retificadora" são desconsideradas.
 * 
 * Fonte de dados: MySQL (tabela dctf_declaracoes)
 * Baseado em: IN RFB 1.787/2018
 */

import { randomUUID } from 'crypto';
import { executeQuery } from '../../../config/mysql';
import { calcularVencimento, calcularDiasAteVencimento, parsePeriodo, formatarPeriodo } from '../utils/dateUtils';
import { normalizarCNPJ, formatarCNPJ } from '../utils/cnpjUtils';

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

/**
 * Lista DCTFs enviadas fora do prazo
 */
export async function listarDCTFsForaDoPrazo(): Promise<DCTFForaDoPrazo[]> {
  try {
    console.log('[Conferência - DCTFs Fora do Prazo] 🔍 Iniciando análise...');
    
    // Buscar todas as DCTFs com data de transmissão
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
    
    console.log(`[Conferência - DCTFs Fora do Prazo] 📊 Total de DCTFs encontradas: ${dctfs.length}`);
    
    const hoje = new Date();
    const dctfsForaDoPrazo: DCTFForaDoPrazo[] = [];
    
    for (const dctf of dctfs) {
      if (!dctf.periodo_apuracao || !dctf.data_transmissao) continue;
      
      // Desconsiderar DCTFs retificadoras (filtro adicional de segurança)
      if (dctf.tipo && dctf.tipo.toUpperCase().includes('RETIFICADORA')) {
        continue;
      }
      
      // Parse do período
      const periodoParsed = parsePeriodo(dctf.periodo_apuracao);
      if (!periodoParsed) continue;
      
      // Calcular vencimento (último dia útil do mês seguinte)
      const vencimento = calcularVencimento(periodoParsed.ano, periodoParsed.mes);
      const dataTransmissao = new Date(dctf.data_transmissao);
      
      // Verificar se foi enviada após o vencimento
      if (dataTransmissao > vencimento) {
        const diasAtraso = Math.floor((dataTransmissao.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
        
        // Determinar severidade
        let severidade: 'high' | 'medium' | 'low' = 'low';
        if (diasAtraso > 30) {
          severidade = 'high';
        } else if (diasAtraso > 10) {
          severidade = 'medium';
        }
        
        const cnpjNormalizado = normalizarCNPJ(dctf.cnpj);
        if (!cnpjNormalizado) continue;
        
        dctfsForaDoPrazo.push({
          id: randomUUID(),
          cnpj: formatarCNPJ(cnpjNormalizado),
          razao_social: dctf.razao_social,
          periodo_apuracao: dctf.periodo_apuracao,
          data_transmissao: dataTransmissao.toISOString(),
          data_vencimento: vencimento.toISOString(),
          dias_atraso: diasAtraso,
          situacao: dctf.situacao,
          tipo: dctf.tipo,
          severidade,
          mensagem: `DCTF enviada com ${diasAtraso} dia${diasAtraso !== 1 ? 's' : ''} de atraso. Prazo: ${vencimento.toLocaleDateString('pt-BR')}, Enviada: ${dataTransmissao.toLocaleDateString('pt-BR')}`,
        });
      }
    }
    
    console.log(`[Conferência - DCTFs Fora do Prazo] ⚠️ DCTFs fora do prazo encontradas: ${dctfsForaDoPrazo.length}`);
    
    return dctfsForaDoPrazo.sort((a, b) => b.dias_atraso - a.dias_atraso);
  } catch (error: any) {
    console.error('[Conferência - DCTFs Fora do Prazo] ❌ Erro:', error);
    throw error;
  }
}

