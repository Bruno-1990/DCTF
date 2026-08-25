-- ============================================================================
-- MIGRACAO 045: DET — PROCURACOES, NOTIFICACOES E LOG DE COLETA
-- ============================================================================
-- Suporta a aba Trabalhista > DTE: acompanhar a caixa postal do Dominio
-- Eletronico Trabalhista dos clientes que outorgaram procuracao ao escritorio.
--
-- REGRA QUE GOVERNA TODO O RESTO: abrir uma MENSAGEM no DET gera ciencia e
-- dispara prazo legal. O coletor le SOMENTE A LISTAGEM (`.tabela_mensagens
-- .linha`), que expoe tipo, remetente, data, assunto e a classe `nao-lida`
-- sem abrir nada. Verificado em 21/08/2026 na caixa da propria Central
-- Contabil: apos varrer a listagem, o contador seguiu "Caixa de Entrada (2)"
-- com as duas nao-lidas intactas. Nenhuma coluna aqui guarda CORPO de
-- mensagem, de proposito — se um dia alguem quiser o corpo, vai ter que
-- decidir conscientemente dar ciencia.
--
-- POR QUE `det_procuracoes` E SEPARADA DE `clientes`:
--   A procuracao nao e atributo do cliente, e um vinculo com validade que
--   nasce, vence e e revogada por fora do sistema. Em 21/08/2026 havia 136
--   procuracoes recebidas no SPE — 127 ativas, 7 revogadas e 2 expiradas.
--   Uma coluna em `clientes` nao teria onde guardar vigencia nem origem, e a
--   releitura diaria do SPE precisa saber o que mudou desde ontem.
--
-- COBERTURA POR RAIZ: procuracao outorgada pela matriz vale para as filiais.
--   Confirmado empiricamente — a filial 03.597.050/0002-77 entrou no DET pela
--   procuracao da matriz 03.597.050/0001-96. Por isso existe
--   `outorgante_cnpj`: sem ele nao da para explicar na tela por que uma filial
--   aparece como deferida sem ter procuracao propria.
--
-- Pode ser executada mais de uma vez (idempotente).
-- ============================================================================

USE DCTF_WEB;

-- ─── 1. Quem tem procuracao ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS det_procuracoes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cnpj CHAR(14) NOT NULL COMMENT 'CNPJ do estabelecimento, so digitos',
  situacao ENUM('deferido','indeferido') NOT NULL DEFAULT 'indeferido',

  -- 'spe'    = lido da aba Recebidas do SPE (fonte da verdade, releitura diaria)
  -- 'manual' = informado por um usuario e confirmado ao vivo contra o DET
  -- 'proprio'= a propria Central Contabil, que acessa sem procuracao
  origem ENUM('spe','manual','proprio') NOT NULL DEFAULT 'spe',

  -- Quem de fato outorgou. Difere de `cnpj` quando a cobertura vem da raiz.
  outorgante_cnpj CHAR(14) NULL,

  vigencia_inicio DATE NULL,
  vigencia_fim DATE NULL,

  -- Texto cru do SPE: 'Ativa' | 'Revogada' | 'Expirada'. Guardado separado de
  -- `situacao` porque 'Revogada' e 'Expirada' pedem acoes diferentes com o
  -- cliente — uma precisa de nova outorga, a outra so de renovacao.
  situacao_spe VARCHAR(30) NULL,

  observacao VARCHAR(255) NULL,
  informado_por VARCHAR(120) NULL COMMENT 'usuario, quando origem=manual',
  verificado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_det_proc_cnpj (cnpj),
  KEY ix_det_proc_situacao (situacao),
  KEY ix_det_proc_vigencia (vigencia_fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. O que esta na caixa postal ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS det_notificacoes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cnpj CHAR(14) NOT NULL,

  -- 'Aviso' | 'Notificacao'. NAO e o mesmo peso: na caixa da Central Contabil
  -- havia 10 Avisos (Credito do Trabalhador, mensal, ruido recorrente) para 1
  -- Notificacao (FGTS Digital, com prazo). Tratar os dois igual afoga o que
  -- importa — por isso o tipo e indexado e a tela filtra por ele.
  tipo VARCHAR(40) NOT NULL,
  remetente VARCHAR(255) NULL,

  -- A listagem mostra data relativa ('Hoje') OU absoluta ('21 jul 26').
  -- `data_texto` guarda o cru; `data_envio` guarda o resolvido. A resolucao
  -- acontece ANTES do hash — se 'Hoje' entrasse no hash, a mesma mensagem
  -- viraria um registro novo amanha, quando a tela passasse a exibir a data.
  data_texto VARCHAR(30) NULL,
  data_envio DATE NULL,

  assunto TEXT NULL,
  nao_lida TINYINT(1) NOT NULL DEFAULT 0,

  -- sha256(cnpj|tipo|data_envio|assunto). E a trava contra duplicar a cada
  -- coleta diaria e o que permite responder "o que chegou desde ontem".
  hash CHAR(64) NOT NULL,

  primeira_coleta_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_coleta_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_det_notif_hash (hash),
  KEY ix_det_notif_cnpj (cnpj),
  KEY ix_det_notif_tipo (tipo),
  KEY ix_det_notif_nao_lida (nao_lida),
  KEY ix_det_notif_data (data_envio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. Log das coletas ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS det_coletas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em TIMESTAMP NULL DEFAULT NULL,
  origem ENUM('cron','manual') NOT NULL DEFAULT 'cron',

  total_clientes INT NOT NULL DEFAULT 0,
  coletados INT NOT NULL DEFAULT 0,
  erros INT NOT NULL DEFAULT 0,
  mensagens_novas INT NOT NULL DEFAULT 0,
  notificacoes_novas INT NOT NULL DEFAULT 0
    COMMENT 'so tipo=Notificacao — e o numero que merece alerta',

  -- Reautenticacoes gastas na rodada. A sessao do DET dura 30 min e a varredura
  -- dos ~132 clientes com espacamento passa de uma hora, entao reautenticar no
  -- meio e o caminho normal, nao excecao. Contar ajuda a diagnosticar queda.
  reautenticacoes INT NOT NULL DEFAULT 0,

  -- Linha com `concluido_em` NULL = coleta que comecou e nao terminou. Nao e
  -- retentada sozinha: se o portal derrubou a rodada, repetir no minuto
  -- seguinte so repete a queda.
  mensagem_erro TEXT NULL,

  PRIMARY KEY (id),
  KEY ix_det_coletas_inicio (iniciado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
