-- Políticas de Row Level Security (RLS) para o sistema DCTF
-- Este arquivo contém todas as políticas de segurança para as tabelas

-- Habilitar RLS em todas as tabelas
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dctf_declaracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dctf_dados ENABLE ROW LEVEL SECURITY;
ALTER TABLE analises ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLÍTICAS PARA TABELA CLIENTES
-- =============================================

-- Política para leitura de clientes (usuários autenticados)
CREATE POLICY "Permitir leitura de clientes para usuários autenticados" ON clientes
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para inserção de clientes (usuários autenticados)
CREATE POLICY "Permitir inserção de clientes para usuários autenticados" ON clientes
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização de clientes (usuários autenticados)
CREATE POLICY "Permitir atualização de clientes para usuários autenticados" ON clientes
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Política para exclusão de clientes (usuários autenticados)
CREATE POLICY "Permitir exclusão de clientes para usuários autenticados" ON clientes
    FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- POLÍTICAS PARA TABELA DCTF_DECLARACOES
-- =============================================

-- Política para leitura de declarações (usuários autenticados)
CREATE POLICY "Permitir leitura de declarações para usuários autenticados" ON dctf_declaracoes
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para inserção de declarações (usuários autenticados)
CREATE POLICY "Permitir inserção de declarações para usuários autenticados" ON dctf_declaracoes
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização de declarações (usuários autenticados)
CREATE POLICY "Permitir atualização de declarações para usuários autenticados" ON dctf_declaracoes
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Política para exclusão de declarações (usuários autenticados)
CREATE POLICY "Permitir exclusão de declarações para usuários autenticados" ON dctf_declaracoes
    FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- POLÍTICAS PARA TABELA DCTF_DADOS
-- =============================================

-- Política para leitura de dados DCTF (usuários autenticados)
CREATE POLICY "Permitir leitura de dados DCTF para usuários autenticados" ON dctf_dados
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para inserção de dados DCTF (usuários autenticados)
CREATE POLICY "Permitir inserção de dados DCTF para usuários autenticados" ON dctf_dados
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização de dados DCTF (usuários autenticados)
CREATE POLICY "Permitir atualização de dados DCTF para usuários autenticados" ON dctf_dados
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Política para exclusão de dados DCTF (usuários autenticados)
CREATE POLICY "Permitir exclusão de dados DCTF para usuários autenticados" ON dctf_dados
    FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- POLÍTICAS PARA TABELA ANALISES
-- =============================================

-- Política para leitura de análises (usuários autenticados)
CREATE POLICY "Permitir leitura de análises para usuários autenticados" ON analises
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para inserção de análises (usuários autenticados)
CREATE POLICY "Permitir inserção de análises para usuários autenticados" ON analises
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização de análises (usuários autenticados)
CREATE POLICY "Permitir atualização de análises para usuários autenticados" ON analises
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Política para exclusão de análises (usuários autenticados)
CREATE POLICY "Permitir exclusão de análises para usuários autenticados" ON analises
    FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- POLÍTICAS PARA TABELA FLAGS
-- =============================================

-- Política para leitura de flags (usuários autenticados)
CREATE POLICY "Permitir leitura de flags para usuários autenticados" ON flags
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para inserção de flags (usuários autenticados)
CREATE POLICY "Permitir inserção de flags para usuários autenticados" ON flags
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização de flags (usuários autenticados)
CREATE POLICY "Permitir atualização de flags para usuários autenticados" ON flags
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Política para exclusão de flags (usuários autenticados)
CREATE POLICY "Permitir exclusão de flags para usuários autenticados" ON flags
    FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- POLÍTICAS PARA TABELA RELATORIOS
-- =============================================

-- Política para leitura de relatórios (usuários autenticados)
CREATE POLICY "Permitir leitura de relatórios para usuários autenticados" ON relatorios
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para inserção de relatórios (usuários autenticados)
CREATE POLICY "Permitir inserção de relatórios para usuários autenticados" ON relatorios
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização de relatórios (usuários autenticados)
CREATE POLICY "Permitir atualização de relatórios para usuários autenticados" ON relatorios
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Política para exclusão de relatórios (usuários autenticados)
CREATE POLICY "Permitir exclusão de relatórios para usuários autenticados" ON relatorios
    FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- POLÍTICAS AVANÇADAS (OPCIONAIS)
-- =============================================

-- Política para permitir apenas service role acessar dados sensíveis
-- (Descomente se necessário)
/*
CREATE POLICY "Apenas service role pode acessar dados sensíveis" ON clientes
    FOR ALL USING (auth.role() = 'service_role');
*/

-- Política para logs de auditoria (se implementar tabela de logs)
-- (Descomente se necessário)
/*
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(50) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apenas service role pode inserir logs de auditoria" ON audit_logs
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Usuários autenticados podem ler logs de auditoria" ON audit_logs
    FOR SELECT USING (auth.role() = 'authenticated');
*/

-- =============================================
-- FUNÇÕES DE SEGURANÇA
-- =============================================

-- Função para verificar se usuário é administrador
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- Implementar lógica de verificação de admin
    -- Por enquanto, retorna true para usuários autenticados
    RETURN auth.role() = 'authenticated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter ID do usuário atual
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
    -- Implementar lógica para obter ID do usuário
    -- Por enquanto, retorna um UUID fixo
    RETURN '00000000-0000-0000-0000-000000000000'::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- COMENTÁRIOS DAS POLÍTICAS
-- =============================================

COMMENT ON POLICY "Permitir leitura de clientes para usuários autenticados" ON clientes IS
'Permite que usuários autenticados leiam dados de clientes';

COMMENT ON POLICY "Permitir inserção de clientes para usuários autenticados" ON clientes IS
'Permite que usuários autenticados criem novos clientes';

COMMENT ON POLICY "Permitir atualização de clientes para usuários autenticados" ON clientes IS
'Permite que usuários autenticados atualizem dados de clientes';

COMMENT ON POLICY "Permitir exclusão de clientes para usuários autenticados" ON clientes IS
'Permite que usuários autenticados excluam clientes';
