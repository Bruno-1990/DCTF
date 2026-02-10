-- ============================================================================
-- MIGRAÇÃO 017: CRIAR TABELA teste_png (teste de importação PNG)
-- ============================================================================
-- Objetivo: Tabela para testar a importação de declarações DCTF a partir de
-- imagens PNG (OCR), com a mesma estrutura de colunas usada em dctf_declaracoes.
-- Sem FK nem índices de unicidade, para facilitar testes.
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA: teste_png
-- ============================================================================
CREATE TABLE IF NOT EXISTS teste_png (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID do registro',
    cliente_id CHAR(36) NULL COMMENT 'ID do cliente (opcional)',
    cnpj VARCHAR(14) NULL COMMENT 'CNPJ/CPF da declaração (apenas dígitos)',
    periodo_apuracao VARCHAR(20) NULL COMMENT 'Período de apuração (ex: MM/YYYY)',
    data_transmissao TEXT NULL COMMENT 'Data/hora de transmissão (texto)',
    situacao VARCHAR(255) NULL COMMENT 'Situação da declaração',
    tipo_ni VARCHAR(20) NULL COMMENT 'Tipo de identificação (CNPJ, CPF)',
    categoria VARCHAR(100) NULL COMMENT 'Categoria da declaração',
    origem VARCHAR(100) NULL COMMENT 'Origem (MIT, eSocial, etc)',
    tipo VARCHAR(100) NULL COMMENT 'Tipo da declaração',
    debito_apurado DECIMAL(15,2) NULL COMMENT 'Débito apurado',
    saldo_a_pagar DECIMAL(15,2) NULL COMMENT 'Saldo a pagar',
    created_at DATETIME NULL COMMENT 'Data de criação',
    updated_at DATETIME NULL COMMENT 'Data de atualização',
    INDEX idx_teste_png_cnpj (cnpj),
    INDEX idx_teste_png_periodo (periodo_apuracao),
    INDEX idx_teste_png_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de teste para importação DCTF a partir de imagens PNG (OCR)';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
