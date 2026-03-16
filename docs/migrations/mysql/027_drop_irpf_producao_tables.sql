-- ============================================================================
-- MIGRAÇÃO 027: REMOVER TODAS AS TABELAS DO MÓDULO IRPF PRODUÇÃO
-- ============================================================================
-- Execute este script no MySQL para remover o módulo IRPF Produção do banco.
-- Uso: mysql -u user -p dctf_web < docs/migrations/mysql/027_drop_irpf_producao_tables.sql
-- ============================================================================

USE dctf_web;

SET FOREIGN_KEY_CHECKS = 0;

-- Declaration (026)
DROP TABLE IF EXISTS irpf_producao_declaration_totals;
DROP TABLE IF EXISTS irpf_producao_declaration_debts;
DROP TABLE IF EXISTS irpf_producao_declaration_assets;
DROP TABLE IF EXISTS irpf_producao_declaration_payments;
DROP TABLE IF EXISTS irpf_producao_declaration_dependents;
DROP TABLE IF EXISTS irpf_producao_declaration_income_exclusive;
DROP TABLE IF EXISTS irpf_producao_declaration_income_exempt;
DROP TABLE IF EXISTS irpf_producao_declaration_income_pf;
DROP TABLE IF EXISTS irpf_producao_declaration_income_pj;
DROP TABLE IF EXISTS irpf_producao_dec_layout_version;

-- Post delivery (025)
DROP TABLE IF EXISTS irpf_producao_post_delivery_occurrences;

-- Extraction (024)
DROP TABLE IF EXISTS irpf_producao_document_extracted_data;
DROP TABLE IF EXISTS irpf_producao_document_extraction_config;

-- Jobs / audit (022)
DROP TABLE IF EXISTS irpf_producao_job_runs;
DROP TABLE IF EXISTS irpf_producao_jobs;
DROP TABLE IF EXISTS irpf_producao_audit_events;
DROP TABLE IF EXISTS irpf_producao_issues;

-- Documents (021)
DROP TABLE IF EXISTS irpf_producao_documents;

-- Cases (020)
DROP TABLE IF EXISTS irpf_producao_case_people;
DROP TABLE IF EXISTS irpf_producao_cases;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- FIM
-- ============================================================================
