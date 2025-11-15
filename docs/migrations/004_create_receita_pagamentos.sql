-- Migração 004: Cria tabela para armazenar dados de pagamento da Receita Federal
-- Esta tabela armazena os dados brutos retornados pela API da Receita Federal
-- e permite rastrear histórico de sincronizações e correspondências com DCTFs

-- Tabela principal de pagamentos da Receita Federal
CREATE TABLE IF NOT EXISTS receita_pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados da Requisição/Sincronização
  cnpj_contribuinte VARCHAR(14) NOT NULL,
  periodo_consulta_inicial DATE,
  periodo_consulta_final DATE,
  data_sincronizacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Dados do Documento (da API da Receita)
  numero_documento VARCHAR(50) NOT NULL,
  tipo_documento TEXT,
  periodo_apuracao DATE, -- Formato original: YYYY-MM-DD
  competencia VARCHAR(7), -- Formato: YYYY-MM
  data_arrecadacao DATE,
  data_vencimento DATE,
  codigo_receita_doc VARCHAR(20),
  
  -- Valores do Documento
  valor_documento NUMERIC(15, 2),
  valor_saldo_documento NUMERIC(15, 2),
  valor_principal NUMERIC(15, 2),
  valor_saldo_principal NUMERIC(15, 2),
  
  -- Dados da Linha (se houver desmembramento)
  sequencial VARCHAR(10),
  codigo_receita_linha VARCHAR(20),
  descricao_receita_linha TEXT,
  periodo_apuracao_linha DATE,
  data_vencimento_linha DATE,
  valor_linha NUMERIC(15, 2),
  valor_principal_linha NUMERIC(15, 2),
  valor_saldo_linha NUMERIC(15, 2),
  
  -- Relacionamento com DCTF (quando encontrado match)
  dctf_id UUID REFERENCES dctf_declaracoes(id) ON DELETE SET NULL,
  
  -- Status de processamento
  status_processamento VARCHAR(20) DEFAULT 'novo' CHECK (
    status_processamento IN ('novo', 'processado', 'correspondido', 'erro')
  ),
  
  -- Metadados adicionais
  dados_completos JSONB, -- Armazena resposta completa da API para referência
  observacoes TEXT,
  erro_sincronizacao TEXT, -- Se houver erro ao processar
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_cnpj 
  ON receita_pagamentos(cnpj_contribuinte);

CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_competencia 
  ON receita_pagamentos(competencia);

CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_numero_documento 
  ON receita_pagamentos(numero_documento);

CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_dctf_id 
  ON receita_pagamentos(dctf_id);

CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_status 
  ON receita_pagamentos(status_processamento);

CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_data_sincronizacao 
  ON receita_pagamentos(data_sincronizacao DESC);

-- Índice composto para busca de correspondências
CREATE INDEX IF NOT EXISTS idx_receita_pagamentos_match 
  ON receita_pagamentos(cnpj_contribuinte, competencia, valor_saldo_documento);

-- Tabela de histórico de sincronizações
CREATE TABLE IF NOT EXISTS receita_sincronizacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados da Sincronização
  cnpj_contribuinte VARCHAR(14),
  periodo_inicial DATE,
  periodo_final DATE,
  tipo_sincronizacao VARCHAR(20) NOT NULL CHECK (
    tipo_sincronizacao IN ('cliente', 'todos', 'debito_especifico')
  ),
  
  -- Resultados
  total_consultados INTEGER DEFAULT 0,
  total_encontrados INTEGER DEFAULT 0,
  total_atualizados INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  
  -- Detalhes da execução
  resultado_completo JSONB, -- Armazena resultado detalhado da sincronização
  erros JSONB, -- Lista de erros encontrados
  tempo_execucao_ms INTEGER,
  
  -- Status
  status VARCHAR(20) DEFAULT 'em_andamento' CHECK (
    status IN ('em_andamento', 'concluida', 'erro', 'cancelada')
  ),
  mensagem TEXT,
  
  -- Usuário/Sistema que executou
  executado_por VARCHAR(100) DEFAULT 'sistema-sincronizacao-receita',
  
  -- Timestamps
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para histórico
CREATE INDEX IF NOT EXISTS idx_receita_sincronizacoes_cnpj 
  ON receita_sincronizacoes(cnpj_contribuinte);

CREATE INDEX IF NOT EXISTS idx_receita_sincronizacoes_status 
  ON receita_sincronizacoes(status);

CREATE INDEX IF NOT EXISTS idx_receita_sincronizacoes_iniciado 
  ON receita_sincronizacoes(iniciado_em DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_receita_pagamentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_receita_pagamentos_updated_at
  BEFORE UPDATE ON receita_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION update_receita_pagamentos_updated_at();

-- Comentários nas tabelas
COMMENT ON TABLE receita_pagamentos IS 'Armazena dados de pagamento retornados pela API da Receita Federal';
COMMENT ON TABLE receita_sincronizacoes IS 'Histórico de execuções de sincronização com a Receita Federal';

-- Comentários nas colunas importantes
COMMENT ON COLUMN receita_pagamentos.dados_completos IS 'Resposta completa da API da Receita em formato JSON para referência futura';
COMMENT ON COLUMN receita_pagamentos.dctf_id IS 'Referência para DCTF correspondente quando match é encontrado';
COMMENT ON COLUMN receita_pagamentos.status_processamento IS 'Status do processamento: novo, processado, correspondido, erro';

