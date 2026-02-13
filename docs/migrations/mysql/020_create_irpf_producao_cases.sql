-- ============================================================================
-- MIGRAÇÃO 020: CRIAR TABELAS DO MÓDULO IRPF PRODUÇÃO (PRD-IRPF-001)
-- ============================================================================
-- Cases de produção de declaração IRPF: workflow, triagem, documentos, checklist
-- ============================================================================

-- Tabela principal: cases (um case = uma declaração em produção)
CREATE TABLE IF NOT EXISTS irpf_producao_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_code VARCHAR(20) NOT NULL COMMENT 'Código exibido (ex: C0001842)',
  exercicio SMALLINT NOT NULL COMMENT 'Ano da declaração (ex: 2025)',
  ano_base SMALLINT NOT NULL COMMENT 'Ano-calendário (ex: 2024)',
  status VARCHAR(30) NOT NULL DEFAULT 'NEW' COMMENT 'NEW, INTAKE_IN_PROGRESS, INTAKE_COMPLETE, PROCESSING, PENDING_INTERNAL, PENDING_DOCS, READY_FOR_REVIEW, APPROVED, SUBMITTED, POST_DELIVERY, CLOSED',
  perfil VARCHAR(30) DEFAULT NULL COMMENT 'Simplificada, Completa, etc.',
  risk_score VARCHAR(20) DEFAULT NULL COMMENT 'Baixo, Médio, Alto, RV_GCAP, EXTERIOR',
  assigned_to VARCHAR(100) DEFAULT NULL COMMENT 'Responsável (operador/preparador)',
  cliente_id INT DEFAULT NULL COMMENT 'Opcional: vínculo com cliente DCTF',
  triagem_json JSON DEFAULT NULL COMMENT 'Folha de rosto: marcadores saúde, educação, bens, exterior, etc.',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_case_code (case_code),
  INDEX idx_status (status),
  INDEX idx_exercicio_ano (exercicio, ano_base),
  INDEX idx_assigned (assigned_to),
  INDEX idx_cliente (cliente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cases de produção IRPF';

-- Tabela: pessoas do case (titular e dependentes) - mínimo para MVP
CREATE TABLE IF NOT EXISTS irpf_producao_case_people (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  cpf VARCHAR(14) NOT NULL,
  nome VARCHAR(255) DEFAULT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'titular' COMMENT 'titular, dependente, alimentando',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_case_people_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
