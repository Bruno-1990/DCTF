-- 044 — REOA: registro de execução da coleta mensal
--
-- O `UNIQUE(bdref)` é a trava que impede a competência ser processada duas
-- vezes. A reserva é feita por INSERT IGNORE ANTES da coleta começar: uma
-- varredura leva minutos (uma SP_BI_FAT por cliente, serializadas), e sem a
-- reserva antecipada um restart no meio faria tudo recomeçar do zero na volta.
--
-- Linha com `concluido_em` NULL = coleta que começou e não terminou. Ela NÃO é
-- retentada automaticamente, de propósito: se o SCI derrubou a rodada, repetir
-- sozinho no minuto seguinte só repete a queda. A saída é a execução manual
-- (POST /api/beneficios/substituto/coletar), com alguém olhando o motivo.
--
-- O serviço cria esta tabela sob demanda (`ensureLogTable` no
-- SubstitutoScheduler); esta migration existe para o histórico e para bases
-- criadas fora do app.

CREATE TABLE IF NOT EXISTS reoa_execucao_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  bdref INT NOT NULL,
  iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em TIMESTAMP NULL DEFAULT NULL,
  total_clientes INT NOT NULL DEFAULT 0,
  coletados INT NOT NULL DEFAULT 0,
  erros INT NOT NULL DEFAULT 0,
  com_alerta INT NOT NULL DEFAULT 0,
  email_enviado TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_reoa_exec_bdref (bdref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
