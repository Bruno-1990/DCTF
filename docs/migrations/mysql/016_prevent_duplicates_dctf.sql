-- ============================================================================
-- MIGRAÇÃO: PREVENIR DUPLICADOS EM dctf_declaracoes
-- ============================================================================
-- Objetivo: Criar constraint UNIQUE para prevenir registros duplicados
-- Um registro é considerado único pela combinação: CNPJ + Período + Data
-- Data: 2026-01-30
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- IMPORTANTE: ANTES DE EXECUTAR ESTA MIGRATION
-- ============================================================================
-- Você DEVE executar o script de deduplicação primeiro:
--   npx tsx scripts/deduplicate-dctf.ts --execute
--
-- Ou usar a API:
--   POST /api/dctf/admin/remove-duplicates (com dryRun: false)
--
-- Caso contrário, a criação do índice UNIQUE falhará se houver duplicados!
-- ============================================================================

-- ============================================================================
-- 1. VERIFICAR SE JÁ EXISTE O ÍNDICE
-- ============================================================================
SELECT 
    COUNT(*) as constraint_exists,
    'Se o resultado for > 0, o índice já existe' as status
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'dctf_declaracoes'
  AND index_name = 'idx_unique_dctf';

-- ============================================================================
-- 2. VERIFICAR SE HÁ DUPLICADOS ANTES DE CRIAR O ÍNDICE
-- ============================================================================
-- Esta query mostra quantos grupos de duplicados existem
SELECT 
    COUNT(*) as grupos_duplicados,
    SUM(total_duplicados) as registros_duplicados_totais,
    'Se grupos_duplicados > 0, você precisa executar o script de deduplicação primeiro!' as aviso
FROM (
    SELECT 
        cnpj,
        periodo_apuracao,
        DATE(data_transmissao) as data_transmissao,
        COUNT(*) as total_duplicados
    FROM dctf_declaracoes
    WHERE cnpj IS NOT NULL 
      AND periodo_apuracao IS NOT NULL
      AND data_transmissao IS NOT NULL
    GROUP BY 
        cnpj,
        periodo_apuracao,
        DATE(data_transmissao)
    HAVING COUNT(*) > 1
) as duplicates_check;

-- ============================================================================
-- 3. LISTAR OS DUPLICADOS (SE HOUVER)
-- ============================================================================
-- Execute esta query para ver os grupos duplicados antes de corrigir
SELECT 
    cnpj,
    periodo_apuracao,
    DATE(data_transmissao) as data_transmissao,
    COUNT(*) as quantidade_duplicados,
    GROUP_CONCAT(id ORDER BY created_at DESC SEPARATOR ', ') as ids_duplicados,
    MAX(created_at) as registro_mais_recente,
    MIN(created_at) as registro_mais_antigo
FROM dctf_declaracoes
WHERE cnpj IS NOT NULL 
  AND periodo_apuracao IS NOT NULL
  AND data_transmissao IS NOT NULL
GROUP BY 
    cnpj,
    periodo_apuracao,
    DATE(data_transmissao)
HAVING COUNT(*) > 1
ORDER BY quantidade_duplicados DESC, cnpj, periodo_apuracao;

-- ============================================================================
-- 4. CRIAR ÍNDICE ÚNICO (EXECUTAR APENAS APÓS DEDUPLICAÇÃO)
-- ============================================================================
-- Este comando irá FALHAR se ainda houverem duplicados!
-- Se falhar, execute: npx tsx scripts/deduplicate-dctf.ts --execute

CREATE UNIQUE INDEX idx_unique_dctf 
ON dctf_declaracoes (
    cnpj, 
    periodo_apuracao, 
    data_transmissao(50)
);

-- ============================================================================
-- 5. VERIFICAR SE O ÍNDICE FOI CRIADO COM SUCESSO
-- ============================================================================
SHOW INDEX FROM dctf_declaracoes WHERE Key_name = 'idx_unique_dctf';

-- ============================================================================
-- 6. TESTAR A CONSTRAINT (OPCIONAL)
-- ============================================================================
-- Tente inserir um registro duplicado manualmente - deve falhar:
-- INSERT INTO dctf_declaracoes (
--     id, cnpj, periodo_apuracao, data_transmissao, created_at, updated_at
-- ) VALUES (
--     UUID(),
--     '12345678000190',
--     '12/2025',
--     '2025-01-15 10:00:00',
--     NOW(),
--     NOW()
-- );
-- Erro esperado: ER_DUP_ENTRY (Duplicate entry)

-- ============================================================================
-- ROLLBACK (SE NECESSÁRIO)
-- ============================================================================
-- Para remover o índice único (apenas para manutenção):
-- DROP INDEX idx_unique_dctf ON dctf_declaracoes;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
-- IMPORTANTE:
-- 1. Execute o script de deduplicação ANTES desta migration
-- 2. Verifique que não há duplicados antes de criar o índice
-- 3. Após criar o índice, futuros duplicados serão automaticamente bloqueados
-- ============================================================================
