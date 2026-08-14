-- ============================================================================
-- MIGRACAO 036: SINALIZAR SOCIO QUE NAO CONSTA MAIS NO CARTAO CNPJ
-- ============================================================================
-- Ao atualizar o cadastro pela ReceitaWS, um socio que estava cadastrado mas
-- nao aparece mais no QSA do cartao NAO e excluido (isso apagaria CPF e
-- participacao preenchidos a mao). Em vez disso ele fica marcado, para que
-- quem abrir o cadastro veja que houve mudanca no quadro societario.
--
--   ausente_no_cartao      1 = nao consta no ultimo cartao consultado
--   ausente_no_cartao_em   quando a ausencia foi detectada pela primeira vez
--
-- Pode ser executado mais de uma vez (ignora se as colunas ja existirem).
-- ============================================================================

USE DCTF_WEB;

SET @db_name = DATABASE();

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'clientes_socios'
    AND COLUMN_NAME = 'ausente_no_cartao'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE clientes_socios ADD COLUMN ausente_no_cartao TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = socio nao consta mais no cartao CNPJ da ReceitaWS''',
  'SELECT ''Coluna ausente_no_cartao ja existe.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists2 = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'clientes_socios'
    AND COLUMN_NAME = 'ausente_no_cartao_em'
);

SET @sql2 = IF(@col_exists2 = 0,
  'ALTER TABLE clientes_socios ADD COLUMN ausente_no_cartao_em TIMESTAMP NULL DEFAULT NULL COMMENT ''Quando a ausencia no cartao foi detectada pela primeira vez'' AFTER ausente_no_cartao',
  'SELECT ''Coluna ausente_no_cartao_em ja existe.'' AS info'
);

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
