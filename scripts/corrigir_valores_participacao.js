/**
 * Script de Correção: Recalcular Valores de Participação dos Sócios
 * 
 * Este script corrige os valores de participação (participacao_valor) de todos os sócios
 * recalculando com base no Capital Social do cliente, usando a normalização correta
 * para formato brasileiro (ex: "1.000,00" → 1000).
 * 
 * Uso: node scripts/corrigir_valores_participacao.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

// Função para normalizar Capital Social (formato brasileiro: "1.000,00" → 1000.00)
function normalizarCapitalSocial(valor) {
  if (valor === null || valor === undefined) return null;
  
  if (typeof valor === 'number') {
    return isNaN(valor) ? null : valor;
  }
  
  // Converter para string e limpar
  let str = String(valor).trim();
  
  // Remover símbolos de moeda (R$, $, etc.)
  str = str.replace(/R\$\s*/gi, '').replace(/\$\s*/g, '').trim();
  
  // Detectar formato brasileiro: tem vírgula como separador decimal
  const temVirgulaDecimal = /,\d{1,2}$/.test(str);
  
  if (temVirgulaDecimal) {
    // Formato brasileiro: remover pontos (milhares) e substituir vírgula por ponto
    // "1.000,00" → "1000,00" → "1000.00"
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    // Formato americano ou sem formatação
    str = str.replace(/[^\d.-]/g, '');
  }
  
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

async function corrigirValoresParticipacao() {
  let connection;
  
  try {
    // Conectar ao banco
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_mpc',
    });
    
    console.log('✅ Conectado ao banco de dados');
    
    // Buscar todos os clientes que têm sócios
    const [clientes] = await connection.execute(`
      SELECT DISTINCT c.id, c.cnpj_limpo, c.razao_social, c.capital_social
      FROM clientes c
      INNER JOIN clientes_socios cs ON cs.cliente_id = c.id
      WHERE cs.participacao_percentual IS NOT NULL
      ORDER BY c.id
    `);
    
    console.log(`\n📊 Encontrados ${clientes.length} clientes com sócios para corrigir\n`);
    
    let totalCorrigidos = 0;
    let totalErros = 0;
    
    // Processar cada cliente
    for (const cliente of clientes) {
      try {
        // Normalizar Capital Social
        const capitalSocialNum = normalizarCapitalSocial(cliente.capital_social);
        
        if (capitalSocialNum === null || capitalSocialNum === 0) {
          console.log(`⚠️  Cliente ${cliente.id} (${cliente.razao_social || cliente.cnpj_limpo}): Capital Social inválido ou zero, pulando...`);
          continue;
        }
        
        // Buscar sócios deste cliente
        const [socios] = await connection.execute(`
          SELECT id, nome, participacao_percentual, participacao_valor
          FROM clientes_socios
          WHERE cliente_id = ? AND participacao_percentual IS NOT NULL
        `, [cliente.id]);
        
        if (socios.length === 0) continue;
        
        console.log(`\n🔍 Cliente: ${cliente.razao_social || cliente.cnpj_limpo}`);
        console.log(`   Capital Social original: ${cliente.capital_social}`);
        console.log(`   Capital Social normalizado: ${capitalSocialNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
        console.log(`   Sócios: ${socios.length}`);
        
        let corrigidosCliente = 0;
        
        // Recalcular cada sócio
        for (const socio of socios) {
          const participacaoPercentual = parseFloat(socio.participacao_percentual);
          
          if (isNaN(participacaoPercentual)) {
            console.log(`   ⚠️  Sócio ${socio.nome}: porcentagem inválida, pulando...`);
            continue;
          }
          
          // Calcular novo valor: Capital Social × Porcentagem / 100
          const novoValor = (capitalSocialNum * participacaoPercentual) / 100;
          const valorAntigo = socio.participacao_valor ? parseFloat(socio.participacao_valor) : null;
          
          // Atualizar apenas se o valor mudou (com tolerância de 0.01 para arredondamentos)
          if (valorAntigo === null || Math.abs(novoValor - valorAntigo) > 0.01) {
            await connection.execute(`
              UPDATE clientes_socios
              SET participacao_valor = ?
              WHERE id = ?
            `, [novoValor, socio.id]);
            
            console.log(`   ✅ ${socio.nome}: ${participacaoPercentual}% = ${valorAntigo !== null ? valorAntigo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'NULL'} → ${novoValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
            corrigidosCliente++;
            totalCorrigidos++;
          } else {
            console.log(`   ✓ ${socio.nome}: ${participacaoPercentual}% = ${novoValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (já correto)`);
          }
        }
        
        if (corrigidosCliente > 0) {
          console.log(`   📝 ${corrigidosCliente} sócio(s) corrigido(s) para este cliente`);
        }
        
      } catch (error) {
        console.error(`   ❌ Erro ao processar cliente ${cliente.id}:`, error.message);
        totalErros++;
      }
    }
    
    console.log(`\n\n✅ Correção concluída!`);
    console.log(`   📊 Total de valores corrigidos: ${totalCorrigidos}`);
    console.log(`   ⚠️  Total de erros: ${totalErros}`);
    
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão encerrada');
    }
  }
}

// Executar
corrigirValoresParticipacao()
  .then(() => {
    console.log('\n✨ Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

