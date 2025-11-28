-- ============================================================================
-- MIGRAÇÃO 003: ADICIONAR COLUNA CNPJ NA TABELA dctf_declaracoes
-- ============================================================================
-- Este script adiciona a coluna cnpj que estava faltando na tabela
-- dctf_declaracoes, presente no Supabase mas não incluída na migração inicial
-- ============================================================================

USE DCTF_WEB;

-- Adicionar coluna cnpj após cliente_id
ALTER TABLE dctf_declaracoes 
ADD COLUMN cnpj VARCHAR(14) NULL COMMENT 'CNPJ da declaração' 
AFTER cliente_id;

-- Criar índice para melhor performance em consultas por CNPJ
CREATE INDEX idx_dctf_cnpj ON dctf_declaracoes(cnpj);

-- Verificar alteração
SHOW COLUMNS FROM dctf_declaracoes WHERE Field = 'cnpj';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================


















