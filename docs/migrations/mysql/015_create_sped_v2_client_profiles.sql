-- =====================================================
-- MIGRATION: 015_create_sped_v2_client_profiles.sql
-- DESCRIÇÃO: Cria tabela para perfis fiscais de clientes
-- DATA: 2024
-- =====================================================

-- TABELA: sped_v2_client_profiles
-- Armazena configurações fiscais de clientes para validação SPED v2
CREATE TABLE IF NOT EXISTS sped_v2_client_profiles (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    cliente_id INT NOT NULL COMMENT 'FK para tabela de clientes',
    
    -- Informações básicas
    segmento VARCHAR(50) NOT NULL COMMENT 'COMERCIO, BEBIDAS, INDUSTRIA, ECOMMERCE',
    regime_tributario VARCHAR(50) NOT NULL COMMENT 'SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL',
    
    -- Flags fiscais
    opera_st BOOLEAN DEFAULT FALSE COMMENT 'Opera com Substituição Tributária?',
    regime_especial BOOLEAN DEFAULT FALSE COMMENT 'Está em regime especial?',
    opera_difal BOOLEAN DEFAULT FALSE COMMENT 'Opera com DIFAL?',
    opera_fcp BOOLEAN DEFAULT FALSE COMMENT 'Opera com FCP?',
    opera_interestadual BOOLEAN DEFAULT FALSE COMMENT 'Opera interestadual?',
    
    -- CFOPs esperados (JSON array)
    cfops_esperados JSON COMMENT 'Array de CFOPs típicos do cliente',
    
    -- Packs selecionados (JSON array)
    packs_selecionados JSON COMMENT 'Array de packs ativos (COMERCIO, BEBIDAS, etc.)',
    
    -- Configurações de tolerância (JSON)
    tolerancias_customizadas JSON COMMENT 'Tolerâncias customizadas por tipo',
    
    -- Metadados
    ativo BOOLEAN DEFAULT TRUE COMMENT 'Perfil ativo?',
    observacoes TEXT COMMENT 'Observações sobre o perfil',
    
    -- Auditoria
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    criado_por INT COMMENT 'ID do usuário que criou',
    atualizado_por INT COMMENT 'ID do usuário que atualizou',
    
    -- Índices
    INDEX idx_cliente_id (cliente_id),
    INDEX idx_segmento (segmento),
    INDEX idx_regime_tributario (regime_tributario),
    INDEX idx_ativo (ativo),
    
    -- Constraints
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    
    -- Unique constraint: um cliente pode ter apenas um perfil ativo por segmento
    UNIQUE KEY uk_cliente_segmento_ativo (cliente_id, segmento, ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Perfis fiscais de clientes para validação SPED v2';

-- VIEW: vw_sped_v2_client_profiles_ativos
-- Retorna apenas perfis ativos
CREATE OR REPLACE VIEW vw_sped_v2_client_profiles_ativos AS
SELECT 
    p.*,
    c.razao_social,
    c.cnpj,
    c.fantasia
FROM sped_v2_client_profiles p
INNER JOIN clientes c ON p.cliente_id = c.id
WHERE p.ativo = TRUE;

