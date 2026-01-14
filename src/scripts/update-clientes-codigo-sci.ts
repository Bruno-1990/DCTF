/**
 * Script para atualizar a tabela de clientes com o campo Codigo SCI
 * Faz match por CNPJ (normalizado) e atualiza o código SCI
 * Gera log detalhado no final
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { getConnection } from '../config/mysql';

interface ClienteSCI {
  codigo: string;
  razao_social: string;
  cnpj: string;
  cnpj_limpo: string;
}

interface LogResult {
  totalLinhas: number;
  clientesProcessados: number;
  clientesAtualizados: number;
  clientesNaoEncontrados: number;
  clientesSemAlteracoes: number;
  erros: Array<{ linha: number; erro: string; dados?: any }>;
  detalhes: Array<{
    codigo_sci: string;
    cnpj: string;
    razao_social: string;
    status: 'atualizado' | 'nao_encontrado' | 'erro' | 'sem_alteracoes';
    mensagem?: string;
    camposAlterados?: string[];
  }>;
}

/**
 * Limpa e normaliza CNPJ removendo formatação
 */
function limparCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

/**
 * Valida se o CNPJ limpo tem 14 dígitos
 */
function validarCNPJ(cnpjLimpo: string): boolean {
  return cnpjLimpo.length === 14 && /^\d{14}$/.test(cnpjLimpo);
}

/**
 * Parseia o arquivo de texto e extrai os dados dos clientes
 */
function parsearArquivo(conteudo: string): ClienteSCI[] {
  const linhas = conteudo.split('\n');
  const clientes: ClienteSCI[] = [];
  
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i].trim();
    
    // Ignorar linhas vazias, cabeçalhos e rodapés
    if (
      !linha ||
      linha.includes('Impressão de campos da consulta') ||
      linha.includes('Página:') ||
      (linha.includes('Código') && linha.includes('Razão social')) ||
      (linha.includes('CNPJ') && !linha.match(/\d/)) ||
      linha.includes('CENTRAL CONTABIL') ||
      linha.includes('SCI Ambiente Contábil ÚNICO') ||
      linha.match(/^\f/) || // Form feed (page break)
      linha.match(/^\s*$/) // Linha vazia
    ) {
      i++;
      continue;
    }
    
    // Tentar identificar linha com código, razão social e CNPJ
    // Formato pode ser:
    // 1. "           1   A.C RAUPP SERVICOS ADMINISTRATIVOS  13.845.695/0001-54" (tudo na mesma linha)
    // 2. "           1   A.C RAUPP SERVICOS ADMINISTRATIVOS" (código + razão social, CNPJ na próxima linha)
    
    // Primeiro, tentar encontrar tudo na mesma linha
    const matchCompleto = linha.match(/^\s*(\d+)\s{2,}(.+?)\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/);
    
    if (matchCompleto) {
      // Formato: código + razão social + CNPJ na mesma linha
      const codigo = matchCompleto[1].trim();
      const razao_social = matchCompleto[2].trim();
      const cnpj = matchCompleto[3].trim();
      const cnpj_limpo = limparCNPJ(cnpj);
      
      if (validarCNPJ(cnpj_limpo)) {
        clientes.push({
          codigo,
          razao_social,
          cnpj,
          cnpj_limpo,
        });
        i++;
        continue;
      }
    }
    
    // Se não encontrou tudo na mesma linha, tentar código + razão social (CNPJ na próxima linha)
    const matchCodigo = linha.match(/^\s*(\d+)\s{2,}(.+)$/);
    
    if (matchCodigo) {
      const codigo = matchCodigo[1].trim();
      let razao_social = matchCodigo[2].trim();
      
      // Verificar se a razão social já contém um CNPJ no final
      const cnpjNaRazaoSocial = razao_social.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/);
      if (cnpjNaRazaoSocial) {
        // CNPJ está no final da razão social
        const cnpj = cnpjNaRazaoSocial[0];
        razao_social = razao_social.replace(/\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, '').trim();
        const cnpj_limpo = limparCNPJ(cnpj);
        
        if (validarCNPJ(cnpj_limpo)) {
          clientes.push({
            codigo,
            razao_social,
            cnpj,
            cnpj_limpo,
          });
          i++;
          continue;
        }
      }
      
      // Próxima linha deve ser o CNPJ
      if (i + 1 < linhas.length) {
        const proximaLinha = linhas[i + 1].trim();
        
        // Tentar encontrar CNPJ formatado (XX.XXX.XXX/XXXX-XX) ou apenas números
        const cnpjMatch = proximaLinha.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{14})/);
        
        if (cnpjMatch) {
          const cnpj = cnpjMatch[0];
          const cnpj_limpo = limparCNPJ(cnpj);
          
          if (validarCNPJ(cnpj_limpo)) {
            clientes.push({
              codigo,
              razao_social,
              cnpj,
              cnpj_limpo,
            });
            i += 2; // Pular a linha do CNPJ também
            continue;
          } else {
            console.warn(`⚠️ CNPJ inválido na linha ${i + 1}: ${cnpj} (limpo: ${cnpj_limpo})`);
          }
        }
      }
    } else {
      // Tentar identificar se é uma linha com apenas CNPJ (sem código/razão social)
      const cnpjMatch = linha.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{14})/);
      if (cnpjMatch && !linha.match(/^\s*\d+\s/)) {
        // É uma linha com apenas CNPJ, provavelmente o código/razão social estava na linha anterior
        // Mas já processamos, então vamos pular
        i++;
        continue;
      }
    }
    
    i++;
  }
  
  return clientes;
}

