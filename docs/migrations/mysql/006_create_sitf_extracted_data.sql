-- ============================================================================
-- MIGRAÇÃO 006: CRIAR TABELA SITF_EXTRACTED_DATA (MySQL)
-- ============================================================================
-- Armazena dados estruturados extraídos do PDF do SITF
-- Relacionada com sitf_downloads através de sitf_download_id
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA: sitf_extracted_data
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitf_extracted_data (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  sitf_download_id CHAR(36) NOT NULL COMMENT 'FK para sitf_downloads.id',
  cnpj VARCHAR(14) NOT NULL COMMENT 'CNPJ do contribuinte (para busca rápida)',
  
  -- Dados do Relatório
  fonte VARCHAR(255) COMMENT 'Fonte do relatório',
  emissao_relatorio DATETIME COMMENT 'Data/hora de emissão do relatório',
  
  -- Dados do Solicitante
  solicitante_cnpj VARCHAR(14) COMMENT 'CNPJ do solicitante',
  
  -- Dados da Empresa (campos principais)
  empresa_razao_social VARCHAR(255) COMMENT 'Razão social da empresa',
  empresa_cnpj_raiz VARCHAR(8) COMMENT 'CNPJ raiz (8 dígitos)',
  empresa_cnpj VARCHAR(18) COMMENT 'CNPJ completo formatado',
  empresa_data_abertura DATE COMMENT 'Data de abertura da empresa',
  empresa_porte VARCHAR(100) COMMENT 'Porte da empresa',
  empresa_situacao_cadastral VARCHAR(50) COMMENT 'Situação cadastral',
  
  -- Natureza Jurídica (JSON)
  empresa_natureza_juridica JSON COMMENT 'Código e descrição da natureza jurídica',
  
  -- CNAE Principal (JSON)
  empresa_cnae_principal JSON COMMENT 'Código e descrição do CNAE principal',
  
  -- Endereço (campos principais)
  endereco_logradouro VARCHAR(255) COMMENT 'Logradouro',
  endereco_numero VARCHAR(20) COMMENT 'Número',
  endereco_complemento VARCHAR(100) COMMENT 'Complemento',
  endereco_bairro VARCHAR(100) COMMENT 'Bairro',
  endereco_cep VARCHAR(9) COMMENT 'CEP',
  endereco_municipio VARCHAR(100) COMMENT 'Município',
  endereco_uf VARCHAR(2) COMMENT 'UF',
  
  -- Domicílio Fiscal
  domicilio_fiscal_unidade VARCHAR(100) COMMENT 'Unidade do domicílio fiscal',
  domicilio_fiscal_codigo VARCHAR(20) COMMENT 'Código do domicílio fiscal',
  
  -- Responsável
  responsavel_cpf VARCHAR(14) COMMENT 'CPF do responsável',
  responsavel_nome VARCHAR(255) COMMENT 'Nome do responsável',
  
  -- Sócios (JSON Array - pode ter múltiplos)
  socios JSON COMMENT 'Array de sócios com CPF, nome, qualificação, etc.',
  
  -- Simples Nacional
  simples_nacional_data_inclusao DATE COMMENT 'Data de inclusão no Simples Nacional',
  simples_nacional_data_exclusao DATE COMMENT 'Data de exclusão do Simples Nacional',
  
  -- Certidão Conjunta RFB/PGFN
  certidao_tipo VARCHAR(100) COMMENT 'Tipo de certidão',
  certidao_numero VARCHAR(50) COMMENT 'Número da certidão',
  certidao_data_emissao DATE COMMENT 'Data de emissão da certidão',
  certidao_data_validade DATE COMMENT 'Data de validade da certidão',
  certidao_pendencias_detectadas BOOLEAN DEFAULT FALSE COMMENT 'Se há pendências detectadas',
  certidao_observacao TEXT COMMENT 'Observações da certidão',
  
  -- Dados completos em JSON (backup/auditoria)
  dados_completos JSON COMMENT 'JSON completo com todos os dados para referência',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de atualização',
  
  -- Índices
  INDEX idx_sitf_extracted_data_download_id (sitf_download_id),
  INDEX idx_sitf_extracted_data_cnpj (cnpj),
  INDEX idx_sitf_extracted_data_emissao (emissao_relatorio),
  INDEX idx_sitf_extracted_data_certidao_numero (certidao_numero),
  INDEX idx_sitf_extracted_data_certidao_validade (certidao_data_validade),
  
  -- Foreign Key
  CONSTRAINT fk_sitf_extracted_data_download 
    FOREIGN KEY (sitf_download_id) 
    REFERENCES sitf_downloads(id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Dados estruturados extraídos do PDF do SITF';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================




