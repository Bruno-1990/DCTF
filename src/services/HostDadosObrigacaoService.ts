import { executeQuery } from '../config/mysql';

export type ObrigacaoStatus = 'SIM' | 'NAO' | 'VERIFICAR';
export type ObrigacaoSeveridade = 'alta' | 'media' | 'baixa';

export interface HostDadosObrigacao {
  cnpj: string;
  razao_social: string;
  cod_emp: number | null;
  ano: number;
  mes: number;
  competencia: string;
  tipos_movimento: string[];
  total_movimentacoes: number;
  tem_dctf: boolean;
  dctf_periodo?: string | null;
  dctf_tipo?: string | null;
  dctf_status?: string | null;
  obrigacao: ObrigacaoStatus;
  severidade: ObrigacaoSeveridade;
  prazoVencimento: string;
  diasAteVencimento: number;
}

interface RawObrigacaoRow {
  cnpj: string;
  razao: string;
  razao_social: string | null; // Razão social da tabela clientes
  cod_emp: number | null;
  ano: number;
  mes: number;
  tipos_movimento: string | null;
  total_movimentacoes: number;
  dctf_id: number | null;
  dctf_periodo: string | null;
  dctf_tipo: string | null;
  dctf_status: string | null;
  dctf_data_transmissao: string | null;
  tem_original_sem_movimento_anterior: number; // Flag se há "Original sem movimento" que dispensa
  ultimo_mes_com_movimento: string | null; // Último mês que teve movimento antes do atual
}

/**
 * Serviço para averiguação de obrigação de DCTFWeb
 * usando os dados de movimentação do SCI em host_dados.
 *
 * LÓGICA ROBUSTA - CONFORME IN RFB 2.237/2024 e 2.248/2025:
 * 
 * REGRAS:
 * 1. Movimento no mês X → obrigação SIM no mês X+1 (subsequente)
 * 2. "Original sem movimento" no mês X → dispensa meses seguintes até novo movimento
 * 3. Verificar histórico completo de movimentos e declarações
 */
