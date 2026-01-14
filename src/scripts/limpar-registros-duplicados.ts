/**
 * Script para limpar registros duplicados mantendo apenas o registro correto
 * Critério: manter o registro que corresponde ao CNPJ do arquivo SCI
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';
import * as fs from 'fs';
import * as path from 'path';

interface ClienteSCI {
  codigo: string;
  razao_social: string;
  cnpj: string;
  cnpj_limpo: string;
}

function limparCNPJ(cnpj: string): string {
  return cnpj.replace(/[^\d]/g, '');
}

function parsearArquivo(conteudo: string): ClienteSCI[] {
  const linhas = conteudo.split('\n');
  const clientes: ClienteSCI[] = [];
  
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i].trim();
    
    if (
      !linha ||
      linha.includes('Impressão de campos da consulta') ||
      linha.includes('Página:') ||
      (linha.includes('Código') && linha.includes('Razão social')) ||
      (linha.includes('CNPJ') && !linha.match(/\d/)) ||
      linha.includes('CENTRAL CONTABIL') ||
      linha.includes('SCI Ambiente Contábil ÚNICO') ||
      linha.match(/^\f/) ||
      linha.match(/^\s*$/)
    ) {
      i++;
      continue;
    }
    
    // Tentar encontrar tudo na mesma linha
    const matchCompleto = linha.match(/^\s*(\d+)\s{2,}(.+?)\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/);
    
    if (matchCompleto) {
      const codigo = matchCompleto[1].trim();
      const razao_social = matchCompleto[2].trim();
      const cnpj = matchCompleto[3].trim();
      const cnpj_limpo = limparCNPJ(cnpj);
      
      if (cnpj_limpo.length === 14) {
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
    
    // Tentar código + razão social (CNPJ na próxima linha ou no final)
    const matchCodigo = linha.match(/^\s*(\d+)\s{2,}(.+)$/);
    
    if (matchCodigo) {
      const codigo = matchCodigo[1].trim();
      let razao_social = matchCodigo[2].trim();
      
      // Verificar se a razão social já contém um CNPJ no final
      const cnpjNaRazaoSocial = razao_social.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/);
      if (cnpjNaRazaoSocial) {
        const cnpj = cnpjNaRazaoSocial[0];
        razao_social = razao_social.replace(/\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, '').trim();
        const cnpj_limpo = limparCNPJ(cnpj);
        
        if (cnpj_limpo.length === 14) {
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
        const cnpjMatch = proximaLinha.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{14})/);
        
        if (cnpjMatch) {
          const cnpj = cnpjMatch[0];
          const cnpj_limpo = limparCNPJ(cnpj);
          
          if (cnpj_limpo.length === 14) {
            clientes.push({
              codigo,
              razao_social,
              cnpj,
              cnpj_limpo,
            });
            i += 2;
            continue;
          }
        }
      }
    }
    
    i++;
  }
  
  return clientes;
}

async function main() {
  console.log('🧹 Limpando registros duplicados...\n');
  
  // Ler arquivo SCI
  const caminhosPossiveis = [
    path.join(process.cwd(), '..', '..', '..', 'Desktop', 'Impressão de campos da consulta.txt'),
    path.join(process.cwd(), 'Impressão de campos da consulta.txt'),
  ];
  
  const arquivoPath = caminhosPossiveis.find(p => fs.existsSync(p));
  
  if (!arquivoPath) {
    console.error('❌ Arquivo não encontrado');
    process.exit(1);
  }
  
  console.log('📄 Lendo arquivo SCI...');
  const conteudo = fs.readFileSync(arquivoPath, 'utf-8');
  const clientesSCI = parsearArquivo(conteudo);
  console.log(`✅ ${clientesSCI.length} clientes encontrados no arquivo SCI\n`);
  
  // Criar mapa de CNPJs válidos do arquivo SCI
  const cnpjsValidos = new Set(clientesSCI.map(c => c.cnpj_limpo));
  
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Buscar duplicados por razão social
    const [rowsDuplicados] = await connection.execute(`
      SELECT 
        razao_social_limpa,
        COUNT(*) as quantidade,
        GROUP_CONCAT(id ORDER BY created_at SEPARATOR ',') as ids,
        GROUP_CONCAT(cnpj_limpo ORDER BY created_at SEPARATOR '|') as cnpjs,
        GROUP_CONCAT(created_at ORDER BY created_at SEPARATOR '|') as datas_criacao
      FROM (
        SELECT 
          id,
          cnpj_limpo,
          TRIM(REGEXP_REPLACE(razao_social, '[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}', '')) as razao_social_limpa,
          created_at
        FROM clientes
        WHERE razao_social IS NOT NULL
      ) as clientes_limpos
      WHERE razao_social_limpa != ''
      GROUP BY razao_social_limpa
      HAVING COUNT(*) > 1
      ORDER BY quantidade DESC
    `);
    
    const duplicados = rowsDuplicados as any[];
    
    console.log(`📋 Encontrados ${duplicados.length} grupos de duplicados\n`);
    
    let registrosRemovidos = 0;
    const registrosParaRemover: Array<{ id: string; razao_social: string; cnpj: string; motivo: string }> = [];
    
    for (const dup of duplicados) {
      const ids = (dup.ids as string).split(',');
      const cnpjs = (dup.cnpjs as string).split('|');
      const datas = (dup.datas_criacao as string).split('|');
      
      // Identificar qual CNPJ é válido (está no arquivo SCI)
      const cnpjsValidosNoGrupo = cnpjs.filter(cnpj => cnpjsValidos.has(cnpj));
      
      if (cnpjsValidosNoGrupo.length === 0) {
        // Nenhum CNPJ válido, manter o mais antigo
        const idParaManter = ids[0];
        const idsParaRemover = ids.slice(1);
        
        for (let i = 0; i < idsParaRemover.length; i++) {
          registrosParaRemover.push({
            id: idsParaRemover[i],
            razao_social: dup.razao_social_limpa,
            cnpj: cnpjs[ids.indexOf(idsParaRemover[i])],
            motivo: 'Duplicado sem CNPJ válido no arquivo SCI',
          });
        }
      } else if (cnpjsValidosNoGrupo.length === 1) {
        // Um único CNPJ válido, remover os outros
        const cnpjValido = cnpjsValidosNoGrupo[0];
        const indiceValido = cnpjs.indexOf(cnpjValido);
        const idParaManter = ids[indiceValido];
        const idsParaRemover = ids.filter((_, i) => i !== indiceValido);
        
        for (let i = 0; i < idsParaRemover.length; i++) {
          const indice = ids.indexOf(idsParaRemover[i]);
          registrosParaRemover.push({
            id: idsParaRemover[i],
            razao_social: dup.razao_social_limpa,
            cnpj: cnpjs[indice],
            motivo: `Duplicado - CNPJ válido é ${cnpjValido}`,
          });
        }
      } else {
        // Múltiplos CNPJs válidos - pode ser legítimo (filiais)
        // Manter todos os válidos, remover apenas os inválidos
        const idsParaRemover: string[] = [];
        
        for (let i = 0; i < ids.length; i++) {
          if (!cnpjsValidos.has(cnpjs[i])) {
            idsParaRemover.push(ids[i]);
            registrosParaRemover.push({
              id: ids[i],
              razao_social: dup.razao_social_limpa,
              cnpj: cnpjs[i],
              motivo: 'Duplicado - CNPJ não está no arquivo SCI',
            });
          }
        }
      }
    }
    
    console.log(`🗑️  Registros a remover: ${registrosParaRemover.length}\n`);
    
    if (registrosParaRemover.length > 0) {
      console.log('Removendo registros...');
      
      for (let i = 0; i < registrosParaRemover.length; i++) {
        const registro = registrosParaRemover[i];
        
        try {
          // Verificar se há dependências antes de remover
          const [dependencias] = await connection.execute(
            `SELECT COUNT(*) as count FROM dctf_declaracoes WHERE cliente_id = ?`,
            [registro.id]
          );
          
          const count = (dependencias as any[])[0]?.count || 0;
          
          if (count > 0) {
            console.log(`⚠️  ID ${registro.id} tem ${count} dependências, não será removido`);
            continue;
          }
          
          await connection.execute(
            `DELETE FROM \`clientes\` WHERE id = ?`,
            [registro.id]
          );
          
          registrosRemovidos++;
          
          if (registrosRemovidos % 10 === 0) {
            console.log(`  Removidos: ${registrosRemovidos}/${registrosParaRemover.length}`);
          }
        } catch (error: any) {
          console.error(`❌ Erro ao remover ID ${registro.id}:`, error.message);
        }
      }
    }
    
    await connection.commit();
    
    console.log(`\n✅ Limpeza concluída!`);
    console.log(`   Registros removidos: ${registrosRemovidos}`);
    
    // Salvar relatório
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(
      process.cwd(),
      '..',
      '..',
      '..',
      'Desktop',
      `limpeza-duplicados-${timestamp}.txt`
    );
    
    const reportContent = [
      '='.repeat(100),
      'RELATÓRIO DE LIMPEZA DE DUPLICADOS',
      '='.repeat(100),
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      `Registros removidos: ${registrosRemovidos}`,
      '='.repeat(100),
      '',
      ...registrosParaRemover.map((r, index) => {
        return [
          `${index + 1}. ID: ${r.id}`,
          `   Razão Social: ${r.razao_social}`,
          `   CNPJ: ${r.cnpj}`,
          `   Motivo: ${r.motivo}`,
          '',
        ].join('\n');
      }),
      '='.repeat(100),
      'FIM DO RELATÓRIO',
      '='.repeat(100),
    ].join('\n');
    
    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`📝 Relatório salvo em: ${reportPath}`);
    
  } catch (error: any) {
    await connection.rollback();
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });


