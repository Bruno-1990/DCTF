-- ============================================================================
-- MIGRAÇÃO 022: ISSUES, AUDIT_EVENTS, JOBS, JOB_RUNS (PRD seção 12)
-- ============================================================================
-- Índices: issues(case_id, severity, status); audit_events(case_id, created_at)
-- ============================================================================

-- Pendências/validações do case (INFO, WARN, BLOCKER)
CREATE TABLE IF NOT EXISTS irpf_producao_issues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'INFO' COMMENT 'INFO, WARN, BLOCKER',
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN, RESOLVED, DISMISSED',
  code VARCHAR(50) DEFAULT NULL COMMENT 'Código da regra ou validação',
  message TEXT DEFAULT NULL,
  document_id INT DEFAULT NULL,
  created_by VARCHAR(100) DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  resolved_by VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_issues_case_severity_status (case_id, severity, status),
  INDEX idx_case (case_id),
  CONSTRAINT fk_issues_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_issues_document FOREIGN KEY (document_id) REFERENCES irpf_producao_documents(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pendências e validações do case';

-- Trilha de auditoria (RF-005, RF-012, RF-025)
CREATE TABLE IF NOT EXISTS irpf_producao_audit_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  event_type VARCHAR(80) NOT NULL COMMENT 'Ex: status_change, document_upload, issue_resolved',
  actor VARCHAR(100) DEFAULT NULL,
  payload JSON DEFAULT NULL COMMENT 'Detalhes do evento',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_case_created (case_id, created_at),
  INDEX idx_case (case_id),
  CONSTRAINT fk_audit_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Eventos de auditoria';

-- Definição de jobs (extract_text, classify, validate, generate_dec, etc.)
CREATE TABLE IF NOT EXISTS irpf_producao_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL COMMENT 'extract_text, classify, validate, generate_dec',
  case_id INT DEFAULT NULL,
  document_id INT DEFAULT NULL,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_jobs_case (case_id),
  INDEX idx_jobs_type (job_type),
  CONSTRAINT fk_jobs_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_jobs_document FOREIGN KEY (document_id) REFERENCES irpf_producao_documents(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Jobs enfileirados';

-- Execuções (runs) para debug e RF-041 (status, tentativas, erro)
CREATE TABLE IF NOT EXISTS irpf_producao_job_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, RUNNING, SUCCESS, FAILED',
  attempts SMALLINT NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  started_at TIMESTAMP NULL DEFAULT NULL,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_runs_job (job_id),
  INDEX idx_runs_status (status),
  CONSTRAINT fk_runs_job FOREIGN KEY (job_id) REFERENCES irpf_producao_jobs(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Execuções de jobs';