/**
 * Verifica se a coluna codigo_sci existe na tabela clientes
 */
async function verificarColunaCodigoSCI(connection: any): Promise<boolean> {
  try {
    const [rows] = await connection.execute(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'clientes' 
       AND COLUMN_NAME = 'codigo_sci'`
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.error('Erro ao verificar coluna codigo_sci:', error);
    return false;
  }
}

/**
 * Cria a coluna codigo_sci se não existir
 */
async function criarColunaCodigoSCI(connection: any): Promise<void> {
  try {
    await connection.execute(
      `ALTER TABLE \`clientes\` 
       ADD COLUMN \`codigo_sci\` VARCHAR(20) NULL 
       AFTER \`cnpj_limpo\``
    );
    console.log('✅ Coluna codigo_sci criada com sucesso');
  } catch (error: any) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ Coluna codigo_sci já existe');
    } else {
      throw error;
    }
  }
}

/**
 * Atualiza o código SCI e razão social de um cliente
 */
async function atualizarClienteCompleto(
  connection: any,
  cnpj_limpo: string,
  codigo_sci: string,
  razao_social: string
): Promise<{ atualizado: boolean; camposAlterados: string[] }> {
  try {
    // Verificar quais campos precisam ser atualizados
    const [rows] = await connection.execute(
      `SELECT \`codigo_sci\`, \`razao_social\` 
       FROM \`clientes\` 
       WHERE \`cnpj_limpo\` = ? 
       LIMIT 1`,
      [cnpj_limpo]
    );
    
    const clienteAtual = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!clienteAtual) {
      return { atualizado: false, camposAlterados: [] };
    }
    
    const camposAlterados: string[] = [];
    const updates: string[] = [];
    const valores: any[] = [];
    
    // Verificar se código SCI mudou
    if (clienteAtual.codigo_sci !== codigo_sci) {
      updates.push('`codigo_sci` = ?');
      valores.push(codigo_sci);
      camposAlterados.push('codigo_sci');
    }
    
    // Verificar se razão social mudou (normalizar para comparação)
    const razaoSocialAtual = (clienteAtual.razao_social || '').trim();
    const razaoSocialNova = razao_social.trim();
    
    if (razaoSocialAtual !== razaoSocialNova && razaoSocialNova) {
      updates.push('`razao_social` = ?');
      valores.push(razaoSocialNova);
      camposAlterados.push('razao_social');
    }
    
    // Se não há nada para atualizar
    if (updates.length === 0) {
      return { atualizado: false, camposAlterados: [] };
    }
    
    // Adicionar updated_at
    updates.push('`updated_at` = NOW()');
    
    // Executar UPDATE
    valores.push(cnpj_limpo);
    const [result] = await connection.execute(
      `UPDATE \`clientes\` 
       SET ${updates.join(', ')} 
       WHERE \`cnpj_limpo\` = ?`,
      valores
    );
    
    return {
      atualizado: (result as any).affectedRows > 0,
      camposAlterados,
    };
  } catch (error) {
    console.error(`Erro ao atualizar cliente para CNPJ ${cnpj_limpo}:`, error);
    throw error;
  }
}

