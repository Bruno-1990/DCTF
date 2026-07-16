-- ============================================================================
-- MIGRACAO 035: CRIAR TABELA reoa_faturamento (dados reais do SCI - REOA)
-- ============================================================================
-- Persiste o faturamento MENSAL por estabelecimento puxado AO VIVO do SCI
-- (SP_BI_FAT, QUADRO=1) para os clientes do grupo SUBSTITUTO, usado na aba REOA.
-- Independente do cache do IRPF (irpf_faturamento_detalhado, QUADRO=2): a
-- conferencia REOA PREFERE esta tabela e cai no cache do IRPF como previa.
-- Criada tambem sob demanda por SubstitutoService.ensureReoaTable()
-- (CREATE TABLE IF NOT EXISTS — idempotente).
-- ============================================================================

USE DCTF_WEB;

CREATE TABLE IF NOT EXISTS `reoa_faturamento` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cliente_id` VARCHAR(36) NOT NULL,
  `codigo_empresa` INT NOT NULL,           -- BDCODEMP do SCI (estabelecimento)
  `ano` INT NOT NULL,
  `mes` INT NOT NULL,
  `bdref` INT NOT NULL,                     -- YYYYMM
  `faturamento` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `consultado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reoa_cli_emp_ano_mes` (`cliente_id`, `codigo_empresa`, `ano`, `mes`),
  INDEX `idx_reoa_cliente` (`cliente_id`),
  INDEX `idx_reoa_bdref` (`bdref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
