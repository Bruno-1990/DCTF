-- ============================================================================
-- SCHEMA COMPLETO DO BANCO DE DADOS DCTF MPC
-- ============================================================================
-- Este arquivo contém TODA a estrutura necessária para criar o banco de dados
-- Execute este script no Supabase Dashboard > SQL Editor
-- ============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABELA: clientes
-- ============================================================================
-- IMPORTANTE: Esta tabela usa apenas cnpj_limpo (sem formatação)
-- CNPJ formatado é gerado apenas na exibição, não é salvo no banco
-- ============================================================================
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razao_social VARCHAR(255) NOT NULL,
    cnpj_limpo VARCHAR(14) UNIQUE NOT NULL, -- CNPJ sem formatação (14 dígitos)
    email VARCHAR(255),
    telefone VARCHAR(20),
    endereco TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para clientes
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj_limpo ON clientes(cnpj_limpo);
CREATE INDEX IF NOT EXISTS idx_clientes_razao_social ON clientes(razao_social);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);

-- Comentários
COMMENT ON TABLE clientes IS 'Tabela de clientes do sistema DCTF';
COMMENT ON COLUMN clientes.cnpj_limpo IS 'CNPJ sem formatação (apenas números, 14 dígitos)';
COMMENT ON COLUMN clientes.razao_social IS 'Razão social do cliente';

-- ============================================================================
-- TABELA: dctf_declaracoes
-- ============================================================================
CREATE TABLE IF NOT EXISTS dctf_declaracoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    periodo VARCHAR(7) NOT NULL, -- Formato: YYYY-MM
    periodo_apuracao VARCHAR(7), -- Período de apuração
    data_declaracao DATE NOT NULL,
    data_transmissao TIMESTAMP WITH TIME ZONE, -- Data/hora de transmissão
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
    situacao VARCHAR(50), -- Situação da declaração (Ativa, Em andamento, etc)
    tipo_ni VARCHAR(10), -- Tipo de identificação (CNPJ, CPF)
    numero_identificacao VARCHAR(20), -- Número de identificação
    categoria VARCHAR(100), -- Categoria da declaração
    origem VARCHAR(50), -- Origem (MIT, eSocial, etc)
    tipo_declaracao VARCHAR(50), -- Tipo (Original, Retificadora, etc)
    arquivo_original VARCHAR(500),
    arquivo_processado VARCHAR(500),
    total_registros INTEGER DEFAULT 0,
    debito_apurado DECIMAL(15,2), -- Débito apurado
    saldo_a_pagar DECIMAL(15,2), -- Saldo a pagar
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para dctf_declaracoes
CREATE INDEX IF NOT EXISTS idx_dctf_cliente_id ON dctf_declaracoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_dctf_periodo ON dctf_declaracoes(periodo);
CREATE INDEX IF NOT EXISTS idx_dctf_periodo_apuracao ON dctf_declaracoes(periodo_apuracao);
CREATE INDEX IF NOT EXISTS idx_dctf_status ON dctf_declaracoes(status);
CREATE INDEX IF NOT EXISTS idx_dctf_situacao ON dctf_declaracoes(situacao);
CREATE INDEX IF NOT EXISTS idx_dctf_data_declaracao ON dctf_declaracoes(data_declaracao);
CREATE INDEX IF NOT EXISTS idx_dctf_data_transmissao ON dctf_declaracoes(data_transmissao);
CREATE INDEX IF NOT EXISTS idx_dctf_numero_identificacao ON dctf_declaracoes(numero_identificacao);

-- Comentários
COMMENT ON TABLE dctf_declaracoes IS 'Metadados das declarações DCTF';

-- ============================================================================
-- TABELA: dctf_dados
-- ============================================================================
-- Dados processados das declarações DCTF
-- ============================================================================
CREATE TABLE IF NOT EXISTS dctf_dados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    declaracao_id UUID NOT NULL REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    linha INTEGER NOT NULL,
    codigo VARCHAR(10),
    descricao TEXT,
    valor DECIMAL(15,2),
    data_ocorrencia DATE,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para dctf_dados
CREATE INDEX IF NOT EXISTS idx_dctf_dados_declaracao_id ON dctf_dados(declaracao_id);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_codigo ON dctf_dados(codigo);
CREATE INDEX IF NOT EXISTS idx_dctf_dados_linha ON dctf_dados(linha);

-- Comentários
COMMENT ON TABLE dctf_dados IS 'Dados processados das declarações DCTF';

