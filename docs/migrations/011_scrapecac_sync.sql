-- Migration 011: Amplia dctf_declaracoes.id (e FKs filhas) de CHAR(36) para CHAR(40)
-- Motivo: nova fonte scrapecac usa SHA-1 (40 chars) como PK; manter rastreabilidade 1:1.
-- Executar via: node scripts/run_migration_011.js (recomendado — desabilita FK_CHECKS).

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE dctf_declaracoes      MODIFY id              CHAR(40) NOT NULL;
ALTER TABLE dctf_dados            MODIFY declaracao_id   CHAR(40) NOT NULL;
ALTER TABLE analises              MODIFY declaracao_id   CHAR(40) NOT NULL;
ALTER TABLE flags                 MODIFY declaracao_id   CHAR(40) NOT NULL;
ALTER TABLE relatorios            MODIFY declaracao_id   CHAR(40) NOT NULL;
ALTER TABLE receita_pagamentos    MODIFY dctf_id         CHAR(40) NULL;

SET FOREIGN_KEY_CHECKS = 1;
