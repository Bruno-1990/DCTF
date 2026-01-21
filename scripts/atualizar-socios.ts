/**
 * Script para atualizar participacao_percentual e participacao_valor dos sócios
 * usando dados do PDF "RELAÇÃO DE SÓCIOS E CAPITAL.pdf"
 * 
 * Uso: npx ts-node scripts/atualizar-socios.ts [--dry-run]
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar .env do diretório raiz
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

import { executeQuery } from '../src/config/mysql';

// Dados dos sócios - CNPJ da empresa -> Array de sócios
// Formato: { cnpj: string, nome: string, cpf?: string, participacao_percentual: number, participacao_valor: number }
const dadosSocios: Record<string, Array<{
  nome: string;
  cpf?: string;
  participacao_percentual: number;
  participacao_valor: number;
}>> = {
  // ATENTO . GESTAO EM RISCOS E PRODUTIVIDADE LTDA - 31.332.375/0001-82
  "31332375000182": [
    { nome: "ANA PENHA BORGES LOVATO", cpf: "95276653704", participacao_percentual: 100, participacao_valor: 20000.00 }
  ],
  
  // BOX 027 VAREJO DIGITAL LTDA - 41.697.567/0001-46
  "41697567000146": [
    { nome: "WILLIAN NASCIMENTO LOVATO", cpf: "14706844703", participacao_percentual: 100, participacao_valor: 50000.00 }
  ],
  
  // CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA - 03.597.050/0001-96
  "03597050000196": [
    { nome: "EDSON DOS SANTOS", cpf: "98049291715", participacao_percentual: 6.33, participacao_valor: 3165.00 },
    { nome: "JOAO CARLOS SCARDUA SAADE", cpf: "48925870797", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "HELDER JORGE TELLES DE SA", cpf: "02021319717", participacao_percentual: 6.33, participacao_valor: 3165.00 },
    { nome: "PAULO DOMINGOS VIANNA GAUDIO", cpf: "71998969720", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "ANA PAULA BARRETO MONTEIRO ROTHEN", cpf: "05540482727", participacao_percentual: 0.53, participacao_valor: 265.00 },
    { nome: "FERNANDA MONTEIRO LORENZON", cpf: "10597382794", participacao_percentual: 0.53, participacao_valor: 265.00 },
    { nome: "JANE MARGARIDA NUNES BARRETO E MONTEIRO", cpf: "28260597772", participacao_percentual: 1.56, participacao_valor: 780.00 },
    { nome: "JONY JONES MOTTA E MOTTA", cpf: "57743924734", participacao_percentual: 3.14, participacao_valor: 1570.00 },
    { nome: "FRANCIS BARRETO MONTEIRO", cpf: "10710232764", participacao_percentual: 0.53, participacao_valor: 265.00 },
    { nome: "CARLOS ALBERTO BREGENSK", cpf: "39463397787", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "VICTOR AFFONSO BIASUTTI PIGNATON", cpf: "07434671750", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "JOSE GERALDO MONTEIRO DE MATOS", cpf: "47907800749", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "HELOISA HELENA MANNATO COUTINHO", cpf: "41848020791", participacao_percentual: 12.33, participacao_valor: 6165.00 },
    { nome: "PEDRO ABAURRE DE VASCONCELLOS", cpf: "12205154770", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "IDELZE MARIA VIEIRA PINTO", cpf: "00296889733", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "FABRICIO HENRIQUE SANTOS SILVA", cpf: "97960381704", participacao_percentual: 8.33, participacao_valor: 4165.00 },
    { nome: "RICARDO GONCALVES DE ASSIS", cpf: "57498768704", participacao_percentual: 3.13, participacao_valor: 1565.00 },
    { nome: "JOCIEL MOREIRA HEMERLY", cpf: "57747393768", participacao_percentual: 3.14, participacao_valor: 1570.00 },
    { nome: "ALBERTO DE SOUZA", cpf: "47907916704", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "CLEONICE TEREZINHA TREVELIN ROSSETTO", cpf: "00514021730", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "JUAREZ JOSE HENRIQUE CAMPOS", cpf: "47475447715", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "JOSE CESAR FELIPE", cpf: "45068259772", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "SONIA MARIA CARDOSO", cpf: "24971316787", participacao_percentual: 3.12, participacao_valor: 1560.00 },
    { nome: "SILVIO PANTELEAO", cpf: "02276528788", participacao_percentual: 8.35, participacao_valor: 4175.00 },
    { nome: "JOAO CARLOS CARVALHO DOS SANTOS", cpf: "98897420710", participacao_percentual: 8.33, participacao_valor: 4165.00 }
  ],
  
  // CURTUME SILVESTRE LTDA. - 39.811.708/0001-68
  "39811708000168": [
    { nome: "SILVESTRE FRITTOLI COUTINHO FILHO", cpf: "26558777568", participacao_percentual: 2.40, participacao_valor: 9966.55 },
    { nome: "HERMOLAO VALADAO COUTINHO", cpf: "15002322549", participacao_percentual: 0.60, participacao_valor: 2491.64 },
    { nome: "MARIA TERESA VALADAO COUTINHO", cpf: "10210296534", participacao_percentual: 1.00, participacao_valor: 4152.73 },
    { nome: "SILVESTRE FRITTOLI COUTINHO", cpf: "03406920578", participacao_percentual: 1.00, participacao_valor: 4152.73 },
    { nome: "CARLOS VALADAO COUTINHO", cpf: "33699267504", participacao_percentual: 0.60, participacao_valor: 2491.64 },
    { nome: "ROBERTO ANTONIO DALA BERNARDINA", cpf: "01078623520", participacao_percentual: 0.60, participacao_valor: 2491.64 },
    { nome: "DISTRIBUIDORA SILVESTRE LIMITADA", participacao_percentual: 93.80, participacao_valor: 389525.81 }
  ],
  
  // ESTACIONE ESTACIONAMENTOS LTDA - 00.956.216/0001-25
  "00956216000125": [
    { nome: "MARCUS TULLIUS BATALHA BARROCA", cpf: "45214964668", participacao_percentual: 50.00, participacao_valor: 1000.00 },
    { nome: "VALERIA MELO BARROCA", cpf: "85610003687", participacao_percentual: 50.00, participacao_valor: 1000.00 }
  ],
  
  // VITORIA ON-LINE SERVICOS DE INTERNET LTDA - 10.338.682/0001-09
  "10338682000109": [
    { nome: "AYKO TECNOLOGIA LTDA", participacao_percentual: 100.00, participacao_valor: 681509.00 },
    { nome: "GIUSEPPE KENJI NAGATANI FEITOZA", cpf: "03458486755", participacao_percentual: 0.00, participacao_valor: 0.00 }
  ]
};

// Função para normalizar nomes (remover acentos, converter para maiúsculas, etc.)
function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

// Função para limpar CPF/CNPJ
function limparCpfCnpj(cpfCnpj: string | undefined): string {
  if (!cpfCnpj) return '';
  return String(cpfCnpj).replace(/\D/g, '');
}

async function atualizarSocios(dryRun: boolean = false) {
  console.log("🚀 Iniciando atualização de Sócios (Participação Percentual e Valor)...");
  console.log("=".repeat(80));
  
  if (dryRun) {
    console.log("🔍 MODO DRY-RUN: Nenhuma alteração será feita no banco\n");
  }
  
  let totalAtualizados = 0;
  let totalNaoEncontrados = 0;
  let totalErros = 0;
  const erros: Array<{ cnpj: string; socio: string; erro: string }> = [];
  
  console.log(`📊 Processando ${Object.keys(dadosSocios).length} empresas...\n`);
  
  for (const [cnpjLimpo, socios] of Object.entries(dadosSocios)) {
    try {
      // Buscar cliente por CNPJ
      const clientes = await executeQuery<any>(
        'SELECT id, razao_social FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
        [cnpjLimpo]
      );
      
      if (!clientes || clientes.length === 0) {
        console.log(`⚠️  Cliente não encontrado: ${cnpjLimpo}`);
        totalNaoEncontrados++;
        continue;
      }
      
      const cliente = clientes[0];
      console.log(`\n📋 Processando: ${cliente.razao_social} (CNPJ: ${cnpjLimpo})`);
      console.log(`   Total de sócios a atualizar: ${socios.length}`);
      
      // Buscar sócios existentes do cliente
      const sociosExistentes = await executeQuery<any>(
        'SELECT id, nome, cpf, participacao_percentual, participacao_valor FROM clientes_socios WHERE cliente_id = ?',
        [cliente.id]
      );
      
      if (!sociosExistentes || sociosExistentes.length === 0) {
        console.log(`   ⚠️  Nenhum sócio encontrado para este cliente. Pulando...`);
        totalNaoEncontrados++;
        continue;
      }
      
      console.log(`   Sócios existentes no banco: ${sociosExistentes.length}`);
      
      // Para cada sócio nos dados fornecidos, tentar encontrar e atualizar
      for (const socioDados of socios) {
        try {
          const nomeNormalizado = normalizarNome(socioDados.nome);
          const cpfLimpo = limparCpfCnpj(socioDados.cpf);
          
          // Tentar encontrar sócio por nome (normalizado) ou CPF
          let socioEncontrado = sociosExistentes.find((s: any) => {
            const nomeExistenteNormalizado = normalizarNome(s.nome || '');
            const cpfExistente = limparCpfCnpj(s.cpf);
            
            // Match por CPF (se ambos tiverem)
            if (cpfLimpo && cpfExistente && cpfLimpo === cpfExistente) {
              return true;
            }
            
            // Match por nome normalizado
            if (nomeNormalizado === nomeExistenteNormalizado) {
              return true;
            }
            
            // Match parcial por palavras-chave (para nomes com pequenas variações)
            const palavrasDados = nomeNormalizado.split(/\s+/).filter(p => p.length > 2);
            const palavrasExistente = nomeExistenteNormalizado.split(/\s+/).filter(p => p.length > 2);
            if (palavrasDados.length > 0 && palavrasExistente.length > 0) {
              const todasPalavrasPresentes = palavrasDados.every(p => 
                palavrasExistente.some(pe => pe.includes(p) || p.includes(pe))
              );
              if (todasPalavrasPresentes && palavrasDados.length >= 2) {
                return true;
              }
            }
            
            return false;
          });
          
          if (socioEncontrado) {
            // Verificar se precisa atualizar
            const percentualAtual = socioEncontrado.participacao_percentual ? parseFloat(String(socioEncontrado.participacao_percentual)) : null;
            const valorAtual = socioEncontrado.participacao_valor ? parseFloat(String(socioEncontrado.participacao_valor)) : null;
            
            const precisaAtualizar = 
              Math.abs((percentualAtual || 0) - socioDados.participacao_percentual) > 0.01 ||
              Math.abs((valorAtual || 0) - socioDados.participacao_valor) > 0.01;
            
            if (!precisaAtualizar && !dryRun) {
              console.log(`   ✓ ${socioDados.nome.substring(0, 40).padEnd(40)} | Já atualizado`);
              continue;
            }
            
            // Atualizar sócio
            if (!dryRun) {
              await executeQuery(
                'UPDATE clientes_socios SET participacao_percentual = ?, participacao_valor = ? WHERE id = ?',
                [socioDados.participacao_percentual, socioDados.participacao_valor, socioEncontrado.id]
              );
            }
            
            totalAtualizados++;
            const status = dryRun ? '🔍 [DRY-RUN]' : '✅';
            console.log(`   ${status} ${socioDados.nome.substring(0, 40).padEnd(40)} | ${socioDados.participacao_percentual}% | R$ ${socioDados.participacao_valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
          } else {
            console.log(`   ⚠️  Sócio não encontrado: ${socioDados.nome.substring(0, 40)}`);
            totalNaoEncontrados++;
          }
        } catch (error: any) {
          totalErros++;
          erros.push({ cnpj: cnpjLimpo, socio: socioDados.nome, erro: error.message });
          console.error(`   ❌ Erro ao atualizar sócio ${socioDados.nome}: ${error.message}`);
        }
      }
    } catch (error: any) {
      totalErros++;
      erros.push({ cnpj: cnpjLimpo, socio: 'N/A', erro: error.message });
      console.error(`❌ Erro ao processar cliente ${cnpjLimpo}: ${error.message}`);
    }
  }
  
  if (!dryRun) {
    console.log(`\n💾 Alterações commitadas no banco de dados`);
  } else {
    console.log(`\n🔍 DRY-RUN: Nenhuma alteração foi feita`);
  }
  
  // Relatório final
  console.log("\n" + "=".repeat(80));
  console.log("📊 RELATÓRIO DE ATUALIZAÇÃO DE SÓCIOS");
  console.log("=".repeat(80));
  console.log(`✅ ${dryRun ? 'Simulados' : 'Atualizados'} com sucesso: ${totalAtualizados}`);
  console.log(`⚠️  Não encontrados: ${totalNaoEncontrados}`);
  console.log(`❌ Erros: ${totalErros}`);
  
  if (erros.length > 0) {
    console.log(`\n❌ Erros encontrados:`);
    erros.slice(0, 10).forEach(({ cnpj, socio, erro }) => {
      console.log(`   - ${cnpj} | ${socio}: ${erro}`);
    });
    if (erros.length > 10) {
      console.log(`   ... e mais ${erros.length - 10} erros`);
    }
  }
  
  console.log("=".repeat(80));
  
  // Fechar conexão
  process.exit(0);
}

// Verificar argumentos
const dryRun = process.argv.includes('--dry-run');

atualizarSocios(dryRun).catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});







