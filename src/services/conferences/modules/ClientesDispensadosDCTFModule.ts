/**
 * MÓDULO: Clientes Dispensados de Transmitir DCTF
 * 
 * Identifica clientes que NÃO têm obrigação de transmitir DCTF na competência vigente porque:
 * 1. Têm uma DCTF do tipo "Original sem movimento" em uma vigência passada
 * 2. E não tiveram movimentação no mês atual (competência vigente)
 * 
 * Conforme IN RFB 2.237/2024, Art. 3º, § 3º: após transmitir "Original sem movimento",
 * os meses seguintes não terão obrigação até retomar movimento.
 * 
 * Exemplo: Se transmitiu "Original sem movimento" em 10/2025, está dispensado de transmitir
 * DCTF em 11/2025, 12/2025, 01/2026, etc., até que tenha movimentação novamente.
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
 * Compara dois períodos (formato MM/YYYY ou YYYY-MM)
 * Retorna true se periodo1 < periodo2
 */
function periodoAnterior(periodo1: string, periodo2: { mes: number; ano: number }): boolean {
  const parsed1 = parsePeriodo(periodo1);
  if (!parsed1) return false;
  
  const valor1 = parsed1.ano * 100 + parsed1.mes;
  const valor2 = periodo2.ano * 100 + periodo2.mes;
  
  return valor1 < valor2;
}

/**
 * Compara dois períodos (formato MM/YYYY ou YYYY-MM)
 * Retorna true se periodo1 < periodo2
 */
