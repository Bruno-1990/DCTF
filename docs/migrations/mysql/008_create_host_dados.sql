-- ============================================================================
-- MIGRAÇÃO 008: CRIAR TABELA HOST_DADOS
-- ============================================================================
-- Tabela para armazenar dados exportados do sistema SCI (Firebird)
-- Dados: FPG (Funcionários), CTB (Contabilidade), FISE (Fiscal Entrada), FISS (Fiscal Saída)
-- ============================================================================

USE dctf_web;

-- ============================================================================
-- TABELA: host_dados
-- ============================================================================
CREATE TABLE IF NOT EXISTS host_dados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cod_emp INT NOT NULL COMMENT 'Código da empresa no sistema SCI',
    razao VARCHAR(255) NOT NULL COMMENT 'Razão social da empresa',
    cnpj VARCHAR(18) NOT NULL COMMENT 'CNPJ da empresa (com ou sem formatação)',
    ano INT NOT NULL COMMENT 'Ano da movimentação',
    mes INT NOT NULL COMMENT 'Mês da movimentação (1-12)',
    movimentacao INT NOT NULL DEFAULT 0 COMMENT 'Quantidade de movimentações',
    tipo VARCHAR(10) NOT NULL COMMENT 'Tipo: FPG, CTB, NFe, NFT, NFEE, NFST',
    relatorio VARCHAR(10) NOT NULL COMMENT 'Relatório: FPG, CTB, FISE, FISS',
    especie VARCHAR(50) NULL COMMENT 'Espécie da nota fiscal (apenas para FISE e FISS)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação do registro',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de atualização',
    
    -- Índices para melhor performance
    INDEX idx_host_dados_cod_emp (cod_emp),
    INDEX idx_host_dados_cnpj (cnpj),
    INDEX idx_host_dados_tipo (tipo),
    INDEX idx_host_dados_relatorio (relatorio),
    INDEX idx_host_dados_ano_mes (ano, mes),
    INDEX idx_host_dados_cnpj_ano_mes (cnpj, ano, mes),
    
    -- Índice único para evitar duplicatas
    UNIQUE KEY uk_host_dados_unique (cod_emp, cnpj, ano, mes, tipo, relatorio, especie)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Dados exportados do sistema SCI (Firebird) para integração';



