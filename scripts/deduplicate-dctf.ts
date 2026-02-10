/**
 * Script para detectar e remover duplicados em dctf_declaracoes
 * Execute: npx tsx scripts/deduplicate-dctf.ts
 */

import { DCTFDeduplicationService } from '../src/services/DCTFDeduplicationService';

async function main() {
  console.log('='.repeat(80));
  console.log('DEDUPLICAÇÃO DE REGISTROS DCTF');
  console.log('='.repeat(80));
  console.log();

  const service = new DCTFDeduplicationService();

  // 1. Detectar duplicados
  console.log('📊 ETAPA 1: Detectando duplicados...');
  console.log('-'.repeat(80));
  
  const detectResult = await service.detectDuplicates();
  
  if (!detectResult.success) {
    console.error('❌ Erro ao detectar duplicados:', detectResult.error);
    process.exit(1);
  }

  const duplicates = detectResult.data || [];
  
  if (duplicates.length === 0) {
    console.log('✅ Nenhum duplicado encontrado!');
    console.log();
    process.exit(0);
  }

  console.log(`\n⚠️  Encontrados ${duplicates.length} grupos de duplicados:\n`);
  
  // Mostrar primeiros 10 grupos
  const showCount = Math.min(10, duplicates.length);
  for (let i = 0; i < showCount; i++) {
    const group = duplicates[i];
    console.log(`  ${i + 1}. CNPJ: ${group.cnpj} | Período: ${group.periodo_apuracao} | Data: ${group.data_transmissao}`);
    console.log(`     → ${group.count} registros duplicados`);
    console.log(`     → IDs: ${group.ids.slice(0, 3).join(', ')}${group.ids.length > 3 ? '...' : ''}`);
    console.log();
  }

  if (duplicates.length > 10) {
    console.log(`  ... e mais ${duplicates.length - 10} grupos\n`);
  }

  const totalDuplicateRecords = duplicates.reduce((sum, g) => sum + g.count, 0);
  console.log(`📈 Total de registros envolvidos: ${totalDuplicateRecords}`);
  console.log();

  // 2. Simulação (Dry Run)
  console.log('🧪 ETAPA 2: Simulando remoção (Dry Run)...');
  console.log('-'.repeat(80));
  
  const dryRunResult = await service.removeDuplicates(true);
  
  if (!dryRunResult.success) {
    console.error('❌ Erro na simulação:', dryRunResult.error);
    process.exit(1);
  }

  const dryRunData = dryRunResult.data!;
  console.log(`\n📊 Resultado da simulação:`);
  console.log(`   • Grupos processados: ${dryRunData.groupsProcessed}`);
  console.log(`   • Registros que seriam removidos: ${dryRunData.recordsRemoved}`);
  console.log(`   • Erros: ${dryRunData.errors}`);
  console.log();

  // 3. Confirmação para executar
  console.log('⚠️  ATENÇÃO: A próxima etapa irá DELETAR os registros duplicados!');
  console.log('   Apenas os registros mais recentes serão mantidos.');
  console.log();
  console.log('   Para executar a remoção, execute:');
  console.log('   npx tsx scripts/deduplicate-dctf.ts --execute');
  console.log();

  const shouldExecute = process.argv.includes('--execute');

  if (!shouldExecute) {
    console.log('ℹ️  Execução interrompida (modo simulação).');
    console.log('   Nenhum registro foi modificado.');
    console.log();
    process.exit(0);
  }

  // 4. Executar remoção
  console.log('🗑️  ETAPA 3: Removendo duplicados...');
  console.log('-'.repeat(80));
  
  const removeResult = await service.removeDuplicates(false);
  
  if (!removeResult.success) {
    console.error('❌ Erro ao remover duplicados:', removeResult.error);
    process.exit(1);
  }

  const removeData = removeResult.data!;
  console.log(`\n✅ Deduplicação concluída com sucesso!`);
  console.log(`   • Grupos processados: ${removeData.groupsProcessed}`);
  console.log(`   • Registros removidos: ${removeData.recordsRemoved}`);
  console.log(`   • Erros: ${removeData.errors}`);
  console.log();

  // 5. Criar constraint UNIQUE
  console.log('🔒 ETAPA 4: Criando constraint UNIQUE para prevenir futuros duplicados...');
  console.log('-'.repeat(80));
  
  const constraintResult = await service.createUniqueConstraint();
  
  if (!constraintResult.success) {
    console.error('⚠️  Aviso: Não foi possível criar a constraint:', constraintResult.error);
    console.log('   A deduplicação foi concluída, mas novos duplicados podem ser criados.');
  } else {
    console.log('\n✅ Constraint UNIQUE criada com sucesso!');
    console.log('   Novos duplicados serão bloqueados automaticamente.');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('PROCESSO CONCLUÍDO COM SUCESSO! ✨');
  console.log('='.repeat(80));
  console.log();
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
