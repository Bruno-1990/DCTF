/**
 * Migração programática (MySQL) para adicionar campos de cadastro (ReceitaWS) em `clientes`
 * e criar a tabela `clientes_socios`.
 *
 * Motivo:
 * - Em alguns ambientes, as migrations SQL do diretório docs/ não foram aplicadas.
 * - Este script usa a conexão MySQL do projeto e roda de forma idempotente.
 *
 * Execute:
 * - npm run migrate:clientes-receitaws
 */

import 'dotenv/config';
import { getConnection } from '../config/mysql';

type ColumnInfo = { Field: string };

async function getColumns(connection: any, table: string): Promise<Set<string>> {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  const cols = new Set<string>();
  for (const r of rows as ColumnInfo[]) cols.add(String(r.Field));
  return cols;
}

async function tableExists(connection: any, table: string): Promise<boolean> {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number((rows as any[])[0]?.cnt || 0) > 0;
}

async function addColumnIfMissing(connection: any, table: string, column: string, ddl: string) {
  const cols = await getColumns(connection, table);
  if (cols.has(column)) return;
  console.log(`➕ Adicionando coluna ${table}.${column}...`);
  await connection.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
}

async function migrateClientesReceitaWS() {
  console.log('🔧 Migrando schema de clientes para ReceitaWS...\n');
  const connection = await getConnection();

  try {
    // Garantir banco (o pool já está conectado no database, mas manter seguro)
    await connection.query('SELECT DATABASE()');

    // 1) Colunas novas em clientes
    const table = 'clientes';
    const clientesExists = await tableExists(connection, table);
    if (!clientesExists) throw new Error('Tabela `clientes` não existe no banco atual.');

    // Campos principais
    await addColumnIfMissing(connection, table, 'fantasia', '`fantasia` VARCHAR(255) NULL');
    await addColumnIfMissing(connection, table, 'tipo_estabelecimento', '`tipo_estabelecimento` VARCHAR(30) NULL');
    await addColumnIfMissing(connection, table, 'situacao_cadastral', '`situacao_cadastral` VARCHAR(50) NULL');
    await addColumnIfMissing(connection, table, 'porte', '`porte` VARCHAR(80) NULL');
    await addColumnIfMissing(connection, table, 'natureza_juridica', '`natureza_juridica` VARCHAR(120) NULL');
    await addColumnIfMissing(connection, table, 'abertura', '`abertura` DATE NULL');
    await addColumnIfMissing(connection, table, 'data_situacao', '`data_situacao` DATE NULL');
    await addColumnIfMissing(connection, table, 'motivo_situacao', '`motivo_situacao` VARCHAR(255) NULL');
    await addColumnIfMissing(connection, table, 'situacao_especial', '`situacao_especial` VARCHAR(255) NULL');
    await addColumnIfMissing(connection, table, 'data_situacao_especial', '`data_situacao_especial` DATE NULL');
    await addColumnIfMissing(connection, table, 'efr', '`efr` VARCHAR(255) NULL');

    // CNAE
    await addColumnIfMissing(connection, table, 'atividade_principal_code', '`atividade_principal_code` VARCHAR(20) NULL');
    await addColumnIfMissing(connection, table, 'atividade_principal_text', '`atividade_principal_text` VARCHAR(255) NULL');
    await addColumnIfMissing(connection, table, 'atividades_secundarias', '`atividades_secundarias` JSON NULL');

    // Endereço detalhado
    await addColumnIfMissing(connection, table, 'logradouro', '`logradouro` VARCHAR(255) NULL');
    await addColumnIfMissing(connection, table, 'numero', '`numero` VARCHAR(30) NULL');
    await addColumnIfMissing(connection, table, 'complemento', '`complemento` VARCHAR(255) NULL');
    await addColumnIfMissing(connection, table, 'bairro', '`bairro` VARCHAR(120) NULL');
    await addColumnIfMissing(connection, table, 'municipio', '`municipio` VARCHAR(120) NULL');
    await addColumnIfMissing(connection, table, 'uf', '`uf` VARCHAR(2) NULL');
    await addColumnIfMissing(connection, table, 'cep', '`cep` VARCHAR(20) NULL');

    // Contato Receita
    await addColumnIfMissing(connection, table, 'receita_email', '`receita_email` VARCHAR(255) NULL');
    await addColumnIfMissing(connection, table, 'receita_telefone', '`receita_telefone` VARCHAR(255) NULL');

    // Tipo de empresa (Matriz ou Filial)
    await addColumnIfMissing(connection, table, 'tipo_empresa', '`tipo_empresa` VARCHAR(20) NULL COMMENT "Tipo de empresa: Matriz ou Filial"');
    
    // Regimes
    await addColumnIfMissing(connection, table, 'capital_social', '`capital_social` DECIMAL(15,2) NULL');
    await addColumnIfMissing(connection, table, 'regime_tributario', '`regime_tributario` VARCHAR(50) NULL COMMENT "Regime tributário selecionado: Simples Nacional, Lucro Presumido, Lucro Real, A Definir"');
    await addColumnIfMissing(connection, table, 'simples_optante', '`simples_optante` BOOLEAN NULL');
    await addColumnIfMissing(connection, table, 'simples_data_opcao', '`simples_data_opcao` DATE NULL');
    await addColumnIfMissing(connection, table, 'simples_data_exclusao', '`simples_data_exclusao` DATE NULL');
    await addColumnIfMissing(connection, table, 'simei_optante', '`simei_optante` BOOLEAN NULL');
    await addColumnIfMissing(connection, table, 'simei_data_opcao', '`simei_data_opcao` DATE NULL');
    await addColumnIfMissing(connection, table, 'simei_data_exclusao', '`simei_data_exclusao` DATE NULL');

    // Metadados ReceitaWS
    await addColumnIfMissing(connection, table, 'receita_ws_status', '`receita_ws_status` VARCHAR(20) NULL');
    await addColumnIfMissing(connection, table, 'receita_ws_message', '`receita_ws_message` TEXT NULL');
    await addColumnIfMissing(connection, table, 'receita_ws_consulta_em', '`receita_ws_consulta_em` TIMESTAMP NULL');
    await addColumnIfMissing(connection, table, 'receita_ws_ultima_atualizacao', '`receita_ws_ultima_atualizacao` TIMESTAMP NULL');
    await addColumnIfMissing(connection, table, 'receita_ws_payload', '`receita_ws_payload` JSON NULL');

    // Ajustar tamanho da coluna telefone (pode vir múltiplos telefones concatenados da ReceitaWS)
    const cols = await getColumns(connection, table);
    if (cols.has('telefone')) {
      const [colInfo] = await connection.query(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'telefone'`,
        [table]
      );
      const colType = (colInfo as any[])[0]?.COLUMN_TYPE || '';
      // Se for VARCHAR(20) ou menor, aumentar para VARCHAR(255)
      if (colType.includes('varchar(20)') || colType.includes('varchar(15)') || colType.includes('varchar(10)')) {
        console.log('📏 Aumentando tamanho da coluna telefone para VARCHAR(255)...');
        await connection.execute(`ALTER TABLE \`${table}\` MODIFY COLUMN \`telefone\` VARCHAR(255) NULL`);
      }
    }

    // Índices úteis (idempotentes via SHOW INDEX)
    const ensureIndex = async (idxName: string, ddl: string) => {
      const [idxRows] = await connection.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [idxName]);
      if (Array.isArray(idxRows) && idxRows.length > 0) return;
      console.log(`📌 Criando índice ${idxName}...`);
      await connection.execute(ddl);
    };
    await ensureIndex('idx_clientes_uf', `CREATE INDEX idx_clientes_uf ON \`${table}\`(uf)`);
    await ensureIndex('idx_clientes_municipio', `CREATE INDEX idx_clientes_municipio ON \`${table}\`(municipio)`);
    await ensureIndex('idx_clientes_situacao_cadastral', `CREATE INDEX idx_clientes_situacao_cadastral ON \`${table}\`(situacao_cadastral)`);

    // 2) Tabela de sócios
    const sociosTable = 'clientes_socios';
    const sociosExists = await tableExists(connection, sociosTable);
    if (!sociosExists) {
      console.log('🧩 Criando tabela clientes_socios...');
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS \`${sociosTable}\` (
          id CHAR(36) PRIMARY KEY COMMENT 'UUID',
          cliente_id CHAR(36) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          qual VARCHAR(120) NULL,
          participacao_percentual DECIMAL(5,2) NULL COMMENT 'Porcentagem de participação do sócio no capital social',
          participacao_valor DECIMAL(15,2) NULL COMMENT 'Valor da participação calculado (capital_social * participacao_percentual / 100)',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_clientes_socios_cliente_id (cliente_id),
          INDEX idx_clientes_socios_nome (nome),
          CONSTRAINT fk_clientes_socios_cliente_id FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      // Adicionar campos de participação se a tabela já existe
      await addColumnIfMissing(connection, sociosTable, 'participacao_percentual', '`participacao_percentual` DECIMAL(5,2) NULL COMMENT \'Porcentagem de participação do sócio no capital social\'');
      await addColumnIfMissing(connection, sociosTable, 'participacao_valor', '`participacao_valor` DECIMAL(15,2) NULL COMMENT \'Valor da participação calculado (capital_social * participacao_percentual / 100)\'');
    }

    console.log('\n✅ Migração concluída com sucesso!');
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrateClientesReceitaWS()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro na migração:', err);
      process.exit(1);
    });
}

export default migrateClientesReceitaWS;


