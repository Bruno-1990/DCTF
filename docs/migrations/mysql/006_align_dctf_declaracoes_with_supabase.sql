-- ============================================================================
-- MIGRAÇÃO 006: ALINHAR SCHEMA dctf_declaracoes COM SUPABASE
-- ============================================================================
-- Objetivo: Tornar o schema MySQL idêntico ao Supabase para evitar erros na sincronização
-- Baseado na estrutura real do Supabase (colunas: id, cnpj, cliente_id, periodo_apuracao, data_transmissao, situacao, etc)
-- Data: 2025-11-25
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- 1. REMOVER COLUNAS QUE NÃO EXISTEM NO SUPABASE
-- ============================================================================
-- (Manter por enquanto para não perder dados - comentado)
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS periodo;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS data_declaracao;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS status;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS numero_identificacao;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS tipo_declaracao;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS arquivo_original;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS arquivo_processado;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS total_registros;
-- ALTER TABLE dctf_declaracoes DROP COLUMN IF EXISTS observacoes;

-- ============================================================================
-- 2. ADICIONAR/MODIFICAR COLUNAS PARA MATCH COM SUPABASE
-- ============================================================================

-- Garantir que cliente_id é nullable (no Supabase pode ser NULL)
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN cliente_id CHAR(36) NULL COMMENT 'ID do cliente (pode ser NULL no Supabase)';

-- Garantir que cnpj existe e é VARCHAR(14)
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN cnpj VARCHAR(14) NULL COMMENT 'CNPJ da declaração';

-- Garantir que periodo_apuracao é VARCHAR(7) (formato MM/YYYY)
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN periodo_apuracao VARCHAR(7) NULL COMMENT 'Período de apuração (MM/YYYY)';

-- Garantir que data_transmissao é TEXT (no Supabase é text, não timestamp)
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN data_transmissao TEXT NULL COMMENT 'Data de transmissão (formato texto)';

-- Garantir que situacao existe e é TEXT
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN situacao TEXT NULL COMMENT 'Situação da declaração';

-- Adicionar colunas que podem existir no Supabase mas não no MySQL
-- (Usar script Node.js para adicionar com verificação de existência)
-- ALTER TABLE dctf_declaracoes 
-- ADD COLUMN tipo_ni VARCHAR(10) NULL COMMENT 'Tipo de identificação (CNPJ, CPF)',
-- ADD COLUMN categoria VARCHAR(100) NULL COMMENT 'Categoria da declaração',
-- ADD COLUMN origem VARCHAR(50) NULL COMMENT 'Origem (MIT, eSocial, etc)',
-- ADD COLUMN tipo VARCHAR(50) NULL COMMENT 'Tipo da declaração',
-- ADD COLUMN debito_apurado DECIMAL(15,2) NULL COMMENT 'Débito apurado',
-- ADD COLUMN saldo_a_pagar DECIMAL(15,2) NULL COMMENT 'Saldo a pagar',
-- ADD COLUMN metadados TEXT NULL COMMENT 'Metadados da declaração (JSON)',
-- ADD COLUMN hora_transmissao VARCHAR(8) NULL COMMENT 'Hora da transmissão (HH:MM:SS)',
-- ADD COLUMN numero_recibo VARCHAR(50) NULL COMMENT 'Número do recibo';

-- ============================================================================
-- 3. REMOVER FOREIGN KEY DE cliente_id (se existir)
-- ============================================================================
-- Isso permite que cliente_id seja NULL sem problemas
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT constraint_name INTO constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'dctf_declaracoes'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%cliente%';
    
    IF constraint_name IS NOT NULL THEN
        SET @sql = CONCAT('ALTER TABLE dctf_declaracoes DROP CONSTRAINT ', constraint_name);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$;

-- Alternativa MySQL (sem DO block):
-- Primeiro, encontrar o nome da constraint:
-- SELECT CONSTRAINT_NAME 
-- FROM information_schema.KEY_COLUMN_USAGE 
-- WHERE TABLE_SCHEMA = 'dctf_web' 
--   AND TABLE_NAME = 'dctf_declaracoes' 
--   AND REFERENCED_TABLE_NAME = 'clientes';

-- Depois, remover manualmente:
-- ALTER TABLE dctf_declaracoes DROP FOREIGN KEY nome_da_constraint;

-- ============================================================================
-- 4. CRIAR ÍNDICES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_dctf_cnpj ON dctf_declaracoes(cnpj);
CREATE INDEX IF NOT EXISTS idx_dctf_periodo_apuracao ON dctf_declaracoes(periodo_apuracao);
CREATE INDEX IF NOT EXISTS idx_dctf_situacao ON dctf_declaracoes(situacao);
CREATE INDEX IF NOT EXISTS idx_dctf_data_transmissao ON dctf_declaracoes(data_transmissao(50));
CREATE INDEX IF NOT EXISTS idx_dctf_tipo ON dctf_declaracoes(tipo);
CREATE INDEX IF NOT EXISTS idx_dctf_cliente_id ON dctf_declaracoes(cliente_id);

-- ============================================================================
-- 5. VERIFICAÇÃO FINAL
-- ============================================================================

-- Verificar estrutura final
SHOW COLUMNS FROM dctf_declaracoes;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================

