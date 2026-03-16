-- ============================================================================
-- MIGRAÇÃO 031: REMOVER TABELAS IRPF 2026 DO BANCO DCTF (dctf_web)
-- ============================================================================
-- As tabelas IRPF 2026 pertencem apenas ao banco/schema irpf2026.
-- Execute este script no MySQL para remover do dctf_web, se existirem.
-- Uso: mysql -u user -p dctf_web < docs/migrations/mysql/031_drop_irpf2026_tables_from_dctf.sql
-- ============================================================================

USE dctf_web;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS irpf2026_mensagens;
DROP TABLE IF EXISTS irpf2026_documentos;
DROP TABLE IF EXISTS irpf2026_admin;
DROP TABLE IF EXISTS irpf2026_usuarios;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- FIM
-- ============================================================================
