-- ============================================================================
-- MIGRACAO 054: A COLUNA SPED PASSA A DIZER QUEM ENVIA
-- ============================================================================
-- A 053 nasceu com a lista da aba AUX da planilha: "ENVIA SPED FISCAL?" com
-- Sim ou Nao. Na pratica isso nao respondia a pergunta que o time faz. Empresa
-- obrigada ao SPED sempre "envia" — o que muda, e o que importa saber, e QUEM
-- transmite: o escritorio ou o proprio cliente.
--
-- A lista passa a ser:
--   Feito no Escritorio  -> nos transmitimos
--   Enviado pelo Cliente -> o cliente transmite por conta propria
--   Nao                  -> a empresa nao envia SPED Fiscal
--
-- "Sim" SAI da lista. Nao e uma quarta resposta: e exatamente a soma das duas
-- primeiras, e mante-lo deixaria o mesmo fato ser gravado de tres jeitos —
-- justamente o que uma lista fechada existe para impedir. Nenhuma linha tinha
-- SPED preenchido quando esta migracao rodou, entao ninguem fica com resposta
-- orfa. (Se voltar a fazer falta, e so acrescentar em FiscalOpcoes.ts.)
--
-- POR QUE MEXER NO TIPO DA COLUNA:
--   VARCHAR(3) foi dimensionado para caber "Sim"/"Nao". "Enviado pelo Cliente"
--   tem 20 caracteres — sem este ALTER o INSERT falharia (ou truncaria em
--   sql_mode permissivo, que e pior: grava "Env" e ninguem percebe).
--
-- Idempotente: MODIFY para o mesmo tipo nao faz nada na segunda vez.
-- ============================================================================

USE DCTF_WEB;

ALTER TABLE fiscal_ficha
  MODIFY COLUMN envia_sped VARCHAR(30) NULL
  COMMENT 'Feito no Escritorio | Enviado pelo Cliente | Nao — valores em FiscalOpcoes.ts';

-- Rede de seguranca para bases que ja tivessem "Sim" gravado antes da troca:
-- vira "Feito no Escritorio", que era o que "Sim" queria dizer na pratica.
-- Nao afeta nada quando a coluna esta vazia.
UPDATE fiscal_ficha SET envia_sped = 'Feito no Escritório' WHERE envia_sped = 'Sim';
