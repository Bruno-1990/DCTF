-- ============================================================================
-- MIGRAÇÃO 021: TABELA DOCUMENTS DO MÓDULO IRPF PRODUÇÃO (PRD seção 12)
-- ============================================================================
-- Metadados de documentos: case_id, doc_type, version, sha256, extraction_*
-- ============================================================================

CREATE TABLE IF NOT EXISTS irpf_producao_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  doc_type VARCHAR(50) NOT NULL COMMENT 'Tipo de documento (ex: INFORMES, DEC_GERADO)',
  source VARCHAR(50) DEFAULT NULL COMMENT 'Origem (upload, gerado, etc.)',
  version SMALLINT NOT NULL DEFAULT 1,
  sha256 VARCHAR(64) DEFAULT NULL COMMENT 'Hash para deduplicação',
  file_path VARCHAR(500) DEFAULT NULL COMMENT 'Caminho na pasta de rede',
  file_size INT DEFAULT NULL,
  uploaded_by VARCHAR(100) DEFAULT NULL,
  extraction_status VARCHAR(30) DEFAULT NULL COMMENT 'PENDING, EXTRACTING, EXTRACTED, REQUIRES_REVIEW, extraction_error_message',
  extraction_flow VARCHAR(30) DEFAULT NULL COMMENT 'node, webhook',
  extraction_error_message TEXT DEFAULT NULL,
  extraction_attempts SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  INDEX idx_extraction_status (extraction_status),
  INDEX idx_doc_case_type_source_version (case_id, doc_type, source, version),
  INDEX idx_sha256 (sha256),
  CONSTRAINT fk_documents_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Documentos do case IRPF';
