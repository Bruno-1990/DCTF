-- ============================================================================
-- MIGRAÇÃO 009: CRIAR TABELA BANCO_HORAS_RELATORIOS
-- ============================================================================
-- Tabela para armazenar histórico de relatórios de banco de horas gerados
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA: banco_horas_relatorios
-- ============================================================================
CREATE TABLE IF NOT EXISTS banco_horas_relatorios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cnpj VARCHAR(18) NOT NULL COMMENT 'CNPJ da empresa (apenas números)',
    razao_social VARCHAR(255) NULL COMMENT 'Razão social da empresa',
    data_inicial DATE NOT NULL COMMENT 'Data inicial do período',
    data_final DATE NOT NULL COMMENT 'Data final do período',
    arquivo_path VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Caminho completo do arquivo gerado',
    nome_arquivo VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Nome do arquivo gerado',
    tamanho_arquivo BIGINT NULL COMMENT 'Tamanho do arquivo em bytes',
    status ENUM('gerando', 'concluido', 'erro') NOT NULL DEFAULT 'gerando' COMMENT 'Status da geração',
    erro TEXT NULL COMMENT 'Mensagem de erro (se houver)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação do registro',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de atualização',
    
    -- Índices para melhor performance
    INDEX idx_banco_horas_cnpj (cnpj),
    INDEX idx_banco_horas_status (status),
    INDEX idx_banco_horas_data_inicial (data_inicial),
    INDEX idx_banco_horas_data_final (data_final),
    INDEX idx_banco_horas_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Histórico de relatórios de banco de horas gerados';



