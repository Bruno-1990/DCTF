-- ============================================================================
-- MIGRATION 008: Adicionar controle de envio do e-BEF na tabela clientes
-- ============================================================================
-- Acrescenta dois campos para o usuário controlar manualmente se o e-BEF
-- (Beneficiários Finais) já foi enviado por empresa-mãe e quando foi marcado.
--
-- MySQL:
--   ebef_enviado     TINYINT(1) NOT NULL DEFAULT 0
--   ebef_enviado_em  DATETIME NULL
-- ============================================================================

ALTER TABLE `clientes`
  ADD COLUMN `ebef_enviado` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `ebef_enviado_em` DATETIME NULL;

CREATE INDEX `idx_clientes_ebef_enviado` ON `clientes` (`ebef_enviado`);
