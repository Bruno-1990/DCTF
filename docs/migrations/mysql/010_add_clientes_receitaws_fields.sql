-- ============================================================================
-- MIGRAÇÃO 010: CAMPOS ROBUSTOS DE CADASTRO (RECEITAWS) + TABELA DE SÓCIOS
-- ============================================================================
-- Objetivo:
-- - Expandir a tabela `clientes` para armazenar dados retornados pela ReceitaWS
-- - Criar tabela 1:N `clientes_socios` para armazenar QSA (quantidade variável)
--
-- Observações:
-- - Mantemos compatibilidade com campos existentes (email/telefone/endereco)
-- - Armazenamos também o payload bruto para auditoria/debug
-- ============================================================================

USE DCTF_WEB;

-- ============================================================================
-- TABELA: clientes (novos campos de cadastro / ReceitaWS)
-- ============================================================================

ALTER TABLE clientes
  -- Identificação/cadastro
  ADD COLUMN IF NOT EXISTS fantasia VARCHAR(255) NULL AFTER razao_social,
  ADD COLUMN IF NOT EXISTS tipo_estabelecimento VARCHAR(30) NULL COMMENT 'MATRIZ/FILIAL' AFTER fantasia,
  ADD COLUMN IF NOT EXISTS situacao_cadastral VARCHAR(50) NULL COMMENT 'ATIVA/INATIVA/...' AFTER tipo_estabelecimento,
  ADD COLUMN IF NOT EXISTS porte VARCHAR(80) NULL AFTER situacao_cadastral,
  ADD COLUMN IF NOT EXISTS natureza_juridica VARCHAR(120) NULL AFTER porte,
  ADD COLUMN IF NOT EXISTS abertura DATE NULL AFTER natureza_juridica,
  ADD COLUMN IF NOT EXISTS data_situacao DATE NULL AFTER abertura,
  ADD COLUMN IF NOT EXISTS motivo_situacao VARCHAR(255) NULL AFTER data_situacao,
  ADD COLUMN IF NOT EXISTS situacao_especial VARCHAR(255) NULL AFTER motivo_situacao,
  ADD COLUMN IF NOT EXISTS data_situacao_especial DATE NULL AFTER situacao_especial,
  ADD COLUMN IF NOT EXISTS efr VARCHAR(255) NULL AFTER data_situacao_especial,

  -- Atividade principal (desnormalizado para consultas rápidas)
  ADD COLUMN IF NOT EXISTS atividade_principal_code VARCHAR(20) NULL AFTER efr,
  ADD COLUMN IF NOT EXISTS atividade_principal_text VARCHAR(255) NULL AFTER atividade_principal_code,

  -- Atividades secundárias (JSON)
  ADD COLUMN IF NOT EXISTS atividades_secundarias JSON NULL AFTER atividade_principal_text,

  -- Endereço (campos separados + compat com `endereco`)
  ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255) NULL AFTER atividades_secundarias,
  ADD COLUMN IF NOT EXISTS numero VARCHAR(30) NULL AFTER logradouro,
  ADD COLUMN IF NOT EXISTS complemento VARCHAR(255) NULL AFTER numero,
  ADD COLUMN IF NOT EXISTS bairro VARCHAR(120) NULL AFTER complemento,
  ADD COLUMN IF NOT EXISTS municipio VARCHAR(120) NULL AFTER bairro,
  ADD COLUMN IF NOT EXISTS uf VARCHAR(2) NULL AFTER municipio,
  ADD COLUMN IF NOT EXISTS cep VARCHAR(20) NULL AFTER uf,

  -- Contato retornado pela ReceitaWS (não confundir com contato “manual”)
  ADD COLUMN IF NOT EXISTS receita_email VARCHAR(255) NULL AFTER cep,
  ADD COLUMN IF NOT EXISTS receita_telefone VARCHAR(255) NULL AFTER receita_email,

  -- Financeiro / regimes
  ADD COLUMN IF NOT EXISTS capital_social DECIMAL(15,2) NULL AFTER receita_telefone,
  ADD COLUMN IF NOT EXISTS simples_optante BOOLEAN NULL AFTER capital_social,
  ADD COLUMN IF NOT EXISTS simples_data_opcao DATE NULL AFTER simples_optante,
  ADD COLUMN IF NOT EXISTS simples_data_exclusao DATE NULL AFTER simples_data_opcao,
  ADD COLUMN IF NOT EXISTS simei_optante BOOLEAN NULL AFTER simples_data_exclusao,
  ADD COLUMN IF NOT EXISTS simei_data_opcao DATE NULL AFTER simei_optante,
  ADD COLUMN IF NOT EXISTS simei_data_exclusao DATE NULL AFTER simei_data_opcao,

  -- Metadados de sincronização ReceitaWS
  ADD COLUMN IF NOT EXISTS receita_ws_status VARCHAR(20) NULL AFTER simei_data_exclusao,
  ADD COLUMN IF NOT EXISTS receita_ws_message TEXT NULL AFTER receita_ws_status,
  ADD COLUMN IF NOT EXISTS receita_ws_consulta_em TIMESTAMP NULL AFTER receita_ws_message,
  ADD COLUMN IF NOT EXISTS receita_ws_ultima_atualizacao TIMESTAMP NULL AFTER receita_ws_consulta_em,
  ADD COLUMN IF NOT EXISTS receita_ws_payload JSON NULL AFTER receita_ws_ultima_atualizacao;

CREATE INDEX IF NOT EXISTS idx_clientes_uf ON clientes(uf);
CREATE INDEX IF NOT EXISTS idx_clientes_municipio ON clientes(municipio);
CREATE INDEX IF NOT EXISTS idx_clientes_situacao_cadastral ON clientes(situacao_cadastral);

-- ============================================================================
-- TABELA: clientes_socios (QSA)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clientes_socios (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  cliente_id CHAR(36) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  qual VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_clientes_socios_cliente_id (cliente_id),
  INDEX idx_clientes_socios_nome (nome),
  CONSTRAINT fk_clientes_socios_cliente_id FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sócios (QSA) dos clientes (quantidade variável) - origem ReceitaWS';

-- ============================================================================
-- FIM
-- ============================================================================