export class HostDadosObrigacaoService {
  /**
   * Retorna obrigações por competência (ano/mes) para todas as empresas
   * que têm registros em host_dados.
   * 
   * IMPORTANTE: A competência analisada (ano/mes) é o mês SUBSEQUENTE ao movimento.
   * Se estamos analisando 09/2025, verificamos movimento em 08/2025.
   */
  async verificarObrigacoesPorCompetencia(
    ano: number,
    mes: number,
  ): Promise<HostDadosObrigacao[]> {
    try {
      const competencia = `${String(mes).padStart(2, '0')}/${ano}`;
      
      // IMPORTANTE: A movimentação verificada é SEMPRE 1 mês ANTES da competência da DCTF
      // Lógica: Movimento no mês X → Obrigação de DCTF no mês X+1
      // Exemplo: Se competência DCTF é 11/2025, verificamos movimento APENAS em 10/2025
      // Isso evita falsos positivos com movimentações antigas de outros meses
      const mesMovimento = mes === 1 ? 12 : mes - 1;
      const anoMovimento = mes === 1 ? ano - 1 : ano;
      const competenciaMovimento = `${String(mesMovimento).padStart(2, '0')}/${anoMovimento}`;
      const periodoSqlMovimento = `${anoMovimento}-${String(mesMovimento).padStart(2, '0')}`;
      
      // Para verificar DCTF, usamos a competência informada (mês analisado)
      const periodoSql = `${ano}-${String(mes).padStart(2, '0')}`;

      console.log(`[HostDadosObrigacaoService] 🔍 Verificando obrigações para competência DCTF: ${competencia}`);
      console.log(`[HostDadosObrigacaoService] ✅ Movimento verificado APENAS em: ${competenciaMovimento} (${mesMovimento}/${anoMovimento})`);

      // Query melhorada: busca movimento APENAS no mês específico (1 mês antes da competência)
      // e verifica DCTF na competência informada
      // FILTRO ESTRITO por ano e mês para evitar falsos positivos com movimentações antigas
      // Também verifica se há "Original sem movimento" que dispensa
      const rows = await executeQuery<RawObrigacaoRow>(
      `
      SELECT
        h.cnpj,
        h.razao,
        c.razao_social,
        h.cod_emp,
        h.ano,
        h.mes,
        GROUP_CONCAT(DISTINCT h.relatorio SEPARATOR ',') AS tipos_movimento,
        SUM(h.movimentacao) AS total_movimentacoes,
        MAX(d.id) AS dctf_id,
        MAX(d.periodo_apuracao) AS dctf_periodo,
        MAX(d.tipo) AS dctf_tipo,
        MAX(d.situacao) AS dctf_status,
        MAX(d.data_transmissao) AS dctf_data_transmissao,
        -- Verificar se há "Original sem movimento" que dispensa meses seguintes
        -- A dispensa é válida se:
        -- 1. Existe "Original sem movimento" em qualquer mês anterior ao movimento atual
        -- 2. NÃO houve movimento DEPOIS desse "Original sem movimento" até o mês atual
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM dctf_declaracoes d_sm
            INNER JOIN clientes c_sm ON d_sm.cliente_id = c_sm.id
            WHERE (
              REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c_sm.cnpj_limpo
              OR (h.cod_emp = c_sm.cod_emp AND h.cod_emp IS NOT NULL)
            )
            AND LOWER(d_sm.tipo) LIKE '%original%sem%movimento%'
            AND d_sm.data_transmissao IS NOT NULL
            AND (d_sm.tipo IS NULL OR UPPER(d_sm.tipo) NOT LIKE '%RETIFICADORA%')
            -- Verificar se o período do "Original sem movimento" é anterior ou igual ao mês do movimento
            AND (
              -- Formato YYYY-MM
              (d_sm.periodo_apuracao LIKE '%-%' AND (
                CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED) < ?
                OR (CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED) = ?
                    AND CAST(SUBSTRING(d_sm.periodo_apuracao, 6, 2) AS UNSIGNED) <= ?)
              ))
              -- Formato MM/YYYY
              OR (d_sm.periodo_apuracao LIKE '%/%' AND (
                CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED) < ?
                OR (CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED) = ?
                    AND CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 2) AS UNSIGNED) <= ?)
              ))
            )
            -- Verificar se não houve movimento DEPOIS do "Original sem movimento"
            AND NOT EXISTS (
              SELECT 1
              FROM host_dados h2
              WHERE (
                REPLACE(REPLACE(REPLACE(h2.cnpj, '.', ''), '/', ''), '-', '') = 
                REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '')
                OR (h2.cod_emp = h.cod_emp AND h2.cod_emp IS NOT NULL)
              )
              AND h2.movimentacao > 0
              -- Movimento DEPOIS do período do "Original sem movimento"
              AND (
                -- Comparar com período do "Original sem movimento"
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
              -- E antes ou igual ao mês do movimento atual
              AND (
                (h2.ano < ?)
                OR (h2.ano = ? AND h2.mes <= ?)
              )
            )
          ) THEN 1
          ELSE 0
        END AS tem_original_sem_movimento_anterior,
        -- Último mês com movimento antes do mês analisado
        (
          SELECT CONCAT(
            LPAD(h2.mes, 2, '0'), '/', h2.ano
          )
          FROM host_dados h2
          WHERE (
            REPLACE(REPLACE(REPLACE(h2.cnpj, '.', ''), '/', ''), '-', '') = 
            REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '')
            OR (h2.cod_emp = h.cod_emp AND h2.cod_emp IS NOT NULL)
          )
          AND (h2.ano < ano OR (h2.ano = ano AND h2.mes < mes))
          AND h2.movimentacao > 0
          ORDER BY h2.ano DESC, h2.mes DESC
          LIMIT 1
        ) AS ultimo_mes_com_movimento
      FROM host_dados h
      LEFT JOIN clientes c
        ON (
          REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
          OR h.cod_emp = c.cod_emp
        )
        -- IMPORTANTE: Considerar apenas clientes "Matriz", excluir "Filial"
        -- Filiais não têm obrigatoriedade de enviar DCTF
        AND (c.tipo_empresa = 'Matriz' OR c.tipo_empresa IS NULL)
      LEFT JOIN dctf_declaracoes d
        ON (
          (
            d.cliente_id = c.id
            OR REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '') = c.cnpj_limpo
          )
          AND (d.periodo_apuracao = ? OR d.periodo_apuracao = ?)
          -- Considerar tanto Original quanto Retificadora para verificar se TEM DCTF
          -- Se tem retificadora, significa que já enviou original antes
        )
      -- FILTRO ESTRITO: Verificar movimento APENAS no mês específico (1 mês antes da competência vigente)
      -- Isso evita falsos positivos com movimentações antigas de meses anteriores
      WHERE h.ano = ? AND h.mes = ?
      GROUP BY
        h.cnpj,
        h.razao,
        c.razao_social,
        h.cod_emp,
        h.ano,
        h.mes
      ORDER BY COALESCE(c.razao_social, h.razao) ASC, h.cnpj ASC
      `,
        [
          // Parâmetros para verificação de "Original sem movimento" (6 placeholders)
          anoMovimento, // 1: anoMovimento para formato YYYY-MM (<)
          anoMovimento, // 2: anoMovimento para formato YYYY-MM (=)
          mesMovimento, // 3: mesMovimento para formato YYYY-MM (<=)
          anoMovimento, // 4: anoMovimento para formato MM/YYYY (<)
          anoMovimento, // 5: anoMovimento para formato MM/YYYY (=)
          mesMovimento, // 6: mesMovimento para formato MM/YYYY (<=)
          anoMovimento, // 7: anoMovimento para NOT EXISTS (<)
          anoMovimento, // 8: anoMovimento para NOT EXISTS (=)
          mesMovimento, // 9: mesMovimento para NOT EXISTS (<=)
          // Parâmetros para verificação de DCTF (2 placeholders)
          periodoSql, // 10: Para verificar DCTF no mês subsequente (formato YYYY-MM)
          competencia, // 11: Formato MM/YYYY
          // Parâmetros para WHERE (2 placeholders)
          anoMovimento, // 12: Ano do movimento para WHERE
          mesMovimento, // 13: Mês do movimento para WHERE
        ],
      );

      console.log(`[HostDadosObrigacaoService] Registros encontrados em host_dados: ${rows.length}`);

      if (rows.length === 0) {
        console.log(`[HostDadosObrigacaoService] Nenhum registro encontrado para ${competencia}. Isso é normal se não houver dados sincronizados.`);
        return [];
      }

      const today = new Date();

      return rows.map((row) => {
      const teveMovimento = (row.total_movimentacoes || 0) > 0;
      const temDctf = !!row.dctf_id;
      const temOriginalSemMovimentoAnterior = row.tem_original_sem_movimento_anterior === 1;

      const prazo = this.calcularPrazoVencimento(ano, mes);
      const diasAteVencimento = this.calcularDiasAteVencimento(today, prazo);

      const { obrigacao, severidade } = this.definirObrigacaoRobusta(
        teveMovimento,
        temDctf,
        temOriginalSemMovimentoAnterior,
        diasAteVencimento,
      );

      // Priorizar razao_social da tabela clientes, senão usar razao de host_dados
      const razaoSocial = row.razao_social || row.razao || '';

      return {
        cnpj: row.cnpj,
        razao_social: razaoSocial,
        cod_emp: row.cod_emp,
        ano: row.ano,
        mes: row.mes,
        competencia,
        tipos_movimento: row.tipos_movimento
          ? row.tipos_movimento.split(',').map((t) => t.trim())
          : [],
        total_movimentacoes: row.total_movimentacoes || 0,
        tem_dctf: temDctf,
        dctf_periodo: row.dctf_periodo,
        dctf_tipo: row.dctf_tipo,
        dctf_status: row.dctf_status,
        obrigacao,
        severidade,
        prazoVencimento: prazo.toISOString(),
        diasAteVencimento,
      };
    });
    } catch (error: any) {
      console.error('[HostDadosObrigacaoService] Erro ao verificar obrigações:', error);
      console.error('[HostDadosObrigacaoService] Stack:', error.stack);
      throw error; // Re-throw para o controller tratar
    }
  }

