-- ============================================================================
-- MIGRACAO 046: REGISTRO DA VARREDURA DE PROCURACOES NA COLETA DO DET
-- ============================================================================
-- A partir daqui a coleta nao parte mais de uma lista que alguem informou: ela
-- comeca lendo a aba "Recebidas (sou Outorgado)" do SPE, reconcilia
-- `det_procuracoes` e so entao decide quem varrer.
--
-- POR QUE ESTAS COLUNAS EXISTEM: se a leitura do SPE falhar, a coleta segue com
-- a lista da vez anterior — abortar o dia inteiro por um soluco do portal e pior,
-- ate porque o proprio DET corrige para baixo ao recusar quem perdeu procuracao.
-- Mas seguir com lista velha tem um custo real e invisivel: quem outorgou ONTEM
-- nao entra, e ninguem fica sabendo. Estas colunas sao o que impede esse silencio
-- — a mesma regra que ja vale para a caixa truncada, anunciada em
-- `paginasNaoLidas` em vez de cortada caladamente.
--
-- `procuracoes_lidas` NULL (e nao 0) distingue "o SPE nao foi lido nesta rodada"
-- de "foi lido e voltou vazio". Zero seria uma afirmacao; NULL e a ausencia dela.
--
-- Idempotente: o runner (`src/scripts/run-det-migration-046.ts`) confere no
-- information_schema antes de aplicar cada coluna, entao rodar de novo nao da
-- erro. Sem procedure/DELIMITER de proposito — DELIMITER e construcao do cliente
-- mysql, nao do servidor, e o driver mysql2 nao a interpreta.
-- ============================================================================

ALTER TABLE det_coletas ADD COLUMN procuracoes_lidas INT NULL
  COMMENT 'linhas lidas na aba Recebidas do SPE; NULL = SPE nao lido nesta rodada';

ALTER TABLE det_coletas ADD COLUMN procuracoes_alteradas INT NULL
  COMMENT 'quantos estabelecimentos mudaram de situacao nesta varredura';

ALTER TABLE det_coletas ADD COLUMN procuracoes_ganharam INT NULL
  COMMENT 'passaram a deferido — entram na varredura a partir de hoje';

ALTER TABLE det_coletas ADD COLUMN procuracoes_perderam INT NULL
  COMMENT 'passaram a indeferido — revogada, expirada ou nunca houve';

ALTER TABLE det_coletas ADD COLUMN spe_erro TEXT NULL
  COMMENT 'motivo da falha ao ler o SPE; preenchido = a coleta rodou com a lista anterior';
