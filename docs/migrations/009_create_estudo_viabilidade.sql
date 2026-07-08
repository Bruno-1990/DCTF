-- ============================================================================
-- MIGRATION 009: Estudo de Viabilidade — ingestao de legislacao e extracao CNAE
-- ============================================================================
-- Duas tabelas:
--   estudo_viabilidade_documentos: cada documento PDF/DOCX ingerido (com MD)
--   estudo_viabilidade_cnaes:      pares {cnae -> descricao/trecho} extraidos
-- ON DELETE CASCADE garante limpeza completa ao excluir um documento.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `estudo_viabilidade_documentos` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `nome_original` VARCHAR(500) NOT NULL,
  `mime_type`     VARCHAR(100) NOT NULL,
  `tamanho_bytes` BIGINT NOT NULL,
  `markdown`      LONGTEXT NULL,
  `status`        ENUM('processando','concluido','erro') NOT NULL DEFAULT 'processando',
  `erro_mensagem` TEXT NULL,
  `total_cnaes`   INT NOT NULL DEFAULT 0,
  `criado_em`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processado_em` DATETIME NULL
);

CREATE TABLE IF NOT EXISTS `estudo_viabilidade_cnaes` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `documento_id`     INT NOT NULL,
  `cnae_original`    VARCHAR(20) NOT NULL,
  `cnae_normalizado` VARCHAR(7)  NOT NULL,
  `descricao`        TEXT NULL,
  `trecho`           TEXT NULL,
  CONSTRAINT `fk_estudo_viab_doc`
    FOREIGN KEY (`documento_id`)
    REFERENCES `estudo_viabilidade_documentos`(`id`)
    ON DELETE CASCADE,
  INDEX `idx_estudo_viab_cnae_norm` (`cnae_normalizado`),
  INDEX `idx_estudo_viab_doc`       (`documento_id`)
);
