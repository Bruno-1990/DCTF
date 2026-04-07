-- ============================================================
-- Migration 032: Tabelas e-BEF (Beneficiários Finais)
--
-- Armazena o vínculo empresa mãe → CNPJ filho (sócio PJ)
-- e o QSA (quadro societário) da empresa filho obtido via
-- ReceitaWS, permitindo identificar os CPFs por trás de
-- cada sócio PJ.
-- ============================================================

CREATE TABLE IF NOT EXISTS ebef_consultas (
    id              CHAR(36)        NOT NULL PRIMARY KEY COMMENT 'UUID',
    cliente_id      CHAR(36)        NOT NULL             COMMENT 'FK empresa mãe (clientes.id)',
    socio_id        CHAR(36)        NULL                 COMMENT 'FK clientes_socios.id do sócio PJ que originou',
    cnpj_filho      VARCHAR(14)     NOT NULL             COMMENT 'CNPJ da empresa filho (só dígitos)',
    nome_filho      VARCHAR(255)    NULL                 COMMENT 'Razão social (ReceitaWS)',
    situacao_filho  VARCHAR(50)     NULL                 COMMENT 'Situação cadastral',
    capital_social_filho DECIMAL(15,2) NULL              COMMENT 'Capital social do filho',
    receita_ws_payload   JSON       NULL                 COMMENT 'Resposta completa ReceitaWS (auditoria)',
    status          ENUM('pendente','processando','concluido','erro') DEFAULT 'pendente',
    erro_mensagem   TEXT            NULL,
    consultado_em   TIMESTAMP       NULL                 COMMENT 'Data/hora da consulta ReceitaWS',
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_ebef_cliente_cnpj (cliente_id, cnpj_filho),
    INDEX idx_ebef_consultas_cliente   (cliente_id),
    INDEX idx_ebef_consultas_cnpj      (cnpj_filho),
    INDEX idx_ebef_consultas_status    (status),

    CONSTRAINT fk_ebef_consultas_cliente
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='e-BEF: consultas de CNPJ filho vinculadas à empresa mãe';


CREATE TABLE IF NOT EXISTS ebef_socios_filho (
    id              CHAR(36)        NOT NULL PRIMARY KEY COMMENT 'UUID',
    consulta_id     CHAR(36)        NOT NULL             COMMENT 'FK ebef_consultas.id',
    nome            VARCHAR(255)    NOT NULL             COMMENT 'Nome do sócio na empresa filho',
    qual            VARCHAR(255)    NULL                 COMMENT 'Qualificação (ex: Sócio-Administrador)',
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_ebef_socios_filho_consulta (consulta_id),

    CONSTRAINT fk_ebef_socios_filho_consulta
        FOREIGN KEY (consulta_id) REFERENCES ebef_consultas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='e-BEF: QSA (sócios) das empresas filho';
