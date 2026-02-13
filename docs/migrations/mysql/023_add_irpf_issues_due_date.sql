-- ============================================================================
-- MIGRAÇÃO 023: due_date em irpf_producao_issues (Task 7.2 - modelo de pendências)
-- ============================================================================

ALTER TABLE irpf_producao_issues
  ADD COLUMN due_date DATE NULL DEFAULT NULL COMMENT 'Prazo para resolução da pendência' AFTER resolved_by;
