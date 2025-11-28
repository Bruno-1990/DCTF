/**
 * MÓDULO: Clientes Dispensados de Transmitir DCTF
 * 
 * Identifica clientes que NÃO têm obrigação de transmitir DCTF na competência vigente porque:
 * 1. Têm uma DCTF do tipo "Original sem movimento" em uma vigência passada
 * 2. E não tiveram movimentação no mês atual (competência vigente)
 * 
 * Conforme IN RFB 2.237/2024, Art. 3º, § 3º: após transmitir "Original sem movimento",
 * os meses seguintes não terão obrigação até retomar movimento.
 */

import { randomUUID } from 'crypto';
import { executeQuery } from '../../../config/mysql';
import { calcularCompetenciaVigente, parsePeriodo, formatarPeriodo } from '../utils/dateUtils';
import { normalizarCNPJ, formatarCNPJ } from '../utils/cnpjUtils';

export interface ClienteDispensadoDCTF {
  id: string;
  cnpj: string;
  razao_social: string;
  periodo_original_sem_movimento: string; // Período da DCTF "Original sem movimento"
  data_transmissao_original: string; // Data de transmissão da DCTF "Original sem movimento"
  competencia_vigente: string; // Competência atual (mês anterior)
  tem_movimentacao_atual: boolean; // Se tem movimentação na competência vigente
  mensagem: string;
}

/**
 * Lista clientes dispensados de transmitir DCTF na competência vigente
 */
