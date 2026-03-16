-- ============================================================================
-- MIGRAÇÃO 029: ADICIONAR COLUNA regime_tributario NA TABELA clientes
-- ============================================================================
-- Campo para regime tributário do cliente (ex.: Simples Nacional, Lucro Presumido, Lucro Real).
-- O código (ClienteController, Clientes.tsx) já usa e persiste este campo; sem a coluna,
-- os valores não são gravados e aparecem vazios. Execute no banco DCTF_WEB.
-- Pode ser executado mais de uma vez (ignora se a coluna já existir).
-- ============================================================================

USE DCTF_WEB;

-- Adicionar coluna regime_tributario (após simei_data_exclusao ou capital_social), somente se não existir
SET @db_name = DATABASE();
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'regime_tributario'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE clientes ADD COLUMN regime_tributario VARCHAR(120) NULL COMMENT ''Simples Nacional, Lucro Presumido, Lucro Real, A Definir'' AFTER endereco',
  'SELECT ''Coluna regime_tributario já existe.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