  /**
   * Retorna os tipos de movimentação (fiscal, trabalhista, contábil) por CNPJ
   * no mesmo mês da competência informada.
   * Usado pelo relatório DCTF para exibir movimentação na competência.
   */
  async listarMovimentacaoPorCompetencia(
    ano: number,
    mes: number,
  ): Promise<{ cnpj: string; tipos_movimento: string[]; total_movimentacoes: number }[]> {
    try {
      const rows = await executeQuery<{ cnpj: string; tipos_movimento: string | null; total_movimentacoes: number }>(
        `
        SELECT
          h.cnpj,
          GROUP_CONCAT(DISTINCT h.relatorio SEPARATOR ',') AS tipos_movimento,
          COALESCE(SUM(h.movimentacao), 0) AS total_movimentacoes
        FROM host_dados h
        WHERE h.ano = ? AND h.mes = ?
          AND (h.movimentacao IS NULL OR h.movimentacao > 0)
        GROUP BY h.cnpj, h.ano, h.mes
        ORDER BY h.cnpj ASC
        `,
        [ano, mes],
      );
      return rows.map((row) => ({
        cnpj: row.cnpj,
        tipos_movimento: row.tipos_movimento
          ? row.tipos_movimento.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        total_movimentacoes: Number(row.total_movimentacoes) || 0,
      }));
    } catch (error: any) {
      console.error('[HostDadosObrigacaoService] Erro ao listar movimentação por competência:', error);
      return [];
    }
  }

