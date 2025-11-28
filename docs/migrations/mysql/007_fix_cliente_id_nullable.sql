-- ============================================================================
-- MIGRAÇÃO 007: CORRIGIR cliente_id PARA SER NULLABLE E REMOVER FOREIGN KEY
-- ============================================================================
-- Objetivo: Permitir que cliente_id seja NULL e remover foreign key
--           Isso permite sincronizar dados do Supabase onde cliente_id pode ser NULL
--           ou conter CNPJs formatados em vez de UUIDs
-- Data: 2025-11-25
-- ============================================================================

USE dctf_web;

-- 1. Remover foreign key constraint (se existir)
-- Primeiro, encontrar o nome da constraint
SET @constraint_name = (
  SELECT CONSTRAINT_NAME 
  FROM information_schema.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = 'dctf_web' 
    AND TABLE_NAME = 'dctf_declaracoes' 
    AND REFERENCED_TABLE_NAME = 'clientes'
  LIMIT 1
);

-- Se encontrou, remover
SET @sql = IF(@constraint_name IS NOT NULL, 
  CONCAT('ALTER TABLE dctf_declaracoes DROP FOREIGN KEY ', @constraint_name),
  'SELECT "Foreign key não encontrada" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Tornar cliente_id nullable
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN cliente_id CHAR(36) NULL COMMENT 'ID do cliente (pode ser NULL ou CNPJ formatado do Supabase)';

-- 3. Verificar resultado
SELECT 
  column_name, 
  is_nullable, 
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'dctf_web'
  AND table_name = 'dctf_declaracoes'
  AND column_name = 'cliente_id';

-- 4. Verificar se foreign key foi removida
SELECT 
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'dctf_web'
  AND TABLE_NAME = 'dctf_declaracoes'
  AND REFERENCED_TABLE_NAME = 'clientes';
-- (Deve retornar vazio)