-- ============================================================================
-- TABELA: analises
-- ============================================================================
-- Resultados das análises realizadas
-- ============================================================================
CREATE TABLE IF NOT EXISTS analises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    declaracao_id UUID NOT NULL REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    tipo_analise VARCHAR(50) NOT NULL,
    severidade VARCHAR(20) NOT NULL CHECK (severidade IN ('baixa', 'media', 'alta', 'critica')),
    descricao TEXT NOT NULL,
    recomendacoes TEXT[],
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_analise', 'concluida')),
    dados_analise JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para analises
CREATE INDEX IF NOT EXISTS idx_analises_declaracao_id ON analises(declaracao_id);
CREATE INDEX IF NOT EXISTS idx_analises_tipo ON analises(tipo_analise);
CREATE INDEX IF NOT EXISTS idx_analises_severidade ON analises(severidade);
CREATE INDEX IF NOT EXISTS idx_analises_status ON analises(status);

-- Comentários
COMMENT ON TABLE analises IS 'Resultados das análises realizadas';

-- ============================================================================
-- TABELA: flags
-- ============================================================================
-- Sinalizações de problemas encontrados
-- ============================================================================
CREATE TABLE IF NOT EXISTS flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    declaracao_id UUID NOT NULL REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    linha_dctf INTEGER,
    codigo_flag VARCHAR(20) NOT NULL,
    descricao TEXT NOT NULL,
    severidade VARCHAR(20) NOT NULL CHECK (severidade IN ('baixa', 'media', 'alta', 'critica')),
    resolvido BOOLEAN DEFAULT FALSE,
    resolucao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para flags
CREATE INDEX IF NOT EXISTS idx_flags_declaracao_id ON flags(declaracao_id);
CREATE INDEX IF NOT EXISTS idx_flags_codigo ON flags(codigo_flag);
CREATE INDEX IF NOT EXISTS idx_flags_severidade ON flags(severidade);
CREATE INDEX IF NOT EXISTS idx_flags_resolvido ON flags(resolvido);

-- Comentários
COMMENT ON TABLE flags IS 'Sinalizações de problemas encontrados';

-- ============================================================================
-- TABELA: relatorios
-- ============================================================================
-- Relatórios gerados pelo sistema
-- ============================================================================
CREATE TABLE IF NOT EXISTS relatorios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    declaracao_id UUID NOT NULL REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    tipo_relatorio VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT,
    arquivo_pdf VARCHAR(500),
    parametros JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para relatorios
CREATE INDEX IF NOT EXISTS idx_relatorios_declaracao_id ON relatorios(declaracao_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_tipo ON relatorios(tipo_relatorio);

-- Comentários
COMMENT ON TABLE relatorios IS 'Relatórios gerados pelo sistema';

-- ============================================================================
-- TABELA: upload_history
-- ============================================================================
-- Histórico de uploads de planilhas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.upload_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    cliente_nome TEXT,
    periodo TEXT NOT NULL,
    filename TEXT NOT NULL,
    total_linhas INTEGER NOT NULL DEFAULT 0,
    processadas INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('sucesso','erro')),
    mensagem TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para upload_history
CREATE INDEX IF NOT EXISTS idx_upload_history_cliente_id ON public.upload_history (cliente_id);
CREATE INDEX IF NOT EXISTS idx_upload_history_periodo ON public.upload_history (periodo);
CREATE INDEX IF NOT EXISTS idx_upload_history_timestamp ON public.upload_history (timestamp DESC);

-- Comentários
COMMENT ON TABLE upload_history IS 'Histórico de uploads de planilhas';

-- ============================================================================
-- TABELAS DE CÓDIGOS DCTF
-- ============================================================================
-- Essas tabelas são usadas para validação e classificação de códigos DCTF
-- ============================================================================

-- Tabela de códigos DCTF
CREATE TABLE IF NOT EXISTS dctf_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(10) UNIQUE NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('receita', 'deducao', 'retencao', 'outros')),
    ativo BOOLEAN DEFAULT TRUE,
    periodo_inicio VARCHAR(7), -- YYYY-MM
    periodo_fim VARCHAR(7),    -- YYYY-MM
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para dctf_codes
CREATE INDEX IF NOT EXISTS idx_dctf_codes_codigo ON dctf_codes(codigo);
CREATE INDEX IF NOT EXISTS idx_dctf_codes_tipo ON dctf_codes(tipo);
CREATE INDEX IF NOT EXISTS idx_dctf_codes_ativo ON dctf_codes(ativo);
CREATE INDEX IF NOT EXISTS idx_dctf_codes_periodo ON dctf_codes(periodo_inicio, periodo_fim);

