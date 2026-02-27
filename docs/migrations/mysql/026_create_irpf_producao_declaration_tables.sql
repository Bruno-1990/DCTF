-- ============================================================================
-- MIGRAÇÃO 026: MODELO DECLARATION_* E DEC_LAYOUT_VERSION (Task 18 / Anexo C)
-- ============================================================================
-- Tabelas para dados da declaração .DEC; origem por campo (P-014).
-- ============================================================================

-- Leiaute por exercício (dec_layout_version por exercício)
CREATE TABLE IF NOT EXISTS irpf_producao_dec_layout_version (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exercicio SMALLINT NOT NULL,
  layout_version VARCHAR(20) NOT NULL DEFAULT '1' COMMENT 'Versão do leiaute (ex: IRPF-LeiauteTXT-2025)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_exercicio (exercicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Versão do leiaute .DEC por exercício';

-- Rendimentos pessoa jurídica (bloco .DEC → origem)
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_income_pj (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL COMMENT 'P-014: ex. document_extracted_data, case_people',
  cnpj_pagador VARCHAR(14) DEFAULT NULL,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_dipj_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rendimentos pessoa física
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_income_pf (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL,
  cpf_pagador VARCHAR(14) DEFAULT NULL,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_dipf_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rendimentos isentos
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_income_exempt (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_die_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rendimentos com tributação exclusiva
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_income_exclusive (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_diex_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dependentes (mapeamento case_people tipo dependente)
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_dependents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL COMMENT 'P-014: ex. case_people',
  cpf VARCHAR(14) NOT NULL,
  nome VARCHAR(255) DEFAULT NULL,
  data_nascimento DATE DEFAULT NULL,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_ddep_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pagamentos (retenções, carnê-lei etc.)
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL,
  tipo VARCHAR(30) DEFAULT NULL,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_dpay_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bens e direitos
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL,
  descricao VARCHAR(255) DEFAULT NULL,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_dast_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dívidas e ônus
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_debts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL,
  descricao VARCHAR(255) DEFAULT NULL,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  CONSTRAINT fk_ddeb_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Totais da declaração (resumo por case)
CREATE TABLE IF NOT EXISTS irpf_producao_declaration_totals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  origem_dado VARCHAR(80) NOT NULL,
  total_rendimentos DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_deducoes DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_imposto DECIMAL(15,2) NOT NULL DEFAULT 0,
  payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_case (case_id),
  CONSTRAINT fk_dtot_case FOREIGN KEY (case_id) REFERENCES irpf_producao_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
