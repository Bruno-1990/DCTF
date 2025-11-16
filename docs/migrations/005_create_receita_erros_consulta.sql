-- Migração 005: Cria tabela para armazenar logs detalhados de erros em consultas em lote
-- Esta tabela permite rastrear e analisar erros específicos por CNPJ durante consultas em lote
-- facilitando diagnóstico, reprocessamento e relatórios

CREATE TABLE IF NOT EXISTS receita_erros_consulta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referência à sincronização/consulta que gerou o erro
  sincronizacao_id UUID REFERENCES receita_sincronizacoes(id) ON DELETE CASCADE,
  
  -- CNPJ que causou o erro
  cnpj_contribuinte VARCHAR(14) NOT NULL,
  
  -- Período consultado (opcional)
  periodo_inicial DATE,
  periodo_final DATE,
  
  -- Tipo de consulta que falhou
  tipo_consulta VARCHAR(50) NOT NULL DEFAULT 'consulta_lote' CHECK (
    tipo_consulta IN ('consulta_simples', 'consulta_lote', 'sincronizacao_cliente', 'sincronizacao_todos')
  ),
  
  -- Classificação do erro
  tipo_erro VARCHAR(50) NOT NULL CHECK (
    tipo_erro IN (
      'erro_api',              -- Erro na API da Receita Federal
      'erro_autenticacao',     -- Erro de autenticação/token
      'erro_rate_limit',       -- Rate limiting atingido
      'erro_validacao',        -- Erro de validação (CNPJ inválido, etc)
      'erro_banco_dados',      -- Erro ao salvar no banco
      'erro_rede',             -- Erro de rede/timeout
      'erro_desconhecido'      -- Erro não categorizado
    )
  ),
  
  -- Detalhes do erro
  mensagem_erro TEXT NOT NULL,
  detalhes_erro JSONB, -- Stack trace, response HTTP, etc.
  
  -- Código HTTP (se aplicável)
  codigo_http INTEGER,
  
  -- Status HTTP (se aplicável)
  status_http VARCHAR(50),
  
  -- Dados da requisição que causou o erro (para reprocessamento)
  dados_requisicao JSONB,
  
  -- Timestamp do erro
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Flag para indicar se já foi reprocessado
  reprocessado BOOLEAN DEFAULT false,
  reprocessado_em TIMESTAMPTZ,
  reprocessado_sincronizacao_id UUID REFERENCES receita_sincronizacoes(id) ON DELETE SET NULL,
  
  -- Observações adicionais
  observacoes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_receita_erros_sincronizacao 
  ON receita_erros_consulta(sincronizacao_id);

CREATE INDEX IF NOT EXISTS idx_receita_erros_cnpj 
  ON receita_erros_consulta(cnpj_contribuinte);

CREATE INDEX IF NOT EXISTS idx_receita_erros_tipo_erro 
  ON receita_erros_consulta(tipo_erro);

CREATE INDEX IF NOT EXISTS idx_receita_erros_ocorrido 
  ON receita_erros_consulta(ocorrido_em DESC);

CREATE INDEX IF NOT EXISTS idx_receita_erros_reprocessado 
  ON receita_erros_consulta(reprocessado, ocorrido_em DESC);

-- Índice composto para análise de erros por CNPJ
CREATE INDEX IF NOT EXISTS idx_receita_erros_cnpj_tipo 
  ON receita_erros_consulta(cnpj_contribuinte, tipo_erro, ocorrido_em DESC);

-- Comentários nas tabelas e colunas
COMMENT ON TABLE receita_erros_consulta IS 'Logs detalhados de erros ocorridos durante consultas à API da Receita Federal';
COMMENT ON COLUMN receita_erros_consulta.sincronizacao_id IS 'Referência à sincronização que gerou este erro';
COMMENT ON COLUMN receita_erros_consulta.cnpj_contribuinte IS 'CNPJ que causou o erro na consulta';
COMMENT ON COLUMN receita_erros_consulta.tipo_erro IS 'Classificação do tipo de erro para facilitar análise';
COMMENT ON COLUMN receita_erros_consulta.detalhes_erro IS 'Detalhes técnicos do erro (stack trace, response HTTP, etc.)';
COMMENT ON COLUMN receita_erros_consulta.dados_requisicao IS 'Dados da requisição original para permitir reprocessamento';
COMMENT ON COLUMN receita_erros_consulta.reprocessado IS 'Indica se o erro foi reprocessado com sucesso';

