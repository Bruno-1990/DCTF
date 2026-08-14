-- ============================================================================
-- MIGRACAO 037: HISTORICO DE ALTERACOES VINDAS DO CARTAO CNPJ (ReceitaWS)
-- ============================================================================
-- Registra, campo a campo, tudo que a atualizacao pela ReceitaWS mudou no
-- cadastro: valor anterior, valor novo, quando e por qual fluxo.
--
-- Serve para responder "o que mudou desde a ultima atualizacao da Receita?"
-- sem precisar recalcular nada e sem gastar consulta na API.
--
-- Pode ser executado mais de uma vez (CREATE TABLE IF NOT EXISTS).
-- ============================================================================

USE DCTF_WEB;

CREATE TABLE IF NOT EXISTS clientes_receita_historico (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  cliente_id    VARCHAR(36)  NOT NULL COMMENT 'FK logica para clientes.id',
  cnpj_limpo    VARCHAR(14)  NULL     COMMENT 'CNPJ sem formatacao, para busca',
  razao_social  VARCHAR(255) NULL     COMMENT 'Razao social no momento da alteracao',
  tipo          VARCHAR(30)  NOT NULL COMMENT 'campo | socio_novo | socio_qualificacao | socio_fora_cartao',
  campo         VARCHAR(120) NOT NULL COMMENT 'Coluna alterada ou nome do socio',
  valor_antes   TEXT         NULL,
  valor_depois  TEXT         NULL,
  origem        VARCHAR(40)  NOT NULL COMMENT 'lote-cartao-cnpj | aplicar-simulacao | import-individual',
  aplicado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_hist_cliente (cliente_id),
  INDEX idx_hist_aplicado_em (aplicado_em),
  INDEX idx_hist_campo (campo),
  INDEX idx_hist_cnpj (cnpj_limpo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Historico de alteracoes aplicadas pelo cartao CNPJ (ReceitaWS)';
