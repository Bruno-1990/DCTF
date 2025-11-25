-- ============================================================================
-- MIGRAÇÃO 005: CRIAR TABELA SITF_DOWNLOADS (MySQL)
-- ============================================================================
-- Adaptado do schema Supabase para MySQL
-- Armazena downloads de PDFs do SITF (Situação Fiscal)
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA: sitf_downloads
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitf_downloads (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  cnpj VARCHAR(14) NOT NULL COMMENT 'CNPJ do contribuinte',
  file_url TEXT COMMENT 'URL do arquivo PDF no storage',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação',
  extracted_data JSON COMMENT 'Dados estruturados extraídos do PDF (débitos, pendências, texto, etc.)',
  pdf_base64 LONGTEXT COMMENT 'PDF em formato base64 para extração de dados sob demanda',
  
  INDEX idx_sitf_downloads_cnpj (cnpj),
  INDEX idx_sitf_downloads_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Downloads de PDFs do SITF (Situação Fiscal)';

-- ============================================================================
-- TABELA: sitf_protocols
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitf_protocols (
  cnpj VARCHAR(14) PRIMARY KEY COMMENT 'CNPJ do contribuinte',
  protocolo TEXT COMMENT 'Número do protocolo',
  status VARCHAR(20) DEFAULT 'novo' COMMENT 'Status do protocolo',
  next_eligible_at TIMESTAMP NULL COMMENT 'Próxima data elegível para consulta',
  expires_at TIMESTAMP NULL COMMENT 'Data de expiração do protocolo',
  file_url TEXT COMMENT 'URL do arquivo quando disponível',
  last_response JSON COMMENT 'Última resposta da API',
  attempts INT DEFAULT 0 COMMENT 'Número de tentativas',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_sitf_protocols_status (status),
  INDEX idx_sitf_protocols_next_eligible (next_eligible_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Protocolos de consulta SITF';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================





