-- ============================================================================
-- MIGRACAO 056: RESPOSTAS DOS QUESTIONARIOS DA ABA FISCAL
-- ============================================================================
-- O questionario "CFOP: XML ou SPED?" circulava como um HTML avulso por link,
-- salvando num banco de fora. Duas consequencias: ninguem sabia quem ja tinha
-- respondido, e as respostas ficavam onde o time nao consulta. Esta tabela
-- traz isso para dentro do app, por colaborador, com visao consolidada.
--
-- POR QUE UMA COLUNA `respostas` JSON E NAO UMA COLUNA POR PERGUNTA:
--   Sao 21 perguntas neste questionario e havera outros. Uma coluna por
--   pergunta significaria uma migration a cada enunciado novo, e um ALTER
--   TABLE para cada questionario. O JSON nao e "campo solto": o backend valida
--   cada chave e cada valor contra a definicao em src/services/
--   FiscalQuestionarios.ts ANTES do INSERT — pergunta que nao existe, ou opcao
--   que nao esta na lista, e recusada com 400. O que entra aqui ja passou pela
--   mesma checagem que uma coluna ENUM faria.
--
-- POR QUE A DEFINICAO DAS PERGUNTAS NAO E TABELA:
--   Mesma razao de FiscalOpcoes.ts (ver migration 053): lista fechada que so
--   muda por decisao de produto. Como tabela, viraria uma segunda fonte da
--   verdade que pode discordar da validacao em silencio.
--
-- POR QUE `questionario_versao` NA LINHA:
--   Quando o enunciado mudar, a versao sobe no codigo. Guardar a versao junto
--   da resposta diz contra QUAL texto a pessoa respondeu — sem isso, uma
--   resposta de 2026 apareceria colada num enunciado reescrito em 2027.
--
-- POR QUE UNIQUE (questionario_slug, colaborador_id):
--   Uma resposta por pessoa por questionario. A tela salva sozinha a cada
--   mudanca (autosave), entao o mesmo formulario chega dezenas de vezes: o
--   INSERT ... ON DUPLICATE KEY UPDATE depende desta chave para substituir em
--   vez de empilhar 40 versoes do mesmo preenchimento.
--
-- OBSERVACOES: as por pergunta vivem dentro do JSON, sob a chave `obs:<id da
--   pergunta>`; a coluna `observacoes` e so a caixa geral do fim (secao H).
--
-- COLLATION: utf8mb4_unicode_ci, EXPLICITA — `fiscal_colaboradores` usa essa e
--   o servidor cria com utf8mb4_0900_ai_ci por padrao; sem declarar, o JOIN
--   quebra com "Illegal mix of collations" na primeira consulta, nunca na
--   criacao. Mesma armadilha documentada na 053.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS. Rodar de novo nao apaga resposta.
-- ============================================================================

USE DCTF_WEB;

CREATE TABLE IF NOT EXISTS fiscal_questionario_respostas (
  id                  INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  questionario_slug   VARCHAR(64)      NOT NULL COMMENT 'slug em FiscalQuestionarios.ts (ex.: cfop-xml-ou-sped)',
  questionario_versao SMALLINT UNSIGNED NOT NULL COMMENT 'versao do enunciado que a pessoa respondeu',
  colaborador_id      INT UNSIGNED     NOT NULL,

  -- Mapa `id da pergunta` -> valor. String na pergunta de opcao unica, array
  -- de strings na de multipla escolha, string na de texto livre. Observacao
  -- por pergunta sob a chave `obs:q1`.
  respostas           JSON             NOT NULL,

  -- A caixa do fim do formulario (secao H). Separada do JSON porque nao
  -- pertence a nenhuma pergunta.
  observacoes         TEXT             NULL,

  criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_quest_colab (questionario_slug, colaborador_id),
  KEY idx_quest_colaborador (colaborador_id),
  CONSTRAINT fk_quest_resposta_colab FOREIGN KEY (colaborador_id)
    REFERENCES fiscal_colaboradores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Respostas dos questionarios da aba Fiscal, uma linha por colaborador';

-- Corrige a collation de quem rodou uma versao anterior — o CREATE acima so
-- vale para tabela nova.
ALTER TABLE fiscal_questionario_respostas CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
