-- ============================================================================
-- MIGRATION: Adicionar coluna hora_transmissao à tabela dctf_declaracoes
-- ============================================================================
-- Esta migration adiciona a coluna hora_transmissao para armazenar
-- separadamente a hora da transmissão da declaração
-- ============================================================================

-- Adicionar coluna hora_transmissao
ALTER TABLE dctf_declaracoes
ADD COLUMN IF NOT EXISTS hora_transmissao VARCHAR(8); -- Formato: HH:MM:SS

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_dctf_hora_transmissao ON dctf_declaracoes(hora_transmissao);

-- Comentário
COMMENT ON COLUMN dctf_declaracoes.hora_transmissao IS 'Hora da transmissão da declaração no formato HH:MM:SS';

