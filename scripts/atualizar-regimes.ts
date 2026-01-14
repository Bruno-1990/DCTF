/**
 * Script para atualizar regimes tributários em massa
 * Lê arquivo tribução.txt e atualiza os registros no banco
 * 
 * Uso: npx ts-node --transpile-only scripts/atualizar-regimes.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Configuração
const ARQUIVO_TRIBUTACAO = 'C:\\Users\\bruno\\Desktop\\tribução.txt';
const API_URL = 'http://localhost:3000/api/clientes/atualizar-regimes-massa';

interface DadoTributacao {
  cnpj: string;
  regime: string;
}

async function lerArquivoTributacao(caminhoArquivo: string): Promise<DadoTributacao[]> {
  console.log(`📂 Lendo arquivo: ${caminhoArquivo}`);
  
  if (!fs.existsSync(caminhoArquivo)) {
    throw new Error(`Arquivo não encontrado: ${caminhoArquivo}`);
  }

  const conteudo = fs.readFileSync(caminhoArquivo, 'utf-8');
  const linhas = conteudo.split('\n');
  
  const dados: DadoTributacao[] = [];
  
  for (const linha of linhas) {
    const linhaTrimmed = linha.trim();
    
    // Pular linhas vazias
    if (!linhaTrimmed) {
      continue;
    }
    
    // Formato esperado: CNPJ<TAB>REGIME
    const partes = linhaTrimmed.split('\t');
    
    if (partes.length < 2) {
      console.warn(`⚠️  Linha ignorada (formato inválido): ${linhaTrimmed}`);
      continue;
    }
    
    const cnpj = partes[0].trim();
    const regime = partes[1].trim();
    
    if (!cnpj || !regime) {
      console.warn(`⚠️  Linha ignorada (dados incompletos): ${linhaTrimmed}`);
      continue;
    }
    
    dados.push({ cnpj, regime });
  }
  
  console.log(`✅ ${dados.length} registros lidos do arquivo`);
  return dados;
}

async function atualizarRegimes(dados: DadoTributacao[]): Promise<void> {
  console.log(`\n🚀 Iniciando atualização de ${dados.length} registros...`);
  console.log(`📡 Endpoint: ${API_URL}\n`);
  
  try {
    const response = await axios.post(API_URL, { dados }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 600000, // 10 minutos
    });
    
    const resultado = response.data;
    
    console.log('\n✅ Atualização concluída!');
    console.log(`\n📊 Resumo:`);
    console.log(`   • Total de registros: ${resultado.data.total}`);
    console.log(`   • ✅ Atualizados: ${resultado.data.atualizados}`);
    console.log(`   • ❓ Não encontrados: ${resultado.data.naoEncontrados}`);
    console.log(`   • ❌ Erros: ${resultado.data.erros}`);
    
    // Exibir detalhes dos erros
    if (resultado.data.erros > 0) {
      console.log(`\n❌ Erros encontrados:`);
      const erros = resultado.data.detalhes.filter((d: any) => d.status === 'erro');
      erros.forEach((erro: any) => {
        console.log(`   • ${erro.cnpj}: ${erro.mensagem}`);
      });
    }
    
    // Exibir amostra dos não encontrados
    if (resultado.data.naoEncontrados > 0) {
      console.log(`\n❓ Clientes não encontrados (amostra):`);
      const naoEncontrados = resultado.data.detalhes
        .filter((d: any) => d.status === 'não encontrado')
        .slice(0, 10);
      
      naoEncontrados.forEach((item: any) => {
        console.log(`   • ${item.cnpj}`);
      });
      
      if (resultado.data.naoEncontrados > 10) {
        console.log(`   ... e mais ${resultado.data.naoEncontrados - 10} clientes`);
      }
    }
    
    // Salvar relatório completo
    const relatorioPath = path.join(__dirname, '..', 'logs', `relatorio-regimes-${Date.now()}.json`);
    const logsDir = path.join(__dirname, '..', 'logs');
    
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(relatorioPath, JSON.stringify(resultado.data, null, 2), 'utf-8');
    console.log(`\n📄 Relatório completo salvo em: ${relatorioPath}`);
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ Erro ao chamar API:', error.message);
      if (error.response) {
        console.error('   Status:', error.response.status);
        console.error('   Dados:', error.response.data);
      }
    } else {
      console.error('❌ Erro desconhecido:', error);
    }
    throw error;
  }
}

async function main() {
  console.log('🏁 Iniciando atualização de regimes tributários\n');
  console.log('=' .repeat(60));
  
  try {
    // Ler arquivo
    const dados = await lerArquivoTributacao(ARQUIVO_TRIBUTACAO);
    
    if (dados.length === 0) {
      console.log('\n⚠️  Nenhum registro encontrado no arquivo');
      return;
    }
    
    // Confirmar antes de prosseguir
    console.log('\n⚠️  ATENÇÃO: Esta operação irá atualizar os registros no banco de dados.');
    console.log(`   Total de registros a processar: ${dados.length}`);
    console.log('\n   Pressione Ctrl+C para cancelar ou aguarde 3 segundos para continuar...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Atualizar
    await atualizarRegimes(dados);
    
    console.log('\n✅ Processo concluído com sucesso!');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('\n❌ Erro durante a execução:', error);
    process.exit(1);
  }
}

// Executar
main();