-- Tabela de códigos de receita (classificação mais detalhada)
CREATE TABLE IF NOT EXISTS dctf_receita_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) UNIQUE NOT NULL, -- Formato: X.X.X.XX.XX
    descricao VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    subcategoria VARCHAR(100),
    ativo BOOLEAN DEFAULT TRUE,
    periodo_inicio VARCHAR(7),
    periodo_fim VARCHAR(7),
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para dctf_receita_codes
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_codigo ON dctf_receita_codes(codigo);
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_categoria ON dctf_receita_codes(categoria);
CREATE INDEX IF NOT EXISTS idx_dctf_receita_codes_ativo ON dctf_receita_codes(ativo);

-- Tabela de alíquotas por período
CREATE TABLE IF NOT EXISTS dctf_aliquotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_dctf VARCHAR(10) NOT NULL REFERENCES dctf_codes(codigo),
    codigo_receita VARCHAR(20) REFERENCES dctf_receita_codes(codigo),
    aliquota DECIMAL(5,4) NOT NULL, -- Ex: 0.0150 para 1,5%
    base_calculo VARCHAR(50) NOT NULL,
    periodo_inicio VARCHAR(7) NOT NULL,
    periodo_fim VARCHAR(7),
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para dctf_aliquotas
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_codigo_dctf ON dctf_aliquotas(codigo_dctf);
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_periodo ON dctf_aliquotas(periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_dctf_aliquotas_codigo_receita ON dctf_aliquotas(codigo_receita);

-- Comentários
COMMENT ON TABLE dctf_codes IS 'Códigos DCTF válidos para validação';
COMMENT ON TABLE dctf_receita_codes IS 'Códigos de receita detalhados';
COMMENT ON TABLE dctf_aliquotas IS 'Alíquotas de impostos por período';

-- ============================================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dctf_declaracoes_updated_at BEFORE UPDATE ON dctf_declaracoes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analises_updated_at BEFORE UPDATE ON analises
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flags_updated_at BEFORE UPDATE ON flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dctf_codes_updated_at BEFORE UPDATE ON dctf_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dctf_receita_codes_updated_at BEFORE UPDATE ON dctf_receita_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dctf_aliquotas_updated_at BEFORE UPDATE ON dctf_aliquotas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNÇÕES AUXILIARES
-- ============================================================================

-- Função para validar código DCTF
CREATE OR REPLACE FUNCTION validate_dctf_code(code VARCHAR(10), period VARCHAR(7) DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    code_exists BOOLEAN;
    period_valid BOOLEAN := TRUE;
BEGIN
    -- Verificar se código existe e está ativo
    SELECT EXISTS(
        SELECT 1 FROM dctf_codes 
        WHERE codigo = code AND ativo = TRUE
    ) INTO code_exists;
    
    IF NOT code_exists THEN
        RETURN FALSE;
    END IF;
    
    -- Verificar período se fornecido
    IF period IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM dctf_codes 
            WHERE codigo = code 
            AND (periodo_inicio IS NULL OR period >= periodo_inicio)
            AND (periodo_fim IS NULL OR period <= periodo_fim)
        ) INTO period_valid;
    END IF;
    
    RETURN period_valid;
END;
$$ LANGUAGE plpgsql;

-- Função para obter alíquota por período
CREATE OR REPLACE FUNCTION get_dctf_aliquota(code VARCHAR(10), period VARCHAR(7))
RETURNS DECIMAL(5,4) AS $$
DECLARE
    result DECIMAL(5,4);
BEGIN
    SELECT aliquota INTO result
    FROM dctf_aliquotas 
    WHERE codigo_dctf = code 
    AND (periodo_inicio IS NULL OR period >= periodo_inicio)
    AND (periodo_fim IS NULL OR period <= periodo_fim)
    ORDER BY periodo_inicio DESC
    LIMIT 1;
    
    RETURN COALESCE(result, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DADOS INICIAIS (OPCIONAL)
-- ============================================================================
-- Descomente as linhas abaixo se quiser inserir dados padrão
-- ============================================================================

/*
-- Inserir códigos DCTF padrão
INSERT INTO dctf_codes (codigo, descricao, tipo, ativo) VALUES
-- Códigos de Receita
('001', 'Receita Bruta', 'receita', true),
('002', 'Receita Líquida', 'receita', true),
('003', 'Receita de Vendas', 'receita', true),
-- ... (veja docs/dctf-codes-schema.sql para lista completa)
ON CONFLICT (codigo) DO NOTHING;
*/

-- ============================================================================
-- FIM DO SCHEMA
-- ============================================================================
-- Após executar este script, execute também:
-- 1. docs/dctf-constraints.sql (se necessário)
-- 2. docs/dctf-performance-indexes.sql (para otimização)
-- 3. docs/migrations/001_normalize_cnpj_column.sql (se já tiver dados)
-- ============================================================================
