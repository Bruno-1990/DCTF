-- ============================================================================
-- Script SQL para extrair schema completo do banco de dados
-- Execute este script no Supabase SQL Editor e copie o resultado
-- ============================================================================

-- Listar todas as tabelas
SELECT 
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Para cada tabela, obter informações das colunas
-- Substitua 'NOME_DA_TABELA' pelo nome da tabela desejada

SELECT 
    c.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.ordinal_position
FROM information_schema.columns c
WHERE c.table_schema = 'public'
    AND c.table_name IN (
        'clientes',
        'dctf_declaracoes',
        'dctf_dados',
        'analises',
        'flags',
        'relatorios',
        'upload_history',
        'dctf_codes',
        'dctf_receita_codes',
        'dctf_aliquotas',
        'receita_pagamentos'
    )
ORDER BY c.table_name, c.ordinal_position;

-- Obter constraints (chaves primárias, estrangeiras, etc.)
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
    AND tc.table_name IN (
        'clientes',
        'dctf_declaracoes',
        'dctf_dados',
        'analises',
        'flags',
        'relatorios',
        'upload_history',
        'dctf_codes',
        'dctf_receita_codes',
        'dctf_aliquotas',
        'receita_pagamentos'
    )
ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position;

-- Obter índices
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename IN (
        'clientes',
        'dctf_declaracoes',
        'dctf_dados',
        'analises',
        'flags',
        'relatorios',
        'upload_history',
        'dctf_codes',
        'dctf_receita_codes',
        'dctf_aliquotas',
        'receita_pagamentos'
    )
ORDER BY tablename, indexname;


