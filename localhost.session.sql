-- ====================================
-- ANÁLISE DE DUPLICATAS EM dctf_declaracoes
-- ====================================

-- 1. Ver estrutura da tabela
DESCRIBE dctf_declaracoes;

-- 2. Ver todas as declarações
SELECT * FROM dctf_declaracoes;

-- ====================================
-- 3. ENCONTRAR DUPLICATAS (ignorando ID e timestamps)
-- ====================================

-- Esta query agrupa por todas as colunas relevantes (exceto id, created_at, updated_at)
-- e mostra quantas vezes cada combinação aparece
SELECT 
    cliente_id,
    competencia,
    tipo,
    status,
    recibo,
    data_transmissao,
    COUNT(*) as quantidade_duplicatas,
    GROUP_CONCAT(id ORDER BY id) as ids_duplicados
FROM dctf_declaracoes
GROUP BY 
    cliente_id,
    competencia,
    tipo,
    status,
    recibo,
    data_transmissao
HAVING COUNT(*) > 1
ORDER BY quantidade_duplicatas DESC;

-- ====================================
-- 4. VER DETALHES COMPLETOS DAS DUPLICATAS
-- ====================================

-- Esta query mostra todos os detalhes das linhas duplicadas
SELECT d.*
FROM dctf_declaracoes d
INNER JOIN (
    SELECT 
        cliente_id,
        competencia,
        tipo,
        status,
        recibo,
        data_transmissao,
        COUNT(*) as cnt
    FROM dctf_declaracoes
    GROUP BY 
        cliente_id,
        competencia,
        tipo,
        status,
        recibo,
        data_transmissao
    HAVING cnt > 1
) dup ON 
    d.cliente_id <=> dup.cliente_id
    AND d.competencia <=> dup.competencia
    AND d.tipo <=> dup.tipo
    AND d.status <=> dup.status
    AND d.recibo <=> dup.recibo
    AND d.data_transmissao <=> dup.data_transmissao
ORDER BY 
    d.cliente_id,
    d.competencia,
    d.tipo,
    d.id;

-- ====================================
-- 5. CONTAR TOTAL DE DUPLICATAS
-- ====================================

SELECT 
    'Total de registros' as metrica,
    COUNT(*) as valor
FROM dctf_declaracoes
UNION ALL
SELECT 
    'Registros únicos' as metrica,
    COUNT(DISTINCT CONCAT_WS('-', 
        COALESCE(cliente_id, 'NULL'),
        COALESCE(competencia, 'NULL'),
        COALESCE(tipo, 'NULL'),
        COALESCE(status, 'NULL'),
        COALESCE(recibo, 'NULL'),
        COALESCE(data_transmissao, 'NULL')
    )) as valor
FROM dctf_declaracoes
UNION ALL
SELECT 
    'Duplicatas' as metrica,
    COUNT(*) - COUNT(DISTINCT CONCAT_WS('-', 
        COALESCE(cliente_id, 'NULL'),
        COALESCE(competencia, 'NULL'),
        COALESCE(tipo, 'NULL'),
        COALESCE(status, 'NULL'),
        COALESCE(recibo, 'NULL'),
        COALESCE(data_transmissao, 'NULL')
    )) as valor
FROM dctf_declaracoes;

-- ====================================
-- 6. QUERY PARA DELETAR DUPLICATAS (MANTENHA APENAS O MAIS ANTIGO)
-- ====================================
-- ⚠️ ATENÇÃO: DESCOMENTE E EXECUTE COM CUIDADO!
-- ⚠️ Esta query DELETA as duplicatas mantendo apenas o registro com menor ID

/*
DELETE d1 FROM dctf_declaracoes d1
INNER JOIN dctf_declaracoes d2 
WHERE 
    d1.id > d2.id
    AND d1.cliente_id <=> d2.cliente_id
    AND d1.competencia <=> d2.competencia
    AND d1.tipo <=> d2.tipo
    AND d1.status <=> d2.status
    AND d1.recibo <=> d2.recibo
    AND d1.data_transmissao <=> d2.data_transmissao;
*/

-- ====================================
-- 7. ALTERNATIVA: MARCAR DUPLICATAS PARA REVISÃO MANUAL
-- ====================================
-- Primeiro, adicione uma coluna is_duplicate se não existir:
-- ALTER TABLE dctf_declaracoes ADD COLUMN is_duplicate BOOLEAN DEFAULT FALSE;

/*
UPDATE dctf_declaracoes d1
INNER JOIN (
    SELECT 
        cliente_id,
        competencia,
        tipo,
        status,
        recibo,
        data_transmissao,
        MIN(id) as min_id
    FROM dctf_declaracoes
    GROUP BY 
        cliente_id,
        competencia,
        tipo,
        status,
        recibo,
        data_transmissao
    HAVING COUNT(*) > 1
) dup ON 
    d1.cliente_id <=> dup.cliente_id
    AND d1.competencia <=> dup.competencia
    AND d1.tipo <=> dup.tipo
    AND d1.status <=> dup.status
    AND d1.recibo <=> dup.recibo
    AND d1.data_transmissao <=> dup.data_transmissao
    AND d1.id > dup.min_id
SET d1.is_duplicate = TRUE;
*/


