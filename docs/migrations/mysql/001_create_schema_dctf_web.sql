-- ============================================================================
-- MIGRAÇÃO 001: CRIAR SCHEMA MYSQL - DCTF_WEB
-- ============================================================================
-- Este script cria todas as tabelas necessárias no banco DCTF_WEB
-- Baseado no schema do Supabase, adaptado para MySQL
-- Execute este script diretamente na conexão MySQL do Cursor
-- Database: DCTF_WEB
-- ============================================================================

USE DCTF_WEB;

-- ============================================================================
-- TABELA: clientes
-- ============================================================================
CREATE TABLE IF NOT EXISTS clientes (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID do Supabase',
    razao_social VARCHAR(255) NOT NULL,
    cnpj_limpo VARCHAR(14) UNIQUE NOT NULL COMMENT 'CNPJ sem formatação (14 dígitos)',
    email VARCHAR(255),
    telefone VARCHAR(20),
    endereco TEXT,
    cod_emp INT COMMENT 'Código da empresa do sistema Export (host_dados)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_clientes_cnpj_limpo (cnpj_limpo),
    INDEX idx_clientes_razao_social (razao_social),
    INDEX idx_clientes_cod_emp (cod_emp),
    INDEX idx_clientes_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de clientes consolidada (Supabase + Export)';

-- ============================================================================
-- TABELA: dctf_declaracoes
-- ============================================================================
CREATE TABLE IF NOT EXISTS dctf_declaracoes (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID do Supabase',
    cliente_id CHAR(36) NOT NULL,
    cnpj VARCHAR(14) COMMENT 'CNPJ da declaração',
    periodo_apuracao VARCHAR(7) COMMENT 'Período de apuração (MM/YYYY)',
    data_transmissao TIMESTAMP NULL COMMENT 'Data/hora de transmissão',
    hora_transmissao VARCHAR(8) COMMENT 'Hora da transmissão (HH:MM:SS)',
    situacao VARCHAR(50) COMMENT 'Situação da declaração',
    tipo_ni VARCHAR(10) COMMENT 'Tipo de identificação (CNPJ, CPF)',
    categoria VARCHAR(100) COMMENT 'Categoria da declaração',
    origem VARCHAR(50) COMMENT 'Origem (MIT, eSocial, etc)',
    tipo VARCHAR(50) COMMENT 'Tipo da declaração',
    debito_apurado DECIMAL(15,2) COMMENT 'Débito apurado',
    saldo_a_pagar DECIMAL(15,2) COMMENT 'Saldo a pagar',
    metadados TEXT COMMENT 'Metadados da declaração (JSON)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    INDEX idx_dctf_cliente_id (cliente_id),
    INDEX idx_dctf_cnpj (cnpj),
    INDEX idx_dctf_periodo_apuracao (periodo_apuracao),
    INDEX idx_dctf_situacao (situacao),
    INDEX idx_dctf_data_transmissao (data_transmissao),
    INDEX idx_dctf_tipo (tipo),
    INDEX idx_dctf_categoria (categoria),
    INDEX idx_dctf_origem (origem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Metadados das declarações DCTF (do Supabase)';

-- ============================================================================
-- TABELA: dctf_dados
-- ============================================================================
CREATE TABLE IF NOT EXISTS dctf_dados (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID do Supabase',
    declaracao_id CHAR(36) NOT NULL,
    linha INT NOT NULL,
    codigo VARCHAR(10),
    descricao TEXT,
    valor DECIMAL(15,2),
    data_ocorrencia DATE,
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declaracao_id) REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    INDEX idx_dctf_dados_declaracao_id (declaracao_id),
    INDEX idx_dctf_dados_codigo (codigo),
    INDEX idx_dctf_dados_linha (linha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Dados processados das declarações DCTF (do Supabase)';

-- ============================================================================
-- TABELA: analises
-- ============================================================================
CREATE TABLE IF NOT EXISTS analises (
    id CHAR(36) PRIMARY KEY,
    declaracao_id CHAR(36) NOT NULL,
    tipo_analise VARCHAR(50) NOT NULL,
    severidade VARCHAR(20) NOT NULL,
    descricao TEXT NOT NULL,
    recomendacoes JSON,
    status VARCHAR(20) DEFAULT 'pendente',
    dados_analise JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (declaracao_id) REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    INDEX idx_analises_declaracao_id (declaracao_id),
    INDEX idx_analises_tipo (tipo_analise),
    INDEX idx_analises_severidade (severidade),
    INDEX idx_analises_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Resultados das análises realizadas';

-- ============================================================================
-- TABELA: flags
-- ============================================================================
CREATE TABLE IF NOT EXISTS flags (
    id CHAR(36) PRIMARY KEY,
    declaracao_id CHAR(36) NOT NULL,
    linha_dctf INT,
    codigo_flag VARCHAR(20) NOT NULL,
    descricao TEXT NOT NULL,
    severidade VARCHAR(20) NOT NULL,
    resolvido BOOLEAN DEFAULT FALSE,
    resolucao TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (declaracao_id) REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    INDEX idx_flags_declaracao_id (declaracao_id),
    INDEX idx_flags_codigo (codigo_flag),
    INDEX idx_flags_severidade (severidade),
    INDEX idx_flags_resolvido (resolvido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sinalizações de problemas encontrados';

-- ============================================================================
-- TABELA: relatorios
-- ============================================================================
CREATE TABLE IF NOT EXISTS relatorios (
    id CHAR(36) PRIMARY KEY,
    declaracao_id CHAR(36) NOT NULL,
    tipo_relatorio VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT,
    arquivo_pdf VARCHAR(500),
    parametros JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declaracao_id) REFERENCES dctf_declaracoes(id) ON DELETE CASCADE,
    INDEX idx_relatorios_declaracao_id (declaracao_id),
    INDEX idx_relatorios_tipo (tipo_relatorio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Relatórios gerados pelo sistema';

-- ============================================================================
-- TABELA: upload_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS upload_history (
    id CHAR(36) PRIMARY KEY,
    cliente_id CHAR(36) NOT NULL,
    cliente_nome TEXT,
    periodo TEXT NOT NULL,
    filename TEXT NOT NULL,
    total_linhas INT NOT NULL DEFAULT 0,
    processadas INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    mensagem TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    INDEX idx_upload_history_cliente_id (cliente_id),
    INDEX idx_upload_history_periodo (periodo),
    INDEX idx_upload_history_timestamp (timestamp DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Histórico de uploads de planilhas';

-- ============================================================================
-- TABELA: dctf_codes
-- ============================================================================
CREATE TABLE IF NOT EXISTS dctf_codes (
    id CHAR(36) PRIMARY KEY,
    codigo VARCHAR(10) UNIQUE NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    periodo_inicio VARCHAR(7),
    periodo_fim VARCHAR(7),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dctf_codes_codigo (codigo),
    INDEX idx_dctf_codes_tipo (tipo),
    INDEX idx_dctf_codes_ativo (ativo),
    INDEX idx_dctf_codes_periodo (periodo_inicio, periodo_fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Códigos DCTF válidos para validação';

-- ============================================================================
-- TABELA: dctf_receita_codes
-- ============================================================================
CREATE TABLE IF NOT EXISTS dctf_receita_codes (
    id CHAR(36) PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL COMMENT 'Formato: X.X.X.XX.XX',
    descricao VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    subcategoria VARCHAR(100),
    ativo BOOLEAN DEFAULT TRUE,
    periodo_inicio VARCHAR(7),
    periodo_fim VARCHAR(7),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dctf_receita_codes_codigo (codigo),
    INDEX idx_dctf_receita_codes_categoria (categoria),
    INDEX idx_dctf_receita_codes_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Códigos de receita detalhados';

-- ============================================================================
-- TABELA: dctf_aliquotas
-- ============================================================================
CREATE TABLE IF NOT EXISTS dctf_aliquotas (
    id CHAR(36) PRIMARY KEY,
    codigo_dctf VARCHAR(10) NOT NULL,
    codigo_receita VARCHAR(20),
    aliquota DECIMAL(5,4) NOT NULL COMMENT 'Ex: 0.0150 para 1,5%',
    base_calculo VARCHAR(50) NOT NULL,
    periodo_inicio VARCHAR(7) NOT NULL,
    periodo_fim VARCHAR(7),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (codigo_dctf) REFERENCES dctf_codes(codigo),
    FOREIGN KEY (codigo_receita) REFERENCES dctf_receita_codes(codigo),
    INDEX idx_dctf_aliquotas_codigo_dctf (codigo_dctf),
    INDEX idx_dctf_aliquotas_periodo (periodo_inicio, periodo_fim),
    INDEX idx_dctf_aliquotas_codigo_receita (codigo_receita)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Alíquotas de impostos por período';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
-- Schema criado com sucesso!
-- Próximo passo: Execute o script Python para migrar os dados do Supabase
-- ============================================================================

