-- Schema para códigos DCTF
-- Tabela de códigos válidos para validação de dados DCTF

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

-- Trigger para updated_at
CREATE TRIGGER update_dctf_codes_updated_at BEFORE UPDATE ON dctf_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir códigos DCTF padrão
INSERT INTO dctf_codes (codigo, descricao, tipo, ativo) VALUES
-- Códigos de Receita
('001', 'Receita Bruta', 'receita', true),
('002', 'Receita Líquida', 'receita', true),
('003', 'Receita de Vendas', 'receita', true),
('004', 'Receita de Serviços', 'receita', true),
('005', 'Receita Financeira', 'receita', true),
('006', 'Receita de Aluguéis', 'receita', true),
('007', 'Receita de Royalties', 'receita', true),
('008', 'Outras Receitas', 'receita', true),

-- Códigos de Dedução
('101', 'Deduções Legais', 'deducao', true),
('102', 'Descontos Incondicionais', 'deducao', true),
('103', 'Devoluções de Vendas', 'deducao', true),
('104', 'Cancelamentos', 'deducao', true),
('105', 'Abatimentos', 'deducao', true),
('106', 'Impostos sobre Vendas', 'deducao', true),
('107', 'Comissões sobre Vendas', 'deducao', true),
('108', 'Outras Deduções', 'deducao', true),

-- Códigos de Retenção
('201', 'IRRF - Imposto de Renda Retido na Fonte', 'retencao', true),
('202', 'CSLL - Contribuição Social sobre Lucro Líquido', 'retencao', true),
('203', 'PIS - Programa de Integração Social', 'retencao', true),
('204', 'COFINS - Contribuição para Financiamento da Seguridade Social', 'retencao', true),
('205', 'INSS - Instituto Nacional do Seguro Social', 'retencao', true),
('206', 'ISS - Imposto sobre Serviços', 'retencao', true),
('207', 'ICMS - Imposto sobre Circulação de Mercadorias e Serviços', 'retencao', true),
('208', 'Outras Retenções', 'retencao', true),

-- Outros Códigos
('301', 'Ajustes de Exercícios Anteriores', 'outros', true),
('302', 'Compensações', 'outros', true),
('303', 'Restituições', 'outros', true),
('304', 'Outros Ajustes', 'outros', true);

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

-- Trigger para updated_at
CREATE TRIGGER update_dctf_receita_codes_updated_at BEFORE UPDATE ON dctf_receita_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir códigos de receita padrão
INSERT INTO dctf_receita_codes (codigo, descricao, categoria, subcategoria, ativo) VALUES
-- Receitas de Vendas
('1.1.1.01.01', 'Vendas de Produtos', 'Vendas', 'Produtos', true),
('1.1.1.01.02', 'Vendas de Mercadorias', 'Vendas', 'Mercadorias', true),
('1.1.1.01.03', 'Vendas de Serviços', 'Vendas', 'Serviços', true),
('1.1.1.01.04', 'Vendas de Bens do Ativo Imobilizado', 'Vendas', 'Ativo Imobilizado', true),

-- Receitas Financeiras
('1.1.2.01.01', 'Juros sobre Aplicações Financeiras', 'Financeira', 'Juros', true),
('1.1.2.01.02', 'Rendimentos de Fundos de Investimento', 'Financeira', 'Fundos', true),
('1.1.2.01.03', 'Ganhos em Operações de Câmbio', 'Financeira', 'Câmbio', true),
('1.1.2.01.04', 'Outras Receitas Financeiras', 'Financeira', 'Outras', true),

-- Receitas de Aluguéis
('1.1.3.01.01', 'Aluguéis de Imóveis', 'Aluguéis', 'Imóveis', true),
('1.1.3.01.02', 'Aluguéis de Equipamentos', 'Aluguéis', 'Equipamentos', true),
('1.1.3.01.03', 'Aluguéis de Veículos', 'Aluguéis', 'Veículos', true),

-- Outras Receitas
('1.1.4.01.01', 'Royalties', 'Outras', 'Royalties', true),
('1.1.4.01.02', 'Franquias', 'Outras', 'Franquias', true),
('1.1.4.01.03', 'Licenças', 'Outras', 'Licenças', true),
('1.1.4.01.04', 'Outras Receitas Operacionais', 'Outras', 'Operacionais', true);

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

-- Trigger para updated_at
CREATE TRIGGER update_dctf_aliquotas_updated_at BEFORE UPDATE ON dctf_aliquotas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir alíquotas padrão (exemplos)
INSERT INTO dctf_aliquotas (codigo_dctf, aliquota, base_calculo, periodo_inicio) VALUES
-- IRRF
('201', 0.0150, 'Valor da Operação', '2024-01'),
('201', 0.0125, 'Valor da Operação', '2024-07'),
-- CSLL
('202', 0.0100, 'Valor da Operação', '2024-01'),
-- PIS
('203', 0.0065, 'Valor da Operação', '2024-01'),
-- COFINS
('204', 0.0300, 'Valor da Operação', '2024-01'),
-- INSS
('205', 0.1100, 'Valor da Operação', '2024-01');

-- Comentários nas tabelas
COMMENT ON TABLE dctf_codes IS 'Códigos DCTF válidos para validação';
COMMENT ON TABLE dctf_receita_codes IS 'Códigos de receita detalhados';
COMMENT ON TABLE dctf_aliquotas IS 'Alíquotas de impostos por período';

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
