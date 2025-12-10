-- ============================================================================
-- MIGRAÇÃO 002: CORRIGIR CAMPO PERIODO PARA PERMITIR NULL
-- ============================================================================
-- Este script corrige o campo 'periodo' na tabela dctf_declaracoes
-- para permitir valores NULL, pois algumas declarações no Supabase
-- não possuem esse campo
-- ============================================================================

USE DCTF_WEB;

-- Alterar campo periodo para permitir NULL
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN periodo VARCHAR(7) NULL COMMENT 'Formato: YYYY-MM';

-- Verificar alteração
SHOW COLUMNS FROM dctf_declaracoes WHERE Field = 'periodo';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================































