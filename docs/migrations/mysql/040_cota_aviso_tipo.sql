-- ============================================================================
-- MIGRACAO 040: DOIS AVISOS POR COMPETENCIA (ENQUADRAMENTO E COTA)
-- ============================================================================
-- A apuracao passou a gerar DOIS e-mails com publicos diferentes:
--
--   ENQUADRAMENTO -> Fiscal. Mudanca de porte ME/EPP/Demais (LC 123/2006).
--   COTA          -> Departamento Pessoal. Quem deve cumprir a cota de
--                    aprendizagem (IN SIT/MTE 146/2018 + CLT art. 429).
--
-- Um e-mail so obrigava cada time a garimpar no meio do assunto do outro. Sao
-- publicos, prazos e acoes distintos.
--
-- O `UNIQUE(bdref)` original garantia UM aviso por competencia — o que agora
-- impediria o segundo e-mail de sair. A chave passa a ser (bdref, tipo): a
-- dedup continua valendo, so que POR TIPO, entao um envio que falhe (e libere
-- a reserva) nao arrasta o outro junto.
--
-- As linhas ja gravadas viram tipo 'COTA' pelo DEFAULT — e o que elas eram
-- quando o e-mail era um so.
--
-- Pode ser executada mais de uma vez (idempotente).
-- ============================================================================

USE DCTF_WEB;

SET @db := DATABASE();

-- 1) Coluna `tipo`
SET @ex := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = @db
              AND TABLE_NAME = 'cota_aviso_log'
              AND COLUMN_NAME = 'tipo');
SET @sql := IF(@ex = 0,
  'ALTER TABLE cota_aviso_log
     ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT ''COTA''
     COMMENT ''Qual aviso: ENQUADRAMENTO (fiscal) | COTA (departamento pessoal)''
     AFTER bdref',
  'SELECT ''tipo ja existe'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Troca do UNIQUE(bdref) por UNIQUE(bdref, tipo).
--    Em dois passos e checando o nome do indice: derrubar um indice que nao
--    existe aborta a migration inteira.
SET @ex := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = @db
              AND TABLE_NAME = 'cota_aviso_log'
              AND INDEX_NAME = 'uk_cota_aviso_bdref');
SET @sql := IF(@ex > 0,
  'ALTER TABLE cota_aviso_log DROP INDEX uk_cota_aviso_bdref',
  'SELECT ''uk_cota_aviso_bdref ja removido'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ex := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = @db
              AND TABLE_NAME = 'cota_aviso_log'
              AND INDEX_NAME = 'uk_cota_aviso_bdref_tipo');
SET @sql := IF(@ex = 0,
  'ALTER TABLE cota_aviso_log ADD UNIQUE KEY uk_cota_aviso_bdref_tipo (bdref, tipo)',
  'SELECT ''uk_cota_aviso_bdref_tipo ja existe'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
