-- ============================================================================
-- MIGRACAO 051: GUIA EXCLUIDA NAO GUARDA PDF
-- ============================================================================
-- Mudanca de politica, nao de schema.
--
-- A 050 fez a exclusao virar logica e guardou TUDO: linha e PDF. Na pratica o
-- PDF de uma guia excluida nao serve para nada — quando o contador clica em
-- excluir, o documento ja foi baixado e entregue, e a nossa copia vira so peso.
-- Cada guia ocupa ~150 KB em `pdf_base64` (LONGTEXT); a linha de registro
-- ocupa algumas centenas de bytes.
--
-- ENTAO A PARTIR DAQUI:
--   excluir  -> apaga o PDF e mantem a linha (numero do documento, valores,
--               competencia, quem emitiu e quando)
--   restaurar-> devolve a linha a lista; o PDF NAO volta, porque foi apagado
--
-- O que se perde ao apagar o PDF e a reimpressao identica. O que se preserva e
-- a resposta para "esta guia chegou a ser emitida, por quem e de quanto?", que
-- e a pergunta que sobrevive ao arquivo.
--
-- Esta migracao aplica a politica retroativamente: limpa o PDF das guias que ja
-- estavam excluidas quando a regra mudou.
--
-- Idempotente: rodar de novo nao encontra nada para limpar.
-- ============================================================================

USE DCTF_WEB;

UPDATE darfs_emitidos
   SET pdf_base64 = NULL
 WHERE excluido_em IS NOT NULL
   AND pdf_base64 IS NOT NULL;
