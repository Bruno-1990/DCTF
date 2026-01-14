-- ============================================================================
-- MIGRAÇÃO 012: CRIAR TABELA SITF_LOTE_PROGRESS (MySQL)
-- ============================================================================
-- Armazena o progresso de consultas em lote de Situação Fiscal
-- Permite que o progresso persista mesmo após refresh da página
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA: sitf_lote_progress
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitf_lote_progress (
  progress_id VARCHAR(100) PRIMARY KEY COMMENT 'ID único do progresso',
  total INT NOT NULL DEFAULT 0 COMMENT 'Total de CNPJs a processar',
  processados INT NOT NULL DEFAULT 0 COMMENT 'CNPJs processados',
  sucessos INT NOT NULL DEFAULT 0 COMMENT 'CNPJs processados com sucesso',
  erros INT NOT NULL DEFAULT 0 COMMENT 'CNPJs com erro',
  porcentagem INT NOT NULL DEFAULT 0 COMMENT 'Porcentagem de conclusão (0-100)',
  status VARCHAR(20) NOT NULL DEFAULT 'em_andamento' COMMENT 'Status: em_andamento, concluida, cancelada',
  cnpj_atual VARCHAR(200) NULL COMMENT 'CNPJ sendo processado no momento',
  apenas_faltantes BOOLEAN DEFAULT FALSE COMMENT 'Se processou apenas CNPJs faltantes',
  total_original INT NULL COMMENT 'Total original antes do filtro',
  ja_processados INT NULL COMMENT 'CNPJs já processados (ignorados)',
  erros_detalhados JSON NULL COMMENT 'Array de erros detalhados',
  ultimo_erro_rate_limit BOOLEAN DEFAULT FALSE COMMENT 'Se o último erro foi rate limit',
  iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de início',
  finalizado_em TIMESTAMP NULL COMMENT 'Data de finalização',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Última atualização',
  
  INDEX idx_sitf_lote_progress_status (status),
  INDEX idx_sitf_lote_progress_iniciado (iniciado_em DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Progresso de consultas em lote de Situação Fiscal';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================



