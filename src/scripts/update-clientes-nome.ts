/**
 * Script para atualizar os nomes (Razão Social) dos clientes existentes no banco
 * a partir do arquivo CSV
 * Formato: Número de Identificação;CNPJ LIMPO;Razão Social
 */

import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import { Cliente } from '../models/Cliente';
import { supabase } from '../config/database';

interface CSVRow {
  'Número de Identificação': string;
  'CNPJ LIMPO': string;
  'Razão Social ': string; // Note o espaço no final
  [key: string]: string;
}

function formatCNPJ(cnpj: string): string {
  // Remove tudo que não é dígito
  const clean = cnpj.replace(/\D/g, '');
  
  // Se já está no formato correto, retorna
  if (clean.length === 14) {
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
  }
  
  return cnpj; // Retorna como está se não conseguir formatar
}

async function updateClientes(): Promise<void> {
  const clienteModel = new Cliente();
  const csvPath = path.join(__dirname, '../../DCTF WEB-DADOS-CLIENTES.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ Arquivo CSV não encontrado:', csvPath);
    process.exit(1);
  }

  console.log('📄 Lendo arquivo CSV...');
  const rows: CSVRow[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath, { encoding: 'latin1' })
      .pipe(csvParser({ separator: ';' }))
      .on('data', (row: CSVRow) => {
        rows.push(row);
      })
      .on('end', () => {
        console.log(`✅ ${rows.length} linhas lidas do CSV`);
        resolve();
      })
      .on('error', (error) => {
        console.error('❌ Erro ao ler CSV:', error);
        reject(error);
      });
  });

  console.log('🔄 Processando clientes existentes no banco...');
  
  // Buscar todos os clientes do banco
  const allClientesResult = await clienteModel.findAll();
  
  if (!allClientesResult.success || !allClientesResult.data) {
    console.error('❌ Erro ao buscar clientes do banco:', allClientesResult.error);
    process.exit(1);
  }

  const clientes = allClientesResult.data;
  console.log(`📊 Encontrados ${clientes.length} clientes no banco de dados`);

  let updatedCount = 0;
  let notFoundCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  // Criar mapa de CNPJ Limpo -> Razão Social do CSV
  const csvMap = new Map<string, string>();
  for (const row of rows) {
    const cnpjLimpo = row['CNPJ LIMPO']?.trim();
    const razaoSocial = row['Razão Social ']?.trim();
    
    if (cnpjLimpo && razaoSocial) {
      // Converter notação científica se necessário e remover formatação
      const cnpjClean = cnpjLimpo.replace(/\D/g, '').replace('E+', '');
      csvMap.set(cnpjClean, razaoSocial);
    }
  }

  console.log(`📋 Mapeados ${csvMap.size} CNPJs com Razão Social no CSV\n`);

  // Atualizar cada cliente
  for (const cliente of clientes) {
    try {
      // Usar cnpj_limpo para comparação
      const cnpjLimpo = cliente.cnpj_limpo || '';
      const csvNome = csvMap.get(cnpjLimpo);
      
      if (!csvNome) {
        console.log(`⚠️  Cliente não encontrado no CSV: ${cnpjLimpo} (atual: ${cliente.razao_social || cliente.nome || 'sem nome'})`);
        notFoundCount++;
        continue;
      }

      // Se o nome já está correto, pular
      const nomeAtual = cliente.razao_social || cliente.nome;
      if (nomeAtual === csvNome) {
        console.log(`⏭️  Nome já está correto: ${csvNome}`);
        skippedCount++;
        continue;
      }

      // Atualizar a razão social
      console.log(`🔄 Atualizando: ${cnpjLimpo}`);
      console.log(`   De: "${nomeAtual || 'sem nome'}"`);
      console.log(`   Para: "${csvNome}"`);
      
      const result = await supabase
        .from('clientes')
        .update({ razao_social: csvNome })
        .eq('id', cliente.id);

      if (!result.error) {
        updatedCount++;
        console.log(`   ✅ Atualizado com sucesso!\n`);
      } else {
        errorCount++;
        const errorMsg = `Erro ao atualizar ${cnpjLimpo}: ${result.error.message}`;
        errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}\n`);
      }
    } catch (error) {
      notFoundCount++;
      const errorMsg = `Cliente ${cliente.id}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
      errors.push(errorMsg);
      console.error(`❌ ${errorMsg}\n`);
    }
  }

  console.log('\n📊 Resumo da atualização:');
  console.log(`✅ Atualizados: ${updatedCount}`);
  console.log(`⏭️  Já estavam corretos: ${skippedCount}`);
  console.log(`⚠️  Não encontrados no CSV: ${notFoundCount}`);
  
  if (errors.length > 0) {
    console.log(`❌ Erros: ${errors.length}`);
    console.log('\n❌ Detalhes dos erros:');
    errors.forEach(err => console.log(`   - ${err}`));
  }
  
  console.log('\n✨ Atualização concluída!');
}

// Executar atualização
updateClientes()
  .then(() => {
    console.log('✅ Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
