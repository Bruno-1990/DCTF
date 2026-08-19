-- Migration 042: status Ativo/Inativo do cliente no DCTF.
--
-- Motivacao: clientes que sairam da carteira continuavam na base do DCTF sem
-- nenhuma marcacao, misturados aos ativos em toda listagem e relatorio.
-- A fonte de verdade de quem ainda e cliente e o OneClick; aqui guardamos o
-- espelho local. NADA e excluido: inativar preserva DCTFs, IRPF, cota e
-- historico ja vinculados ao cliente (~3.2 mil registros em 18 tabelas).
--
-- `inativado_origem` distingue quem inativou: 'oneclick' (sincronizacao
-- automatica) ou 'manual' (usuario pela tela). Isso evita que a sincronizacao
-- reative um cliente que o usuario inativou de proposito.

ALTER TABLE clientes
  ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE clientes
  ADD COLUMN inativado_em DATETIME NULL;

ALTER TABLE clientes
  ADD COLUMN inativado_motivo VARCHAR(255) NULL;

ALTER TABLE clientes
  ADD COLUMN inativado_origem VARCHAR(20) NULL;

CREATE INDEX idx_clientes_ativo ON clientes (ativo);
