-- Índices de Performance para DCTF
-- Otimizações específicas para consultas frequentes e performance

-- ==============================================
-- ÍNDICES PRINCIPAIS
-- ==============================================

-- Índices para tabela clientes
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);
CREATE INDEX IF NOT EXISTS idx_clientes_ativo ON clientes(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_clientes_created_at ON clientes(created_at);

-- Índices para tabela dctf_declaracoes
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_cliente_periodo ON dctf_declaracoes(cliente_id, periodo);
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_status ON dctf_declaracoes(status);
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_periodo ON dctf_declaracoes(periodo);
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_created_at ON dctf_declaracoes(created_at);
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_status_periodo ON dctf_declaracoes(status, periodo);
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_cliente_status ON dctf_declaracoes(cliente_id, status);

-- Índices para tabela dctf_dados
CREATE INDEX IF NOT EXISTS idx_dctf_dados_dctf_id ON dctf_dados(dctf_id);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_codigo ON dctf_dados(codigo);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_valor ON dctf_dados(valor);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_data_ocorrencia ON dctf_dados(data_ocorrencia);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_codigo_valor ON dctf_dados(codigo, valor);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_dctf_codigo ON dctf_dados(dctf_id, codigo);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_valor_positivo ON dctf_dados(valor) WHERE valor > 0;
CREATE INDEX IF NOT EXISTS idx_dctf_dados_codigo_receita ON dctf_dados(codigo_receita) WHERE codigo_receita IS NOT NULL;

-- Índices para tabela analises
CREATE INDEX IF NOT EXISTS idx_analises_dctf_id ON analises(dctf_id);
CREATE INDEX IF NOT EXISTS idx_analises_tipo ON analises(tipo);
CREATE INDEX IF NOT EXISTS idx_analises_status ON analises(status);
CREATE INDEX IF NOT EXISTS idx_analises_created_at ON analises(created_at);
CREATE INDEX IF NOT EXISTS idx_analises_dctf_tipo ON analises(dctf_id, tipo);
CREATE INDEX IF NOT EXISTS idx_analises_tipo_status ON analises(tipo, status);

-- Índices para tabela flags
CREATE INDEX IF NOT EXISTS idx_flags_dctf_id ON flags(dctf_id);
CREATE INDEX IF NOT EXISTS idx_flags_severidade ON flags(severidade);
CREATE INDEX IF NOT EXISTS idx_flags_status ON flags(status);
CREATE INDEX IF NOT EXISTS idx_flags_created_at ON flags(created_at);
CREATE INDEX IF NOT EXISTS idx_flags_dctf_severidade ON flags(dctf_id, severidade);
CREATE INDEX IF NOT EXISTS idx_flags_severidade_status ON flags(severidade, status);

-- Índices para tabela relatorios
CREATE INDEX IF NOT EXISTS idx_relatorios_cliente_id ON relatorios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_dctf_id ON relatorios(dctf_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_tipo ON relatorios(tipo);
CREATE INDEX IF NOT EXISTS idx_relatorios_status ON relatorios(status);
CREATE INDEX IF NOT EXISTS idx_relatorios_created_at ON relatorios(created_at);
CREATE INDEX IF NOT EXISTS idx_relatorios_cliente_tipo ON relatorios(cliente_id, tipo);

-- ==============================================
-- ÍNDICES PARA CÓDIGOS DCTF
-- ==============================================

-- Índices para tabela dctf_codes
CREATE INDEX IF NOT EXISTS idx_dctf_codes_codigo ON dctf_codes(codigo);
CREATE INDEX IF NOT EXISTS idx_dctf_codes_tipo ON dctf_codes(tipo);
CREATE INDEX IF NOT EXISTS idx_dctf_codes_ativo ON dctf_codes(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_dctf_codes_periodo ON dctf_codes(periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_dctf_codes_tipo_ativo ON dctf_codes(tipo, ativo);

-- Índices para tabela dctf_receita_codes
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_codigo ON dctf_receita_codes(codigo);
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_categoria ON dctf_receita_codes(categoria);
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_subcategoria ON dctf_receita_codes(subcategoria);
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_ativo ON dctf_receita_codes(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_categoria_ativo ON dctf_receita_codes(categoria, ativo);

-- Índices para tabela dctf_aliquotas
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_codigo_dctf ON dctf_aliquotas(codigo_dctf);
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_codigo_receita ON dctf_aliquotas(codigo_receita) WHERE codigo_receita IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_periodo ON dctf_aliquotas(periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_codigo_periodo ON dctf_aliquotas(codigo_dctf, periodo_inicio, periodo_fim);

-- ==============================================
-- ÍNDICES COMPOSTOS OTIMIZADOS
-- ==============================================

-- Índices para consultas de relatórios
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_relatorio 
ON dctf_declaracoes(cliente_id, periodo, status) 
WHERE status IN ('processado', 'validado');

-- Índices para consultas de análise
CREATE INDEX IF NOT EXISTS idx_dctf_dados_analise 
ON dctf_dados(dctf_id, codigo, valor) 
WHERE valor > 0;

-- Índices para consultas de flags
CREATE INDEX IF NOT EXISTS idx_flags_alertas 
ON flags(dctf_id, severidade, status) 
WHERE severidade IN ('alta', 'critica');

-- Índices para consultas de performance
CREATE INDEX IF NOT EXISTS idx_dctf_dados_performance 
ON dctf_dados(codigo, data_ocorrencia, valor) 
WHERE valor > 0;

-- ==============================================
-- ÍNDICES PARCIAIS PARA OTIMIZAÇÃO
-- ==============================================

-- Índices para dados ativos apenas
CREATE INDEX IF NOT EXISTS idx_clientes_ativos ON clientes(id, nome, cnpj) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_ativas ON dctf_declaracoes(id, cliente_id, periodo) WHERE status != 'erro';
CREATE INDEX IF NOT EXISTS idx_dctf_dados_validos ON dctf_dados(id, dctf_id, codigo, valor) WHERE valor > 0;

-- Índices para dados recentes (últimos 12 meses)
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_recentes 
ON dctf_declaracoes(cliente_id, periodo, status) 
WHERE created_at >= CURRENT_DATE - INTERVAL '12 months';

CREATE INDEX IF NOT EXISTS idx_dctf_dados_recentes 
ON dctf_dados(dctf_id, codigo, valor, data_ocorrencia) 
WHERE data_ocorrencia >= CURRENT_DATE - INTERVAL '12 months';

-- ==============================================
-- ÍNDICES PARA CONSULTAS ESPECÍFICAS
-- ==============================================

-- Índice para busca de códigos por período
CREATE INDEX IF NOT EXISTS idx_dctf_codes_periodo_ativo 
ON dctf_codes(codigo, tipo, ativo) 
WHERE ativo = true AND (periodo_inicio IS NULL OR periodo_inicio <= CURRENT_DATE);

-- Índice para cálculos de impostos
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_calculo 
ON dctf_aliquotas(codigo_dctf, periodo_inicio, aliquota) 
WHERE periodo_inicio <= CURRENT_DATE;

-- Índice para validação de consistência
CREATE INDEX IF NOT EXISTS idx_dctf_dados_consistencia 
ON dctf_dados(dctf_id, codigo, valor) 
WHERE codigo LIKE '001%' OR codigo LIKE '1%' OR codigo LIKE '2%';

-- ==============================================
-- ÍNDICES DE TEXTO PARA BUSCA
-- ==============================================

-- Índices GIN para busca de texto
CREATE INDEX IF NOT EXISTS idx_clientes_nome_gin ON clientes USING gin(to_tsvector('portuguese', nome));
CREATE INDEX IF NOT EXISTS idx_dctf_dados_descricao_gin ON dctf_dados USING gin(to_tsvector('portuguese', descricao));
CREATE INDEX IF NOT EXISTS idx_dctf_codes_descricao_gin ON dctf_codes USING gin(to_tsvector('portuguese', descricao));

-- ==============================================
-- ÍNDICES PARA PARTICIONAMENTO (FUTURO)
-- ==============================================

-- Índices preparados para particionamento por período
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_periodo_partition 
ON dctf_declaracoes(periodo, cliente_id, status);

CREATE INDEX IF NOT EXISTS idx_dctf_dados_periodo_partition 
ON dctf_dados(data_ocorrencia, dctf_id, codigo);

-- ==============================================
-- ESTATÍSTICAS E ANÁLISE
-- ==============================================

-- Função para analisar performance dos índices
CREATE OR REPLACE FUNCTION analyze_dctf_performance()
RETURNS TABLE(
    tabela TEXT,
    indice TEXT,
    tamanho TEXT,
    uso TEXT,
    eficiencia TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname||'.'||tablename as tabela,
        indexname as indice,
        pg_size_pretty(pg_relation_size(indexrelid)) as tamanho,
        CASE 
            WHEN idx_scan = 0 THEN 'Nunca usado'
            WHEN idx_scan < 100 THEN 'Pouco usado'
            WHEN idx_scan < 1000 THEN 'Moderadamente usado'
            ELSE 'Muito usado'
        END as uso,
        CASE 
            WHEN idx_tup_read = 0 THEN 'N/A'
            WHEN (idx_tup_fetch::float / idx_tup_read) > 0.8 THEN 'Eficiente'
            WHEN (idx_tup_fetch::float / idx_tup_read) > 0.5 THEN 'Moderadamente eficiente'
            ELSE 'Ineficiente'
        END as eficiencia
    FROM pg_stat_user_indexes 
    WHERE schemaname = 'public' 
    AND tablename IN ('clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes', 'dctf_receita_codes', 'dctf_aliquotas')
    ORDER BY pg_relation_size(indexrelid) DESC;
END;
$$ LANGUAGE plpgsql;

-- Função para recomendar índices
CREATE OR REPLACE FUNCTION recommend_dctf_indexes()
RETURNS TABLE(
    recomendacao TEXT,
    prioridade TEXT,
    justificativa TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'Considere criar índice para consultas por período' as recomendacao,
        'Alta' as prioridade,
        'Consultas por período são muito frequentes' as justificativa
    UNION ALL
    SELECT 
        'Monitore uso de índices de texto' as recomendacao,
        'Média' as prioridade,
        'Índices GIN podem ser custosos para atualizações' as justificativa
    UNION ALL
    SELECT 
        'Considere particionamento por período' as recomendacao,
        'Baixa' as prioridade,
        'Útil quando tabelas crescerem muito' as justificativa;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ==============================================

COMMENT ON INDEX idx_dctf_declaracoes_cliente_periodo IS 'Índice principal para consultas por cliente e período';
COMMENT ON INDEX idx_dctf_dados_codigo_valor IS 'Índice para consultas de valores por código';
COMMENT ON INDEX idx_dctf_dados_valor_positivo IS 'Índice parcial para valores positivos apenas';
COMMENT ON INDEX idx_dctf_codes_periodo_ativo IS 'Índice para códigos ativos no período atual';
COMMENT ON INDEX idx_dctf_aliquotas_calculo IS 'Índice otimizado para cálculos de alíquotas';

-- ==============================================
-- MANUTENÇÃO DE ÍNDICES
-- ==============================================

-- Função para reindexar tabelas DCTF
CREATE OR REPLACE FUNCTION reindex_dctf_tables()
RETURNS VOID AS $$
BEGIN
    REINDEX TABLE clientes;
    REINDEX TABLE dctf_declaracoes;
    REINDEX TABLE dctf_dados;
    REINDEX TABLE analises;
    REINDEX TABLE flags;
    REINDEX TABLE relatorios;
    REINDEX TABLE dctf_codes;
    REINDEX TABLE dctf_receita_codes;
    REINDEX TABLE dctf_aliquotas;
    
    -- Atualizar estatísticas
    ANALYZE clientes;
    ANALYZE dctf_declaracoes;
    ANALYZE dctf_dados;
    ANALYZE analises;
    ANALYZE flags;
    ANALYZE relatorios;
    ANALYZE dctf_codes;
    ANALYZE dctf_receita_codes;
    ANALYZE dctf_aliquotas;
END;
$$ LANGUAGE plpgsql;

-- Função para limpar índices não utilizados
CREATE OR REPLACE FUNCTION cleanup_unused_indexes()
RETURNS TABLE(
    indice TEXT,
    tamanho TEXT,
    ultimo_uso TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname||'.'||indexname as indice,
        pg_size_pretty(pg_relation_size(indexrelid)) as tamanho,
        CASE 
            WHEN idx_scan = 0 THEN 'Nunca usado'
            ELSE 'Último uso: ' || last_idx_scan::text
        END as ultimo_uso
    FROM pg_stat_user_indexes 
    WHERE schemaname = 'public' 
    AND idx_scan = 0
    AND pg_relation_size(indexrelid) > 1024 * 1024 -- Maior que 1MB
    ORDER BY pg_relation_size(indexrelid) DESC;
END;
$$ LANGUAGE plpgsql;

