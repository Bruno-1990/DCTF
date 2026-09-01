-- ============================================================================
-- SUPERSEDIDA — NAO EXECUTAR ISOLADAMENTE
-- ============================================================================
-- Esta migracao criou a tabela `sicalc_darfs`, que a 049 renomeou para
-- `darfs_emitidos` e a 050 reduziu ao DARF numerado. Roda-la sozinha hoje
-- criaria uma `sicalc_darfs` vazia e orfa ao lado da tabela real.
-- O caminho correto e `npm run migrate:darf`, que aplica 049 e 050 em ordem.
-- Mantida aqui apenas como registro historico do schema.
-- ============================================================================

-- ============================================================================
-- MIGRACAO 048: SICALC — HISTORICO DE DARFs EMITIDOS
-- ============================================================================
-- Suporta a aba Trabalhista > DARF: emissao avulsa de DARF pelo Integra
-- Contador (SICALC / CONSOLIDARGERARDARF51).
--
-- POR QUE GUARDAR O PDF E NAO SO OS METADADOS:
--   O DARF emitido tem validade — o proprio SERPRO devolve `dataValidadeCalculo`
--   junto com o documento. Reemitir depois nao devolve o mesmo papel: a
--   consolidacao e refeita na data nova e os valores mudam. Entao o PDF que o
--   cliente recebeu e o unico registro do que foi de fato entregue, e ele
--   precisa poder ser reimpresso identico sem uma segunda ida a rede.
--
-- POR QUE OS VALORES CONSOLIDADOS SAO COLUNAS E NAO SO JSON:
--   `valor_total`, `valor_multa` e `valor_juros` sao o que a conferencia olha e
--   o que um relatorio soma. Deixa-los so dentro de `resposta_json` obrigaria
--   toda consulta a abrir JSON. O `resposta_json` continua existindo ao lado,
--   cru, para auditoria — quando alguem perguntar "de onde saiu esse numero", a
--   resposta esta na resposta original do SERPRO, nao numa releitura nossa.
--
-- O QUE NAO TEM AQUI: nenhum campo de "pago". Emitir DARF nao e pagar DARF, e
--   inventar um status de pagamento que ninguem alimenta so criaria um numero
--   errado na tela. O acompanhamento de pagamento ja vive em /api/pagamentos.
--
-- Pode ser executada mais de uma vez (idempotente).
-- ============================================================================

USE DCTF_WEB;

CREATE TABLE IF NOT EXISTS sicalc_darfs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- ─── Contribuinte ────────────────────────────────────────────────────────
  -- VARCHAR(14) e nao CHAR(14): o SICALC aceita CPF (11) alem de CNPJ (14), e
  -- um CHAR(14) preencheria CPF com espacos a direita, quebrando o JOIN com
  -- `clientes.cnpj_limpo`.
  cnpj VARCHAR(14) NOT NULL COMMENT 'CNPJ ou CPF do contribuinte, so digitos',
  razao_social VARCHAR(255) NULL COMMENT 'Copia do nome no momento da emissao',

  -- ─── Receita ─────────────────────────────────────────────────────────────
  codigo_receita VARCHAR(6) NOT NULL COMMENT 'Codigo da receita RFB',
  codigo_receita_extensao VARCHAR(4) NULL COMMENT 'Extensao do codigo',
  -- Guardada no momento da emissao porque a tabela de receitas da RFB muda: um
  -- DARF de 2 anos atras precisa continuar dizendo o que dizia entao.
  descricao_receita VARCHAR(255) NULL COMMENT 'Descricao vinda do servico 52',

  -- ─── Periodo e vencimento ────────────────────────────────────────────────
  tipo_pa VARCHAR(4) NULL COMMENT 'Tipo do periodo de apuracao (ex: TR, ME)',
  data_pa VARCHAR(7) NOT NULL COMMENT 'MM/AAAA ou AAAA, como enviado ao SERPRO',
  numero_referencia VARCHAR(30) NULL,
  vencimento DATE NULL COMMENT 'Excludente com cota',
  cota SMALLINT UNSIGNED NULL COMMENT 'Excludente com vencimento',

  -- ─── Valores ─────────────────────────────────────────────────────────────
  valor_imposto DECIMAL(15,2) NOT NULL COMMENT 'Principal informado na emissao',
  valor_multa DECIMAL(15,2) NULL COMMENT 'Multa de mora calculada pela RFB',
  valor_juros DECIMAL(15,2) NULL COMMENT 'Juros calculados pela RFB',
  valor_total DECIMAL(15,2) NULL COMMENT 'Total consolidado — o que se paga',
  percentual_multa DECIMAL(7,2) NULL,
  percentual_juros DECIMAL(7,2) NULL,
  termo_inicial_juros DATE NULL,

  -- ─── Consolidacao ────────────────────────────────────────────────────────
  data_consolidacao DATE NOT NULL COMMENT 'Data de pagamento usada no calculo',
  -- Depois desta data o DARF nao vale mais e precisa ser reemitido. E o campo
  -- que a tela usa para marcar a linha como vencida.
  data_validade_calculo DATE NULL COMMENT 'Ate quando o calculo vale',

  -- ─── Documento ───────────────────────────────────────────────────────────
  numero_documento VARCHAR(30) NULL COMMENT 'Numero do DARF gerado pela RFB',
  pdf_base64 LONGTEXT NULL COMMENT 'PDF do DARF em base64, como veio do SERPRO',

  -- ─── Extras opcionais do SICALC ──────────────────────────────────────────
  uf CHAR(2) NULL,
  municipio VARCHAR(6) NULL COMMENT 'Codigo TOM da RFB',
  observacao VARCHAR(255) NULL COMMENT 'Texto impresso no corpo do DARF',
  ganho_capital TINYINT(1) NOT NULL DEFAULT 0,
  data_alienacao DATE NULL,
  cno VARCHAR(20) NULL,
  cnpj_prestador VARCHAR(14) NULL,

  -- ─── Rastro ──────────────────────────────────────────────────────────────
  emitido_por VARCHAR(120) NULL COMMENT 'Usuario que clicou em emitir',
  resposta_json JSON NULL COMMENT 'Resposta crua do SERPRO, para auditoria',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_sicalc_darfs_cnpj (cnpj),
  INDEX idx_sicalc_darfs_criado_em (criado_em DESC),
  INDEX idx_sicalc_darfs_receita (codigo_receita),
  -- Consulta mais comum da tela: "os DARFs deste cliente, mais novo primeiro".
  INDEX idx_sicalc_darfs_cnpj_data (cnpj, criado_em DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='DARFs emitidos pelo Integra Contador (SICALC)';
