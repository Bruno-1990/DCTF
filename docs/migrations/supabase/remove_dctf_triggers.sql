-- ============================================================================
-- REMOVER TRIGGERS E FUNÇÕES DA TABELA dctf_declaracoes NO SUPABASE
-- ============================================================================
-- Objetivo: Remover triggers que dependem da tabela 'clientes' que não existe
--           Isso permite que o n8n insira dados diretamente na tabela
-- Data: 2025-11-25
-- ============================================================================

-- 1. Remover o trigger que chama set_cliente_id_by_cnpj
DROP TRIGGER IF EXISTS trigger_set_cliente_id_by_cnpj ON public.dctf_declaracoes;

-- 2. Remover a função set_cliente_id_by_cnpj (se não for usada em outros lugares)
DROP FUNCTION IF EXISTS public.set_cliente_id_by_cnpj() CASCADE;

-- 3. Remover o trigger que chama associar_declaracoes_a_cliente (se existir)
DROP TRIGGER IF EXISTS trigger_associar_declaracoes_a_cliente ON public.clientes;

-- 4. Remover a função associar_declaracoes_a_cliente (se não for usada)
DROP FUNCTION IF EXISTS public.associar_declaracoes_a_cliente() CASCADE;

-- 5. Verificar se há outros triggers na tabela dctf_declaracoes
-- Execute no Supabase SQL Editor:
-- SELECT trigger_name, event_manipulation, event_object_table 
-- FROM information_schema.triggers 
-- WHERE event_object_table = 'dctf_declaracoes';

-- ============================================================================
-- NOTA: Se você precisar manter a função importar_dctf_json, ela também
-- precisa ser atualizada para não depender da tabela clientes, ou removida.
-- ============================================================================

-- 6. (Opcional) Remover a função importar_dctf_json se não for mais usada
-- DROP FUNCTION IF EXISTS public.importar_dctf_json(jsonb) CASCADE;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- Após executar este script, verifique se não há mais triggers:
-- SELECT * FROM information_schema.triggers 
-- WHERE event_object_table = 'dctf_declaracoes';

-- ============================================================================
-- RESULTADO ESPERADO
-- ============================================================================
-- Após executar este script:
-- 1. O n8n poderá inserir dados na tabela dctf_declaracoes sem erros
-- 2. A coluna cliente_id pode ficar NULL (será preenchida depois no MySQL)
-- 3. Os dados serão inseridos diretamente sem processamento de triggers

