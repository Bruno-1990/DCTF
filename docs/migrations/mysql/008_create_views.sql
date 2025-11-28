-- ============================================================================
-- MIGRAÇÃO 008: CRIAR VIEWS MYSQL PARA CONFERÊNCIAS
-- ============================================================================
-- Views equivalentes às do Supabase para compatibilidade
-- Execute este script no MySQL DCTF_WEB
-- ============================================================================

USE DCTF_WEB;

-- ============================================================================
-- VIEW: vw_pagamentos_competencia
-- Agrega pagamentos por competência e código de receita
-- ============================================================================
CREATE OR REPLACE VIEW vw_pagamentos_competencia AS
SELECT
  rp.cnpj_contribuinte,
  COALESCE(
    NULLIF(rp.competencia, ''),
    DATE_FORMAT(rp.periodo_apuracao, '%Y-%m'),
    DATE_FORMAT(rp.data_arrecadacao, '%Y-%m')
  ) AS competencia,
  COALESCE(
    NULLIF(rp.codigo_receita_linha, ''),
    NULLIF(rp.codigo_receita_doc, '')
  ) AS codigo_receita,
  SUM(COALESCE(rp.valor_principal_linha, rp.valor_principal, 0)) AS total_principal,
  SUM(COALESCE(rp.valor_documento, 0)) AS total_documento,
  MAX(
    GREATEST(
      0,
      DATEDIFF(rp.data_arrecadacao, rp.data_vencimento)
    )
  ) AS atraso_max_dias
FROM receita_pagamentos rp
GROUP BY 
  rp.cnpj_contribuinte,
  COALESCE(
    NULLIF(rp.competencia, ''),
    DATE_FORMAT(rp.periodo_apuracao, '%Y-%m'),
    DATE_FORMAT(rp.data_arrecadacao, '%Y-%m')
  ),
  COALESCE(
    NULLIF(rp.codigo_receita_linha, ''),
    NULLIF(rp.codigo_receita_doc, '')
  );

-- ============================================================================
-- VIEW: vw_dctf_competencia
-- Agrega declarações DCTF por competência (total declarado)
-- ============================================================================
CREATE OR REPLACE VIEW vw_dctf_competencia AS
SELECT
  d.cliente_id,
  d.periodo_apuracao AS competencia,
  d.cnpj,
  SUM(COALESCE(dd.valor, 0)) AS total_declarado
FROM dctf_declaracoes d
LEFT JOIN dctf_dados dd ON dd.declaracao_id = d.id
GROUP BY d.cliente_id, d.periodo_apuracao, d.cnpj;

-- ============================================================================
-- VIEW: vw_dctf_competencia (alternativa com período formatado)
-- Se período_apuracao estiver no formato MM/YYYY, converte para YYYY-MM
-- ============================================================================
-- Nota: Esta view assume que periodo_apuracao pode estar em formato MM/YYYY
-- Se estiver em outro formato, ajuste conforme necessário

-- ============================================================================
-- ÍNDICES para melhorar performance das views
-- ============================================================================
-- Os índices já devem existir nas tabelas base, mas verificamos:

-- Índices em receita_pagamentos (se não existirem)
-- CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_cnpj ON receita_pagamentos(cnpj_contribuinte);
-- CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_competencia ON receita_pagamentos(competencia);
-- CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_periodo ON receita_pagamentos(periodo_apuracao);

-- Índices em dctf_declaracoes (se não existirem)
-- CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_cliente_id ON dctf_declaracoes(cliente_id);
-- CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_periodo ON dctf_declaracoes(periodo_apuracao);

-- Índices em dctf_dados (se não existirem)
-- CREATE INDEX IF NOT EXISTS idx_dctf_dados_declaracao_id ON dctf_dados(declaracao_id);

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================

















