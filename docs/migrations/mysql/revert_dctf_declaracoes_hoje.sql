-- ============================================================================
-- REVERTER ALTERAÇÕES DE HOJE NA TABELA dctf_declaracoes
-- ============================================================================
-- Este script ajuda a reverter inserções e, se houver backup, modificações
-- feitas na data de hoje.
--
-- O QUE É POSSÍVEL REVERTER SEM BACKUP:
--   1. INSERÇÕES de hoje: registros onde DATE(created_at) = data de hoje.
--      → Basta deletar esses registros.
--
-- O QUE NÃO É POSSÍVEL REVERTER SEM BACKUP:
--   2. MODIFICAÇÕES (UPDATEs) de hoje: registros onde DATE(updated_at) = hoje
--      mas created_at < hoje. O MySQL não guarda valores antigos; só com
--      backup ou point-in-time recovery (binlog) dá para restaurar.
--
-- USO:
--   Execute primeiro as consultas de diagnóstico (1 e 2).
--   Para reverter apenas os INSERIDOS hoje, execute o bloco 3.
--   Faça backup da tabela antes se quiser segurança extra.
-- ============================================================================

USE dctf_web;

-- ----------------------------------------------------------------------------
-- 1. DIAGNÓSTICO: quantos registros foram INSERIDOS hoje
--    (created_at na data de hoje)
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*) AS inseridos_hoje
FROM dctf_declaracoes
WHERE DATE(created_at) = CURDATE();

-- Listar IDs (opcional)
-- SELECT id, cnpj, periodo_apuracao, created_at
-- FROM dctf_declaracoes
-- WHERE DATE(created_at) = CURDATE()
-- ORDER BY created_at;

-- ----------------------------------------------------------------------------
-- 2. DIAGNÓSTICO: quantos registros foram MODIFICADOS hoje
--    (updated_at na data de hoje, mas criados em outro dia)
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*) AS modificados_hoje
FROM dctf_declaracoes
WHERE DATE(updated_at) = CURDATE()
  AND DATE(created_at) < CURDATE();

-- ----------------------------------------------------------------------------
-- 3. REVERTER INSERÇÕES DE HOJE (apenas os que foram criados hoje)
--    Execute somente se quiser remover esses registros.
--    Recomendação: faça backup antes, ex.:
--      CREATE TABLE dctf_declaracoes_backup_YYYYMMDD AS SELECT * FROM dctf_declaracoes WHERE DATE(created_at) = CURDATE();
-- ----------------------------------------------------------------------------
-- DELETE FROM dctf_declaracoes
-- WHERE DATE(created_at) = CURDATE();

-- Para usar uma data específica em vez de "hoje" (ex.: 2026-02-26):
-- DELETE FROM dctf_declaracoes
-- WHERE DATE(created_at) = '2026-02-26';
