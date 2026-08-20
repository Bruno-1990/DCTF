-- 043 — REOA: carimbo de coleta próprio em reoa_faturamento
--
-- Por que uma coluna nova em vez de usar `consultado_em`, que já existe:
-- aquela é TIMESTAMP ... ON UPDATE CURRENT_TIMESTAMP, e o MySQL só dispara o
-- ON UPDATE quando a linha MUDA de valor. Em mês fechado — a maioria dos 12 da
-- janela — re-puxar do SCI grava exatamente o mesmo número, a linha não muda e
-- o carimbo não anda. Ou seja, `consultado_em` responde "quando este valor
-- mudou pela última vez", e a pergunta da tela é outra: "há quanto tempo
-- ninguém confere este cliente".
--
-- `coletado_em` é gravada à mão em toda coleta (VALUES(coletado_em) no
-- ON DUPLICATE KEY UPDATE), mudando o valor ou não.
--
-- As linhas antigas recebem o carimbo por backfill (ver no fim do arquivo).
-- NULL fica só para o que realmente nunca foi coletado, que a tela lê como
-- "nunca coletado".
--
-- O serviço aplica este mesmo ALTER sob demanda (`ensureReoaTable`), então esta
-- migration existe para o histórico e para bases criadas fora do app.

ALTER TABLE reoa_faturamento
  ADD COLUMN coletado_em TIMESTAMP NULL DEFAULT NULL;

-- Backfill: as linhas que já existiam FORAM coletadas, só não havia onde anotar.
-- Para elas `consultado_em` é confiável — sem UPDATE posterior o ON UPDATE nunca
-- disparou, então o valor ainda é o do INSERT, que é a hora da coleta. Deixá-las
-- em NULL faria a tela dizer "nunca coletado" de cliente que foi conferido.
UPDATE reoa_faturamento SET coletado_em = consultado_em WHERE coletado_em IS NULL;
