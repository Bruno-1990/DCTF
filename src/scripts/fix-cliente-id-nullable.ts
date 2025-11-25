/**
 * Script para corrigir cliente_id para ser nullable e remover foreign key
 * Executa via conexão MySQL da aplicação
 */

import { getConnection } from '../config/mysql';

async function fixClienteIdNullable() {
  console.log('🔧 Corrigindo cliente_id para ser nullable e removendo foreign key...\n');

  const connection = await getConnection();

  try {
    // 1. Encontrar e remover foreign key
    console.log('1. Removendo foreign key de cliente_id...');
    const [constraints] = await connection.execute(`
      SELECT CONSTRAINT_NAME 
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'dctf_declaracoes' 
        AND REFERENCED_TABLE_NAME = 'clientes'
      LIMIT 1
    `) as [any[], any];

    if (constraints && constraints.length > 0) {
      const constraintName = constraints[0].CONSTRAINT_NAME;
      console.log(`   Encontrada constraint: ${constraintName}`);
      await connection.execute(`ALTER TABLE dctf_declaracoes DROP FOREIGN KEY ${constraintName}`);
      console.log('   ✅ Foreign key removida\n');
    } else {
      console.log('   ℹ️  Nenhuma foreign key encontrada\n');
    }

    // 2. Tornar cliente_id nullable
    console.log('2. Tornando cliente_id nullable...');
    await connection.execute(`
      ALTER TABLE dctf_declaracoes 
      MODIFY COLUMN cliente_id CHAR(36) NULL COMMENT 'ID do cliente (pode ser NULL ou CNPJ formatado do Supabase)'
    `);
    console.log('   ✅ cliente_id agora é nullable\n');

    // 3. Verificar resultado
    console.log('3. Verificando resultado...');
    const [columns] = await connection.execute(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'dctf_declaracoes'
        AND column_name = 'cliente_id'
    `) as [any[], any];

    if (columns && columns.length > 0) {
      const col = columns[0];
      console.log(`   ✅ cliente_id: ${col.data_type}, nullable: ${col.is_nullable}`);
      if (col.is_nullable === 'YES') {
        console.log('   ✅ Correção aplicada com sucesso!\n');
      } else {
        console.log('   ⚠️  Ainda não é nullable - verifique manualmente\n');
      }
    }

    // 4. Verificar se foreign key foi removida
    const [remainingConstraints] = await connection.execute(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dctf_declaracoes'
        AND REFERENCED_TABLE_NAME = 'clientes'
    `) as [any[], any];

    if (remainingConstraints && remainingConstraints.length > 0) {
      console.log('   ⚠️  Ainda há foreign keys - verifique manualmente');
    } else {
      console.log('   ✅ Nenhuma foreign key restante\n');
    }

    console.log('✅ Processo concluído!');
    console.log('\n📝 Próximos passos:');
    console.log('   1. Teste a sincronização novamente');
    console.log('   2. Os registros com cliente_id NULL devem ser inseridos sem erros');

  } catch (err: any) {
    console.error('❌ Erro ao executar correção:', err.message);
    process.exit(1);
  } finally {
    connection.release();
  }
}

fixClienteIdNullable();

