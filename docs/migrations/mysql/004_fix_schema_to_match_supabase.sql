-- ============================================================================
-- MIGRAÇÃO 004: AJUSTAR SCHEMA MYSQL PARA SER ESPELHO DO SUPABASE
-- ============================================================================
-- Este script ajusta o schema MySQL para ser idêntico ao Supabase
-- Baseado na estrutura real do Supabase (não no arquivo database-schema.sql)
-- ============================================================================

USE DCTF_WEB;

-- ============================================================================
-- AJUSTES NA TABELA dctf_declaracoes
-- ============================================================================

-- Adicionar colunas que existem no Supabase mas não no MySQL
ALTER TABLE dctf_declaracoes 
ADD COLUMN IF NOT EXISTS metadados TEXT NULL COMMENT 'Metadados da declaração (JSON)',
ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NULL COMMENT 'Tipo da declaração';

-- Remover colunas que NÃO existem no Supabase
-- (Comentadas para não perder dados - descomente se necessário)
-- ALTER TABLE dctf_declaracoes 
-- DROP COLUMN IF EXISTS periodo,
-- DROP COLUMN IF EXISTS data_declaracao,
-- DROP COLUMN IF EXISTS status,
-- DROP COLUMN IF EXISTS numero_identificacao,
-- DROP COLUMN IF EXISTS tipo_declaracao,
-- DROP COLUMN IF EXISTS arquivo_original,
-- DROP COLUMN IF EXISTS arquivo_processado,
-- DROP COLUMN IF EXISTS total_registros,
-- DROP COLUMN IF EXISTS observacoes;

-- Criar índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_dctf_tipo ON dctf_declaracoes(tipo);

-- ============================================================================
-- AJUSTES NA TABELA clientes
-- ============================================================================

-- As colunas email, telefone, endereco, cod_emp existem no MySQL mas não no Supabase
-- Mantendo-as por enquanto (podem ser úteis para integração com Export)
-- Se quiser remover para ser 100% espelho:
-- ALTER TABLE clientes 
-- DROP COLUMN IF EXISTS email,
-- DROP COLUMN IF EXISTS telefone,
-- DROP COLUMN IF EXISTS endereco,
-- DROP COLUMN IF EXISTS cod_emp;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Verificar estrutura final
SHOW COLUMNS FROM dctf_declaracoes;
SHOW COLUMNS FROM clientes;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================































