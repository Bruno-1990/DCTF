-- ============================================================================
-- MIGRAÇÃO 057: PAINEL DE AGENDAMENTOS
-- ============================================================================
-- POR QUE ESTAS TABELAS EXISTEM
--
-- Até aqui, dia/hora dos jobs e destinatários dos e-mails moravam no .env, lidos
-- UMA vez na carga do módulo (`const DIA = Number(process.env['COTA_SCHEDULER_DIA'] || 5)`).
-- Duas consequências: só quem tem acesso ao servidor conseguia mudar, e qualquer
-- mudança exigia reiniciar o serviço. O painel administrativo passa a editar
-- estas tabelas, e os schedulers passam a lê-las a cada verificação.
--
-- O .env continua valendo como SEMENTE: na primeira subida, o que estiver lá
-- (ou o padrão do código) vira a primeira linha. Depois disso quem manda é aqui.
--
-- O CATÁLOGO (nome, descrição, tipo de janela, listas de e-mail) fica no código,
-- em src/services/agendamentos/catalogo.ts — muda junto com o job. Aqui ficam só
-- QUANDO roda e PARA QUEM avisa, que é o que a tela edita.
--
-- Uso: npm run migrate:agendamentos
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Quando cada job roda. A chave é o id do catálogo (kebab-case), não um
-- auto_increment: o painel é montado a partir do catálogo, e é o id que liga as
-- duas pontas. Sem linha aqui, vale a semente — job novo não fica travado.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agendamentos (
  id VARCHAR(60) NOT NULL COMMENT 'id do catálogo, ex.: cota-aprendizagem',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  -- Dia do mês, só para janela mensal. Limitado a 1-28 na aplicação: com 29 a 31,
  -- o mês que não tem o dia ficaria sem execução, em silêncio.
  dia TINYINT UNSIGNED NULL DEFAULT NULL,
  hora TINYINT UNSIGNED NULL DEFAULT NULL,
  minuto TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- CSV de getDay() (0=dom … 6=sáb), só para janela semanal (DET). Guardado como
  -- texto porque é lista curta e é assim que o DET_SCHEDULER_DIAS já vinha do .env.
  dias_semana VARCHAR(20) NULL DEFAULT NULL,
  atualizado_por VARCHAR(120) NULL DEFAULT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Horário e liga/desliga de cada job — editado pelo painel administrativo';

-- ---------------------------------------------------------------------------
-- Destinatários. Uma linha por endereço (e não uma coluna com a lista separada
-- por vírgula, como era no .env): assim dá para adicionar e remover um endereço
-- sem reescrever a lista inteira, e o UNIQUE impede o mesmo e-mail duas vezes.
--
-- `lista` existe porque um job pode ter mais de um aviso com públicos
-- diferentes: a cota manda enquadramento para os líderes e cota para o DP.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agendamento_emails (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agendamento_id VARCHAR(60) NOT NULL,
  lista VARCHAR(60) NOT NULL COMMENT 'chave da lista no catálogo, ex.: enquadramento',
  email VARCHAR(190) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por VARCHAR(120) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_agendamento_email (agendamento_id, lista, email),
  KEY idx_agendamento_lista (agendamento_id, lista),
  CONSTRAINT fk_agendamento_email FOREIGN KEY (agendamento_id)
    REFERENCES agendamentos (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Para quem cada aviso é enviado — editado pelo painel administrativo';

-- ---------------------------------------------------------------------------
-- Rastro das mudanças. Mexer no horário de um job de produção é mudança de
-- comportamento do sistema: sem registro, "por que o e-mail da cota chegou dia
-- 8?" não tem resposta. Guarda o antes e o depois, em texto.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agendamento_alteracoes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agendamento_id VARCHAR(60) NOT NULL,
  campo VARCHAR(40) NOT NULL COMMENT 'ativo, dia, hora, minuto, dias_semana ou email',
  valor_anterior VARCHAR(255) NULL DEFAULT NULL,
  valor_novo VARCHAR(255) NULL DEFAULT NULL,
  alterado_por VARCHAR(120) NULL DEFAULT NULL,
  alterado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alteracao_agendamento (agendamento_id, alterado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Histórico de quem mudou horário/destinatário e quando';

-- ============================================================================
-- FIM — a semeadura a partir do .env é feita pela aplicação, na subida
-- (src/services/agendamentos/AgendamentoConfigService.ts), e não aqui: os
-- valores em vigor estão no .env do servidor, não neste arquivo versionado.
-- ============================================================================