  /**
   * Retorna movimentação por cliente na competência (ano/mes), usando o MESMO cruzamento
   * da conferência e da tela Cliente > Lançamentos SCI: clientes + host_dados por
   * cnpj_limpo normalizado ou cod_emp. Garante que quantidade e áreas (tipos) batem
   * com o que a conferência e a tela de lançamentos exibem.
   */
  async listarMovimentacaoPorCompetenciaPorCliente(
    ano: number,
    mes: number,
  ): Promise<{ cnpj: string; tipos_movimento: string[]; total_movimentacoes: number }[]> {
    try {
      const rows = await executeQuery<{
        cnpj_limpo: string;
        tipos_movimento: string | null;
        total_movimentacoes: number;
      }>(
        `
        SELECT
          c.cnpj_limpo,
          GROUP_CONCAT(DISTINCT h.relatorio SEPARATOR ',') AS tipos_movimento,
          COALESCE(SUM(h.movimentacao), 0) AS total_movimentacoes
        FROM clientes c
        INNER JOIN host_dados h ON (
          REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
          OR (h.cod_emp = c.cod_emp AND h.cod_emp IS NOT NULL AND c.cod_emp IS NOT NULL)
        )
        WHERE h.ano = ? AND h.mes = ?
          AND (h.movimentacao IS NULL OR h.movimentacao > 0)
        GROUP BY c.id, c.cnpj_limpo
        ORDER BY c.cnpj_limpo ASC
        `,
        [ano, mes],
      );
      return rows.map((row) => ({
        cnpj: row.cnpj_limpo,
        tipos_movimento: row.tipos_movimento
          ? row.tipos_movimento.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        total_movimentacoes: Number(row.total_movimentacoes) || 0,
      }));
    } catch (error: any) {
      console.error('[HostDadosObrigacaoService] Erro ao listar movimentação por competência por cliente:', error);
      return [];
    }
  }

