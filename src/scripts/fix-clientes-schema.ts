/**
 * Script para corrigir problemas encontrados na estrutura da tabela clientes
 */

import 'dotenv/config';
import { getConnection } from '../config/mysql';

async function fixClientesSchema() {
  console.log('🔧 Corrigindo estrutura da tabela clientes...\n');
  const connection = await getConnection();

  try {
    // 1. Corrigir cnpj_limpo para permitir NULL
    console.log('📝 Corrigindo cnpj_limpo para permitir NULL...');
    await connection.execute(`ALTER TABLE \`clientes\` MODIFY COLUMN \`cnpj_limpo\` VARCHAR(14) NULL`);
    console.log('✅ cnpj_limpo corrigido\n');

    // 2. Corrigir endereco de TEXT para VARCHAR(500)
    console.log('📝 Corrigindo endereco de TEXT para VARCHAR(500)...');
    await connection.execute(`ALTER TABLE \`clientes\` MODIFY COLUMN \`endereco\` VARCHAR(500) NULL`);
    console.log('✅ endereco corrigido\n');

    console.log('✅ Todas as correções aplicadas com sucesso!');
  } catch (error: any) {
    console.error('❌ Erro ao corrigir schema:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  fixClientesSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    });
}

export default fixClientesSchema;


