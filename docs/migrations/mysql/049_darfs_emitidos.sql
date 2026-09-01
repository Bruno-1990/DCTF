-- ============================================================================
-- MIGRACAO 049: DARFs EMITIDOS — SICALC E DCTFWEB NA MESMA TABELA
-- ============================================================================
-- A 048 criou `sicalc_darfs` supondo que a aba Trabalhista > DARF emitiria
-- apenas o DARF avulso do Sicalc. Supunha errado: a rotina trabalhista
-- (contribuicao previdenciaria e de terceiros) e declarada na DCTFWeb e se paga
-- com o DARF NUMERADO, que a propria DCTFWeb gera ja vinculado ao debito.
--
-- POR QUE UMA TABELA SO, E NAO DUAS:
--   Para quem usa, "os DARFs do cliente X" e uma coisa so. Duas tabelas
--   obrigariam toda tela e todo relatorio a unir as duas para responder a
--   pergunta mais simples que existe aqui. O que difere entre as origens sao os
--   campos de IDENTIFICACAO do debito, e esses convivem bem lado a lado:
--     sicalc  -> codigo_receita + extensao + data_pa + consolidacao
--     dctfweb -> categoria + ano_pa + mes_pa + recibo
--   O que e comum — contribuinte, PDF, numero do documento, quem emitiu — ja
--   estava modelado e nao muda.
--
-- POR QUE RENOMEAR: uma tabela chamada `sicalc_darfs` guardando DARF de DCTFWeb
--   e exatamente o tipo de nome que engana quem chegar depois.
--
-- AS COLUNAS DO SICALC VIRAM NULLABLE: `codigo_receita`, `data_pa`,
--   `valor_imposto` e `data_consolidacao` nasceram NOT NULL porque toda emissao
--   era Sicalc. Nenhuma delas existe numa guia de DCTFWeb — os valores vem da
--   declaracao, nao do formulario.
--
-- Idempotente: pode rodar de novo (checa information_schema antes de cada passo).
-- ============================================================================

USE DCTF_WEB;

-- ─── 1. Renomeia, se ainda nao foi renomeada ───────────────────────────────

SET @tem_antiga = (SELECT COUNT(*) FROM information_schema.tables
                    WHERE table_schema = DATABASE() AND table_name = 'sicalc_darfs');
SET @tem_nova   = (SELECT COUNT(*) FROM information_schema.tables
                    WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos');

SET @sql = IF(@tem_antiga = 1 AND @tem_nova = 0,
              'RENAME TABLE sicalc_darfs TO darfs_emitidos',
              'SELECT "tabela ja renomeada ou inexistente" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ─── 2. Origem da emissao ──────────────────────────────────────────────────
-- Default 'sicalc' porque as linhas que ja existem sao todas do Sicalc: quando
-- foram gravadas, era a unica coisa que a tela sabia emitir.

SET @tem = (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
               AND column_name = 'origem');
SET @sql = IF(@tem = 0,
  'ALTER TABLE darfs_emitidos
     ADD COLUMN origem ENUM(''sicalc'',''dctfweb'') NOT NULL DEFAULT ''sicalc''
       COMMENT ''sicalc = DARF avulso (o preto) | dctfweb = DARF numerado''
       AFTER id',
  'SELECT "coluna origem ja existe" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ─── 3. Campos que so a DCTFWeb usa ────────────────────────────────────────

SET @tem = (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
               AND column_name = 'categoria');
SET @sql = IF(@tem = 0,
  'ALTER TABLE darfs_emitidos
     ADD COLUMN categoria VARCHAR(30) NULL
       COMMENT ''GERAL_MENSAL, GERAL_13o_SALARIO, AFERICAO...'' AFTER descricao_receita,
     ADD COLUMN categoria_numero SMALLINT UNSIGNED NULL
       COMMENT ''40, 41, 44, 45, 46, 50, 51 — o que foi enviado a RFB'' AFTER categoria,
     ADD COLUMN ano_pa CHAR(4) NULL AFTER categoria_numero,
     ADD COLUMN mes_pa CHAR(2) NULL COMMENT ''ausente nas categorias de 13o'' AFTER ano_pa,
     ADD COLUMN dia_pa CHAR(2) NULL COMMENT ''so espetaculo desportivo'' AFTER mes_pa,
     ADD COLUMN cno_afericao VARCHAR(20) NULL COMMENT ''so afericao de obra'' AFTER dia_pa,
     ADD COLUMN num_proc_reclamatoria VARCHAR(40) NULL
       COMMENT ''so reclamatoria trabalhista'' AFTER cno_afericao,
     ADD COLUMN numero_recibo VARCHAR(40) NULL
       COMMENT ''recibo da declaracao; vazio = a RFB usou o mais recente'' AFTER num_proc_reclamatoria',
  'SELECT "colunas dctfweb ja existem" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ─── 4. Relaxa o que era obrigatorio so por causa do Sicalc ────────────────
-- Guia de DCTFWeb nao tem codigo de receita nem valor informado: os valores
-- vem da declaracao. Manter NOT NULL obrigaria a inventar um zero, e um zero
-- inventado no historico e pior do que um NULL honesto.

SET @precisa = (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
                   AND column_name = 'codigo_receita' AND is_nullable = 'NO');
SET @sql = IF(@precisa = 1,
  'ALTER TABLE darfs_emitidos
     MODIFY COLUMN codigo_receita VARCHAR(6) NULL COMMENT ''so sicalc'',
     MODIFY COLUMN data_pa VARCHAR(7) NULL COMMENT ''so sicalc — MM/AAAA ou AAAA'',
     MODIFY COLUMN valor_imposto DECIMAL(15,2) NULL COMMENT ''so sicalc — principal informado'',
     MODIFY COLUMN data_consolidacao DATE NULL COMMENT ''so sicalc''',
  'SELECT "colunas ja sao nullable" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ─── 5. Indice por origem ──────────────────────────────────────────────────
-- A tela filtra por aba (numerado x avulso), e sem isto cada troca de filtro
-- varreria a tabela inteira.

SET @tem = (SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
               AND index_name = 'idx_darfs_origem_data');
SET @sql = IF(@tem = 0,
  'ALTER TABLE darfs_emitidos ADD INDEX idx_darfs_origem_data (origem, criado_em DESC)',
  'SELECT "indice ja existe" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