export async function listarClientesDispensadosDCTF(): Promise<ClienteDispensadoDCTF[]> {
  try {
    console.log('[Conferência - Clientes Dispensados DCTF] 🔍 Iniciando análise...');

    const today = new Date();
    const { mes: competenciaMes, ano: competenciaAno, competencia, periodoSql } = calcularCompetenciaVigente(today);
    
    console.log(`[Conferência - Clientes Dispensados DCTF] 📅 Competência vigente: ${competencia}`);
    console.log(`[Conferência - Clientes Dispensados DCTF] 📅 Período SQL: ${periodoSql}`);

    // Buscar clientes que:
    // 1. Têm DCTF "Original sem movimento" em vigência passada
    // 2. NÃO têm movimentação na competência vigente
    // 3. NÃO têm DCTF na competência vigente (porque estão dispensados)
    const clientes = await executeQuery<{
      cnpj: string;
      razao_social: string;
      periodo_original_sem_movimento: string;
      data_transmissao_original: string;
      tem_movimentacao_atual: number; // 0 ou 1
    }>(
      `
      SELECT DISTINCT
        c.cnpj_limpo AS cnpj,
        c.razao_social,
        d_sm.periodo_apuracao AS periodo_original_sem_movimento,
        d_sm.data_transmissao AS data_transmissao_original,
        -- Verificar se tem movimentação na competência vigente
        CASE 
          WHEN EXISTS (
            SELECT 1
            FROM host_dados h
            WHERE (
              REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
              OR (h.cod_emp = c.cod_emp AND h.cod_emp IS NOT NULL AND c.cod_emp IS NOT NULL)
            )
            AND h.ano = ?
            AND h.mes = ?
            AND h.movimentacao > 0
          ) THEN 1
          ELSE 0
        END AS tem_movimentacao_atual
      FROM clientes c
      INNER JOIN dctf_declaracoes d_sm
        ON d_sm.cliente_id = c.id
      WHERE 
        -- DCTF do tipo "Original sem movimento"
        LOWER(d_sm.tipo) LIKE '%original%sem%movimento%'
        AND d_sm.data_transmissao IS NOT NULL
        AND (d_sm.tipo IS NULL OR UPPER(d_sm.tipo) NOT LIKE '%RETIFICADORA%')
        -- Período da DCTF "Original sem movimento" deve ser anterior à competência vigente
        AND (
          -- Formato YYYY-MM
          (d_sm.periodo_apuracao LIKE '%-%' AND (
            CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED) < ?
            OR (CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED) = ?
                AND CAST(SUBSTRING(d_sm.periodo_apuracao, 6, 2) AS UNSIGNED) < ?)
          ))
          -- Formato MM/YYYY
          OR (d_sm.periodo_apuracao LIKE '%/%' AND (
            CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED) < ?
            OR (CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED) = ?
                AND CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 2) AS UNSIGNED) < ?)
          ))
        )
        -- NÃO deve ter movimentação na competência vigente
        AND NOT EXISTS (
          SELECT 1
          FROM host_dados h
          WHERE (
            REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
            OR (h.cod_emp = c.cod_emp AND h.cod_emp IS NOT NULL AND c.cod_emp IS NOT NULL)
          )
          AND h.ano = ?
          AND h.mes = ?
          AND h.movimentacao > 0
        )
        -- NÃO deve ter DCTF na competência vigente (porque está dispensado)
        AND NOT EXISTS (
          SELECT 1
          FROM dctf_declaracoes d_vigente
          WHERE d_vigente.cliente_id = c.id
            AND (
              TRIM(d_vigente.periodo_apuracao) = ?
              OR TRIM(d_vigente.periodo_apuracao) = ?
            )
        )
        -- Verificar se não houve movimento DEPOIS do "Original sem movimento" até a competência vigente
        -- (se houve movimento depois, a dispensa foi quebrada)
        AND NOT EXISTS (
          SELECT 1
          FROM host_dados h2
          WHERE (
            REPLACE(REPLACE(REPLACE(h2.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
            OR (h2.cod_emp = c.cod_emp AND h2.cod_emp IS NOT NULL AND c.cod_emp IS NOT NULL)
          )
          AND h2.movimentacao > 0
          -- Movimento DEPOIS do período do "Original sem movimento"
          AND (
            (d_sm.periodo_apuracao LIKE '%-%' AND (
              (h2.ano > CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED))
              OR (h2.ano = CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED)
                  AND h2.mes > CAST(SUBSTRING(d_sm.periodo_apuracao, 6, 2) AS UNSIGNED))
            ))
            OR (d_sm.periodo_apuracao LIKE '%/%' AND (
              (h2.ano > CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED))
              OR (h2.ano = CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED)
                  AND h2.mes > CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 2) AS UNSIGNED))
            ))
          )
          -- E antes ou igual à competência vigente
          AND (
            (h2.ano < ?)
            OR (h2.ano = ? AND h2.mes <= ?)
          )
        )
      ORDER BY c.razao_social ASC, d_sm.periodo_apuracao DESC
      `,
      [
        // Parâmetros para verificar movimentação na competência vigente (2 placeholders)
        competenciaAno, // 1: ano da competência vigente
        competenciaMes, // 2: mês da competência vigente
        // Parâmetros para verificar se período é anterior (6 placeholders)
        competenciaAno, // 3: ano para formato YYYY-MM (<)
        competenciaAno, // 4: ano para formato YYYY-MM (=)
        competenciaMes, // 5: mês para formato YYYY-MM (<)
        competenciaAno, // 6: ano para formato MM/YYYY (<)
        competenciaAno, // 7: ano para formato MM/YYYY (=)
        competenciaMes, // 8: mês para formato MM/YYYY (<)
        // Parâmetros para NOT EXISTS movimentação vigente (2 placeholders)
        competenciaAno, // 9: ano da competência vigente
        competenciaMes, // 10: mês da competência vigente
        // Parâmetros para NOT EXISTS DCTF vigente (2 placeholders)
        periodoSql, // 11: formato YYYY-MM
        competencia, // 12: formato MM/YYYY
        // Parâmetros para NOT EXISTS movimento depois (3 placeholders)
        competenciaAno, // 13: ano da competência vigente (<)
        competenciaAno, // 14: ano da competência vigente (=)
        competenciaMes, // 15: mês da competência vigente (<=)
      ]
    );

    console.log(`[Conferência - Clientes Dispensados DCTF] 📊 Total encontrado na query: ${clientes.length}`);
    
    if (clientes.length > 0) {
      console.log(`[Conferência - Clientes Dispensados DCTF] 📋 Primeiros 3 clientes encontrados:`, 
        clientes.slice(0, 3).map(c => ({ cnpj: c.cnpj, razao: c.razao_social, periodo: c.periodo_original_sem_movimento }))
      );
    }

    const clientesDispensados: ClienteDispensadoDCTF[] = clientes.map((cliente) => {
      const cnpjNormalizado = normalizarCNPJ(cliente.cnpj);
      if (!cnpjNormalizado) {
        return null;
      }

      return {
        id: randomUUID() as string,
        cnpj: formatarCNPJ(cnpjNormalizado) || cliente.cnpj,
        razao_social: cliente.razao_social || '',
        periodo_original_sem_movimento: cliente.periodo_original_sem_movimento || '',
        data_transmissao_original: cliente.data_transmissao_original || '',
        competencia_vigente: competencia,
        tem_movimentacao_atual: cliente.tem_movimentacao_atual === 1,
        mensagem: `Cliente dispensado de transmitir DCTF para ${competencia}. Já transmitiu "Original sem movimento" em ${cliente.periodo_original_sem_movimento} e não teve movimentação no mês atual.`,
      };
    }).filter((c): c is ClienteDispensadoDCTF => c !== null);

    console.log(`[Conferência - Clientes Dispensados DCTF] ✅ Clientes dispensados: ${clientesDispensados.length}`);

    return clientesDispensados;
  } catch (error: any) {
    console.error('[Conferência - Clientes Dispensados DCTF] ❌ Erro:', error);
    throw error;
  }
}

