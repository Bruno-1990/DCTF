-- ============================================================================
-- MIGRAÇÃO 018: REMOVER TABELAS DE RECEITA PAGAMENTOS (MySQL)
-- ============================================================================
-- Remove tabelas da funcionalidade de consulta/sincronização de pagamentos
-- da Receita Federal (aba Pagamentos descontinuada).
-- Ordem: primeiro tabelas que referenciam outras (receita_erros -> receita_sincronizacoes -> receita_pagamentos).
-- ============================================================================

USE dctf_web;

-- Tabela de erros (referencia receita_sincronizacoes)
DROP TABLE IF EXISTS receita_erros_consulta;

-- Tabela de sincronizações
DROP TABLE IF EXISTS receita_sincronizacoes;

-- Tabela de pagamentos (referencia dctf_declaracoes; FK é removida com a tabela)
DROP TABLE IF EXISTS receita_pagamentos;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
