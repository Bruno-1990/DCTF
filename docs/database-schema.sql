-- Schema do banco de dados DCTF
-- Este arquivo contém todas as definições de tabelas e relacionamentos

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    email VARCHAR(255),
    telefone VARCHAR(20),
    endereco TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para clientes
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);

-- Tabela de Declarações DCTF
CREATE TABLE IF NOT EXISTS dctf_declaracoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    periodo VARCHAR(7) NOT NULL, -- Formato: YYYY-MM
    data_declaracao DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
    arquivo_original VARCHAR(500),
    arquivo_processado VARCHAR(500),
    total_registros INTEGER DEFAULT 0,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para dctf_declaracoes
CREATE INDEX IF NOT EXISTS idx_dctf_cliente_id ON dctf_declaracoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_dctf_periodo ON dctf_declaracoes(periodo);
CREATE INDEX IF NOT EXISTS idx_dctf_status ON dctf_declaracoes(status);
CREATE INDEX IF NOT EXISTS idx_dctf_data_declaracao ON dctf_declaracoes(data_declaracao);

-- Tabela de Dados DCTF (dados processados)
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

-- Tabela de Análises
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

-- Tabela de Flags (sinalizações de problemas)
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

-- Tabela de Relatórios
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

-- Comentários nas tabelas
COMMENT ON TABLE clientes IS 'Tabela de clientes do sistema DCTF';
COMMENT ON TABLE dctf_declaracoes IS 'Metadados das declarações DCTF';
COMMENT ON TABLE dctf_dados IS 'Dados processados das declarações DCTF';
COMMENT ON TABLE analises IS 'Resultados das análises realizadas';
COMMENT ON TABLE flags IS 'Sinalizações de problemas encontrados';
COMMENT ON TABLE relatorios IS 'Relatórios gerados pelo sistema';
