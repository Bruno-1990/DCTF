-- ============================================================================
-- MIGRACAO 047: REGISTRO DE COLETA POR CLIENTE EM det_procuracoes
-- ============================================================================
-- PROBLEMA QUE RESOLVE: a tela derivava "ultima coleta" de MAX(ultima_coleta_em)
-- da tabela det_notificacoes. Isso confunde DOIS casos distintos num "nunca":
--   1. cliente COLETADO cuja caixa estava VAZIA  -> sem linha em notificacoes
--      -> MAX = NULL -> aparece "nunca", como se nao tivesse sido conferido
--   2. cliente REALMENTE nunca coletado          -> tambem NULL -> "nunca"
-- Os dois ficam indistinguiveis, e o Departamento Pessoal nao sabe se precisa
-- coletar ou se ja foi conferido e nao ha nada.
--
-- A COLETA E ATRIBUTO DO CLIENTE, NAO DA MENSAGEM. Estas colunas guardam quando
-- cada CNPJ foi varrido e com que resultado, independentemente de ter mensagem.
-- Assim a tela distingue: "ha 3h" (coletado, com msgs), "sem mensagens"
-- (coletado, caixa vazia) e "nunca" (de fato nunca varrido).
--
-- `ultima_coleta_status`:
--   'ok'      = caixa lida, com mensagens
--   'vazia'   = caixa lida, sem mensagens (conferido, nada a fazer)
--   'erro'    = tentou e falhou (fica visivel para reprocessar)
--   NULL      = nunca coletado
--
-- Idempotente: o runner confere no information_schema antes de aplicar.
-- ============================================================================

ALTER TABLE det_procuracoes ADD COLUMN ultima_coleta_em TIMESTAMP NULL DEFAULT NULL
  COMMENT 'quando este CNPJ foi varrido pela ultima vez; NULL = nunca';

ALTER TABLE det_procuracoes ADD COLUMN ultima_coleta_status VARCHAR(10) NULL DEFAULT NULL
  COMMENT 'ok | vazia | erro | NULL(nunca)';

ALTER TABLE det_procuracoes ADD COLUMN ultima_coleta_msgs INT NULL DEFAULT NULL
  COMMENT 'quantas mensagens a caixa tinha na ultima coleta';
