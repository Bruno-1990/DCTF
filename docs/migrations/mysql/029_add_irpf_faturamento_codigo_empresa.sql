-- ============================================================================
-- MIGRAÇÃO 029: Adicionar coluna codigo_empresa às tabelas de cache IRPF faturamento
-- ============================================================================
-- Corrige o erro "Unknown column 'codigo_empresa' in 'field list'" quando
-- as tabelas foram criadas antes da coluna existir no código.
-- Execute uma vez no MySQL. Se aparecer "Duplicate column name", a coluna já existe.
-- ============================================================================

USE dctf_web;

-- irpf_faturamento_consolidado (ignore se "Duplicate column name")
ALTER TABLE `irpf_faturamento_consolidado`
  ADD COLUMN `codigo_empresa` INT NOT NULL DEFAULT 1 AFTER `codigo_sci`;

-- irpf_faturamento_mini (ignore se "Duplicate column name")
ALTER TABLE `irpf_faturamento_mini`
  ADD COLUMN `codigo_empresa` INT NOT NULL DEFAULT 1 AFTER `codigo_sci`;