/**
 * Busca cliente por CNPJ
 */
async function buscarClientePorCNPJ(
  connection: any,
  cnpj_limpo: string
): Promise<any | null> {
  try {
    const [rows] = await connection.execute(
      `SELECT \`id\`, \`razao_social\`, \`cnpj_limpo\`, \`codigo_sci\` 
       FROM \`clientes\` 
       WHERE \`cnpj_limpo\` = ? 
       LIMIT 1`,
      [cnpj_limpo]
    );
    
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error(`Erro ao buscar cliente por CNPJ ${cnpj_limpo}:`, error);
    return null;
  }
}

/**
 * Função principal
 */
async function main() {
  // Tentar diferentes caminhos possíveis para o arquivo
  const caminhosPossiveis = [
    path.join(process.cwd(), '..', '..', '..', '..', '..', 'Desktop', 'Impressão de campos da consulta.txt'),
    path.join('C:', 'Users', 'bruno', 'Desktop', 'Impressão de campos da consulta.txt'),
    path.join(process.cwd(), 'Impressão de campos da consulta.txt'),
  ];
  
  let arquivoPath: string | null = null;
  
  for (const caminho of caminhosPossiveis) {
    if (fs.existsSync(caminho)) {
      arquivoPath = caminho;
      break;
    }
  }
  
  if (!arquivoPath) {
    console.error('❌ Arquivo não encontrado. Tentou os seguintes caminhos:');
    caminhosPossiveis.forEach(c => console.error(`  - ${c}`));
    console.error('\n💡 Dica: Coloque o arquivo "Impressão de campos da consulta.txt" na pasta Desktop ou na raiz do projeto');
    process.exit(1);
  }
  
  console.log('📄 Lendo arquivo:', arquivoPath);
  
  const conteudo = fs.readFileSync(arquivoPath, 'utf-8');
  console.log('✅ Arquivo lido com sucesso');
  
  console.log('🔍 Parseando arquivo...');
  const clientesSCI = parsearArquivo(conteudo);
  console.log(`✅ ${clientesSCI.length} clientes encontrados no arquivo`);
  
  if (clientesSCI.length === 0) {
    console.error('❌ Nenhum cliente encontrado no arquivo');
    process.exit(1);
  }
  
  console.log('🔌 Conectando ao banco de dados...');
  const connection = await getConnection();
  
  try {
    // Verificar e criar coluna codigo_sci se necessário
    console.log('🔍 Verificando coluna codigo_sci...');
    const colunaExiste = await verificarColunaCodigoSCI(connection);
    
    if (!colunaExiste) {
      console.log('📝 Criando coluna codigo_sci...');
      await criarColunaCodigoSCI(connection);
    } else {
      console.log('✅ Coluna codigo_sci já existe');
    }
    
    // Iniciar transação
    await connection.beginTransaction();
    
    const log: LogResult = {
      totalLinhas: clientesSCI.length,
      clientesProcessados: 0,
      clientesAtualizados: 0,
      clientesNaoEncontrados: 0,
      clientesSemAlteracoes: 0,
      erros: [],
      detalhes: [],
    };
    
    console.log('🔄 Processando clientes...');
    
    for (let i = 0; i < clientesSCI.length; i++) {
      const clienteSCI = clientesSCI[i];
      log.clientesProcessados++;
      
      try {
        // Buscar cliente no banco
        const cliente = await buscarClientePorCNPJ(connection, clienteSCI.cnpj_limpo);
        
        if (!cliente) {
          log.clientesNaoEncontrados++;
          log.detalhes.push({
            codigo_sci: clienteSCI.codigo,
            cnpj: clienteSCI.cnpj,
            razao_social: clienteSCI.razao_social,
            status: 'nao_encontrado',
            mensagem: 'Cliente não encontrado no banco de dados',
          });
          continue;
        }
        
        // Atualizar todos os campos do cliente (código SCI e razão social)
        const resultado = await atualizarClienteCompleto(
          connection,
          clienteSCI.cnpj_limpo,
          clienteSCI.codigo,
          clienteSCI.razao_social
        );
        
        if (resultado.atualizado) {
          log.clientesAtualizados++;
          const camposStr = resultado.camposAlterados.join(', ');
          log.detalhes.push({
            codigo_sci: clienteSCI.codigo,
            cnpj: clienteSCI.cnpj,
            razao_social: clienteSCI.razao_social,
            status: 'atualizado',
            mensagem: `Campos atualizados: ${camposStr}`,
            camposAlterados: resultado.camposAlterados,
          });
        } else if (resultado.camposAlterados.length === 0) {
          // Cliente encontrado mas nenhum campo precisou ser atualizado
          log.clientesSemAlteracoes++;
          log.detalhes.push({
            codigo_sci: clienteSCI.codigo,
            cnpj: clienteSCI.cnpj,
            razao_social: clienteSCI.razao_social,
            status: 'sem_alteracoes',
            mensagem: 'Cliente encontrado, mas nenhum campo precisou ser atualizado',
            camposAlterados: [],
          });
        } else {
          log.detalhes.push({
            codigo_sci: clienteSCI.codigo,
            cnpj: clienteSCI.cnpj,
            razao_social: clienteSCI.razao_social,
            status: 'erro',
            mensagem: 'Nenhuma linha foi atualizada',
            camposAlterados: [],
          });
        }
      } catch (error: any) {
        log.erros.push({
          linha: i + 1,
          erro: error.message || 'Erro desconhecido',
          dados: clienteSCI,
        });
        log.detalhes.push({
          codigo_sci: clienteSCI.codigo,
          cnpj: clienteSCI.cnpj,
          razao_social: clienteSCI.razao_social,
          status: 'erro',
          mensagem: error.message || 'Erro desconhecido',
        });
      }
      
      // Progresso
      if ((i + 1) % 10 === 0) {
        console.log(`  Processados: ${i + 1}/${clientesSCI.length}`);
      }
    }
    
    // Commit transação
    await connection.commit();
    console.log('✅ Transação commitada com sucesso');
    
    // Gerar log
    console.log('\n📊 RESUMO DA ATUALIZAÇÃO:');
    console.log('='.repeat(60));
    console.log(`Total de linhas processadas: ${log.totalLinhas}`);
    console.log(`Clientes atualizados: ${log.clientesAtualizados}`);
    console.log(`Clientes sem alterações: ${log.clientesSemAlteracoes}`);
    console.log(`Clientes não encontrados: ${log.clientesNaoEncontrados}`);
    console.log(`Erros: ${log.erros.length}`);
    console.log('='.repeat(60));
    
    // Preparar timestamp para nomes de arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    // Salvar log detalhado em arquivo
    const logFileName = `log-codigo-sci-${timestamp}.json`;
    const logPath = path.join(
      path.dirname(arquivoPath),
      logFileName
    );
    
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8');
    console.log(`\n📝 Log detalhado salvo em: ${logPath}`);
    
    // Filtrar CNPJs não encontrados
    const naoEncontrados = log.detalhes.filter(d => d.status === 'nao_encontrado');
    
    // Salvar lista de CNPJs não encontrados em arquivo separado
    if (naoEncontrados.length > 0) {
      const cnpjsNaoEncontradosFileName = `cnpjs-nao-encontrados-${timestamp}.txt`;
      const cnpjsNaoEncontradosPath = path.join(
        path.dirname(arquivoPath),
        cnpjsNaoEncontradosFileName
      );
      
      // Criar conteúdo do arquivo
      const conteudoArquivo = [
        '='.repeat(80),
        'LISTA DE CNPJs NÃO ENCONTRADOS NO BANCO DE DADOS',
        '='.repeat(80),
        `Total: ${naoEncontrados.length} CNPJ(s)`,
        `Data: ${new Date().toLocaleString('pt-BR')}`,
        '='.repeat(80),
        '',
        'Formato: Código SCI | CNPJ | Razão Social',
        '-'.repeat(80),
        '',
        ...naoEncontrados.map((cliente, index) => {
          return `${String(index + 1).padStart(4, ' ')}. ${cliente.codigo_sci.padEnd(8, ' ')} | ${cliente.cnpj.padEnd(18, ' ')} | ${cliente.razao_social}`;
        }),
        '',
        '='.repeat(80),
        'FIM DA LISTA',
        '='.repeat(80),
      ].join('\n');
      
      fs.writeFileSync(cnpjsNaoEncontradosPath, conteudoArquivo, 'utf-8');
      console.log(`📋 Lista de CNPJs não encontrados salva em: ${cnpjsNaoEncontradosPath}`);
      
      // Também salvar em formato CSV para facilitar importação
      const csvFileName = `cnpjs-nao-encontrados-${timestamp}.csv`;
      const csvPath = path.join(
        path.dirname(arquivoPath),
        csvFileName
      );
      
      const csvConteudo = [
        'Codigo SCI,CNPJ,CNPJ Limpo,Razao Social',
        ...naoEncontrados.map(cliente => {
          const cnpjLimpo = limparCNPJ(cliente.cnpj);
          // Escapar vírgulas e aspas no CSV
          const razaoSocialEscapada = cliente.razao_social.replace(/"/g, '""');
          return `"${cliente.codigo_sci}","${cliente.cnpj}","${cnpjLimpo}","${razaoSocialEscapada}"`;
        }),
      ].join('\n');
      
      fs.writeFileSync(csvPath, csvConteudo, 'utf-8');
      console.log(`📊 Lista de CNPJs não encontrados (CSV) salva em: ${csvPath}`);
    }
    
    // Exibir detalhes dos erros se houver
    if (log.erros.length > 0) {
      console.log('\n❌ ERROS ENCONTRADOS:');
      log.erros.forEach((erro, index) => {
        console.log(`  ${index + 1}. Linha ${erro.linha}: ${erro.erro}`);
        if (erro.dados) {
          console.log(`     CNPJ: ${erro.dados.cnpj}, Código SCI: ${erro.dados.codigo}`);
        }
      });
    }
    
    // Exibir alguns exemplos de clientes atualizados
    const atualizados = log.detalhes.filter(d => d.status === 'atualizado');
    if (atualizados.length > 0) {
      console.log('\n✅ PRIMEIROS 10 CLIENTES ATUALIZADOS:');
      atualizados.slice(0, 10).forEach((cliente, index) => {
        const campos = cliente.camposAlterados?.join(', ') || 'N/A';
        console.log(`  ${index + 1}. CNPJ: ${cliente.cnpj}, Código SCI: ${cliente.codigo_sci}`);
        console.log(`     Razão Social: ${cliente.razao_social}`);
        console.log(`     Campos alterados: ${campos}`);
      });
      if (atualizados.length > 10) {
        console.log(`  ... e mais ${atualizados.length - 10} clientes atualizados`);
      }
    }
    
    // Exibir lista completa de clientes não encontrados (reutilizar variável já declarada)
    if (naoEncontrados.length > 0) {
      console.log('\n⚠️ LISTA COMPLETA DE CNPJs NÃO ENCONTRADOS:');
      console.log('='.repeat(80));
      console.log(`Total: ${naoEncontrados.length} CNPJ(s) não encontrado(s) no banco de dados`);
      console.log('-'.repeat(80));
      console.log('Formato: Código SCI | CNPJ | Razão Social');
      console.log('-'.repeat(80));
      
      naoEncontrados.forEach((cliente, index) => {
        console.log(`${String(index + 1).padStart(4, ' ')}. ${cliente.codigo_sci.padEnd(8, ' ')} | ${cliente.cnpj.padEnd(18, ' ')} | ${cliente.razao_social}`);
      });
      
      console.log('-'.repeat(80));
      console.log(`\n💡 Arquivos gerados com a lista completa:`);
      console.log(`   - TXT: cnpjs-nao-encontrados-${timestamp}.txt`);
      console.log(`   - CSV: cnpjs-nao-encontrados-${timestamp}.csv`);
    } else {
      console.log('\n✅ Todos os CNPJs foram encontrados no banco de dados!');
    }
    
    // Estatísticas de campos alterados
    const camposAlteradosCount: Record<string, number> = {};
    atualizados.forEach(cliente => {
      cliente.camposAlterados?.forEach(campo => {
        camposAlteradosCount[campo] = (camposAlteradosCount[campo] || 0) + 1;
      });
    });
    
    if (Object.keys(camposAlteradosCount).length > 0) {
      console.log('\n📈 ESTATÍSTICAS DE CAMPOS ALTERADOS:');
      Object.entries(camposAlteradosCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([campo, count]) => {
          console.log(`  - ${campo}: ${count} atualização(ões)`);
        });
    }
    
  } catch (error: any) {
    await connection.rollback();
    console.error('❌ Erro durante o processamento:', error);
    throw error;
  } finally {
    connection.release();
    console.log('\n✅ Conexão fechada');
  }
}

// Executar
main()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

