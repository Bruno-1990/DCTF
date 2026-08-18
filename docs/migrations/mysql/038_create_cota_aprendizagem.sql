-- ============================================================================
-- MIGRACAO 038: COTA DE APRENDIZAGEM - CLASSIFICACAO DE PORTE ME/EPP/DEMAIS
-- ============================================================================
-- Base legal: LC 123/2006 art. 3o (porte por receita bruta) + IN SIT/MTE
-- 146/2018 art. 3o, I (ME e EPP sao ISENTAS da cota de aprendizagem).
-- Especificacao completa em Regra/regras-cota-aprendizagem.md.
--
-- O QUE ESTA MIGRACAO COBRE: somente a CLASSIFICACAO DE PORTE.
-- NAO calcula numero de aprendizes (5% a 15% dos empregados em funcoes CBO) —
-- nao existe fonte de quantidade de empregados no sistema. Fase futura.
--
-- POR QUE UMA TABELA PROPRIA DE FATURAMENTO, e nao reusar irpf_faturamento_*:
--   1. IrpfFaturamentoDetalhado.salvarDetalhado (models/IrpfFaturamentoDetalhado
--      .ts:113) faz DELETE do ano inteiro antes de reinserir. Para o ano
--      CORRENTE isso e destrutivo: uma falha da SP no meio apaga meses ja
--      coletados — e a RBA do ano vigente e justamente o dado que nao pode
--      evaporar. Aqui a gravacao e UPSERT, nunca DELETE.
--   2. Os dois escritores do cache do IRPF sao incompativeis entre si:
--      IrpfScheduler.ts:178 usa SP_BI_FAT(...,SOMA=1) e grava o total ja
--      somado sob codigo_empresa=1; IrpfController.ts:586 usa SOMA=0 e grava
--      por estabelecimento. Rodando um depois do outro, a linha da filial fica
--      orfa e SUM(faturamento_total) CONTA A FILIAL DUAS VEZES.
--      Aqui a tabela e consolidada por definicao (sem codigo_empresa).
--   3. A janela do IRPF e [anoAtual-2, anoAtual-1] — o ano CORRENTE nunca e
--      buscado, e e dele que sai a RBA da regra dos 20%.
--
-- Pode ser executada mais de uma vez (idempotente).
-- ============================================================================

USE DCTF_WEB;

