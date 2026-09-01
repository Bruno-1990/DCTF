-- ============================================================================
-- MIGRACAO 050: SO O DARF NUMERADO — E EXCLUSAO QUE NAO APAGA
-- ============================================================================
-- Duas mudancas independentes, na mesma migracao porque tocam a mesma tabela.
--
-- 1. O DARF AVULSO (SICALC) SAIU
--    A aba passou a emitir apenas o DARF numerado da DCTFWeb. O avulso chegou a
--    ser implementado e foi retirado a pedido: na rotina trabalhista ele e
--    sempre o documento errado, porque contribuicao previdenciaria e de
--    terceiros se declara na DCTFWeb e so a guia dela quita a declaracao.
--    Com ele saem ~20 colunas que so o Sicalc preenchia (codigo de receita,
--    consolidacao, multa e juros discriminados, dados de ganho de capital).
--    Deixa-las seria manter schema morto — e schema morto e o que faz o
--    proximo a mexer achar que a funcionalidade ainda existe.
--
-- 2. EXCLUIR PASSA A SER LOGICO
--    Em 31/08/2026 uma linha do historico (id=1, um DARF de teste) desapareceu
--    sem deixar rastro. O unico caminho que apaga e o DELETE da rota, entao
--    alguem clicou na lixeira — mas nao ha como saber quem, nem quando, nem
--    recuperar o documento. Para uma tabela de DOCUMENTOS FISCAIS, com o PDF
--    guardado dentro, isso e inaceitavel: o PDF e a unica copia do que foi
--    entregue ao cliente, e reemitir depois nao devolve o mesmo papel.
--    Passa a valer o mesmo principio ja adotado no cadastro de clientes:
--    inativar, nunca excluir.
--
-- Idempotente: cada passo checa o information_schema antes de agir.
-- ============================================================================

USE DCTF_WEB;

-- ─── 1. Exclusao logica ────────────────────────────────────────────────────
-- Vem ANTES da limpeza de colunas de proposito: e ela que permite tirar as
-- linhas do Sicalc de circulacao sem destrui-las.

SET @tem = (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
               AND column_name = 'excluido_em');
SET @sql = IF(@tem = 0,
  'ALTER TABLE darfs_emitidos
     ADD COLUMN excluido_em TIMESTAMP NULL DEFAULT NULL
       COMMENT ''Preenchido = fora da lista. O documento e o PDF continuam aqui.'',
     ADD COLUMN excluido_por VARCHAR(120) NULL
       COMMENT ''Quem pediu a exclusao — o rastro que faltou em 31/08/2026'',
     ADD COLUMN motivo_exclusao VARCHAR(255) NULL',
  'SELECT "colunas de exclusao ja existem" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- O indice cobre a consulta que a tela faz o tempo todo: "os nao excluidos,
-- mais novo primeiro".
SET @tem = (SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
               AND index_name = 'idx_darfs_vivos');
SET @sql = IF(@tem = 0,
  'ALTER TABLE darfs_emitidos ADD INDEX idx_darfs_vivos (excluido_em, criado_em DESC)',
  'SELECT "indice ja existe" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ─── 2. Tira as linhas do Sicalc de circulacao ─────────────────────────────
-- Sao emissoes de teste feitas na validacao da integracao. Nao sao apagadas:
-- ficam marcadas, com motivo, e o PDF segue guardado.
--
-- ATENCAO AO `categoria IS NULL`. Ele parece redundante ao lado do filtro por
-- `origem`, e nao e: na primeira versao desta migracao a guarda era so o
-- `IF(@tem_origem = 1, ...)`, e numa segunda execucao — na mesma sessao em que
-- o DDL do passo 4 ja tinha rodado — a leitura do information_schema saiu
-- errada e o UPDATE varreu as QUATRO guias de DCTFWeb junto (01/09/2026, 08:58).
-- Guarda de metadado e fragil depois de DDL; guarda semantica nao e. Toda guia
-- de DCTFWeb tem `categoria` preenchida e nenhuma linha do Sicalc tinha, entao
-- com esta condicao o passo NAO CONSEGUE alcancar um documento numerado, mesmo
-- que o IF externo degrade.

SET @tem_origem = (SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
                      AND column_name = 'origem');
SET @sql = IF(@tem_origem = 1,
  'UPDATE darfs_emitidos
      SET excluido_em = NOW(),
          excluido_por = ''migracao 050'',
          motivo_exclusao = ''DARF avulso (Sicalc) descontinuado — a aba emite so o numerado''
    WHERE origem = ''sicalc''
      AND categoria IS NULL
      AND excluido_em IS NULL',
  'SELECT "coluna origem ja removida" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ─── 3. Derruba as colunas que so o Sicalc usava ───────────────────────────
-- Depois do passo 2 elas estao NULL em toda linha ativa, entao a queda nao
-- perde informacao de nenhum documento em uso.

SET @tem = (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
               AND column_name = 'codigo_receita');
SET @sql = IF(@tem = 1,
  'ALTER TABLE darfs_emitidos
     DROP COLUMN codigo_receita,
     DROP COLUMN codigo_receita_extensao,
     DROP COLUMN descricao_receita,
     DROP COLUMN tipo_pa,
     DROP COLUMN data_pa,
     DROP COLUMN numero_referencia,
     DROP COLUMN cota,
     DROP COLUMN valor_multa,
     DROP COLUMN valor_juros,
     DROP COLUMN percentual_multa,
     DROP COLUMN percentual_juros,
     DROP COLUMN termo_inicial_juros,
     DROP COLUMN data_consolidacao,
     DROP COLUMN data_validade_calculo,
     DROP COLUMN uf,
     DROP COLUMN municipio,
     DROP COLUMN observacao,
     DROP COLUMN ganho_capital,
     DROP COLUMN data_alienacao,
     DROP COLUMN cno,
     DROP COLUMN cnpj_prestador',
  'SELECT "colunas do sicalc ja removidas" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ─── 4. `origem` perde a razao de existir ──────────────────────────────────
-- Com uma via so, a coluna teria sempre o mesmo valor. Fica DEPOIS do passo 2,
-- que e quem precisava dela.

SET @sql = IF(@tem_origem = 1,
  'ALTER TABLE darfs_emitidos DROP COLUMN origem',
  'SELECT "coluna origem ja removida" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @tem = (SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'darfs_emitidos'
               AND index_name = 'idx_darfs_origem_data');
SET @sql = IF(@tem > 0,
  'ALTER TABLE darfs_emitidos DROP INDEX idx_darfs_origem_data',
  'SELECT "indice de origem ja removido" AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
