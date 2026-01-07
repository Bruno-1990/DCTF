-- ============================================================================
-- Migration 011: Adicionar CPF e campos de participação aos sócios
-- ============================================================================
-- Descrição:
--   Adiciona o campo CPF aos sócios e garante que os campos de participação
--   (participacao_percentual e participacao_valor) existam na tabela.
--
-- Data: 2026-01-06
-- ============================================================================

USE dctf_web;

-- Adicionar coluna CPF (se não existir)
SET @dbname = DATABASE();
SET @tablename = 'clientes_socios';
SET @columnname = 'cpf';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` VARCHAR(14) NULL COMMENT ''CPF do sócio (somente números)'' AFTER `nome`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Adicionar índice para CPF (se não existir)
SET @indexname = 'idx_clientes_socios_cpf';
SET @preparedStatement2 = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND INDEX_NAME = @indexname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD INDEX `', @indexname, '` (`cpf`)')
));
PREPARE alterIfNotExists2 FROM @preparedStatement2;
EXECUTE alterIfNotExists2;
DEALLOCATE PREPARE alterIfNotExists2;

-- Adicionar coluna participacao_percentual (se não existir)
SET @columnname = 'participacao_percentual';
SET @preparedStatement3 = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` DECIMAL(5,2) NULL COMMENT ''Porcentagem de participação no capital social'' AFTER `qual`')
));
PREPARE alterIfNotExists3 FROM @preparedStatement3;
EXECUTE alterIfNotExists3;
DEALLOCATE PREPARE alterIfNotExists3;

-- Adicionar coluna participacao_valor (se não existir)
SET @columnname = 'participacao_valor';
SET @preparedStatement4 = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` DECIMAL(15,2) NULL COMMENT ''Valor da participação calculado (capital_social * participacao_percentual / 100)'' AFTER `participacao_percentual`')
));
PREPARE alterIfNotExists4 FROM @preparedStatement4;
EXECUTE alterIfNotExists4;
DEALLOCATE PREPARE alterIfNotExists4;

-- ============================================================================
-- Verificação final
-- ============================================================================

SELECT 
  'clientes_socios' as tabela,
  COLUMN_NAME as coluna,
  COLUMN_TYPE as tipo,
  IS_NULLABLE as nulavel,
  COLUMN_COMMENT as comentario
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'clientes_socios'
  AND COLUMN_NAME IN ('cpf', 'participacao_percentual', 'participacao_valor')
ORDER BY ORDINAL_POSITION;

-- ============================================================================
-- FIM
-- ============================================================================