-- ----------------------------------------------------------------------------
-- 1) FATURAMENTO MENSAL CONSOLIDADO DA PESSOA JURIDICA
-- ----------------------------------------------------------------------------
-- LC 123 art. 3o caput mede a receita bruta da PESSOA JURIDICA, nao do
-- estabelecimento. Por isso a coleta usa SP_BI_FAT(..., SOMAMATRIZFILIAL=1) e
-- esta tabela NAO tem codigo_empresa: cada linha ja e matriz + filiais somadas.
--
-- ATENCAO PARA A FASE 2: a COTA em si e apurada por ESTABELECIMENTO
-- (IN 146/2018, doc secao 3.4). Quem for calcular numero de aprendizes NAO
-- pode herdar este numero consolidado.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cota_faturamento_mensal` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cliente_id` VARCHAR(36) NOT NULL,
  `codigo_sci` INT NULL,                    -- BDCODEMP consultado no SCI
  `ano` INT NOT NULL,
  `mes` INT NOT NULL,                       -- 1..12
  `bdref` INT NOT NULL,                     -- YYYYMM (formato do SCI)
  `faturamento` DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Ausencia de linha = mes DESCONHECIDO. Linha com 0,00 = zero declarado pelo
  -- SCI. A diferenca importa: zero informado nao torna a apuracao incerta.
  `base_receita` VARCHAR(40) NOT NULL DEFAULT 'faturamento_total',
  -- De qual componente da SP_BI_FAT saiu o valor (BDORDEM=7 = faturamento
  -- total). LC 123 art. 3o §1o define receita bruta excluindo vendas
  -- canceladas e descontos incondicionais, e sem receita nao-operacional —
  -- e 'faturamento_total' inclui outras_receitas. Se o fiscal concluir que a
  -- base correta e outra, muda-se aqui e reapura sem perder o historico.
  `consultado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cota_fat_cli_ano_mes` (`cliente_id`, `ano`, `mes`),
  INDEX `idx_cota_fat_cliente` (`cliente_id`),
  INDEX `idx_cota_fat_bdref` (`bdref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Faturamento mensal consolidado (matriz+filiais) para classificar porte LC 123';

-- ----------------------------------------------------------------------------
-- 2) CLASSIFICACAO MENSAL — o historico
-- ----------------------------------------------------------------------------
-- Uma linha por (cliente, ano, mes). E esta granularidade que responde
-- "em que mes exatamente a empresa virou Demais" sem reexecutar codigo, e que
-- alimenta a deteccao de virada e o e-mail agrupado.
--
-- porte_anterior/mudou sao desnormalizados de proposito: "quem mudou nesta
-- competencia" vira WHERE bdref=? AND mudou=1, sem self-join.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cota_classificacao_mensal` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cliente_id` VARCHAR(36) NOT NULL,
  `ano` INT NOT NULL,
  `mes` INT NOT NULL,
  `bdref` INT NOT NULL,

  -- Receitas que embasaram a decisao (guardadas, nao recalculadas na leitura)
  `rbaa` DECIMAL(15,2) NULL COMMENT 'Receita bruta acumulada do ano ANTERIOR. NULL = indisponivel (NAO e zero).',
  `rba` DECIMAL(15,2) NULL COMMENT 'Receita bruta acumulada do ano CORRENTE ate este mes.',

  -- Resultado
  `porte` ENUM('ME','EPP','DEMAIS','SEM_DADOS') NOT NULL,
  `porte_base` ENUM('ME','EPP','DEMAIS','SEM_DADOS') NOT NULL
    COMMENT 'Porte so pela RBAA, antes de aplicar a regra dos 20%',
  `motivo` VARCHAR(40) NOT NULL
    COMMENT 'RBAA | EXCESSO_20PCT | SEM_DADOS',
  `sujeita_cota` TINYINT(1) NULL
    COMMENT 'TRI-ESTADO: 1=Demais (sujeita); 0=ME/EPP (isenta); NULL=nao foi possivel concluir. NUNCA usar 0 para "nao sei" — isso afirmaria isencao sem ter verificado.',

  -- Sinais prospectivos (efeito so em 1o/jan do ano seguinte)
  `excede_teto_epp` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'RBA passou de 4,8 mi. Se o excesso ficar <= 20%, vira Demais so em 1o/jan (art. 3o §9o-A).',
  `excede_teto_me` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'RBA passou de 360 mil. ME vira EPP em 1o/jan (art. 3o §7o, SEM regra de 20%). Nao muda a isencao: ME e EPP sao ambas isentas.',

  -- Os DOIS meses candidatos de excesso, sempre gravados.
  -- AMBIGUIDADE JURIDICA REAL: o §9o manda excluir "no mes subsequente a
  -- ocorrencia do excesso", e o excesso do §9o e passar de 4,8 mi
  -- (mes_excesso_limite). O §9o-A apenas ADIA esse efeito para o ano seguinte
  -- quando o excesso final ficar <= 20%. A especificacao em
  -- Regra/regras-cota-aprendizagem.md usa o mes em que passou de 5,76 mi
  -- (mes_excesso_20pct). Para uma empresa que cruza 4,8 mi em maio e 5,76 mi
  -- em setembro, a diferenca e de QUATRO MESES de cota retroativa.
  -- Gravamos os dois e deixamos o criterio parametrizado: se o juridico
  -- decidir pela outra leitura, reapura-se sem reler o SCI.
  `mes_excesso_limite` INT NULL COMMENT 'Primeiro mes com RBA > 4,8 mi (leitura literal do §9o)',
  `mes_excesso_20pct` INT NULL COMMENT 'Primeiro mes com RBA > 5,76 mi (leitura da especificacao)',
  `criterio_mes_excesso` ENUM('MES_LIMITE','MES_20PCT') NOT NULL DEFAULT 'MES_20PCT',
  `data_efeito` DATE NULL
    COMMENT '1o dia do mes seguinte ao fato (§9o) ou 01/01 do ano seguinte (§9o-A / §7o)',

  -- Confiabilidade
  `meses_faltantes` INT NOT NULL DEFAULT 0,
  `meses_faltantes_lista` VARCHAR(60) NULL COMMENT 'Ex.: "1,2,7" — auditabilidade, nao so a contagem',
  `dado_confiavel` TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '0 = ha meses sem dado; a RBA e um piso, nao o valor real',
  `impedimento_societario` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'SUSPEITA de socio PJ no capital (art. 3o §4o, I). SINALIZA e NAO decide: o §4o tem 11 incisos que o banco nao enxerga, e derrubar para Demais por inferencia criaria obrigacao real de contratar aprendizes a partir de um retrato do QSA que pode estar desatualizado.',
  `inicio_atividade` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Empresa aberta no proprio ano: limite e proporcional (art. 3o §2o). Nao proporcionalizamos ainda — apenas sinalizamos para conferencia manual.',
  `revisar_juridico` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Ligado quando os dois meses de excesso divergem, ha suspeita de impedimento, ou o ano e de inicio de atividade',

  -- Deteccao de virada (alimenta a tela e o e-mail)
  `porte_anterior` ENUM('ME','EPP','DEMAIS','SEM_DADOS') NULL,
  `mudou` TINYINT(1) NOT NULL DEFAULT 0,

  `fonte` VARCHAR(20) NOT NULL DEFAULT 'sci'
    COMMENT 'sci = coletado por esta feature | cache-irpf = previa do cache do IRPF, NAO decide cota nem dispara e-mail',
  `calculado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cota_cls_cli_ano_mes` (`cliente_id`, `ano`, `mes`),
  INDEX `idx_cota_cls_bdref` (`bdref`),
  INDEX `idx_cota_cls_mudou` (`bdref`, `mudou`),
  INDEX `idx_cota_cls_porte` (`porte`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Historico mensal de porte ME/EPP/Demais e sujeicao a cota de aprendizagem';

-- ----------------------------------------------------------------------------
-- 3) LOG DE AVISO — deduplicacao do e-mail mensal
-- ----------------------------------------------------------------------------
-- O UNIQUE(bdref) e o que garante UM e-mail por competencia mesmo se o
-- processo reiniciar no minuto do disparo (o guard isRunning e memoria e nao
-- sobrevive a restart). A reserva e feita com INSERT IGNORE ANTES do envio:
-- assim o pior caso e "nao enviou" (visivel na tela) em vez de e-mail
-- duplicado para a diretoria.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cota_aviso_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bdref` INT NOT NULL COMMENT 'YYYYMM da competencia avisada',
  `total_avaliados` INT NOT NULL DEFAULT 0,
  `total_mudancas` INT NOT NULL DEFAULT 0,
  `total_alertas` INT NOT NULL DEFAULT 0,
  `total_sem_dados` INT NOT NULL DEFAULT 0,
  `destinatarios` VARCHAR(500) NULL,
  `enviado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cota_aviso_bdref` (`bdref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Um registro por competencia avisada — dedup do e-mail mensal da cota';
