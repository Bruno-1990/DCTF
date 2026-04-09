/**
 * Script de teste rápido para verificar duplicados
 * Execute: npx tsx test-deduplication.ts
 */

import { DCTFDeduplicationService } from './src/services/DCTFDeduplicationService';

async function testDetection() {
  console.log('🔍 Testando detecção de duplicados...\n');
  
  const service = new DCTFDeduplicationService();
  const result = await service.detectDuplicates();
  
  if (!result.success) {
    console.error('❌ Erro:', result.error);
    return;
  }
  
  const duplicates = result.data || [];
  
  if (duplicates.length === 0) {
    console.log('✅ Nenhum duplicado encontrado!');
    return;
  }
  
  console.log(`⚠️  Encontrados ${duplicates.length} grupos de duplicados:\n`);
  
  for (const group of duplicates.slice(0, 5)) {
    console.log(`📄 CNPJ: ${group.cnpj}`);
    console.log(`   Período: ${group.periodo_apuracao}`);
    console.log(`   Data: ${group.data_transmissao}`);
    console.log(`   Duplicados: ${group.count} registros`);
    console.log(`   IDs: ${group.ids.join(', ')}`);
    console.log(`   → Manter: ${group.newest_id} (mais recente)`);
    console.log(`   → Remover: ${group.ids.filter(id => id !== group.newest_id).join(', ')}`);
    console.log();
  }
  
  if (duplicates.length > 5) {
    console.log(`... e mais ${duplicates.length - 5} grupos\n`);
  }
  
  const totalRecords = duplicates.reduce((sum, g) => sum + g.count, 0);
  const recordsToRemove = duplicates.reduce((sum, g) => sum + (g.count - 1), 0);
  
  console.log('📊 Resumo:');
  console.log(`   • Total de registros duplicados: ${totalRecords}`);
  console.log(`   • Registros a serem removidos: ${recordsToRemove}`);
  console.log(`   • Registros a manter: ${duplicates.length}`);
  console.log();
  console.log('💡 Para remover os duplicados, execute:');
  console.log('   npx tsx scripts/deduplicate-dctf.ts --execute');
  console.log();
}

testDetection().catch(console.error);
