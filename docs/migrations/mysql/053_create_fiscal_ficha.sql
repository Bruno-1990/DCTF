-- ============================================================================
-- MIGRACAO 053: FICHA FISCAL POR COLABORADOR
-- ============================================================================
-- A distribuicao da carteira fiscal vivia numa planilha (Distribuicao_por_
-- colaborador.xlsx): uma aba por pessoa, oito colunas, e as quatro ultimas em
-- branco esperando alguem preencher na mao. As quatro primeiras (CNPJ, razao
-- social, regime, beneficio) ja saiam do banco — eram copia, e copia envelhece:
-- cliente que muda de regime no sistema continua "LUCRO PRESUMIDO" na planilha
-- para sempre.
--
-- ESTA MIGRACAO GUARDA SO O QUE NAO EXISTE NO BANCO:
--   perfil, volume de NF, envia SPED e observacao — os campos que a pessoa
--   digita. CNPJ, razao social, regime e beneficio continuam vindo de
--   `clientes` por JOIN, e por isso nunca ficam defasados.
--
-- SAO DUAS TABELAS:
--   fiscal_colaboradores -> QUEM preenche. Cadastro pequeno e estavel.
--   fiscal_ficha         -> O QUE cada um respondeu, uma linha por
--                           (colaborador, cliente).
--
-- POR QUE `cliente_id` E NAO `cnpj`:
--   `darf_lote_acessorias` guarda CNPJ porque a lista dela nasce de fora do
--   sistema. Aqui e o oposto: a regra do produto e que so entra empresa JA
--   cadastrada. A FK para `clientes.id` transforma essa regra em garantia do
--   banco, em vez de uma validacao que alguem pode esquecer de chamar.
--
-- POR QUE `inutilizado` E NAO DELETE:
--   "Essa empresa nao e minha" e informacao, nao engano. A linha fica na tela
--   riscada, com botao de desfazer, e sobra o rastro de quem dispensou o que —
--   que e justamente o material para arrumar a distribuicao depois.
--
-- POR QUE AS OPCOES (Servico/Comercio/Industria, faixas de NF, Sim/Nao) NAO
-- VIRAM TABELA:
--   Sao a aba AUX da planilha: tres listas fechadas que nao mudam por operacao
--   do usuario, so por decisao de produto — e mudar exige mexer na validacao do
--   backend de qualquer jeito. Como tabela, virariam duas fontes da verdade que
--   podem discordar em silencio. Vivem em src/services/FiscalOpcoes.ts, que o
--   backend usa para validar e a tela le por /api/fiscal/opcoes.
--
-- COLLATION: utf8mb4_unicode_ci, EXPLICITA. `clientes` usa essa e o servidor
--   cria com utf8mb4_0900_ai_ci por padrao; sem declarar, o JOIN por cliente_id
--   quebra com "Illegal mix of collations" — erro que so aparece na primeira
--   consulta, nunca na criacao da tabela.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS e INSERT IGNORE. Rodar de novo nao
-- duplica colaborador nem apaga nada que ja foi preenchido na tela.
-- ============================================================================

USE DCTF_WEB;

-- ─── 1. Quem preenche ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fiscal_colaboradores (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(80)  NOT NULL,
  -- Desligar em vez de apagar: quem sai do time nao leva junto a ficha que
  -- preencheu, e a carteira dele continua consultavel para redistribuir.
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  ordem         SMALLINT     NOT NULL DEFAULT 0 COMMENT 'ordem no seletor da tela',
  criado_em     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fiscal_colab_nome (nome),
  KEY idx_fiscal_colab_ativo (ativo, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Colaboradores que preenchem a ficha fiscal';

-- ─── 2. O que cada um respondeu ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fiscal_ficha (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colaborador_id INT UNSIGNED NOT NULL,
  cliente_id     CHAR(36)     NOT NULL COMMENT 'clientes.id — razao, CNPJ, regime e beneficio vem de la',

  -- Os quatro campos que a planilha existia para coletar. NULL = ainda nao
  -- respondido, que e diferente de vazio: a tela conta pendencia por isso.
  perfil       VARCHAR(20)  NULL COMMENT 'Servico | Comercio | Industria',
  volume_nf    VARCHAR(20)  NULL COMMENT 'faixa; valores em FiscalOpcoes.ts',
  envia_sped   VARCHAR(3)   NULL COMMENT 'Sim | Nao',
  observacao   VARCHAR(500) NULL COMMENT 'texto livre, unico campo sem lista fechada',

  -- "Essa empresa nao e minha". Continua listada, riscada, com desfazer.
  inutilizado        TINYINT(1)   NOT NULL DEFAULT 0,
  inutilizado_em     DATETIME     NULL,
  inutilizado_motivo VARCHAR(255) NULL,

  origem        VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT 'planilha = veio da carga inicial',
  preenchido_em DATETIME    NULL COMMENT 'primeira vez que os tres campos ficaram completos',
  criado_em     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- A mesma empresa pode aparecer para duas pessoas (acontece quando alguem
  -- adiciona o que ja era de outro); o que nao pode e duplicar dentro da
  -- mesma lista. O endpoint de adicionar avisa quando ha outro dono.
  UNIQUE KEY uq_fiscal_ficha (colaborador_id, cliente_id),
  KEY idx_fiscal_ficha_cliente (cliente_id),
  KEY idx_fiscal_ficha_pendente (colaborador_id, inutilizado, perfil),
  CONSTRAINT fk_fiscal_ficha_colab FOREIGN KEY (colaborador_id)
    REFERENCES fiscal_colaboradores (id) ON DELETE CASCADE,
  CONSTRAINT fk_fiscal_ficha_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Perfil, volume de NF, SPED e observacao por colaborador x cliente';

-- ─── 3. Corrige a collation de quem rodou uma versao anterior ──────────────
-- O CREATE acima so vale para tabela nova.

ALTER TABLE fiscal_colaboradores CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE fiscal_ficha         CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 4. Os colaboradores ───────────────────────────────────────────────────
-- As nove abas da planilha, na ordem alfabetica em que estavam.
-- "Sem responsavel" recebe a aba OBSERVACAO: empresas reais, sem dono definido
-- (SOMENTE DP, SOMENTE LEG, nao localizadas no Controle de Inspecao). Ficam
-- visiveis para alguem reclamar, em vez de sumirem na importacao.

INSERT IGNORE INTO fiscal_colaboradores (nome, ordem) VALUES
  ('ANDREIA',          1),
  ('ARTHUR',           2),
  ('DULCINEA',         3),
  ('GUSTAVO',          4),
  ('IAN',              5),
  ('JOSELI',           6),
  ('MARIA HELENA',     7),
  ('MAYRCE',           8),
  ('PRISCILA',         9),
  ('Sem responsável', 99);
