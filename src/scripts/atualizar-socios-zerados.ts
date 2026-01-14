/**
 * Script para atualizar todos os sócios que não têm participação definida
 * Definindo participacao_percentual = 0 e participacao_valor = 0
 */

import * as dotenv from 'dotenv';
import { getConnection } from '../config/mysql';

dotenv.config();

async function atualizarSociosZerados() {
  let connection;
  
  try {
    console.log('🔄 Conectando ao banco de dados...');
    connection = await getConnection();
    
    console.log('📊 Buscando sócios sem participação definida...');
    
    // Buscar sócios que têm participacao_percentual NULL ou participacao_valor NULL
    const [sociosSemDados] = await connection.execute(`
      SELECT 
        id, 
        cliente_id,
        nome,
        participacao_percentual,
        participacao_valor
      FROM clientes_socios
      WHERE participacao_percentual IS NULL 
         OR participacao_valor IS NULL
         OR participacao_percentual = 0
         OR participacao_valor = 0
      ORDER BY cliente_id, nome
    `);
    
    const socios = sociosSemDados as Array<{
      id: string;
      cliente_id: string;
      nome: string;
      participacao_percentual: number | null;
      participacao_valor: number | null;
    }>;
    
    console.log(`📋 Encontrados ${socios.length} sócios para atualizar`);
    
    if (socios.length === 0) {
      console.log('✅ Nenhum sócio precisa ser atualizado.');
      return;
    }
    
    await connection.beginTransaction();
    
    let atualizados = 0;
    let atualizadosPercentual = 0;
    let atualizadosValor = 0;
    
    for (const socio of socios) {
      const precisaAtualizarPercentual = socio.participacao_percentual === null || socio.participacao_percentual === undefined;
      const precisaAtualizarValor = socio.participacao_valor === null || socio.participacao_valor === undefined;
      
      if (precisaAtualizarPercentual || precisaAtualizarValor) {
        // Se ambos precisam ser atualizados, fazer um UPDATE único
        if (precisaAtualizarPercentual && precisaAtualizarValor) {
          await connection.execute(
            'UPDATE clientes_socios SET participacao_percentual = 0, participacao_valor = 0, updated_at = NOW() WHERE id = ?',
            [socio.id]
          );
          atualizados++;
          atualizadosPercentual++;
          atualizadosValor++;
          console.log(`✅ Atualizado ${socio.nome} (ID: ${socio.id}): 0.00% e R$ 0,00`);
        } 
        // Se só percentual precisa ser atualizado
        else if (precisaAtualizarPercentual) {
          await connection.execute(
            'UPDATE clientes_socios SET participacao_percentual = 0, updated_at = NOW() WHERE id = ?',
            [socio.id]
          );
          atualizados++;
          atualizadosPercentual++;
          console.log(`✅ Atualizado ${socio.nome} (ID: ${socio.id}): 0.00%`);
        }
        // Se só valor precisa ser atualizado
        else if (precisaAtualizarValor) {
          await connection.execute(
            'UPDATE clientes_socios SET participacao_valor = 0, updated_at = NOW() WHERE id = ?',
            [socio.id]
          );
          atualizados++;
          atualizadosValor++;
          console.log(`✅ Atualizado ${socio.nome} (ID: ${socio.id}): R$ 0,00`);
        }
      }
    }
    
    await connection.commit();
    
    console.log('\n📊 Resumo da atualização:');
    console.log(`   Total de sócios atualizados: ${atualizados}`);
    console.log(`   Participação percentual atualizada: ${atualizadosPercentual}`);
    console.log(`   Valor monetário atualizado: ${atualizadosValor}`);
    console.log('\n✅ Atualização concluída com sucesso!');
    
  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('❌ Erro ao atualizar sócios:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Executar o script
atualizarSociosZerados()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

