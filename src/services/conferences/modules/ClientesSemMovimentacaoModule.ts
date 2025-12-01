/**
 * MÓDULO: Clientes Cadastrados sem Movimentação há mais de 12 meses
 * 
 * Objetivo: Identificar clientes cadastrados que não têm movimentação registrada
 * no sistema SCI há mais de 12 meses.
 * 
 * Regra: Cliente sem movimentação em host_dados há mais de 12 meses pode estar
 * inativo e pode não precisar enviar DCTF (dependendo da situação).
 * 
 * Fonte de dados: MySQL (tabelas clientes e host_dados)
 */

import { randomUUID } from 'crypto';
import { executeQuery } from '../../../config/mysql';
import { normalizarCNPJ, formatarCNPJ } from '../utils/cnpjUtils';

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

/**
 * Lista clientes sem movimentação há mais de 12 meses
 */
export async function listarClientesSemMovimentacao(): Promise<ClienteSemMovimentacao[]> {
  try {
    console.log('[Conferência - Clientes sem Movimentação] 🔍 Iniciando análise...');
    
    const hoje = new Date();
    const limite12Meses = new Date(hoje);
    limite12Meses.setMonth(limite12Meses.getMonth() - 12);
    
    // Buscar clientes e suas últimas movimentações
    // host_dados tem campos ano e mes separados, não uma data
    const limiteAno = limite12Meses.getFullYear();
    const limiteMes = limite12Meses.getMonth() + 1;
    
    // Buscar última movimentação por cliente
    const clientes = await executeQuery<{
      cnpj_limpo: string;
      razao_social: string;
      ultima_movimentacao: string | null;
      ultima_dctf: string | null;
    }>(
      `
      SELECT 
        c.cnpj_limpo,
        c.razao_social,
        CASE 
          WHEN ult_mov.ano IS NOT NULL THEN CONCAT(ult_mov.ano, '-', LPAD(ult_mov.mes, 2, '0'), '-01')
          ELSE NULL
        END AS ultima_movimentacao,
        MAX(d.data_transmissao) AS ultima_dctf
      FROM clientes c
      LEFT JOIN (
        SELECT 
          REPLACE(REPLACE(REPLACE(COALESCE(cnpj, ''), '.', ''), '/', ''), '-', '') AS cnpj_limpo,
          CAST(SUBSTRING_INDEX(MAX(CONCAT(LPAD(ano, 4, '0'), '-', LPAD(mes, 2, '0'))), '-', 1) AS UNSIGNED) AS ano,
          CAST(SUBSTRING_INDEX(MAX(CONCAT(LPAD(ano, 4, '0'), '-', LPAD(mes, 2, '0'))), '-', -1) AS UNSIGNED) AS mes
        FROM host_dados
        GROUP BY REPLACE(REPLACE(REPLACE(COALESCE(cnpj, ''), '.', ''), '/', ''), '-', '')
      ) ult_mov ON ult_mov.cnpj_limpo = c.cnpj_limpo
      LEFT JOIN dctf_declaracoes d ON REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '') = c.cnpj_limpo
      GROUP BY c.cnpj_limpo, c.razao_social, ult_mov.ano, ult_mov.mes
      HAVING ultima_movimentacao IS NULL 
         OR (ult_mov.ano < ? OR (ult_mov.ano = ? AND ult_mov.mes < ?))
      ORDER BY (ult_mov.ano IS NULL), ult_mov.ano ASC, (ult_mov.mes IS NULL), ult_mov.mes ASC
      `,
      [limiteAno, limiteAno, limiteMes]
    );
    
    console.log(`[Conferência - Clientes sem Movimentação] 📊 Total de clientes encontrados: ${clientes.length}`);
    
    const clientesSemMovimentacao: ClienteSemMovimentacao[] = [];
    
    for (const cliente of clientes) {
      const cnpjNormalizado = normalizarCNPJ(cliente.cnpj_limpo);
      if (!cnpjNormalizado) continue;
      
      let mesesSemMovimentacao = 999; // Se nunca teve movimentação
      let ultimaMovimentacaoDate: Date | null = null;
      
      if (cliente.ultima_movimentacao) {
        ultimaMovimentacaoDate = new Date(cliente.ultima_movimentacao);
        const diffTime = hoje.getTime() - ultimaMovimentacaoDate.getTime();
        mesesSemMovimentacao = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
      }
      
      // Determinar severidade
      let severidade: 'high' | 'medium' | 'low' = 'low';
      if (mesesSemMovimentacao > 24) {
        severidade = 'high';
      } else if (mesesSemMovimentacao > 18) {
        severidade = 'medium';
      }
      
      const mensagem = cliente.ultima_movimentacao
        ? `Cliente sem movimentação há ${mesesSemMovimentacao} meses. Última movimentação: ${ultimaMovimentacaoDate?.toLocaleDateString('pt-BR')}.`
        : 'Cliente cadastrado mas nunca teve movimentação registrada no sistema.';
      
      clientesSemMovimentacao.push({
        id: randomUUID(),
        cnpj: formatarCNPJ(cnpjNormalizado),
        razao_social: cliente.razao_social,
        ultima_movimentacao: cliente.ultima_movimentacao,
        meses_sem_movimentacao: mesesSemMovimentacao,
        ultima_dctf: cliente.ultima_dctf,
        severidade,
        mensagem,
      });
    }
    
    console.log(`[Conferência - Clientes sem Movimentação] ⚠️ Clientes sem movimentação há mais de 12 meses: ${clientesSemMovimentacao.length}`);
    
    return clientesSemMovimentacao.sort((a, b) => b.meses_sem_movimentacao - a.meses_sem_movimentacao);
  } catch (error: any) {
    console.error('[Conferência - Clientes sem Movimentação] ❌ Erro:', error);
    throw error;
  }
}

