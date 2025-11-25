/**
 * Script para alinhar schema MySQL com Supabase
 * Executa a migração 006_align_dctf_declaracoes_with_supabase.sql
 */

import { getConnection } from '../config/mysql';
import * as fs from 'fs';
import * as path from 'path';

async function alignSchemas() {
  console.log('🔧 Alinhando schema MySQL com Supabase...\n');

  const connection = await getConnection();

  try {
    // Ler o script SQL
    const sqlPath = path.join(__dirname, '../../docs/migrations/mysql/006_align_dctf_declaracoes_with_supabase.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Remover comentários e dividir em comandos
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => {
        // Remover linhas vazias, comentários e blocos DO
        return cmd.length > 0 
          && !cmd.startsWith('--') 
          && !cmd.startsWith('/*')
          && !cmd.includes('DO $$'); // Pular blocos DO (PostgreSQL)
      });

    console.log(`📝 Executando ${commands.length} comandos SQL...\n`);

    // Primeiro, remover foreign key de cliente_id se existir
    console.log('1. Verificando e removendo foreign key de cliente_id...');
    try {
      const [constraints] = await connection.execute(`
        SELECT CONSTRAINT_NAME 
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'dctf_declaracoes' 
          AND REFERENCED_TABLE_NAME = 'clientes'
      `) as [any[], any];

      if (constraints && constraints.length > 0) {
        const constraintName = constraints[0].CONSTRAINT_NAME;
        console.log(`   Removendo constraint: ${constraintName}`);
        await connection.execute(`ALTER TABLE dctf_declaracoes DROP FOREIGN KEY ${constraintName}`);
        console.log('   ✅ Foreign key removida\n');
      } else {
        console.log('   ℹ️  Nenhuma foreign key encontrada\n');
      }
    } catch (err: any) {
      console.log(`   ⚠️  Erro ao remover foreign key (pode não existir): ${err.message}\n`);
    }

    // 2. Modificar colunas existentes
    console.log('2. Modificando colunas existentes...');
    const modifyCommands = [
      'ALTER TABLE dctf_declaracoes MODIFY COLUMN cliente_id CHAR(36) NULL COMMENT \'ID do cliente (pode ser NULL no Supabase)\'',
      'ALTER TABLE dctf_declaracoes MODIFY COLUMN cnpj VARCHAR(14) NULL COMMENT \'CNPJ da declaração\'',
      'ALTER TABLE dctf_declaracoes MODIFY COLUMN periodo_apuracao VARCHAR(7) NULL COMMENT \'Período de apuração (MM/YYYY)\'',
      'ALTER TABLE dctf_declaracoes MODIFY COLUMN data_transmissao TEXT NULL COMMENT \'Data de transmissão (formato texto)\'',
      'ALTER TABLE dctf_declaracoes MODIFY COLUMN situacao TEXT NULL COMMENT \'Situação da declaração\'',
    ];

    for (const cmd of modifyCommands) {
      try {
        await connection.execute(cmd);
        console.log(`   ✅ ${cmd.substring(30, 60)}...`);
      } catch (err: any) {
        console.log(`   ⚠️  ${err.message}`);
      }
    }
    console.log('');

    // 3. Adicionar colunas que podem não existir
    console.log('3. Adicionando colunas faltantes...');
    const columnsToAdd = [
      { name: 'tipo_ni', type: 'VARCHAR(10)', comment: 'Tipo de identificação (CNPJ, CPF)' },
      { name: 'categoria', type: 'VARCHAR(100)', comment: 'Categoria da declaração' },
      { name: 'origem', type: 'VARCHAR(50)', comment: 'Origem (MIT, eSocial, etc)' },
      { name: 'tipo', type: 'VARCHAR(50)', comment: 'Tipo da declaração' },
      { name: 'debito_apurado', type: 'DECIMAL(15,2)', comment: 'Débito apurado' },
      { name: 'saldo_a_pagar', type: 'DECIMAL(15,2)', comment: 'Saldo a pagar' },
      { name: 'metadados', type: 'TEXT', comment: 'Metadados da declaração (JSON)' },
      { name: 'hora_transmissao', type: 'VARCHAR(8)', comment: 'Hora da transmissão (HH:MM:SS)' },
      { name: 'numero_recibo', type: 'VARCHAR(50)', comment: 'Número do recibo' },
    ];

    // Verificar quais colunas já existem
    const [existingColumns] = await connection.execute(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'dctf_declaracoes'
    `) as [any[], any];

    const existingColumnNames = existingColumns.map((col: any) => col.column_name);

    for (const col of columnsToAdd) {
      if (existingColumnNames.includes(col.name)) {
        console.log(`   ℹ️  Coluna ${col.name} já existe, pulando...`);
        continue;
      }

      try {
        await connection.execute(`
          ALTER TABLE dctf_declaracoes 
          ADD COLUMN \`${col.name}\` ${col.type} NULL COMMENT '${col.comment}'
        `);
        console.log(`   ✅ Coluna ${col.name} adicionada`);
      } catch (err: any) {
        console.error(`   ❌ Erro ao adicionar ${col.name}: ${err.message}`);
      }
    }
    console.log('');

    // 4. Criar índices
    console.log('4. Criando índices...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_dctf_cnpj ON dctf_declaracoes(cnpj)',
      'CREATE INDEX IF NOT EXISTS idx_dctf_periodo_apuracao ON dctf_declaracoes(periodo_apuracao)',
      'CREATE INDEX IF NOT EXISTS idx_dctf_situacao ON dctf_declaracoes(situacao)',
      'CREATE INDEX IF NOT EXISTS idx_dctf_tipo ON dctf_declaracoes(tipo)',
      'CREATE INDEX IF NOT EXISTS idx_dctf_cliente_id ON dctf_declaracoes(cliente_id)',
    ];

    for (const idxCmd of indexes) {
      try {
        await connection.execute(idxCmd);
        console.log(`   ✅ Índice criado`);
      } catch (err: any) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log(`   ℹ️  Índice já existe`);
        } else {
          console.error(`   ❌ Erro: ${err.message}`);
        }
      }
    }
    console.log('');

    // Verificar estrutura final
    console.log('\n📋 Estrutura final da tabela dctf_declaracoes:\n');
    const [columns] = await connection.execute(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'dctf_declaracoes'
      ORDER BY ordinal_position
    `) as [any[], any];

    console.table(columns);

    console.log('\n✅ Migração concluída!');
    console.log('\n📝 Próximos passos:');
    console.log('   1. Teste a sincronização novamente');
    console.log('   2. Verifique os logs de erro para identificar problemas restantes');

  } catch (err: any) {
    console.error('❌ Erro ao executar migração:', err.message);
    process.exit(1);
  } finally {
    connection.release();
  }
}

alignSchemas();

