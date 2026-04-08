-- ============================================================================
-- MIGRACAO 033: ADICIONAR COLUNA beneficios_fiscais NA TABELA clientes
-- ============================================================================
-- Campo para beneficios fiscais do cliente (ex.: SUBSTITUTO, FUNDAP, COMPETE).
-- Valores vem do OneClick (tabela cad_cli_bnf + cad_cli_beneficios).
-- Um cliente pode ter multiplos beneficios, armazenados como texto separado por virgula.
-- Pode ser executado mais de uma vez (ignora se a coluna ja existir).
-- ============================================================================

USE DCTF_WEB;

SET @db_name = DATABASE();
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'beneficios_fiscais'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE clientes ADD COLUMN beneficios_fiscais VARCHAR(500) NULL COMMENT ''Beneficios fiscais (ex: SUBSTITUTO, FUNDAP, COMPETE ATACADISTA)'' AFTER regime_tributario',
  'SELECT ''Coluna beneficios_fiscais ja existe.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
