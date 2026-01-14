/**
 * Script para atualizar dados faltantes de sócios
 * Atualiza CNPJ, porcentagem e valor de cada sócio
 * Cria sócios se não existirem
 * 
 * Uso: npx ts-node scripts/atualizar-socios-faltantes.ts [--dry-run]
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar .env do diretório raiz
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

import { executeQuery } from '../src/config/mysql';

// Dados das empresas e seus sócios
interface SocioDados {
  nome: string;
  cpf?: string;
  cnpj?: string;
  qual?: string;
  participacao_percentual: number;
  participacao_valor: number;
}

interface EmpresaDados {
  cnpj: string;
  capital_social?: number;
  socios: SocioDados[];
}

const dadosEmpresas: EmpresaDados[] = [
  {
    cnpj: '31332375000182', // ATENTO . GESTAO EM RISCOS E PRODUTIVIDADE LTDA
    capital_social: 20000.00,
    socios: [
      {
        nome: 'ANA PENHA BORGES LOVATO',
        cpf: '95276653704',
        qual: '49-Sócio-Administrador',
        participacao_percentual: 100,
        participacao_valor: 20000.00
      }
    ]
  },
  {
    cnpj: '41697567000146', // BOX 027 VAREJO DIGITAL LTDA
    capital_social: 50000.00,
    socios: [
      {
        nome: 'WILLIAN NASCIMENTO LOVATO',
        cpf: '14706844703',
        qual: '49-Sócio-Administrador',
        participacao_percentual: 100,
        participacao_valor: 50000.00
      }
    ]
  },
  {
    cnpj: '48401933000117', // CONSORCIO CONSERVA-VITORIA
    capital_social: 0.00,
    socios: [
      {
        nome: 'CINCO ESTRELAS CONSTRUTORA E',
        cnpj: '30686869000100',
        qual: 'Sócio',
        participacao_percentual: 0,
        participacao_valor: 0
      },
      {
        nome: 'CBS - CONSTRUTORA BAHIANA DE SANEAMENTO',
        cnpj: '11630923000143',
        qual: 'Sócio',
        participacao_percentual: 0,
        participacao_valor: 0
      },
      {
        nome: 'PAULO ALEXANDRE GALLIS PEREIRA BARAONA',
        cpf: '57664064791',
        qual: 'ADMINISTRADOR',
        participacao_percentual: 0,
        participacao_valor: 0
      },
      {
        nome: 'RROCHA ENGENHARIA LTDA SOCIEDADE CONSORCIADA',
        cnpj: '06297390000190',
        qual: 'Sócio',
        participacao_percentual: 0,
        participacao_valor: 0
      }
    ]
  }
];

// Função para normalizar nomes
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

// Função principal
async function atualizarSociosFaltantes() {
  const isDryRun = process.argv.includes('--dry-run');
  
  if (isDryRun) {
    console.log('🔍 MODO DRY-RUN: Nenhuma alteração será feita no banco de dados\n');
  }

  let totalEmpresasProcessadas = 0;
  let totalSociosAtualizados = 0;
  let totalSociosCriados = 0;
  let totalErros = 0;
  const erros: Array<{ empresa: string; socio: string; erro: string }> = [];

  console.log(`📊 Processando ${dadosEmpresas.length} empresas...\n`);

  for (const empresa of dadosEmpresas) {
    try {
      console.log(`\n🏢 Processando: ${empresa.cnpj}`);
      
      // Buscar cliente por CNPJ
      const clientes = await executeQuery<any>(
        'SELECT id, razao_social, capital_social FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
        [empresa.cnpj]
      );

      if (!clientes || clientes.length === 0) {
        console.log(`   ⚠️  Cliente não encontrado para CNPJ: ${empresa.cnpj}`);
        totalErros++;
        erros.push({ empresa: empresa.cnpj, socio: 'N/A', erro: 'Cliente não encontrado' });
        continue;
      }

      const cliente = clientes[0];
      console.log(`   ✅ Cliente encontrado: ${cliente.razao_social} (ID: ${cliente.id})`);

      // Atualizar capital social se fornecido e diferente
      if (empresa.capital_social !== undefined) {
        const capitalAtual = cliente.capital_social ? parseFloat(String(cliente.capital_social)) : null;
        if (Math.abs((capitalAtual || 0) - empresa.capital_social) > 0.01) {
          if (!isDryRun) {
            await executeQuery(
              'UPDATE clientes SET capital_social = ? WHERE id = ?',
              [empresa.capital_social, cliente.id]
            );
            console.log(`   💰 Capital Social atualizado: R$ ${empresa.capital_social.toFixed(2)}`);
          } else {
            console.log(`   💰 [DRY-RUN] Capital Social seria atualizado: R$ ${empresa.capital_social.toFixed(2)}`);
          }
        }
      }

      // Buscar sócios existentes
      const sociosExistentes = await executeQuery<any>(
        'SELECT id, nome, cpf, qual, participacao_percentual, participacao_valor FROM clientes_socios WHERE cliente_id = ?',
        [cliente.id]
      );

      console.log(`   👥 Sócios existentes: ${sociosExistentes?.length || 0}`);

      // Processar cada sócio dos dados fornecidos
      for (const socioDados of empresa.socios) {
        try {
          const nomeNormalizado = normalizarNome(socioDados.nome);
          const cpfLimpo = limparCpfCnpj(socioDados.cpf);
          const cnpjLimpo = limparCpfCnpj(socioDados.cnpj);

          // Tentar encontrar sócio existente
          // Nota: A tabela usa apenas 'cpf' para armazenar tanto CPF quanto CNPJ
          let socioEncontrado = sociosExistentes?.find((s: any) => {
            const nomeExistenteNormalizado = normalizarNome(s.nome || '');
            const cpfExistente = limparCpfCnpj(s.cpf);

            // Match por CPF ou CNPJ (ambos armazenados no campo 'cpf')
            const documentoLimpo = cpfLimpo || cnpjLimpo;
            if (documentoLimpo && cpfExistente && documentoLimpo === cpfExistente) {
              return true;
            }

            // Match por nome normalizado
            if (nomeNormalizado === nomeExistenteNormalizado) {
              return true;
            }

            // Match parcial por palavras-chave
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
            // Atualizar sócio existente
            // Usar cpf ou cnpj (o que estiver disponível) no campo 'cpf'
            const documentoLimpo = cpfLimpo || cnpjLimpo;
            const documentoAtual = limparCpfCnpj(socioEncontrado.cpf);
            
            const precisaAtualizar =
              (documentoLimpo && documentoAtual !== documentoLimpo) ||
              (socioDados.qual && socioEncontrado.qual !== socioDados.qual) ||
              Math.abs((parseFloat(String(socioEncontrado.participacao_percentual || 0))) - socioDados.participacao_percentual) > 0.01 ||
              Math.abs((parseFloat(String(socioEncontrado.participacao_valor || 0))) - socioDados.participacao_valor) > 0.01;

            if (precisaAtualizar) {
              if (!isDryRun) {
                await executeQuery(
                  `UPDATE clientes_socios 
                   SET cpf = COALESCE(?, cpf), 
                       qual = COALESCE(?, qual), 
                       participacao_percentual = ?, 
                       participacao_valor = ? 
                   WHERE id = ?`,
                  [
                    documentoLimpo || null,
                    socioDados.qual || null,
                    socioDados.participacao_percentual,
                    socioDados.participacao_valor,
                    socioEncontrado.id
                  ]
                );
                console.log(`   ✅ Sócio atualizado: ${socioDados.nome}`);
              } else {
                console.log(`   ✅ [DRY-RUN] Sócio seria atualizado: ${socioDados.nome}`);
              }
              totalSociosAtualizados++;
            } else {
              console.log(`   ⏭️  Sócio já está atualizado: ${socioDados.nome}`);
            }
          } else {
            // Criar novo sócio
            // Usar cpf ou cnpj (o que estiver disponível) no campo 'cpf'
            const documentoLimpo = cpfLimpo || cnpjLimpo;
            
            if (!isDryRun) {
              await executeQuery(
                `INSERT INTO clientes_socios 
                 (cliente_id, nome, cpf, qual, participacao_percentual, participacao_valor) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  cliente.id,
                  socioDados.nome,
                  documentoLimpo || null,
                  socioDados.qual || null,
                  socioDados.participacao_percentual,
                  socioDados.participacao_valor
                ]
              );
              console.log(`   ➕ Sócio criado: ${socioDados.nome}`);
            } else {
              console.log(`   ➕ [DRY-RUN] Sócio seria criado: ${socioDados.nome}`);
            }
            totalSociosCriados++;
          }
        } catch (error: any) {
          console.error(`   ❌ Erro ao processar sócio ${socioDados.nome}:`, error.message);
          totalErros++;
          erros.push({ empresa: cliente.razao_social, socio: socioDados.nome, erro: error.message });
        }
      }

      totalEmpresasProcessadas++;
    } catch (error: any) {
      console.error(`❌ Erro ao processar empresa ${empresa.cnpj}:`, error.message);
      totalErros++;
      erros.push({ empresa: empresa.cnpj, socio: 'N/A', erro: error.message });
    }
  }

  // Relatório final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RELATÓRIO FINAL');
  console.log('='.repeat(60));
  console.log(`✅ Empresas processadas: ${totalEmpresasProcessadas}`);
  console.log(`✅ Sócios atualizados: ${totalSociosAtualizados}`);
  console.log(`➕ Sócios criados: ${totalSociosCriados}`);
  console.log(`❌ Erros: ${totalErros}`);

  if (erros.length > 0) {
    console.log('\n⚠️  DETALHES DOS ERROS:');
    erros.forEach((erro, index) => {
      console.log(`   ${index + 1}. ${erro.empresa} - ${erro.socio}: ${erro.erro}`);
    });
  }

  if (isDryRun) {
    console.log('\n💡 Execute sem --dry-run para aplicar as alterações');
  } else {
    console.log('\n✅ Atualização concluída!');
  }
}

// Executar
atualizarSociosFaltantes()
  .then(() => {
    console.log('\n✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

