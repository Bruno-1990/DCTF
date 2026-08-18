-- ============================================================================
-- MIGRACAO 039: MOTIVOS DA REVISAO JURIDICA NA COTA DE APRENDIZAGEM
-- ============================================================================
-- A coluna `revisar_juridico` diz QUE precisa conferir, mas nao O QUE conferir.
-- Sem o motivo, o analista abre um cliente marcado e nao sabe se e por socio
-- pessoa juridica, socio no exterior, inicio de atividade ou divergencia entre
-- os dois meses de excesso — e acaba reconferindo tudo.
--
-- Guardado como texto separado por virgula (codigos estaveis, ex.:
-- "SOCIO_PJ,SOCIO_EXTERIOR") em vez de uma coluna por motivo: a lista de
-- hipoteses do art. 3o §4o da LC 123 tem onze incisos e vai crescer conforme
-- forem sendo cobertas.
--
-- Pode ser executada mais de uma vez (idempotente).
-- ============================================================================

USE DCTF_WEB;

SET @db := DATABASE();
SET @ex := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = @db
              AND TABLE_NAME = 'cota_classificacao_mensal'
              AND COLUMN_NAME = 'revisar_motivos');
SET @sql := IF(@ex = 0,
  'ALTER TABLE cota_classificacao_mensal
     ADD COLUMN revisar_motivos VARCHAR(255) NULL
     COMMENT ''Codigos do porque da revisao, separados por virgula: SOCIO_PJ | SOCIO_EXTERIOR | SOCIO_OAB | INICIO_ATIVIDADE | MES_EXCESSO_DIVERGENTE''
     AFTER revisar_juridico',
  'SELECT ''revisar_motivos ja existe'' AS info');
-- Um por linha: o runner separa os statements por ";" seguido de quebra de
-- linha, e os tres na mesma linha virariam um comando so.
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
