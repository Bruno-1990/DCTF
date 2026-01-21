-- Migration 014: Criar tabelas de auditoria para SPED v2
-- Data: 2024
-- Descrição: Tabelas para log de auditoria e controle de correções aplicadas

-- Tabela de log de auditoria
CREATE TABLE IF NOT EXISTS `sped_v2_audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `lote_id` VARCHAR(100) NOT NULL COMMENT 'ID do lote de correções',
  `correcao_id` VARCHAR(100) NOT NULL COMMENT 'ID da correção',
  `chave_nfe` VARCHAR(44) NULL COMMENT 'Chave da NF-e',
  `registro_sped` VARCHAR(10) NULL COMMENT 'Tipo de registro (C100, C170, C190)',
  `campo` VARCHAR(100) NOT NULL COMMENT 'Nome do campo alterado',
  `valor_antes` DECIMAL(15,2) NOT NULL COMMENT 'Valor antes da correção',
  `valor_depois` DECIMAL(15,2) NOT NULL COMMENT 'Valor depois da correção',
  `diferenca` DECIMAL(15,2) NOT NULL COMMENT 'Diferença entre valores',
  `regra_aplicada` VARCHAR(200) NULL COMMENT 'Regra de legitimação aplicada',
  `score_confianca` DECIMAL(5,2) NULL COMMENT 'Score de confiança da correção',
  `classificacao` VARCHAR(20) NULL COMMENT 'Classificação (ERRO, REVISAR, LEGÍTIMO)',
  `usuario_id` INT NULL COMMENT 'ID do usuário que aplicou a correção',
  `usuario_nome` VARCHAR(200) NULL COMMENT 'Nome do usuário',
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data/hora da correção',
  `metadata` JSON NULL COMMENT 'Metadados adicionais (contexto, explicação, etc.)',
  `arquivo_sped` VARCHAR(500) NULL COMMENT 'Caminho do arquivo SPED',
  `arquivo_sped_corrigido` VARCHAR(500) NULL COMMENT 'Caminho do arquivo SPED corrigido',
  INDEX `idx_lote_id` (`lote_id`),
  INDEX `idx_correcao_id` (`correcao_id`),
  INDEX `idx_chave_nfe` (`chave_nfe`),
  INDEX `idx_timestamp` (`timestamp`),
  INDEX `idx_usuario_id` (`usuario_id`),
  INDEX `idx_registro_sped` (`registro_sped`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log de auditoria de correções SPED v2';

-- Tabela de correções aplicadas (controle de lotes)
CREATE TABLE IF NOT EXISTS `sped_v2_corrections` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `lote_id` VARCHAR(100) NOT NULL UNIQUE COMMENT 'ID único do lote',
  `usuario_id` INT NULL COMMENT 'ID do usuário que criou o lote',
  `usuario_nome` VARCHAR(200) NULL COMMENT 'Nome do usuário',
  `arquivo_sped_original` VARCHAR(500) NOT NULL COMMENT 'Caminho do arquivo SPED original',
  `arquivo_sped_corrigido` VARCHAR(500) NULL COMMENT 'Caminho do arquivo SPED corrigido',
  `total_correcoes` INT NOT NULL DEFAULT 0 COMMENT 'Total de correções no lote',
  `correcoes_aplicadas` INT NOT NULL DEFAULT 0 COMMENT 'Correções aplicadas com sucesso',
  `correcoes_falhadas` INT NOT NULL DEFAULT 0 COMMENT 'Correções que falharam',
  `c190_recalculados` INT NOT NULL DEFAULT 0 COMMENT 'Total de C190 recalculados',
  `impacto_total` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Impacto total estimado',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pendente' COMMENT 'Status: pendente, aplicado, revertido, erro',
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação do lote',
  `data_aplicacao` DATETIME NULL COMMENT 'Data de aplicação das correções',
  `data_reversao` DATETIME NULL COMMENT 'Data de reversão (rollback)',
  `usuario_reversao_id` INT NULL COMMENT 'ID do usuário que reverteu',
  `usuario_reversao_nome` VARCHAR(200) NULL COMMENT 'Nome do usuário que reverteu',
  `motivo_reversao` TEXT NULL COMMENT 'Motivo da reversão',
  `metadata` JSON NULL COMMENT 'Metadados adicionais do lote',
  INDEX `idx_lote_id` (`lote_id`),
  INDEX `idx_usuario_id` (`usuario_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_data_criacao` (`data_criacao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Controle de lotes de correções SPED v2';

-- Tabela de rollback (histórico de reversões)
CREATE TABLE IF NOT EXISTS `sped_v2_rollback_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `lote_id` VARCHAR(100) NOT NULL COMMENT 'ID do lote revertido',
  `usuario_id` INT NULL COMMENT 'ID do usuário que realizou o rollback',
  `usuario_nome` VARCHAR(200) NULL COMMENT 'Nome do usuário',
  `total_correcoes_revertidas` INT NOT NULL DEFAULT 0 COMMENT 'Total de correções revertidas',
  `motivo` TEXT NULL COMMENT 'Motivo do rollback',
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data/hora do rollback',
  `metadata` JSON NULL COMMENT 'Metadados adicionais',
  INDEX `idx_lote_id` (`lote_id`),
  INDEX `idx_timestamp` (`timestamp`),
  INDEX `idx_usuario_id` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log de rollback de correções SPED v2';

