-- ============================================================================
-- MIGRACAO 052: LOTE MENSAL DE DARF PARA A ACESSORIAS
-- ============================================================================
-- Ate aqui o DARF numerado so nascia de alguem preencher o formulario da aba
-- Trabalhista > DARF, uma empresa por vez, e baixar o PDF na mao. Para o grupo
-- de clientes que o DP entrega todo mes pela Acessorias isso era trabalho
-- repetido e, pior, esquecivel: uma competencia inteira podia passar sem que
-- ninguem notasse a falta de uma guia.
--
-- SAO DUAS TABELAS, E ELAS RESPONDEM PERGUNTAS DIFERENTES:
--
--   darf_lote_acessorias  -> QUEM entra no lote. Cadastro, editavel na tela.
--   darf_lote_execucoes   -> O QUE ACONTECEU em cada rodada. Registro historico.
--
-- POR QUE A LISTA E UMA TABELA, E NAO UM FILTRO SOBRE `clientes`:
--   O recorte nao e derivavel do cadastro. Nao e "todo cliente ativo", nem "todo
--   mundo com folha" — e a carteira que o DP entrega por aquele canal, e ela
--   muda por decisao comercial, nao por mudanca de dado. Todo filtro que se
--   tentasse escrever aqui seria uma adivinhacao que quebra no primeiro cliente
--   que entra ou sai da rotina.
--
-- POR QUE `itens` E JSON, E NAO UMA TERCEIRA TABELA:
--   As linhas de uma execucao so sao lidas em bloco, para montar o e-mail e a
--   tela do historico. Nunca se consulta "todas as falhas de agosto entre todas
--   as execucoes" — para isso existe `darfs_emitidos`, que e a fonte da verdade
--   sobre guias. Uma tabela filha aqui custaria join em toda leitura e nao
--   pagaria nenhuma consulta nova. O mesmo criterio ja vale em
--   `darfs_emitidos.resposta_json`.
--
-- POR QUE GUARDAR AS FALHAS:
--   "Nao ha debitos com saldo a pagar" nao e erro do sistema, e resposta da
--   Receita — e e exatamente o que o DP precisa ver para decidir se confere a
--   declaracao daquele cliente. Uma execucao que so registra sucesso obriga a
--   comparar listas na mao para descobrir quem ficou de fora.
--
-- COLLATION: utf8mb4_unicode_ci, EXPLICITA, porque `clientes` e
--   `darfs_emitidos` usam essa e o servidor cria com utf8mb4_0900_ai_ci por
--   padrao. Sem declarar, o LEFT JOIN por CNPJ falha com "Illegal mix of
--   collations" — erro que so aparece no primeiro JOIN, nao na criacao.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS e INSERT IGNORE. Rodar de novo nao
-- duplica cliente nem apaga o que foi editado na tela.
-- ============================================================================

USE DCTF_WEB;

-- ─── 1. Quem entra no lote ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS darf_lote_acessorias (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cnpj         VARCHAR(14)  NOT NULL COMMENT 'so digitos, como em clientes.cnpj_limpo',
  -- Desligar em vez de apagar: cliente que sai da rotina costuma voltar, e a
  -- linha guarda desde quando estava no lote.
  ativo        TINYINT(1)   NOT NULL DEFAULT 1,
  observacao   VARCHAR(255) NULL COMMENT 'por que entrou ou por que foi desligado',
  criado_em    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  criado_por   VARCHAR(100) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_darf_lote_cnpj (cnpj),
  KEY idx_darf_lote_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Clientes cujo DARF previdenciario vai para a pasta da Acessorias';

-- ─── 2. O que aconteceu em cada rodada ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS darf_lote_execucoes (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ano_pa         CHAR(4)      NOT NULL,
  mes_pa         CHAR(2)      NOT NULL,
  categoria      VARCHAR(30)  NOT NULL DEFAULT 'GERAL_MENSAL',
  -- 'agendador' quando ninguem clicou. Serve para distinguir a rodada mensal
  -- de uma reexecucao feita na mao depois de corrigir uma declaracao.
  disparado_por  VARCHAR(100) NULL,
  iniciado_em    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em   DATETIME     NULL COMMENT 'nulo = a rodada morreu no meio',
  total          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  emitidos       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- Guia que ja existia no historico e foi so copiada para a pasta. Contada a
  -- parte porque nao consumiu cota do SERPRO.
  reaproveitados SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  falhas         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  valor_total    DECIMAL(15,2) NULL,
  email_enviado  TINYINT(1)   NOT NULL DEFAULT 0,
  email_erro     VARCHAR(255) NULL,
  itens          JSON         NOT NULL COMMENT 'uma entrada por cliente, com erro quando houve',
  PRIMARY KEY (id),
  KEY idx_lote_competencia (ano_pa, mes_pa),
  KEY idx_lote_iniciado (iniciado_em DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Historico das rodadas do lote mensal de DARF';

-- ─── 3. Corrige a collation de quem foi criado antes desta regra ───────────
-- O CREATE acima so vale para tabela nova. Quem ja rodou a 052 na versao sem
-- COLLATE tem as tabelas em utf8mb4_0900_ai_ci e continuaria quebrando no JOIN.

ALTER TABLE darf_lote_acessorias CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE darf_lote_execucoes  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 4. A carteira inicial ─────────────────────────────────────────────────
-- Os 17 clientes que o DP entrega hoje. Conferidos um a um contra `clientes`
-- antes de entrar aqui.

INSERT IGNORE INTO darf_lote_acessorias (cnpj, criado_por, observacao) VALUES
  ('47306185000120', 'migration 052', 'carteira inicial'),  -- 238 AJ Port Consultoria
  ('64515496000119', 'migration 052', 'carteira inicial'),  -- 427 AKL Tecnologia
  ('63119645000168', 'migration 052', 'carteira inicial'),  -- 413 Cerdtech Desenvolvimento
  ('32747025000140', 'migration 052', 'carteira inicial'),  --  42 Comunica ES
  ('50599076000153', 'migration 052', 'carteira inicial'),  -- 273 Darwin Capixaba Editora
  ('56938284000116', 'migration 052', 'carteira inicial'),  -- 322 Julia Munhao
  ('39311386000198', 'migration 052', 'carteira inicial'),  --  82 Veride (Kernel Importacao)
  ('64752040000172', 'migration 052', 'carteira inicial'),  -- 428 L Acqua Nuova
  ('29236102000192', 'migration 052', 'carteira inicial'),  -- 398 Paris, Guerzet e Azevedo
  ('22796449000140', 'migration 052', 'carteira inicial'),  -- 111 Pereira & Avila Advogados
  ('05755778000124', 'migration 052', 'carteira inicial'),  -- 120 RV Negocios Imobiliarios
  ('40142610000144', 'migration 052', 'carteira inicial'),  -- 274 Rizzo Comercio de Roupas
  ('32663680000110', 'migration 052', 'carteira inicial'),  -- 132 Soma Servicos Administrativos
  ('30691293000161', 'migration 052', 'carteira inicial'),  -- 144 Up Log
  ('59267356000139', 'migration 052', 'carteira inicial'),  -- 379 Zenith Gestao Empresarial
  ('07452963000175', 'migration 052', 'carteira inicial'),  -- 159 Zorzal Tecnologia
  ('39811708000168', 'migration 052', 'carteira inicial');  --  49 Curtume Silvestre
