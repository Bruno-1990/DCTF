-- Migração: Normalizar coluna CNPJ
-- Objetivo: Remover coluna 'cnpj' formatada e manter apenas 'cnpj_limpo'
-- Data: 2025-01-13

-- Passo 1: Adicionar coluna cnpj_limpo se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clientes' AND column_name = 'cnpj_limpo'
    ) THEN
        ALTER TABLE clientes ADD COLUMN cnpj_limpo VARCHAR(14);
    END IF;
END $$;

-- Passo 2: Popular cnpj_limpo a partir de cnpj (removendo formatação)
-- Se cnpj_limpo estiver vazio/null, preencher a partir de cnpj
UPDATE clientes
SET cnpj_limpo = REGEXP_REPLACE(COALESCE(cnpj_limpo, cnpj), '[^0-9]', '', 'g')
WHERE cnpj_limpo IS NULL OR cnpj_limpo = '';

-- Passo 3: Garantir que cnpj_limpo tenha exatamente 14 dígitos (preencher zeros à esquerda se necessário)
UPDATE clientes
SET cnpj_limpo = LPAD(REGEXP_REPLACE(cnpj_limpo, '[^0-9]', '', 'g'), 14, '0')
WHERE LENGTH(REGEXP_REPLACE(cnpj_limpo, '[^0-9]', '', 'g')) < 14;

-- Passo 4: Remover registros com cnpj_limpo inválido (menos de 14 dígitos após limpeza)
DELETE FROM clientes
WHERE LENGTH(REGEXP_REPLACE(cnpj_limpo, '[^0-9]', '', 'g')) != 14;

-- Passo 5: Tornar cnpj_limpo NOT NULL e UNIQUE
ALTER TABLE clientes
    ALTER COLUMN cnpj_limpo SET NOT NULL,
    ADD CONSTRAINT clientes_cnpj_limpo_unique UNIQUE (cnpj_limpo);

-- Passo 6: Remover índice antigo de cnpj se existir
DROP INDEX IF EXISTS idx_clientes_cnpj;

-- Passo 7: Criar índice em cnpj_limpo
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj_limpo ON clientes(cnpj_limpo);

-- Passo 8: Remover coluna cnpj formatada
ALTER TABLE clientes DROP COLUMN IF EXISTS cnpj;

-- Passo 9: Adicionar coluna razao_social se não existir (para compatibilidade)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clientes' AND column_name = 'razao_social'
    ) THEN
        -- Se existir 'nome', copiar para 'razao_social' antes de adicionar
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'clientes' AND column_name = 'nome'
        ) THEN
            ALTER TABLE clientes ADD COLUMN razao_social VARCHAR(255);
            UPDATE clientes SET razao_social = nome WHERE razao_social IS NULL;
        ELSE
            ALTER TABLE clientes ADD COLUMN razao_social VARCHAR(255);
        END IF;
    END IF;
END $$;

-- Passo 10: Tornar razao_social NOT NULL se houver dados
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM clientes WHERE razao_social IS NULL) THEN
        -- Preencher com 'nome' se existir
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'clientes' AND column_name = 'nome'
        ) THEN
            UPDATE clientes SET razao_social = COALESCE(nome, 'Cliente sem nome') WHERE razao_social IS NULL;
        ELSE
            UPDATE clientes SET razao_social = 'Cliente sem nome' WHERE razao_social IS NULL;
        END IF;
    END IF;
    
    -- Tornar NOT NULL apenas se não houver NULLs
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE razao_social IS NULL) THEN
        ALTER TABLE clientes ALTER COLUMN razao_social SET NOT NULL;
    END IF;
END $$;

-- Comentários
COMMENT ON COLUMN clientes.cnpj_limpo IS 'CNPJ sem formatação (apenas números, 14 dígitos)';
COMMENT ON COLUMN clientes.razao_social IS 'Razão social do cliente';

