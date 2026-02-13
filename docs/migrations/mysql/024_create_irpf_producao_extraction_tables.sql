-- ============================================================================
-- MIGRAÇÃO 024: EXTRAÇÃO DINÂMICA (Task 10, PRD 8.7, RF-044 a RF-048)
-- ============================================================================
-- document_extraction_config: regras por doc_type/fonte; versionamento.
-- document_extracted_data: resultados por document_id com rule_version, confidence_score, override.
-- documents.raw_text: texto extraído quando não há regra (Task 10.3).
-- ============================================================================

-- Regras de extração por doc_type (e opcionalmente source); versionadas
CREATE TABLE IF NOT EXISTS irpf_producao_document_extraction_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_type VARCHAR(50) NOT NULL COMMENT 'Tipo de documento (ex: INF_REND, CADASTRO)',
  source VARCHAR(50) DEFAULT NULL COMMENT 'Fonte opcional para regra específica',
  extrator_nome VARCHAR(80) NOT NULL COMMENT 'Nome do extrator (ex: cpf_regex)',
  tipo VARCHAR(30) NOT NULL DEFAULT 'regex' COMMENT 'regex, posição, tabela, modelo',
  parametros JSON DEFAULT NULL COMMENT 'Parâmetros do extrator (ex: padrão regex)',
  campo_destino VARCHAR(80) NOT NULL COMMENT 'Campo de destino (declaration_* ou checklist)',
  versao_regra SMALLINT NOT NULL DEFAULT 1 COMMENT 'Versão da regra para reprodutibilidade',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_config_doc_type (doc_type),
  INDEX idx_config_doc_source (doc_type, source),
  INDEX idx_config_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Regras de extração por docType/fonte; versionamento (RF-044)';

-- Dados extraídos por documento; rule_version para rastreabilidade (RF-046, RNF-042)
CREATE TABLE IF NOT EXISTS irpf_producao_document_extracted_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  rule_version SMALLINT NOT NULL COMMENT 'Versão da regra usada',
  config_id INT DEFAULT NULL COMMENT 'FK opcional à regra usada',
  campo_destino VARCHAR(80) NOT NULL,
  valor_extraido TEXT DEFAULT NULL COMMENT 'Valor bruto extraído',
  valor_normalizado VARCHAR(500) DEFAULT NULL COMMENT 'Valor normalizado',
  confidence_score DECIMAL(5,4) DEFAULT NULL COMMENT '0-1; abaixo de limiar → revisão (RF-047)',
  raw_snippet TEXT DEFAULT NULL COMMENT 'Trecho do texto de onde saiu o valor',
  override_by VARCHAR(100) DEFAULT NULL COMMENT 'Override humano com auditoria',
  override_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_extracted_document (document_id),
  INDEX idx_extracted_campo (document_id, campo_destino),
  CONSTRAINT fk_extracted_document FOREIGN KEY (document_id) REFERENCES irpf_producao_documents(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_extracted_config FOREIGN KEY (config_id) REFERENCES irpf_producao_document_extraction_config(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Resultados de extração por document; override humano auditado (RF-046)';

-- Texto bruto extraído (PDF/editável) para documento sem regra ou para reprocessamento (Task 10.3)
ALTER TABLE irpf_producao_documents
  ADD COLUMN IF NOT EXISTS raw_text LONGTEXT DEFAULT NULL COMMENT 'Texto extraído (quando sem regra ou para pipeline)'
  AFTER extraction_attempts;
