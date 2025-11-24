/**
 * Script para testar conexão com MySQL
 */

// Carregar variáveis de ambiente do arquivo .env
import 'dotenv/config';

import { testMySQLConnection } from '../config/mysql';

async function main() {
  console.log('🔍 Testando conexão com MySQL...');
  
  const isConnected = await testMySQLConnection();
  
  if (isConnected) {
    console.log('✅ Teste de conexão concluído com sucesso!');
    process.exit(0);
  } else {
    console.log('❌ Falha no teste de conexão!');
    console.log('Verifique se as variáveis de ambiente estão configuradas corretamente:');
    console.log('- MYSQL_HOST');
    console.log('- MYSQL_PORT');
    console.log('- MYSQL_USER');
    console.log('- MYSQL_PASSWORD');
    console.log('- MYSQL_DATABASE');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Erro inesperado:', error);
  process.exit(1);
});

