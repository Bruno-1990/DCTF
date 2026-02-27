/**
 * Verifica se há IDs duplicados na tabela dctf_declaracoes do Supabase.
 * Se houver, só 919 (ou menos) registros únicos podem ser inseridos no MySQL.
 *
 * Uso: npx ts-node src/scripts/verificar-duplicatas-id-supabase.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const { supabaseAdmin, supabase } = await import('../config/database');
  const client = supabaseAdmin || supabase;
  if (!client) {
    console.error('Supabase não configurado (SUPABASE_URL e SUPABASE_ANON_KEY no .env).');
    process.exit(1);
  }

  console.log('\n=== Verificação de IDs duplicados no Supabase (dctf_declaracoes) ===\n');

  const { data: rows, error } = await client
    .from('dctf_declaracoes')
    .select('id')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao buscar registros:', error.message);
    process.exit(1);
  }

  const total = rows?.length ?? 0;
  const byId = new Map<string, number>();
  for (const r of rows || []) {
    const id = r?.id;
    if (id) byId.set(id, (byId.get(id) || 0) + 1);
  }

  const duplicateIds = [...byId.entries()].filter(([, count]) => count > 1);
  const uniqueCount = byId.size;

  console.log(`Total de linhas no Supabase: ${total}`);
  console.log(`IDs únicos: ${uniqueCount}`);
  console.log(`IDs duplicados (aparecem mais de uma vez): ${duplicateIds.length}`);
  console.log('');

  if (duplicateIds.length > 0) {
    console.log('IDs que se repetem (por isso só 1 registro de cada é inserido no MySQL):');
    for (const [id, count] of duplicateIds) {
      console.log(`  - ${id} (${count} vezes)`);
    }
    console.log('');
    console.log(`→ No MySQL serão inseridos no máximo ${uniqueCount} registros (não ${total}).`);
    console.log('  Para ter os 925 inseridos, é preciso dar novos IDs às linhas duplicadas no Supabase ou remover duplicatas.');
  } else {
    console.log('Nenhum ID duplicado. Se a sync ainda traz 919, verifique se o MySQL estava realmente vazio (mesmo .env).');
  }
  console.log('');
  process.exit(0);
}

main();
