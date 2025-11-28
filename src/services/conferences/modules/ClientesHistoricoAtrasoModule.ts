/**
 * MÓDULO: Clientes com Histórico de Atraso
 * 
 * Objetivo: Identificar clientes que têm histórico de envio de DCTF após o prazo legal.
 * 
 * Regra: Cliente que enviou múltiplas DCTFs fora do prazo nos últimos 12 meses
 * tem histórico de atraso e requer atenção especial.
 * 
 * IMPORTANTE: Considera apenas DCTFs do tipo "Original". 
 * DCTFs do tipo "Retificadora" são desconsideradas.
 * 
 * Fonte de dados: MySQL (tabela dctf_declaracoes)
 * Baseado em: IN RFB 1.787/2018
 */

import { randomUUID } from 'crypto';
import { executeQuery } from '../../../config/mysql';
import { calcularVencimento, parsePeriodo } from '../utils/dateUtils';
import { normalizarCNPJ, formatarCNPJ } from '../utils/cnpjUtils';

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

/**
 * Lista clientes com histórico de atraso
 */
export async function listarClientesHistoricoAtraso(): Promise<ClienteHistoricoAtraso[]> {
  try {
    console.log('[Conferência - Clientes com Histórico de Atraso] 🔍 Iniciando análise...');
    
    const hoje = new Date();
    const limite12Meses = new Date(hoje);
    limite12Meses.setMonth(limite12Meses.getMonth() - 12);
    
    // Buscar todas as DCTFs dos últimos 12 meses
    // IMPORTANTE: Considerar apenas DCTFs do tipo "Original" (excluir "Retificadora")
    const dctfs = await executeQuery<{
      cnpj: string;
      periodo_apuracao: string | null;
      data_transmissao: string | null;
      tipo: string | null;
      razao_social: string | null;
    }>(
      `
      SELECT 
        d.cnpj,
        d.periodo_apuracao,
        d.data_transmissao,
        d.tipo,
        c.razao_social
      FROM dctf_declaracoes d
      LEFT JOIN clientes c ON REPLACE(REPLACE(REPLACE(COALESCE(c.cnpj_limpo, ''), '.', ''), '/', ''), '-', '') = REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '')
      WHERE d.data_transmissao IS NOT NULL
        AND d.data_transmissao >= ?
        AND d.periodo_apuracao IS NOT NULL
        AND TRIM(d.periodo_apuracao) != ''
        AND (d.tipo IS NULL OR UPPER(d.tipo) NOT LIKE '%RETIFICADORA%')
      ORDER BY d.cnpj, d.data_transmissao DESC
      `,
      [limite12Meses.toISOString().split('T')[0]]
    );
    
    console.log(`[Conferência - Clientes com Histórico de Atraso] 📊 Total de DCTFs encontradas: ${dctfs.length}`);
    
    // Agrupar por CNPJ e analisar atrasos
    const clientesMap = new Map<string, {
      cnpj: string;
      razao_social: string | null;
      dctfs: Array<{ periodo: string; dataTransmissao: Date; diasAtraso: number }>;
    }>();
    
    for (const dctf of dctfs) {
      if (!dctf.periodo_apuracao || !dctf.data_transmissao) continue;
      
      // Desconsiderar DCTFs retificadoras (filtro adicional de segurança)
      if (dctf.tipo && dctf.tipo.toUpperCase().includes('RETIFICADORA')) {
        continue;
      }
      
      const cnpjNormalizado = normalizarCNPJ(dctf.cnpj);
      if (!cnpjNormalizado) continue;
      
      const periodoParsed = parsePeriodo(dctf.periodo_apuracao);
      if (!periodoParsed) continue;
      
      const dataTransmissao = new Date(dctf.data_transmissao);
      const vencimento = calcularVencimento(periodoParsed.ano, periodoParsed.mes);
      
      // Verificar se foi enviada após o vencimento
      if (dataTransmissao > vencimento) {
        const diasAtraso = Math.floor((dataTransmissao.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
        
        if (!clientesMap.has(cnpjNormalizado)) {
          clientesMap.set(cnpjNormalizado, {
            cnpj: cnpjNormalizado,
            razao_social: dctf.razao_social,
            dctfs: [],
          });
        }
        
        const cliente = clientesMap.get(cnpjNormalizado)!;
        cliente.dctfs.push({
          periodo: dctf.periodo_apuracao,
          dataTransmissao,
          diasAtraso,
        });
      }
    }
    
    // Buscar total de DCTFs por cliente (para calcular percentual)
    // IMPORTANTE: Considerar apenas DCTFs do tipo "Original" (excluir "Retificadora")
    const totalDCTFsPorCliente = await executeQuery<{
      cnpj: string;
      total: number;
    }>(
      `
      SELECT 
        REPLACE(REPLACE(REPLACE(COALESCE(cnpj, ''), '.', ''), '/', ''), '-', '') AS cnpj,
        COUNT(*) AS total
      FROM dctf_declaracoes
      WHERE data_transmissao IS NOT NULL
        AND data_transmissao >= ?
        AND cnpj IS NOT NULL
        AND (tipo IS NULL OR UPPER(tipo) NOT LIKE '%RETIFICADORA%')
      GROUP BY REPLACE(REPLACE(REPLACE(COALESCE(cnpj, ''), '.', ''), '/', ''), '-', '')
      `,
      [limite12Meses.toISOString().split('T')[0]]
    );
    
    const totalDCTFsMap = new Map<string, number>();
    for (const item of totalDCTFsPorCliente) {
      const cnpjNormalizado = normalizarCNPJ(item.cnpj);
      if (cnpjNormalizado) {
        totalDCTFsMap.set(cnpjNormalizado, item.total);
      }
    }
    
    // Gerar lista de clientes com histórico de atraso
    const clientesComAtraso: ClienteHistoricoAtraso[] = [];
    
    for (const [cnpj, dados] of clientesMap.entries()) {
      if (dados.dctfs.length === 0) continue;
      
      const totalDCTFs = totalDCTFsMap.get(cnpj) || dados.dctfs.length;
      const percentualAtraso = (dados.dctfs.length / totalDCTFs) * 100;
      const diasAtrasoMedio = Math.round(
        dados.dctfs.reduce((sum, d) => sum + d.diasAtraso, 0) / dados.dctfs.length
      );
      
      // Determinar severidade
      let severidade: 'high' | 'medium' | 'low' = 'low';
      if (dados.dctfs.length >= 3 || percentualAtraso >= 50) {
        severidade = 'high';
      } else if (dados.dctfs.length >= 2 || percentualAtraso >= 30) {
        severidade = 'medium';
      }
      
      const ultimaAtrasada = dados.dctfs[0];
      
      clientesComAtraso.push({
        id: randomUUID(),
        cnpj: formatarCNPJ(cnpj),
        razao_social: dados.razao_social,
        total_dctfs_atrasadas: dados.dctfs.length,
        total_dctfs: totalDCTFs,
        percentual_atraso: Math.round(percentualAtraso * 10) / 10,
        ultima_dctf_atrasada: ultimaAtrasada.dataTransmissao.toISOString(),
        dias_atraso_medio: diasAtrasoMedio,
        severidade,
        mensagem: `${dados.dctfs.length} de ${totalDCTFs} DCTF${totalDCTFs !== 1 ? 's' : ''} enviada${dados.dctfs.length !== 1 ? 's' : ''} fora do prazo nos últimos 12 meses (${Math.round(percentualAtraso * 10) / 10}%). Atraso médio: ${diasAtrasoMedio} dias.`,
      });
    }
    
    console.log(`[Conferência - Clientes com Histórico de Atraso] ⚠️ Clientes com histórico de atraso: ${clientesComAtraso.length}`);
    
    return clientesComAtraso.sort((a, b) => b.total_dctfs_atrasadas - a.total_dctfs_atrasadas);
  } catch (error: any) {
    console.error('[Conferência - Clientes com Histórico de Atraso] ❌ Erro:', error);
    throw error;
  }
}

