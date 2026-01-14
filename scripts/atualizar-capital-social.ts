/**
 * Script para atualizar capital_social na tabela clientes
 * usando dados do PDF "RELAÇÃO DE SÓCIOS E CAPITAL.pdf"
 * 
 * Uso: npx ts-node scripts/atualizar-capital-social.ts [--dry-run]
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar .env do diretório raiz
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

import { executeQuery } from '../src/config/mysql';

// Dados do PDF - CNPJ limpo (14 dígitos) -> Capital Social
const dadosPDF: Record<string, number> = {
  "42081159000128": 1000.00,  // A G A P LTDA
  "13845695000154": 10000.00,  // A.C RAUPP SERVICOS ADMINISTRATIVOS
  "11318082000133": 80000.00,  // ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA
  "43340265000141": 1000.00,  // ACBL INFORMACOES LTDA
  "07799121000194": 850000.00,  // ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA
  "47306185000120": 20000.00,  // AI PORT CONSULTORIA LTDA
  "36578434000110": 20000.00,  // ARAME NOBRE INDUSTRIA E COMERCIO LTDA
  "42532281000173": 200000.00,  // ARAUCARIA SERVICOS LTDA
  "63231837000161": 1000.00,  // ARCANA DESIGN LTDA
  "31332375000182": 20000.00,  // ATENTO . GESTAO EM RISCOS E PRODUTIVIDADE LTDA
  "59160869000146": 50000.00,  // AURORA INFORMATICA COMERCIO IMPORTACAO E EXPORTACAO LTDA
  "41004473000144": 100000.00,  // AYKO HOLDING E PARTICIPACOES LTDA
  "10338682000109": 681509.00,  // VITORIA ON-LINE SERVICOS DE INTERNET LTDA
  "61215139000147": 150000.00,  // VIX LONAS LTDA
  "37297680000167": 10000.00,  // VIXSELL COMERCIO E SERVICO LTDA
  "09104418000113": 100000.00,  // VLA TELECOMUNICACOES LTDA
  "22542368000114": 100000.00,  // VOE TELECOMUNICACOES LTDA
  "30393954000172": 1000000.00,  // WP COMPANY COMERCIO E SERVICOS TECNOLOGIA LTDA
  "34263516000140": 10000.00,  // ZAD COMUNICA LTDA
  "52945020000139": 10000.00,  // ZEGBOX INDUSTRIA E COMERCIO DE EMBALAGENS LTDA
  "59580750000122": 100000.00,  // ZENA LRF TRADING LTDA
  "59267356000139": 5000.00,  // ZENITH GESTAO EMPRESARIAL LTDA
  "24203997000145": 2500.00,  // ZORZAL GESTAO E TECNOLOGIA LTDA
  "07452963000175": 2500.00,  // ZORZAL TECNOLOGIA E GESTAO LTDA
  
  // Clientes que estavam sem capital_social (valores extraídos do PDF)
  "16632622000253": 650000.00,  // BELL TEC TELECOMUNICACOES LTDA
  "03597050000277": 552500.00,  // CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD
  "03597050000510": 552500.00,  // CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD
  "03597050000358": 552500.00,  // CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD
  "03597050000439": 552500.00,  // Centro de Ensino Cachoeirense Darwin Ltda
  "03597050000196": 50000.00,  // CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA
  "48401933000117": 415272.72,  // CONSORCIO CONSERVA-VITORIA
  "39811708000168": 415272.72,  // CURTUME SILVESTRE LTDA.
  "00956216000125": 2000.00,  // ESTACIONE ESTACIONAMENTOS LTDA
  "28397677000124": 5000.00,  // SEBASTIAO PEDRO DE FREITAS
  "30691293000595": 1000.00,  // UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA
};

async function atualizarCapitalSocial(dryRun: boolean = false) {
  console.log("🚀 Iniciando atualização de Capital Social...");
  console.log("=".repeat(80));
  
  if (dryRun) {
    console.log("🔍 MODO DRY-RUN: Nenhuma alteração será feita no banco\n");
  }
  
  let atualizados = 0;
  let naoEncontrados: string[] = [];
  let jaAtualizados: string[] = [];
  let erros: Array<{ cnpj: string; erro: string }> = [];
  
  console.log(`📊 Processando ${Object.keys(dadosPDF).length} registros...\n`);
  
  for (const [cnpjLimpo, capitalSocial] of Object.entries(dadosPDF)) {
    try {
      // Buscar cliente por CNPJ
      const clientes = await executeQuery<any>(
        'SELECT id, razao_social, capital_social FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
        [cnpjLimpo]
      );
      
      if (!clientes || clientes.length === 0) {
        naoEncontrados.push(cnpjLimpo);
        console.log(`⚠️  Cliente não encontrado: ${cnpjLimpo}`);
        continue;
      }
      
      const cliente = clientes[0];
      const capitalAtual = cliente.capital_social ? parseFloat(String(cliente.capital_social)) : 0;
      
      // Verificar se já está atualizado (pular se valor for 0 e já tiver algum valor)
      if (capitalSocial === 0 && capitalAtual > 0) {
        console.log(`⚠️  [${cnpjLimpo}] Valor no script é 0, mas cliente já tem capital_social: ${capitalAtual}. Pulando...`);
        continue;
      }
      
      // Verificar se já está atualizado
      if (capitalSocial > 0 && Math.abs(capitalAtual - capitalSocial) < 0.01) {
        jaAtualizados.push(cnpjLimpo);
        continue;
      }
      
      // Não atualizar se o valor for 0 (placeholder)
      if (capitalSocial === 0) {
        console.log(`⚠️  [${cnpjLimpo}] Valor não definido (0). Adicione o valor correto do PDF ao script.`);
        continue;
      }
      
      // Atualizar capital_social
      if (!dryRun) {
        await executeQuery(
          'UPDATE clientes SET capital_social = ? WHERE id = ?',
          [capitalSocial, cliente.id]
        );
      }
      
      atualizados++;
      const capitalFormatado = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(capitalSocial);
      
      const status = dryRun ? '🔍 [DRY-RUN]' : '✅';
      console.log(`${status} [${atualizados}] ${cliente.razao_social.substring(0, 50).padEnd(50)} | CNPJ: ${cnpjLimpo} | Capital: ${capitalFormatado}`);
      
    } catch (error: any) {
      erros.push({ cnpj: cnpjLimpo, erro: error.message });
      console.error(`❌ Erro ao atualizar ${cnpjLimpo}: ${error.message}`);
    }
  }
  
  if (!dryRun) {
    console.log(`\n💾 Alterações commitadas no banco de dados`);
  } else {
    console.log(`\n🔍 DRY-RUN: Nenhuma alteração foi feita`);
  }
  
  // Relatório final
  console.log("\n" + "=".repeat(80));
  console.log("📊 RELATÓRIO DE ATUALIZAÇÃO");
  console.log("=".repeat(80));
  console.log(`✅ ${dryRun ? 'Simulados' : 'Atualizados'} com sucesso: ${atualizados}`);
  console.log(`ℹ️  Já estavam atualizados: ${jaAtualizados.length}`);
  console.log(`⚠️  Não encontrados: ${naoEncontrados.length}`);
  console.log(`❌ Erros: ${erros.length}`);
  
  if (naoEncontrados.length > 0) {
    console.log(`\n⚠️  CNPJs não encontrados no banco:`);
    naoEncontrados.slice(0, 10).forEach(cnpj => {
      console.log(`   - ${cnpj}`);
    });
    if (naoEncontrados.length > 10) {
      console.log(`   ... e mais ${naoEncontrados.length - 10} CNPJs`);
    }
  }
  
  if (erros.length > 0) {
    console.log(`\n❌ Erros encontrados:`);
    erros.slice(0, 5).forEach(({ cnpj, erro }) => {
      console.log(`   - ${cnpj}: ${erro}`);
    });
    if (erros.length > 5) {
      console.log(`   ... e mais ${erros.length - 5} erros`);
    }
  }
  
  console.log("=".repeat(80));
  
  // Verificar se há clientes sem capital_social que precisam ser atualizados
  console.log("\n🔍 Verificando clientes sem capital_social...");
  try {
    const clientesSemCapital = await executeQuery<any>(
      `SELECT cnpj_limpo, razao_social, capital_social 
       FROM clientes 
       WHERE (capital_social IS NULL OR capital_social = 0) 
       AND cnpj_limpo IS NOT NULL 
       AND cnpj_limpo != ''
       ORDER BY razao_social
       LIMIT 20`
    );
    
    if (clientesSemCapital && clientesSemCapital.length > 0) {
      console.log(`\n⚠️  Encontrados ${clientesSemCapital.length} clientes sem capital_social (mostrando primeiros 20):`);
      clientesSemCapital.forEach((cliente: any) => {
        console.log(`   - ${cliente.razao_social.substring(0, 50).padEnd(50)} | CNPJ: ${cliente.cnpj_limpo}`);
      });
      console.log(`\n💡 Para atualizar esses clientes, adicione-os ao dicionário dadosPDF no script.`);
    } else {
      console.log(`✅ Todos os clientes têm capital_social definido!`);
    }
  } catch (error: any) {
    console.error(`❌ Erro ao verificar clientes sem capital_social: ${error.message}`);
  }
  
  // Fechar conexão
  process.exit(0);
}

// Verificar argumentos
const dryRun = process.argv.includes('--dry-run');

atualizarCapitalSocial(dryRun).catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});

