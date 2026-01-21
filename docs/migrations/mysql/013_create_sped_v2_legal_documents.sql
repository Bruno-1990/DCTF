-- ============================================================================
-- MIGRAÇÃO 013: CRIAR TABELAS PARA SISTEMA DE CONHECIMENTO DE DOCUMENTOS LEGAIS (SPED v2.0)
-- ============================================================================
-- Sistema híbrido (RAG + Banco de Dados) para armazenar e consultar documentos legais
-- que servem como base para geração de regras de validação SPED
-- ============================================================================
-- Tabelas criadas:
--   1. sped_v2_legal_documents - Documentos legais com versionamento por vigência
--   2. sped_v2_document_chunks - Chunks de texto extraídos para RAG
--   3. sped_v2_legal_rules - Regras estruturadas extraídas dos documentos
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA 1: sped_v2_legal_documents
-- ============================================================================
-- Armazena metadados dos documentos legais (PDFs, DOCX) com versionamento
-- por período de vigência (mês/ano)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sped_v2_legal_documents (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID do documento',
  
  -- Identificação do documento
  documento_tipo VARCHAR(50) NOT NULL COMMENT 'Tipo: GUIA_PRATICO, ATO_COTEPE, CONVENIO, PORTARIA, NOTA_TECNICA, etc.',
  documento_nome VARCHAR(255) NOT NULL COMMENT 'Nome do documento (ex: "Guia Prático EFD ICMS/IPI")',
  versao VARCHAR(20) COMMENT 'Versão do documento (ex: "3.2.1", "79/25")',
  
  -- Versionamento por vigência
  vigencia_inicio DATE NOT NULL COMMENT 'Data de início da vigência',
  vigencia_fim DATE NULL COMMENT 'Data de fim da vigência (NULL = ainda vigente)',
  
  -- Arquivo e hash
  arquivo_path VARCHAR(500) NOT NULL COMMENT 'Caminho relativo do arquivo original (PDF/DOCX)',
  hash_arquivo VARCHAR(64) NOT NULL COMMENT 'SHA-256 do arquivo para detectar mudanças',
  
  -- Metadados estruturados (JSON)
  metadata JSON COMMENT 'Metadados adicionais: {autor, data_publicacao, sefaz, orgão, etc.}',
  
  -- Status e controle
  status VARCHAR(20) DEFAULT 'ativo' COMMENT 'Status: ativo, inativo, substituido',
  documento_substituido_id CHAR(36) NULL COMMENT 'ID do documento que substituiu este (se aplicável)',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação/ingestão',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de última atualização',
  
  -- Índices para busca rápida
  INDEX idx_doc_tipo (documento_tipo),
  INDEX idx_doc_vigencia (vigencia_inicio, vigencia_fim),
  INDEX idx_doc_hash (hash_arquivo),
  INDEX idx_doc_status (status),
  INDEX idx_doc_nome (documento_nome),
  
  -- Foreign key para documento que substituiu
  CONSTRAINT fk_doc_substituido 
    FOREIGN KEY (documento_substituido_id) 
    REFERENCES sped_v2_legal_documents(id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Documentos legais (PDFs/DOCX) com versionamento por vigência';

-- ============================================================================
-- TABELA 2: sped_v2_document_chunks
-- ============================================================================
-- Armazena chunks de texto extraídos dos documentos para RAG
-- Cada chunk preserva contexto (seção, artigo, página) e pode ter embedding
-- ============================================================================
CREATE TABLE IF NOT EXISTS sped_v2_document_chunks (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID do chunk',
  document_id CHAR(36) NOT NULL COMMENT 'FK para sped_v2_legal_documents.id',
  
  -- Ordenação e estrutura
  chunk_index INT NOT NULL COMMENT 'Índice sequencial do chunk no documento',
  page_number INT COMMENT 'Número da página (se aplicável)',
  
  -- Conteúdo do chunk
  chunk_text TEXT NOT NULL COMMENT 'Texto do chunk',
  
  -- Metadados de contexto
  section_title VARCHAR(255) COMMENT 'Título da seção (ex: "Seção 5.2.3")',
  article_number VARCHAR(50) COMMENT 'Número do artigo/parágrafo (ex: "Art. 12, § 3º")',
  context VARCHAR(255) COMMENT 'Contexto adicional do chunk',
  
  -- Embedding (opcional - pode ser armazenado em vector store externo)
  embedding_vector JSON COMMENT 'Vetor de embedding (se armazenado no banco)',
  embedding_model VARCHAR(100) COMMENT 'Modelo usado para gerar embedding',
  
  -- Metadados adicionais (JSON)
  metadata JSON COMMENT 'Metadados adicionais: {tags, referencias_cruzadas, prioridade, etc.}',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de atualização',
  
  -- Índices
  INDEX idx_chunk_document (document_id),
  INDEX idx_chunk_index (document_id, chunk_index),
  INDEX idx_chunk_section (section_title),
  INDEX idx_chunk_article (article_number),
  INDEX idx_chunk_page (page_number),
  
  -- Foreign key
  CONSTRAINT fk_chunk_document 
    FOREIGN KEY (document_id) 
    REFERENCES sped_v2_legal_documents(id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  
  -- Unique constraint: um documento não pode ter dois chunks com mesmo índice
  UNIQUE KEY uk_chunk_document_index (document_id, chunk_index)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Chunks de texto extraídos dos documentos para RAG';

-- ============================================================================
-- TABELA 3: sped_v2_legal_rules
-- ============================================================================
-- Armazena regras estruturadas extraídas dos documentos legais
-- Cada regra tem tipo, categoria, condições e referências legais
-- ============================================================================
CREATE TABLE IF NOT EXISTS sped_v2_legal_rules (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID da regra',
  document_id CHAR(36) NOT NULL COMMENT 'FK para sped_v2_legal_documents.id',
  
  -- Classificação da regra
  rule_type VARCHAR(50) NOT NULL COMMENT 'Tipo: VALIDACAO, OBRIGATORIEDADE, TOLERANCIA, EXCECAO',
  rule_category VARCHAR(50) COMMENT 'Categoria SPED: C100, C170, C190, E110, E111, etc.',
  
  -- Descrição e condição
  rule_description TEXT NOT NULL COMMENT 'Descrição da regra em linguagem natural',
  rule_condition TEXT COMMENT 'Condição da regra (SQL-like ou expressão lógica)',
  
  -- Referências legais
  legal_reference VARCHAR(255) COMMENT 'Referência legal (ex: "Guia Prático 3.2.1, Seção 5.2.3")',
  article_reference VARCHAR(100) COMMENT 'Referência a artigo (ex: "Art. 12, § 3º")',
  section_reference VARCHAR(100) COMMENT 'Referência a seção/capítulo',
  
  -- Versionamento
  vigencia_inicio DATE NOT NULL COMMENT 'Data de início da vigência da regra',
  vigencia_fim DATE NULL COMMENT 'Data de fim da vigência (NULL = ainda vigente)',
  
  -- Chunk de origem (opcional - para rastreabilidade)
  chunk_id CHAR(36) NULL COMMENT 'FK para sped_v2_document_chunks.id (chunk de onde a regra foi extraída)',
  
  -- Metadados adicionais (JSON)
  metadata JSON COMMENT 'Metadados: {severidade, impacto, aplicabilidade, etc.}',
  
  -- Status
  status VARCHAR(20) DEFAULT 'ativo' COMMENT 'Status: ativo, inativo, substituido',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de atualização',
  
  -- Índices para busca rápida
  INDEX idx_rule_type (rule_type),
  INDEX idx_rule_category (rule_category),
  INDEX idx_rule_vigencia (vigencia_inicio, vigencia_fim),
  INDEX idx_rule_document (document_id),
  INDEX idx_rule_status (status),
  INDEX idx_rule_category_type (rule_category, rule_type),
  
  -- Foreign keys
  CONSTRAINT fk_rule_document 
    FOREIGN KEY (document_id) 
    REFERENCES sped_v2_legal_documents(id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    
  CONSTRAINT fk_rule_chunk 
    FOREIGN KEY (chunk_id) 
    REFERENCES sped_v2_document_chunks(id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Regras estruturadas extraídas dos documentos legais';

-- ============================================================================
-- VIEWS ÚTEIS PARA CONSULTA
-- ============================================================================

-- View: Documentos vigentes em um período específico
CREATE OR REPLACE VIEW vw_sped_v2_documents_vigentes AS
SELECT 
  d.*,
  CASE 
    WHEN vigencia_fim IS NULL THEN 'vigente'
    WHEN vigencia_fim >= CURDATE() THEN 'vigente'
    ELSE 'expirado'
  END AS status_vigencia
FROM sped_v2_legal_documents d
WHERE d.status = 'ativo'
  AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE());

-- View: Regras vigentes por categoria
CREATE OR REPLACE VIEW vw_sped_v2_rules_vigentes AS
SELECT 
  r.*,
  d.documento_tipo,
  d.documento_nome,
  d.versao
FROM sped_v2_legal_rules r
INNER JOIN sped_v2_legal_documents d ON r.document_id = d.id
WHERE r.status = 'ativo'
  AND d.status = 'ativo'
  AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= CURDATE())
  AND (d.vigencia_fim IS NULL OR d.vigencia_fim >= CURDATE());

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
-- Para executar esta migration:
-- 1. Conecte-se ao MySQL
-- 2. Execute: source docs/migrations/mysql/013_create_sped_v2_legal_documents.sql
-- ============================================================================








