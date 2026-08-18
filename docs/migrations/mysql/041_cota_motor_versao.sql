-- ============================================================================
-- MIGRACAO 041: VERSAO DO MOTOR NA LINHA CLASSIFICADA
-- ============================================================================
-- A competencia 202607 acumulou linhas de DUAS versoes do codigo ao mesmo
-- tempo: 11 clientes ficaram marcados com `revisar_juridico = 1` e
-- `revisar_motivos` NULL (versao anterior, que ainda nao gravava o motivo),
-- convivendo com linhas gravadas depois, ja com motivo. O e-mail somava as
-- duas e anunciava "18 a conferir com o juridico" sem que houvesse 18 casos.
--
-- Nada na linha dizia qual regra a produziu. Com `motor_versao` gravado, linha
-- de versao antiga fica visivel — e reapurar deixa de ser adivinhacao.
--
-- As linhas ja existentes ficam com NULL de proposito: NULL aqui significa
-- "apurada antes de existir o controle", que e exatamente o caso delas. Nao
-- inventamos uma versao para dado que nao sabemos como foi produzido.
--
-- Pode ser executada mais de uma vez (idempotente).
-- ============================================================================

USE DCTF_WEB;

SET @db := DATABASE();
SET @ex := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = @db
              AND TABLE_NAME = 'cota_classificacao_mensal'
              AND COLUMN_NAME = 'motor_versao');
SET @sql := IF(@ex = 0,
  'ALTER TABLE cota_classificacao_mensal
     ADD COLUMN motor_versao VARCHAR(20) NULL
     COMMENT ''Versao do motor de regras que produziu a linha; NULL = anterior ao controle''
     AFTER fonte',
  'SELECT ''motor_versao ja existe'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
