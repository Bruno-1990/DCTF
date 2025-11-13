/**
 * Script para importar clientes a partir do arquivo CSV
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
  [key: string]: string; // Para permitir outras colunas
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

async function importClientes(): Promise<void> {
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

  console.log('🔄 Processando e importando clientes...');
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      const razaoSocial = row['Razão Social ']?.trim();
      const cnpjFormatted = row['Número de Identificação']?.trim();
      
      // Validar campos obrigatórios
      if (!razaoSocial || !cnpjFormatted) {
        console.warn(`⚠️  Linha ${i + 2}: Campos inválidos - Razão Social: "${razaoSocial}", CNPJ: "${cnpjFormatted}"`);
        skipCount++;
        continue;
      }

      const cnpj = formatCNPJ(cnpjFormatted);
      
      // Verificar se cliente já existe
      const existingResult = await clienteModel.findByCNPJ(cnpj);
      
      if (existingResult.success && existingResult.data) {
        console.log(`⏭️  Cliente já existe (CNPJ: ${cnpj}): ${razaoSocial}`);
        skipCount++;
        continue;
      }

      // Limpar CNPJ antes de salvar
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      
      // Criar cliente
      const result = await clienteModel.createCliente({
        razao_social: razaoSocial,
        cnpj_limpo: cnpjLimpo,
      });

      if (result.success) {
        successCount++;
        console.log(`✅ Importado: ${razaoSocial} (${cnpj})`);
      } else {
        errorCount++;
        const errorMsg = `Linha ${i + 2}: ${result.error || 'Erro desconhecido'}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    } catch (error) {
      errorCount++;
      const errorMsg = `Linha ${i + 2}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
      errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }
  }

  console.log('\n📊 Resumo da importação:');
  console.log(`✅ Sucesso: ${successCount}`);
  console.log(`⏭️  Ignorados (já existem): ${skipCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Detalhes dos erros:');
    errors.forEach(err => console.log(`   - ${err}`));
  }
  
  console.log('\n✨ Importação concluída!');
}

// Executar importação
importClientes()
  .then(() => {
    console.log('✅ Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
