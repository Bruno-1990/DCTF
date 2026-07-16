-- ============================================================================
-- MIGRACAO 034: CRIAR TABELA MESTRA beneficios (tipos de beneficio fiscal)
-- ============================================================================
-- Lista mestra dos tipos de beneficio fiscal (ex.: SUBSTITUTO, FUNDAP, COMPETE).
-- Serve como catalogo/dominio de tipos, distinto da coluna string
-- clientes.beneficios_fiscais (que permanece como texto separado por virgula).
-- Convencao: nomes sempre em MAIUSCULO e unicos (uq_beneficios_nome).
-- Pode ser executada mais de uma vez (CREATE TABLE IF NOT EXISTS e idempotente).
-- ============================================================================

USE DCTF_WEB;

CREATE TABLE IF NOT EXISTS `beneficios` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(120) NOT NULL,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_beneficios_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
