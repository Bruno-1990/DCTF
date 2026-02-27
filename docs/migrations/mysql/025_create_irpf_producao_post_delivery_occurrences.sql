-- ============================================================================
-- MIGRAÇÃO 025: OCORRÊNCIAS PÓS-ENTREGA (Task 17 / RF-061)
-- ============================================================================
-- Malha/retificação: motivo catalogado e anexo opcional (document_id).
-- ============================================================================

CREATE TABLE IF NOT EXISTS irpf_producao_post_delivery_occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  motivo VARCHAR(50) NOT NULL COMMENT 'Lista fechada: MALHA_FINA, RETIFICACAO, COMPLEMENTACAO, OUTROS',
  observacao TEXT DEFAULT NULL,
  document_id INT DEFAULT NULL COMMENT 'Anexo opcional (documento do case)',
  created_by VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_pdo_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pdo_document FOREIGN KEY (document_id) REFERENCES irpf_producao_documents(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ocorrências pós-entrega (malha/retificação) RF-061';
