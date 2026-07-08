-- ============================================================================
-- MIGRATION 010: colunas estruturadas em estudo_viabilidade_cnaes
-- ============================================================================
-- A tabela 009 capturava apenas {descricao, trecho}. Legislacoes de Vigilancia
-- Sanitaria trazem CNAEs em TABELAS com colunas: Denominacao, Compreende,
-- Grau de Risco, Condicao de Classificacao, Orgao competente. Adicionar.
-- ============================================================================

ALTER TABLE `estudo_viabilidade_cnaes`
  ADD COLUMN `denominacao`                  TEXT NULL,
  ADD COLUMN `grau_risco`                   VARCHAR(100) NULL,
  ADD COLUMN `compreende_atuacao`           TEXT NULL,
  ADD COLUMN `condicao_classificacao_risco` TEXT NULL,
  ADD COLUMN `orgao_vigilancia`             TEXT NULL;

CREATE INDEX `idx_estudo_viab_grau_risco`
  ON `estudo_viabilidade_cnaes` (`grau_risco`);
