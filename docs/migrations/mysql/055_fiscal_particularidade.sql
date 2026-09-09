-- ============================================================================
-- MIGRACAO 055: `observacao` VIRA `particularidade`
-- ============================================================================
-- O campo de texto livre da ficha fiscal nasceu como "observacao", herdando o
-- cabecalho da planilha. O nome era fraco: "observacao" e onde todo mundo
-- escreve qualquer coisa, e o que se quer ali e o que aquela empresa tem de
-- diferente das outras — o detalhe que muda como ela e tratada.
--
-- ATENCAO A UM HOMONIMO QUE NAO MUDA:
--   A planilha de origem tem uma ABA chamada OBSERVACAO — as 8 excecoes que
--   ficaram fora da distribuicao (somente DP, somente legalizacao, nao
--   localizadas). Aquilo e o nome real de uma aba num arquivo que existe, e o
--   import continua procurando por ele. Sao coisas diferentes com o mesmo
--   nome, e so esta coluna e renomeada.
--
-- IDEMPOTENTE, e por isso o PREPARE:
--   O runner roda 053, 054 e 055 em toda execucao. Um `CHANGE COLUMN
--   observacao ...` seco quebraria na segunda vez, quando a coluna antiga ja
--   nao existe. O IF sobre information_schema deixa a migracao repetivel.
--
-- Os dados vao junto: CHANGE COLUMN renomeia preservando o conteudo. As
-- particularidades importadas da aba OBSERVACAO continuam onde estavam.
-- ============================================================================

USE DCTF_WEB;

SET @tem_coluna_antiga := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'fiscal_ficha'
     AND COLUMN_NAME = 'observacao'
);

SET @sql := IF(
  @tem_coluna_antiga > 0,
  'ALTER TABLE fiscal_ficha CHANGE COLUMN observacao particularidade VARCHAR(500) NULL COMMENT ''texto livre, unico campo sem lista fechada''',
  'SELECT 1'
);

PREPARE troca_nome FROM @sql;
EXECUTE troca_nome;
DEALLOCATE PREPARE troca_nome;
