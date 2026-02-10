-- ============================================================================
-- MIGRAÇÃO 019: ADICIONAR COLUNA nome_pasta_rede NA TABELA clientes
-- ============================================================================
-- Campo para caminho da pasta do cliente na rede (ex.: \\192.168.0.9\Clientes\NOME)
-- Execute no banco DCTF_WEB. Pode ser executado mais de uma vez (ignora se já existir).
-- ============================================================================

USE DCTF_WEB;

-- Adicionar coluna nome_pasta_rede (após endereco), somente se não existir
SET @db_name = DATABASE();
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'nome_pasta_rede'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE clientes ADD COLUMN nome_pasta_rede VARCHAR(255) NULL COMMENT ''Caminho da pasta na rede'' AFTER endereco',
  'SELECT ''Coluna nome_pasta_rede já existe.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
