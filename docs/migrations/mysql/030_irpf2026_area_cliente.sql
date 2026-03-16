-- ============================================================================
-- MIGRAÇÃO 030: ÁREA DO CLIENTE IRPF 2026
-- ============================================================================
-- Tabelas: irpf2026_usuarios, irpf2026_documentos, irpf2026_admin, irpf2026_mensagens
-- Execute no banco dctf_web (ou DCTF_WEB). Pode ser executado mais de uma vez
-- (CREATE TABLE IF NOT EXISTS / ADD COLUMN com verificação).
-- ============================================================================

USE dctf_web;

-- 1. Usuários da área do cliente (declarantes)
CREATE TABLE IF NOT EXISTS irpf2026_usuarios (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  nome_exibicao VARCHAR(255) DEFAULT NULL,
  status_declaracao VARCHAR(60) DEFAULT 'pendente' COMMENT 'pendente, aguardando_docs, em_analise, documentacao_incompleta, concluida',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_irpf2026_usuarios_email (email),
  INDEX idx_irpf2026_usuarios_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Usuários da área do cliente IRPF 2026';

-- 2. Administradores (e-mails com permissão para visão geral)
CREATE TABLE IF NOT EXISTS irpf2026_admin (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  nome_exibicao VARCHAR(255) DEFAULT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_irpf2026_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Administradores / e-mails com permissão para visão geral IRPF 2026';

-- 3. Documentos enviados pelos usuários
CREATE TABLE IF NOT EXISTS irpf2026_documentos (
  id VARCHAR(36) PRIMARY KEY,
  usuario_id VARCHAR(36) NOT NULL,
  nome_original VARCHAR(500) NOT NULL,
  nome_arquivo VARCHAR(500) NOT NULL,
  categoria VARCHAR(80) NOT NULL COMMENT 'Código do checklist (ex: rendimentos_salario, despesas_medicas)',
  tamanho_bytes INT UNSIGNED DEFAULT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  caminho_arquivo VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_irpf2026_documentos_usuario (usuario_id),
  INDEX idx_irpf2026_documentos_categoria (categoria),
  INDEX idx_irpf2026_documentos_created (created_at),
  CONSTRAINT fk_irpf2026_doc_usuario FOREIGN KEY (usuario_id) REFERENCES irpf2026_usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Documentos enviados na área do cliente IRPF 2026';

-- 4. Notificações / mensagens (admin -> cliente)
CREATE TABLE IF NOT EXISTS irpf2026_mensagens (
  id VARCHAR(36) PRIMARY KEY,
  usuario_id VARCHAR(36) NOT NULL,
  admin_id VARCHAR(36) DEFAULT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'mensagem' COMMENT 'notificacao, mensagem',
  titulo VARCHAR(500) NOT NULL,
  texto TEXT NOT NULL,
  lida TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_irpf2026_mensagens_usuario (usuario_id),
  INDEX idx_irpf2026_mensagens_created (created_at),
  CONSTRAINT fk_irpf2026_msg_usuario FOREIGN KEY (usuario_id) REFERENCES irpf2026_usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_irpf2026_msg_admin FOREIGN KEY (admin_id) REFERENCES irpf2026_admin(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Mensagens e notificações do escritório para o cliente IRPF 2026';

-- ============================================================================
-- FIM
-- ============================================================================
