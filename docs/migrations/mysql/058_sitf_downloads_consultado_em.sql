-- ============================================================================
-- MIGRAÇÃO 058: DATA DA CONSULTA DA SITUAÇÃO FISCAL (sitf_downloads.consultado_em)
-- ============================================================================
-- POR QUE
--
-- A participação dos sócios só pode ser atualizada com a Situação Fiscal consultada
-- no MÊS CORRENTE; quem não foi consultado no mês entra na fila de consulta.
-- Até aqui não havia data confiável da consulta:
--   * sitf_downloads tem uma linha por CNPJ e a nova consulta só troca o PDF:
--     o created_at fica o do PRIMEIRO download e não há updated_at;
--   * sitf_extracted_data.updated_at muda também quando o MESMO PDF é extraído
--     de novo (em 07/2026, 65 linhas "atualizadas" com só 9 downloads no mês);
--   * sitf_extracted_data.emissao_relatorio nunca é preenchida.
-- A partir daqui o orquestrador grava consultado_em = agora sempre que um relatório
-- chega do SERPRO (insert e update do PDF).
--
-- PREENCHIMENTO DAS LINHAS ANTIGAS (estimativa)
-- O protocolo novo grava expires_at = pedido + 24 h, e a emissão do PDF preserva esse
-- valor; então expires_at − 1 dia é o dia do último pedido ao SERPRO. Sem protocolo
-- utilizável, vale o created_at. Nunca antes do created_at do próprio download.
--
-- Uso: npm run migrate:sitf-consultado-em   (idempotente)
-- ============================================================================

ALTER TABLE sitf_downloads
  ADD COLUMN consultado_em DATETIME NULL COMMENT 'Quando o relatório foi obtido do SERPRO (a vigência da Situação Fiscal)';

UPDATE sitf_downloads d
  LEFT JOIN sitf_protocols p ON p.cnpj = d.cnpj AND p.expires_at IS NOT NULL
   SET d.consultado_em = GREATEST(d.created_at, COALESCE(DATE_SUB(p.expires_at, INTERVAL 1 DAY), d.created_at))
 WHERE d.consultado_em IS NULL;
