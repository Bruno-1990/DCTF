-- ============================================================================
-- MIGRAÇÃO 004: CRIAR TABELAS DE RECEITA PAGAMENTOS (MySQL)
-- ============================================================================
-- Adaptado do script PostgreSQL para MySQL
-- Cria tabelas para armazenar dados de pagamento da Receita Federal
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA: receita_pagamentos
-- ============================================================================
CREATE TABLE IF NOT EXISTS receita_pagamentos (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  
  -- Dados da Requisição/Sincronização
  cnpj_contribuinte VARCHAR(14) NOT NULL,
  periodo_consulta_inicial DATE,
  periodo_consulta_final DATE,
  data_sincronizacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Dados do Documento (da API da Receita)
  numero_documento VARCHAR(50) NOT NULL,
  tipo_documento TEXT,
  periodo_apuracao DATE COMMENT 'Formato original: YYYY-MM-DD',
  competencia VARCHAR(7) COMMENT 'Formato: YYYY-MM',
  data_arrecadacao DATE,
  data_vencimento DATE,
  codigo_receita_doc VARCHAR(20),
  
  -- Valores do Documento
  valor_documento DECIMAL(15, 2),
  valor_saldo_documento DECIMAL(15, 2),
  valor_principal DECIMAL(15, 2),
  valor_saldo_principal DECIMAL(15, 2),
  
  -- Dados da Linha (se houver desmembramento)
  sequencial VARCHAR(10),
  codigo_receita_linha VARCHAR(20),
  descricao_receita_linha TEXT,
  periodo_apuracao_linha DATE,
  data_vencimento_linha DATE,
  valor_linha DECIMAL(15, 2),
  valor_principal_linha DECIMAL(15, 2),
  valor_saldo_linha DECIMAL(15, 2),
  
  -- Relacionamento com DCTF (quando encontrado match)
  dctf_id CHAR(36) COMMENT 'Referência para dctf_declaracoes(id)',
  
  -- Status de processamento
  status_processamento VARCHAR(20) DEFAULT 'novo' COMMENT 'novo, processado, correspondido, erro',
  
  -- Metadados adicionais
  dados_completos JSON COMMENT 'Armazena resposta completa da API para referência',
  observacoes TEXT,
  erro_sincronizacao TEXT COMMENT 'Se houver erro ao processar',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_receita_pagamentos_cnpj (cnpj_contribuinte),
  INDEX idx_receita_pagamentos_competencia (competencia),
  INDEX idx_receita_pagamentos_numero_documento (numero_documento),
  INDEX idx_receita_pagamentos_dctf_id (dctf_id),
  INDEX idx_receita_pagamentos_status (status_processamento),
  INDEX idx_receita_pagamentos_data_sincronizacao (data_sincronizacao DESC),
  INDEX idx_receita_pagamentos_match (cnpj_contribuinte, competencia, valor_saldo_documento),
  
  FOREIGN KEY (dctf_id) REFERENCES dctf_declaracoes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Armazena dados de pagamento retornados pela API da Receita Federal';

-- ============================================================================
-- TABELA: receita_sincronizacoes
-- ============================================================================
CREATE TABLE IF NOT EXISTS receita_sincronizacoes (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  
  -- Dados da Sincronização
  cnpj_contribuinte VARCHAR(14),
  periodo_inicial DATE,
  periodo_final DATE,
  tipo_sincronizacao VARCHAR(20) NOT NULL COMMENT 'cliente, todos, debito_especifico',
  
  -- Resultados
  total_consultados INT DEFAULT 0,
  total_encontrados INT DEFAULT 0,
  total_atualizados INT DEFAULT 0,
  total_erros INT DEFAULT 0,
  
  -- Detalhes da execução
  resultado_completo JSON COMMENT 'Armazena resultado detalhado da sincronização',
  erros JSON COMMENT 'Lista de erros encontrados',
  tempo_execucao_ms INT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'em_andamento' COMMENT 'em_andamento, concluida, erro, cancelada',
  mensagem TEXT,
  
  -- Usuário/Sistema que executou
  executado_por VARCHAR(100) DEFAULT 'sistema-sincronizacao-receita',
  
  -- Timestamps
  iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_receita_sincronizacoes_cnpj (cnpj_contribuinte),
  INDEX idx_receita_sincronizacoes_status (status),
  INDEX idx_receita_sincronizacoes_iniciado (iniciado_em DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Histórico de execuções de sincronização com a Receita Federal';

-- ============================================================================
-- TABELA: receita_erros_consulta
-- ============================================================================
CREATE TABLE IF NOT EXISTS receita_erros_consulta (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  
  -- Referência à sincronização/consulta que gerou o erro
  sincronizacao_id CHAR(36) COMMENT 'Referência para receita_sincronizacoes(id)',
  
  -- CNPJ que causou o erro
  cnpj_contribuinte VARCHAR(14) NOT NULL,
  
  -- Período consultado (opcional)
  periodo_inicial DATE,
  periodo_final DATE,
  
  -- Tipo de consulta que falhou
  tipo_consulta VARCHAR(50) NOT NULL DEFAULT 'consulta_lote' COMMENT 'consulta_simples, consulta_lote, sincronizacao_cliente, sincronizacao_todos',
  
  -- Classificação do erro
  tipo_erro VARCHAR(50) NOT NULL COMMENT 'erro_api, erro_autenticacao, erro_rate_limit, erro_validacao, erro_banco_dados, erro_rede, erro_desconhecido',
  
  -- Detalhes do erro
  mensagem_erro TEXT NOT NULL,
  detalhes_erro JSON COMMENT 'Stack trace, response HTTP, etc.',
  
  -- Código HTTP (se aplicável)
  codigo_http INT,
  
  -- Status HTTP (se aplicável)
  status_http VARCHAR(50),
  
  -- Dados da requisição que causou o erro (para reprocessamento)
  dados_requisicao JSON,
  
  -- Timestamp do erro
  ocorrido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Flag para indicar se já foi reprocessado
  reprocessado BOOLEAN DEFAULT FALSE,
  reprocessado_em TIMESTAMP NULL,
  reprocessado_sincronizacao_id CHAR(36) COMMENT 'Referência para receita_sincronizacoes(id)',
  
  -- Observações adicionais
  observacoes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_receita_erros_sincronizacao (sincronizacao_id),
  INDEX idx_receita_erros_cnpj (cnpj_contribuinte),
  INDEX idx_receita_erros_tipo_erro (tipo_erro),
  INDEX idx_receita_erros_ocorrido (ocorrido_em DESC),
  INDEX idx_receita_erros_reprocessado (reprocessado, ocorrido_em DESC),
  INDEX idx_receita_erros_cnpj_tipo (cnpj_contribuinte, tipo_erro, ocorrido_em DESC),
  
  FOREIGN KEY (sincronizacao_id) REFERENCES receita_sincronizacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (reprocessado_sincronizacao_id) REFERENCES receita_sincronizacoes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Logs detalhados de erros ocorridos durante consultas à API da Receita Federal';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================





