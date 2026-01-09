-- Migration 013: Criar tabela temporária para CNPJs pendentes de consulta em lote
-- Esta tabela armazena CNPJs de empresas na aba Participação que têm divergências
-- e precisam ser consultados na Situação Fiscal

CREATE TABLE IF NOT EXISTS `sitf_lote_cnpjs_pendentes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cnpj` VARCHAR(14) NOT NULL COMMENT 'CNPJ limpo (14 dígitos)',
  `razao_social` VARCHAR(255) NULL COMMENT 'Razão social da empresa',
  `cliente_id` VARCHAR(36) NULL COMMENT 'ID do cliente na tabela clientes',
  `motivo` VARCHAR(255) NULL COMMENT 'Motivo da inclusão (ex: "Divergência em percentuais", "Divergência em valores")',
  `status` ENUM('pendente', 'processando', 'concluido', 'erro') DEFAULT 'pendente' COMMENT 'Status do processamento',
  `tentativas` INT DEFAULT 0 COMMENT 'Número de tentativas de processamento',
  `ultimo_erro` TEXT NULL COMMENT 'Última mensagem de erro, se houver',
  `criado_em` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação do registro',
  `processado_em` DATETIME NULL COMMENT 'Data em que foi processado com sucesso',
  `progress_id` VARCHAR(36) NULL COMMENT 'ID do progresso de lote que está processando este CNPJ',
  UNIQUE KEY `uk_cnpj` (`cnpj`),
  INDEX `idx_status` (`status`),
  INDEX `idx_progress_id` (`progress_id`),
  INDEX `idx_criado_em` (`criado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela temporária para armazenar CNPJs pendentes de consulta em lote de Situação Fiscal';

