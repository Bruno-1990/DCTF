-- ============================================================================
-- REMOVER TODAS AS DEPENDÊNCIAS DA TABELA clientes NA TABELA dctf_declaracoes
-- ============================================================================
-- Objetivo: Remover triggers, foreign keys e funções que dependem da tabela 'clientes'
--           Isso permite que o n8n insira dados diretamente na tabela sem erros
-- Data: 2025-11-25
-- ============================================================================

-- 1. Remover triggers que dependem de clientes
DROP TRIGGER IF EXISTS trigger_set_cliente_id_by_cnpj ON public.dctf_declaracoes;
DROP TRIGGER IF EXISTS trigger_associar_declaracoes_a_cliente ON public.clientes;

-- 2. Remover funções que dependem de clientes
DROP FUNCTION IF EXISTS public.set_cliente_id_by_cnpj() CASCADE;
DROP FUNCTION IF EXISTS public.associar_declaracoes_a_cliente() CASCADE;
DROP FUNCTION IF EXISTS public.importar_dctf_json(jsonb) CASCADE;

-- 3. Remover foreign key constraint se existir
-- Primeiro, verificar o nome da constraint
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Buscar o nome da constraint de foreign key
    SELECT constraint_name INTO constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'dctf_declaracoes'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%cliente%';
    
    -- Se encontrou, remover
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.dctf_declaracoes DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE 'Constraint removida: %', constraint_name;
    ELSE
        RAISE NOTICE 'Nenhuma constraint de foreign key encontrada';
    END IF;
END $$;

-- 4. Tornar cliente_id nullable (se não for já)
ALTER TABLE public.dctf_declaracoes 
ALTER COLUMN cliente_id DROP NOT NULL;

-- 5. Verificar se há outros triggers na tabela dctf_declaracoes
-- (apenas para informação - não remove automaticamente)
-- SELECT trigger_name, event_manipulation, event_object_table 
-- FROM information_schema.triggers 
-- WHERE event_object_table = 'dctf_declaracoes';

-- ============================================================================
-- VERIFICAÇÃO FINAL
-- ============================================================================
-- Execute estas queries para verificar que tudo foi removido:

-- Verificar triggers
-- SELECT trigger_name, event_manipulation, event_object_table 
-- FROM information_schema.triggers 
-- WHERE event_object_table = 'dctf_declaracoes';

-- Verificar foreign keys
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_schema = 'public'
--   AND table_name = 'dctf_declaracoes'
--   AND constraint_type = 'FOREIGN KEY';

-- Verificar se cliente_id é nullable
-- SELECT column_name, is_nullable, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'dctf_declaracoes'
--   AND column_name = 'cliente_id';

-- ============================================================================
-- RESULTADO ESPERADO
-- ============================================================================
-- Após executar este script:
-- 1. ✅ Nenhum trigger será executado ao inserir dados
-- 2. ✅ Nenhuma foreign key referenciará a tabela clientes
-- 3. ✅ A coluna cliente_id pode ser NULL
-- 4. ✅ O n8n poderá inserir dados sem erros
-- 5. ✅ Os dados serão inseridos diretamente sem processamento automático

