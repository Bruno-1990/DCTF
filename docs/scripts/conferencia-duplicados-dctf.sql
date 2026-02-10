-- =============================================================================
-- CONFERÊNCIA DE DUPLICADOS - dctf_declaracoes
-- =============================================================================
-- Chave de unicidade: NÚMERO DE IDENTIFICAÇÃO (cnpj) + PERÍODO + DATA TRANSMISSÃO
--                     + CATEGORIA + ORIGEM + TIPO + SITUAÇÃO + DÉBITO + SALDO
-- Execute no MySQL para listar grupos que têm mais de um registro (duplicados).
-- =============================================================================

-- 1) Grupos duplicados (mesma chave lógica, mais de um registro)
SELECT
  cnpj AS numero_identificacao,
  periodo_apuracao AS periodo_apuracao,
  data_transmissao AS data_transmissao,
  categoria,
  origem,
  tipo,
  situacao,
  debito_apurado AS debito_apurado,
  saldo_a_pagar AS saldo_a_pagar,
  COUNT(*) AS qtd_registros,
  GROUP_CONCAT(id ORDER BY created_at ASC) AS ids,
  MIN(created_at) AS primeiro_registro,
  MAX(created_at) AS ultimo_registro
FROM dctf_declaracoes
WHERE cnpj IS NOT NULL
  AND periodo_apuracao IS NOT NULL
GROUP BY
  cnpj,
  periodo_apuracao,
  data_transmissao,
  categoria,
  origem,
  tipo,
  situacao,
  debito_apurado,
  saldo_a_pagar
HAVING COUNT(*) > 1
ORDER BY qtd_registros DESC, cnpj, periodo_apuracao;

-- 2) Resumo: total de grupos duplicados e total de registros envolvidos
SELECT
  COUNT(*) AS grupos_duplicados,
  SUM(qtd) AS total_registros_duplicados,
  SUM(qtd) - COUNT(*) AS registros_a_remover_para_ficar_um_por_grupo
FROM (
  SELECT COUNT(*) AS qtd
  FROM dctf_declaracoes
  WHERE cnpj IS NOT NULL
    AND periodo_apuracao IS NOT NULL
  GROUP BY
    cnpj,
    periodo_apuracao,
    data_transmissao,
    categoria,
    origem,
    tipo,
    situacao,
    debito_apurado,
    saldo_a_pagar
  HAVING COUNT(*) > 1
) t;