  /**
   * Lista clientes que NÃO têm DCTF na competência vigente,
   * mas TÊM movimento no Banco SCI no mês anterior.
   * 
   * Isso identifica empresas com obrigação de enviar DCTF que ainda não enviaram.
   */
  async listarClientesSemDCTFComMovimento(ano?: number, mes?: number): Promise<{
    cnpj: string;
    razao_social: string;
    regime_tributario?: string | null;
    cod_emp: number | null;
    competencia_obrigacao: string; // Competência que deveria ter DCTF (mês subsequente ao movimento)
    competencia_movimento: string; // Competência do movimento (mês anterior)
    ano_movimento: number;
    mes_movimento: number;
    tipos_movimento: string[];
    total_movimentacoes: number;
    prazoVencimento: string;
    diasAteVencimento: number;
    possivelObrigacaoEnvio: boolean; // ✅ NOVO: Indica se há possível obrigação de envio
    motivoObrigacao?: string; // ✅ NOVO: Motivo da obrigação ou dispensa
  }[]> {
    try {
      // Se não informado, usar competência vigente (mês anterior ao atual)
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1; // getMonth() retorna 0-11, então +1 para 1-12
      const anoAtual = hoje.getFullYear();

      // Competência vigente da DCTF é SEMPRE o mês anterior à data atual
      // Exemplo: Se hoje é 15/12/2025, competência vigente é 11/2025
      const competenciaMes = mes || (mesAtual === 1 ? 12 : mesAtual - 1); // Mês anterior
      const competenciaAno = ano || (mesAtual === 1 ? anoAtual - 1 : anoAtual); // Se janeiro, ano anterior
      
      console.log(`[HostDadosObrigacaoService] 📅 Data atual: ${hoje.toISOString().split('T')[0]}`);
      console.log(`[HostDadosObrigacaoService] 📅 Mês atual: ${mesAtual}/${anoAtual}`);
      console.log(`[HostDadosObrigacaoService] 🔍 Competência vigente DCTF: ${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`);
      
      // IMPORTANTE: O movimento que gera obrigação é SEMPRE 1 mês ANTES da competência vigente
      // Lógica: Movimento no mês X → Obrigação de DCTF no mês X+1
      // Exemplo: Se competência DCTF é 11/2025, verificamos movimento em 10/2025
      // Isso evita falsos positivos com movimentações antigas
      const mesMovimento = competenciaMes === 1 ? 12 : competenciaMes - 1;
      const anoMovimento = competenciaMes === 1 ? competenciaAno - 1 : competenciaAno;
      
      const competenciaObrigacao = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
      const competenciaMovimento = `${String(mesMovimento).padStart(2, '0')}/${anoMovimento}`;
      
      console.log(`[HostDadosObrigacaoService] 🔍 Buscando clientes sem DCTF em ${competenciaObrigacao} mas com movimento em ${competenciaMovimento}`);
      console.log(`[HostDadosObrigacaoService] 📊 Parâmetros da query: anoMovimento=${anoMovimento}, mesMovimento=${mesMovimento}, competenciaObrigacao=${competenciaObrigacao}`);

      // Query que cruza:
      // 1. Clientes cadastrados (apenas "Matriz")
      // 2. Movimento em host_dados APENAS no mês específico (1 mês antes da competência vigente)
      //    IMPORTANTE: Filtramos estritamente por ano e mês para evitar falsos positivos com movimentações antigas
      // 3. Ausência de DCTF na competência vigente
      // IMPORTANTE: Verificar ambos os formatos de período_apuracao (YYYY-MM e MM/YYYY)
      // IMPORTANTE: Considerar QUALQUER DCTF existente, independente de situação ou data_transmissao
      const periodoSql = `${competenciaAno}-${String(competenciaMes).padStart(2, '0')}`;
      
      console.log(`[HostDadosObrigacaoService] ✅ Verificando DCTFs com período: ${periodoSql} ou ${competenciaObrigacao}`);
      console.log(`[HostDadosObrigacaoService] ✅ Verificando movimentação APENAS em: ${anoMovimento}-${String(mesMovimento).padStart(2, '0')} (${competenciaMovimento})`);

      // Usar LEFT JOIN com verificação explícita de NULL para garantir que não há DCTF
      // Adicionar verificação de "Original sem movimento" que pode dispensar
      const rows = await executeQuery<{
        cnpj: string;
        razao_social: string;
        regime_tributario: string | null;
        cod_emp: number | null;
        tipos_movimento: string | null;
        total_movimentacoes: number;
        tem_original_sem_movimento: number; // 1 se tem, 0 se não tem
      }>(
        `
        SELECT 
          c.cnpj_limpo AS cnpj,
          c.razao_social,
          c.regime_tributario,
          MAX(h.cod_emp) AS cod_emp,
          GROUP_CONCAT(DISTINCT h.relatorio SEPARATOR ',') AS tipos_movimento,
          SUM(h.movimentacao) AS total_movimentacoes,
          -- Verificar se há "Original sem movimento" que dispensa
          CASE 
            WHEN EXISTS (
              SELECT 1 
              FROM dctf_declaracoes d_sm
              WHERE d_sm.cliente_id = c.id
                AND LOWER(d_sm.tipo) LIKE '%original%sem%movimento%'
                AND d_sm.data_transmissao IS NOT NULL
                AND (d_sm.tipo IS NULL OR UPPER(d_sm.tipo) NOT LIKE '%RETIFICADORA%')
                -- Verificar se o período do "Original sem movimento" é anterior ou igual ao mês do movimento
                AND (
                  -- Formato YYYY-MM
                  (d_sm.periodo_apuracao LIKE '%-%' AND (
                    CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED) < ?
                    OR (CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 4) AS UNSIGNED) = ?
                        AND CAST(SUBSTRING(d_sm.periodo_apuracao, 6, 2) AS UNSIGNED) <= ?)
                  ))
                  -- Formato MM/YYYY
                  OR (d_sm.periodo_apuracao LIKE '%/%' AND (
                    CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED) < ?
                    OR (CAST(SUBSTRING(d_sm.periodo_apuracao, 4, 4) AS UNSIGNED) = ?
                        AND CAST(SUBSTRING(d_sm.periodo_apuracao, 1, 2) AS UNSIGNED) <= ?)
                  ))
                )
                -- Verificar se não houve movimento DEPOIS do "Original sem movimento"
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
                  -- E antes ou igual ao mês do movimento atual
                  AND (
                    (h2.ano < ?)
                    OR (h2.ano = ? AND h2.mes <= ?)
                  )
                )
            ) THEN 1
            ELSE 0
          END AS tem_original_sem_movimento
        FROM clientes c
        INNER JOIN host_dados h
          ON (
            REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = c.cnpj_limpo
            OR (h.cod_emp = c.cod_emp AND h.cod_emp IS NOT NULL)
          )
        WHERE 
          -- FILTRO ESTRITO: Verificar movimento APENAS no mês específico (1 mês antes da competência vigente)
          -- Isso evita falsos positivos com movimentações antigas de meses anteriores
          -- Exemplo: Para DCTF 11/2025, verificamos movimento APENAS em 10/2025
          h.ano = ?
          AND h.mes = ?
          AND h.movimentacao > 0
          -- IMPORTANTE: Considerar apenas clientes "Matriz", excluir "Filial"
          -- Filiais não têm obrigatoriedade de enviar DCTF
          AND (c.tipo_empresa = 'Matriz' OR c.tipo_empresa IS NULL)
          -- Verificar que NÃO existe DCTF para a competência vigente
          -- Usar NOT EXISTS para garantir que não há DCTF (mais confiável que LEFT JOIN)
          -- IMPORTANTE: Considerar tanto Original quanto Retificadora
          -- Se tem retificadora, significa que já enviou original antes
          -- IMPORTANTE: Verificar tanto por cliente_id quanto por CNPJ normalizado
          -- (mesma lógica do Módulo 1 para garantir consistência)
          AND NOT EXISTS (
            SELECT 1
            FROM dctf_declaracoes d
            WHERE (
              d.cliente_id = c.id
              OR REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '') = c.cnpj_limpo
            )
            AND (
              -- Formato YYYY-MM (ex: 2025-10)
              TRIM(d.periodo_apuracao) = ?
              -- Formato MM/YYYY (ex: 10/2025)
              OR TRIM(d.periodo_apuracao) = ?
            )
          )
        GROUP BY
          c.id,
          c.cnpj_limpo,
          c.razao_social
        ORDER BY c.razao_social ASC, c.cnpj_limpo ASC
        `,
        [
          // Parâmetros para verificação de "Original sem movimento"
          anoMovimento, // 1: anoMovimento para formato YYYY-MM (<)
          anoMovimento, // 2: anoMovimento para formato YYYY-MM (=)
          mesMovimento, // 3: mesMovimento para formato YYYY-MM (<=)
          anoMovimento, // 4: anoMovimento para formato MM/YYYY (<)
          anoMovimento, // 5: anoMovimento para formato MM/YYYY (=)
          mesMovimento, // 6: mesMovimento para formato MM/YYYY (<=)
          anoMovimento, // 7: anoMovimento para NOT EXISTS (<)
          anoMovimento, // 8: anoMovimento para NOT EXISTS (=)
          mesMovimento, // 9: mesMovimento para NOT EXISTS (<=)
          // Parâmetros para verificação de DCTF
          // Parâmetros para WHERE (movimento)
          anoMovimento, // 10: Ano do movimento
          mesMovimento, // 11: Mês do movimento
          // Parâmetros para NOT EXISTS (verificação de DCTF)
          periodoSql, // 12: Formato YYYY-MM
          competenciaObrigacao, // 13: Formato MM/YYYY
        ],
      );

      console.log(`[HostDadosObrigacaoService] Encontrados ${rows.length} clientes sem DCTF mas com movimento`);
      
      // Validação adicional: verificar se realmente não existe DCTF para TODOS os clientes encontrados
      // Isso ajuda a identificar se há algum problema na query
      let rowsFinais = rows;
      
      if (rows.length > 0) {
        const todosCnpjs = rows.map(r => r.cnpj);
        console.log(`[HostDadosObrigacaoService] Total de CNPJs únicos encontrados: ${todosCnpjs.length}`);
        console.log(`[HostDadosObrigacaoService] Exemplo de CNPJs: ${todosCnpjs.slice(0, 10).join(', ')}`);
        
        // Verificar TODOS os clientes encontrados (não apenas os primeiros 20)
        const cnpjsComDCTF: string[] = [];
        const cnpjsSemDCTF: string[] = [];
        
        for (const cnpj of todosCnpjs) {
          const checkQuery = await executeQuery<{ count: number; periodos: string }>(
            `
            SELECT COUNT(*) as count, GROUP_CONCAT(DISTINCT TRIM(d.periodo_apuracao) SEPARATOR ', ') as periodos
            FROM dctf_declaracoes d
            LEFT JOIN clientes c ON d.cliente_id = c.id
            WHERE (
              c.cnpj_limpo = ?
              OR REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '') = ?
            )
            AND (
              TRIM(d.periodo_apuracao) = ?
              OR TRIM(d.periodo_apuracao) = ?
            )
            AND (
              c.id IS NOT NULL
              OR d.cnpj IS NOT NULL
            )
            -- IMPORTANTE: Considerar tanto Original quanto Retificadora
            -- Se tem retificadora, significa que já enviou original antes
            `,
            [cnpj, cnpj, periodoSql, competenciaObrigacao]
          );
          
          if (checkQuery.length > 0 && checkQuery[0].count > 0) {
            cnpjsComDCTF.push(cnpj);
            console.warn(`[HostDadosObrigacaoService] ⚠️ ATENÇÃO: Cliente ${cnpj} TEM DCTF (${checkQuery[0].periodos}) mas apareceu na lista!`);
          } else {
            cnpjsSemDCTF.push(cnpj);
          }
        }
        
        if (cnpjsComDCTF.length > 0) {
          console.error(`[HostDadosObrigacaoService] ❌ ERRO: ${cnpjsComDCTF.length} clientes com DCTF apareceram incorretamente na lista!`);
          console.error(`[HostDadosObrigacaoService] CNPJs com DCTF: ${cnpjsComDCTF.join(', ')}`);
          console.error(`[HostDadosObrigacaoService] Períodos procurados: ${periodoSql} ou ${competenciaObrigacao}`);
          
          // Filtrar os clientes que realmente não têm DCTF
          rowsFinais = rows.filter(row => cnpjsSemDCTF.includes(row.cnpj));
          console.log(`[HostDadosObrigacaoService] 🔧 Filtrando ${cnpjsComDCTF.length} clientes com DCTF da lista. Restam ${rowsFinais.length} clientes válidos.`);
        } else {
          console.log(`[HostDadosObrigacaoService] ✅ Validação OK: Todos os ${rows.length} clientes realmente não têm DCTF`);
        }
      }

      const today = new Date();
      const prazo = this.calcularPrazoVencimento(competenciaAno, competenciaMes);
      const diasAteVencimento = this.calcularDiasAteVencimento(today, prazo);

      return rowsFinais.map((row) => {
        // Calcular se há possível obrigação de envio
        // Se tem "Original sem movimento" válido, não há obrigação
        const temOriginalSemMovimento = row.tem_original_sem_movimento === 1;
        const teveMovimento = true; // Se está na lista, teve movimento
        const temDctf = false; // Se está na lista, não tem DCTF
        
        // Aplicar lógica robusta para determinar obrigação
        const resultadoObrigacao = this.definirObrigacaoRobusta(
          teveMovimento,
          temDctf,
          temOriginalSemMovimento,
          diasAteVencimento,
        );
        
        // Se a obrigação é "SIM", há possível obrigação de envio
        const possivelObrigacaoEnvio = resultadoObrigacao.obrigacao === 'SIM';
        
        // Definir motivo da obrigação ou dispensa
        let motivoObrigacao: string;
        if (temOriginalSemMovimento) {
          motivoObrigacao = 'Dispensado: existe "Original sem movimento" válido que dispensa o envio';
        } else if (possivelObrigacaoEnvio) {
          motivoObrigacao = 'Movimento no mês anterior gera obrigação de envio conforme IN RFB 2.237/2024';
        } else {
          motivoObrigacao = 'Verificar situação específica do cliente';
        }

        return {
          cnpj: row.cnpj,
          razao_social: row.razao_social || '',
          regime_tributario: row.regime_tributario ?? null,
          cod_emp: row.cod_emp,
          competencia_obrigacao: competenciaObrigacao,
          competencia_movimento: competenciaMovimento,
          ano_movimento: anoMovimento,
          mes_movimento: mesMovimento,
          tipos_movimento: row.tipos_movimento
            ? row.tipos_movimento.split(',').map((t) => t.trim())
            : [],
          total_movimentacoes: row.total_movimentacoes || 0,
          prazoVencimento: prazo.toISOString(),
          diasAteVencimento,
          possivelObrigacaoEnvio, // ✅ NOVO
          motivoObrigacao, // ✅ NOVO
        };
      });
    } catch (error: any) {
      console.error('[HostDadosObrigacaoService] Erro ao listar clientes sem DCTF com movimento:', error);
      console.error('[HostDadosObrigacaoService] Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Lista lançamentos de host_dados para um cliente (CNPJ limpo),
   * opcionalmente filtrando por ano/mes.
   */
  async listarLancamentosPorCliente(params: {
    cnpj: string;
    ano?: number;
    mes?: number;
  }): Promise<{
    ano: number;
    mes: number;
    competencia: string;
    cod_emp: number | null;
    razao: string;
    cnpj: string;
    relatorio: string;
    tipo: string;
    especie: string | null;
    movimentacao: number;
  }[]> {
    const cnpjLimpo = params.cnpj.replace(/\D/g, '');

    const filters: string[] = [];
    const values: any[] = [];

    // Comparar sempre CNPJ limpo, independente de como veio do Firebird historicamente
    filters.push("REPLACE(REPLACE(REPLACE(h.cnpj, '.', ''), '/', ''), '-', '') = ?");
    values.push(cnpjLimpo);

    if (params.ano) {
      filters.push('h.ano = ?');
      values.push(params.ano);
    }

    if (params.mes) {
      filters.push('h.mes = ?');
      values.push(params.mes);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const rows = await executeQuery<{
      ano: number;
      mes: number;
      cod_emp: number | null;
      razao: string;
      cnpj: string;
      relatorio: string;
      tipo: string;
      especie: string | null;
      movimentacao: number;
    }>(
      `
      SELECT
        h.ano,
        h.mes,
        h.cod_emp,
        h.razao,
        h.cnpj,
        h.relatorio,
        h.tipo,
        h.especie,
        h.movimentacao
      FROM host_dados h
      ${whereClause}
      ORDER BY h.ano DESC, h.mes DESC, h.relatorio, h.tipo, h.especie
      `,
      values,
    );

    return rows.map((row) => ({
      ...row,
      competencia: `${String(row.mes).padStart(2, '0')}/${row.ano}`,
    }));
  }

  private calcularPrazoVencimento(ano: number, mes: number): Date {
    // Mes seguinte ao fato gerador
    const nextMonth = mes === 12 ? 1 : mes + 1;
    const nextYear = mes === 12 ? ano + 1 : ano;

    // Último dia do mês seguinte
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0, 12, 0, 0, 0));

    // Ajustar para último dia útil (seg a sex)
    while (lastDay.getUTCDay() === 0 || lastDay.getUTCDay() === 6) {
      lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    }

    return lastDay;
  }

  private calcularDiasAteVencimento(hoje: Date, prazo: Date): number {
    const start = new Date(
      Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()),
    );
    const end = new Date(
      Date.UTC(prazo.getUTCFullYear(), prazo.getUTCMonth(), prazo.getUTCDate()),
    );
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Define obrigação baseado em:
   * 1. Movimento no mês X → obrigação no mês X+1
   * 2. "Original sem movimento" dispensa meses seguintes
   * 3. Histórico de movimentos e declarações
   * 
   * CONFORME IN RFB 2.237/2024, Art. 3º:
   * - Movimento no mês X → obrigação SIM no mês X+1 (subsequente)
   * - "Original sem movimento" no mês X → dispensa meses seguintes até novo movimento
   */
  private definirObrigacaoRobusta(
    teveMovimento: boolean,
    temDctf: boolean,
    temOriginalSemMovimentoAnterior: boolean,
    diasAteVencimento: number,
  ): { obrigacao: ObrigacaoStatus; severidade: ObrigacaoSeveridade } {
    
    // REGRA 1: Se NÃO teve movimento no mês analisado → VERIFICAR
    // (pode ter obrigação se não enviou "Original sem movimento")
    if (!teveMovimento) {
      // Se há "Original sem movimento" que dispensa, não tem obrigação
      if (temOriginalSemMovimentoAnterior) {
        console.log('[HostDadosObrigacaoService] Sem movimento mas há "Original sem movimento" que dispensa → NAO');
        return { obrigacao: 'NAO', severidade: 'baixa' };
      }
      // Sem movimento e sem dispensa → precisa verificar se deve enviar "Original sem movimento"
      console.log('[HostDadosObrigacaoService] Sem movimento e sem dispensa → VERIFICAR');
      return { obrigacao: 'VERIFICAR', severidade: 'baixa' };
    }

    // REGRA 2: Teve movimento no mês X → obrigação SIM no mês X+1
    // Mas verificar se há "Original sem movimento" que ainda está válido
    // (se houve movimento DEPOIS do "Original sem movimento", a dispensa foi quebrada)
    if (temOriginalSemMovimentoAnterior) {
      // Se tem "Original sem movimento" mas ainda teve movimento,
      // significa que houve movimento DEPOIS da dispensa, então voltou a ter obrigação
      // Mas a query já verifica isso, então se chegou aqui com movimento e dispensa,
      // significa que a dispensa foi quebrada pelo movimento atual
      console.log('[HostDadosObrigacaoService] Teve movimento (dispensa quebrada) → SIM');
    }

    // REGRA 3: Se já tem DCTF para o mês subsequente → NÃO tem obrigação
    if (temDctf) {
      console.log('[HostDadosObrigacaoService] Já tem DCTF → NAO');
      return { obrigacao: 'NAO', severidade: 'baixa' };
    }

    // REGRA 4: Teve movimento e NÃO tem DCTF → obrigação SIM
    if (diasAteVencimento < 0) {
      // Vencido
      console.log('[HostDadosObrigacaoService] Teve movimento, sem DCTF, vencido → SIM (alta)');
      return { obrigacao: 'SIM', severidade: 'alta' };
    }

    if (diasAteVencimento <= 5) {
      // Próximo do vencimento
      console.log('[HostDadosObrigacaoService] Teve movimento, sem DCTF, próximo vencimento → SIM (alta)');
      return { obrigacao: 'SIM', severidade: 'alta' };
    }

    console.log('[HostDadosObrigacaoService] Teve movimento, sem DCTF, dentro do prazo → SIM (media)');
    return { obrigacao: 'SIM', severidade: 'media' };
  }
}


