/**
 * Script para testar conexão com Supabase
 */

import { testConnection } from '../config/database';

async function main() {
  console.log('🔍 Testando conexão com Supabase...');
  
  const isConnected = await testConnection();
  
  if (isConnected) {
    console.log('✅ Teste de conexão concluído com sucesso!');
    process.exit(0);
  } else {
    console.log('❌ Falha no teste de conexão!');
    console.log('Verifique se as variáveis de ambiente estão configuradas corretamente:');
    console.log('- SUPABASE_URL');
    console.log('- SUPABASE_ANON_KEY');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Erro inesperado:', error);
  process.exit(1);
});