function periodoDepois(periodo1: string, periodo2: { mes: number; ano: number }): boolean {
  const parsed1 = parsePeriodo(periodo1);
  if (!parsed1) return false;
  
  const valor1 = parsed1.ano * 100 + parsed1.mes;
  const valor2 = periodo2.ano * 100 + periodo2.mes;
  
  return valor1 > valor2;
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
    console.log(`[Conferência - Clientes Dispensados DCTF] 📅 Mês: ${competenciaMes}, Ano: ${competenciaAno}`);
    
    // Teste específico: verificar se 10/2025 é anterior a 11/2025
    const teste102025 = parsePeriodo('10/2025');
    if (teste102025) {
      const valor102025 = teste102025.ano * 100 + teste102025.mes;
      const valorCompetencia = competenciaAno * 100 + competenciaMes;
      const isAnteriorTeste = valor102025 < valorCompetencia;
      console.log(`[Conferência - Clientes Dispensados DCTF] 🧪 Teste: 10/2025 (${valor102025}) < ${competencia} (${valorCompetencia}) = ${isAnteriorTeste}`);
    }
    
    // DEBUG: Verificar quantos registros "Original sem movimento" de 10/2025 existem no banco
    const debug102025 = await executeQuery<{
      total: number;
      com_cliente_id: number;
      sem_cliente_id: number;
      exemplo_cnpj: string;
    }>(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN d.cliente_id IS NOT NULL THEN 1 ELSE 0 END) as com_cliente_id,
        SUM(CASE WHEN d.cliente_id IS NULL THEN 1 ELSE 0 END) as sem_cliente_id,
        MAX(d.cnpj) as exemplo_cnpj
      FROM dctf_declaracoes d
      WHERE d.tipo IS NOT NULL
        AND LOWER(TRIM(d.tipo)) LIKE '%original%sem%movimento%'
        AND (
          d.periodo_apuracao = '10/2025'
          OR d.periodo_apuracao = '2025-10'
        )
      `
    );
    console.log(`[Conferência - Clientes Dispensados DCTF] 🔍 DEBUG 10/2025: Total: ${debug102025[0]?.total || 0}, Com cliente_id: ${debug102025[0]?.com_cliente_id || 0}, Sem cliente_id: ${debug102025[0]?.sem_cliente_id || 0}, Exemplo CNPJ: ${debug102025[0]?.exemplo_cnpj || 'N/A'}`);

    // Buscar todos os clientes com "Original sem movimento" em período anterior à competência vigente
    // IMPORTANTE: Usar LEFT JOIN e verificar tanto por cliente_id quanto por CNPJ para garantir que encontramos todos os registros
    const clientesComOriginalSemMovimento = await executeQuery<{
      cliente_id: string;
      cnpj: string;
      razao_social: string;
      periodo_apuracao: string;
      data_transmissao: string;
    }>(
      `
      SELECT DISTINCT
        COALESCE(c.id, '') AS cliente_id,
        COALESCE(c.cnpj_limpo, REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '')) AS cnpj,
        COALESCE(c.razao_social, '') AS razao_social,
        d.periodo_apuracao,
        d.data_transmissao
      FROM dctf_declaracoes d
      LEFT JOIN clientes c ON (
        d.cliente_id = c.id
        OR REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '') = c.cnpj_limpo
      )
      WHERE 
        d.tipo IS NOT NULL
        AND LOWER(TRIM(d.tipo)) LIKE '%original%sem%movimento%'
        AND d.data_transmissao IS NOT NULL
        AND UPPER(TRIM(d.tipo)) NOT LIKE '%RETIFICADORA%'
        AND d.periodo_apuracao IS NOT NULL
        AND TRIM(d.periodo_apuracao) != ''
        -- Garantir que temos pelo menos CNPJ ou cliente_id
        AND (
          c.id IS NOT NULL
          OR REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '') != ''
        )
      ORDER BY 
        COALESCE(c.id, ''),
        d.periodo_apuracao DESC, 
        d.data_transmissao DESC
      `
    );

    console.log(`[Conferência - Clientes Dispensados DCTF] 📊 Total de "Original sem movimento" encontrados: ${clientesComOriginalSemMovimento.length}`);
    
    // Log detalhado dos primeiros registros
    if (clientesComOriginalSemMovimento.length > 0) {
      console.log(`[Conferência - Clientes Dispensados DCTF] 📋 Primeiros 5 registros encontrados:`);
      clientesComOriginalSemMovimento.slice(0, 5).forEach((r, i) => {
        const parsed = parsePeriodo(r.periodo_apuracao);
        const valorPeriodo = parsed ? parsed.ano * 100 + parsed.mes : 0;
        const valorCompetencia = competenciaAno * 100 + competenciaMes;
        const isAnterior = parsed ? valorPeriodo < valorCompetencia : false;
        console.log(`   ${i + 1}. Cliente ID: ${r.cliente_id}, CNPJ: ${r.cnpj}, Período: ${r.periodo_apuracao} (valor: ${valorPeriodo}), Competência: ${competencia} (valor: ${valorCompetencia}), Anterior? ${isAnterior}`);
      });
    }

    // Agrupar por cliente e pegar o período mais recente
    const clientesPorId = new Map<string, {
      cnpj: string;
      razao_social: string;
      periodo_original_sem_movimento: string;
      data_transmissao_original: string;
    }>();

    let countFiltradosPorPeriodo = 0;
    let countMantidos = 0;

    for (const cliente of clientesComOriginalSemMovimento) {
      // Verificar se o período do "Original sem movimento" é anterior à competência vigente
      // Exemplo: 10/2025 < 11/2025 = true (está dispensado em 11/2025)
      // Exemplo: 10/2025 < 12/2025 = true (está dispensado em 12/2025 quando competência vigente for 12/2025)
      const isAnterior = periodoAnterior(cliente.periodo_apuracao, { mes: competenciaMes, ano: competenciaAno });
      
      if (!isAnterior) {
        countFiltradosPorPeriodo++;
        // Log para debug: por que foi filtrado
        const parsed = parsePeriodo(cliente.periodo_apuracao);
        if (parsed) {
          const valorPeriodo = parsed.ano * 100 + parsed.mes;
          const valorCompetencia = competenciaAno * 100 + competenciaMes;
          console.log(`[Conferência - Clientes Dispensados DCTF] ⚠️ Filtrado: Período ${cliente.periodo_apuracao} (${valorPeriodo}) NÃO é anterior à competência ${competencia} (${valorCompetencia})`);
        }
        continue; // Pular se o período não é anterior à competência vigente
      }

      countMantidos++;
      
      // Usar cliente_id como chave, ou CNPJ se cliente_id não estiver disponível
      const chave = cliente.cliente_id || cliente.cnpj;
      
      const existing = clientesPorId.get(chave);
      if (!existing) {
        clientesPorId.set(chave, {
          cnpj: cliente.cnpj,
          razao_social: cliente.razao_social,
          periodo_original_sem_movimento: cliente.periodo_apuracao,
          data_transmissao_original: cliente.data_transmissao,
        });
      } else {
        // Manter o período mais recente
        const parsedExisting = parsePeriodo(existing.periodo_original_sem_movimento);
        const parsedCurrent = parsePeriodo(cliente.periodo_apuracao);
        if (parsedExisting && parsedCurrent) {
          const valorExisting = parsedExisting.ano * 100 + parsedExisting.mes;
          const valorCurrent = parsedCurrent.ano * 100 + parsedCurrent.mes;
          if (valorCurrent > valorExisting) {
            clientesPorId.set(chave, {
              cnpj: cliente.cnpj,
              razao_social: cliente.razao_social,
              periodo_original_sem_movimento: cliente.periodo_apuracao,
              data_transmissao_original: cliente.data_transmissao,
            });
          }
        }
      }
    }

    console.log(`[Conferência - Clientes Dispensados DCTF] 📊 Estatísticas de filtragem:`);
    console.log(`   - Total de registros encontrados: ${clientesComOriginalSemMovimento.length}`);
    console.log(`   - Filtrados por período (não anterior): ${countFiltradosPorPeriodo}`);
    console.log(`   - Mantidos após filtro de período: ${countMantidos}`);
    console.log(`   - Clientes únicos com "Original sem movimento" anterior: ${clientesPorId.size}`);

    // Agora verificar para cada cliente se:
    // 1. NÃO tem movimentação na competência vigente
    // 2. NÃO tem DCTF na competência vigente
    // 3. NÃO teve movimento DEPOIS do "Original sem movimento" até a competência vigente

    const clientesDispensados: ClienteDispensadoDCTF[] = [];
    let countComMovimentacao = 0;
    let countComDCTF = 0;
    let countComMovimentoDepois = 0;
    let countPeriodoInvalido = 0;

    for (const [chave, clienteInfo] of clientesPorId.entries()) {
      // Determinar se a chave é cliente_id ou CNPJ
      const isClienteId = chave.length === 36; // UUID tem 36 caracteres
      const clienteId = isClienteId ? chave : null;
      const cnpjLimpo = isClienteId ? null : chave;
      
      // Verificar se tem movimentação na competência vigente
      const temMovimentacaoVigente = await executeQuery<{ count: number }>(
        `
        SELECT COUNT(*) as count
        FROM host_dados h
        INNER JOIN clientes c ON (
          REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
          OR (h.cod_emp = c.cod_emp AND h.cod_emp IS NOT NULL AND c.cod_emp IS NOT NULL)
        )
        WHERE (
          ${isClienteId ? 'c.id = ?' : 'c.cnpj_limpo = ?'}
        )
          AND h.ano = ?
          AND h.mes = ?
          AND h.movimentacao > 0
        `,
        isClienteId 
          ? [clienteId, competenciaAno, competenciaMes]
          : [cnpjLimpo, competenciaAno, competenciaMes]
      );

      if (temMovimentacaoVigente[0]?.count > 0) {
        countComMovimentacao++;
        continue; // Tem movimentação na competência vigente, não está dispensado
      }

      // Verificar se tem DCTF na competência vigente
      const temDCTFVigente = await executeQuery<{ count: number }>(
        `
        SELECT COUNT(*) as count
        FROM dctf_declaracoes d
        WHERE (
          ${isClienteId ? 'd.cliente_id = ?' : 'REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, \'\'), \'.\', \'\'), \'/\', \'\'), \'-\', \'\') = ?'}
        )
          AND (
            TRIM(d.periodo_apuracao) = ?
            OR TRIM(d.periodo_apuracao) = ?
          )
        `,
        isClienteId
          ? [clienteId, periodoSql, competencia]
          : [cnpjLimpo, periodoSql, competencia]
      );

      if (temDCTFVigente[0]?.count > 0) {
        countComDCTF++;
        continue; // Tem DCTF na competência vigente, não está dispensado
      }

      // Verificar se teve movimento DEPOIS do "Original sem movimento" até a competência vigente
      // IMPORTANTE: Se houve movimento em qualquer mês entre o "Original sem movimento" e a competência vigente,
      // a dispensa foi quebrada e o cliente deve transmitir DCTF novamente
      const periodoOriginal = parsePeriodo(clienteInfo.periodo_original_sem_movimento);
      if (!periodoOriginal) {
        countPeriodoInvalido++;
        console.warn(`[Conferência - Clientes Dispensados DCTF] ⚠️ Período inválido para cliente ${clienteId}: ${clienteInfo.periodo_original_sem_movimento}`);
        continue;
      }

      // Buscar movimento DEPOIS do período do "Original sem movimento" e ANTES ou IGUAL à competência vigente
      // Exemplo: "Original sem movimento" em 10/2025, competência vigente 11/2025
      // Busca movimento em: 11/2025 (mes > 10 E mes <= 11)
      const teveMovimentoDepois = await executeQuery<{ count: number; exemplo_ano: number; exemplo_mes: number }>(
        `
        SELECT 
          COUNT(*) as count,
          MAX(h.ano) as exemplo_ano,
          MAX(h.mes) as exemplo_mes
        FROM host_dados h
        INNER JOIN clientes c ON (
          REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
          OR (h.cod_emp = c.cod_emp AND h.cod_emp IS NOT NULL AND c.cod_emp IS NOT NULL)
        )
        WHERE (
          ${isClienteId ? 'c.id = ?' : 'c.cnpj_limpo = ?'}
        )
          AND h.movimentacao > 0
          -- Movimento DEPOIS do período do "Original sem movimento"
          AND (
            (h.ano > ?)
            OR (h.ano = ? AND h.mes > ?)
          )
          -- E ANTES ou IGUAL à competência vigente
          AND (
            (h.ano < ?)
            OR (h.ano = ? AND h.mes <= ?)
          )
        `,
        isClienteId
          ? [
              clienteId,
              periodoOriginal.ano, // ano > periodoOriginal.ano
              periodoOriginal.ano, // ano = periodoOriginal.ano
              periodoOriginal.mes, // mes > periodoOriginal.mes
              competenciaAno, // ano < competenciaAno
              competenciaAno, // ano = competenciaAno
              competenciaMes, // mes <= competenciaMes
            ]
          : [
              cnpjLimpo,
              periodoOriginal.ano,
              periodoOriginal.ano,
              periodoOriginal.mes,
              competenciaAno,
              competenciaAno,
              competenciaMes,
            ]
      );

      if (teveMovimentoDepois[0]?.count > 0) {
        countComMovimentoDepois++;
        const exemplo = teveMovimentoDepois[0];
        console.log(`[Conferência - Clientes Dispensados DCTF] ⚠️ Cliente ${clienteInfo.cnpj} teve movimento depois de ${clienteInfo.periodo_original_sem_movimento} (exemplo: ${exemplo.exemplo_ano}/${exemplo.exemplo_mes}) - dispensa quebrada`);
        continue; // Teve movimento depois do "Original sem movimento", dispensa foi quebrada
      }

      // Cliente está dispensado!
      const cnpjNormalizado = normalizarCNPJ(clienteInfo.cnpj);
      if (!cnpjNormalizado) {
        continue;
      }

      clientesDispensados.push({
        id: randomUUID() as string,
        cnpj: formatarCNPJ(cnpjNormalizado) || clienteInfo.cnpj,
        razao_social: clienteInfo.razao_social || '',
        periodo_original_sem_movimento: clienteInfo.periodo_original_sem_movimento,
        data_transmissao_original: clienteInfo.data_transmissao_original,
        competencia_vigente: competencia,
        tem_movimentacao_atual: false,
        mensagem: `Cliente dispensado de transmitir DCTF para ${competencia}. Já transmitiu "Original sem movimento" em ${clienteInfo.periodo_original_sem_movimento} e não teve movimentação no mês atual.`,
      });
    }

    console.log(`[Conferência - Clientes Dispensados DCTF] 📊 Estatísticas de validação:`);
    console.log(`   - Com movimentação na vigência: ${countComMovimentacao}`);
    console.log(`   - Com DCTF na vigência: ${countComDCTF}`);
    console.log(`   - Com movimento depois do "Original sem movimento": ${countComMovimentoDepois}`);
    console.log(`   - Com período inválido: ${countPeriodoInvalido}`);
    console.log(`[Conferência - Clientes Dispensados DCTF] ✅ Clientes dispensados: ${clientesDispensados.length}`);
    
    if (clientesDispensados.length > 0) {
      console.log(`[Conferência - Clientes Dispensados DCTF] 📋 Primeiros 5 clientes encontrados:`, 
        clientesDispensados.slice(0, 5).map(c => ({ 
          cnpj: c.cnpj, 
          razao: c.razao_social, 
          periodo: c.periodo_original_sem_movimento,
          competencia: c.competencia_vigente
        }))
      );
    } else if (clientesPorId.size > 0) {
      console.log(`[Conferência - Clientes Dispensados DCTF] ⚠️ Nenhum cliente dispensado encontrado, mas havia ${clientesPorId.size} clientes com "Original sem movimento" anterior.`);
      console.log(`[Conferência - Clientes Dispensados DCTF] ⚠️ Verifique os logs acima para entender por que foram filtrados.`);
    }

    return clientesDispensados;
  } catch (error: any) {
    console.error('[Conferência - Clientes Dispensados DCTF] ❌ Erro:', error);
    throw error;
  }
}
