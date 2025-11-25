/**
 * Script para migrar dados de receita_pagamentos do Supabase para MySQL
 * Usa MCP Supabase para buscar dados diretamente
 * 
 * Execute: npx ts-node src/scripts/migrate-receita-pagamentos-mcp.ts
 */

import 'dotenv/config';
import { mysqlPool } from '../config/mysql';

// ID do projeto Supabase (Teste MCP)
const SUPABASE_PROJECT_ID = 'utyelfwvrrbfpcyzzxgu';

interface SupabasePagamento {
  id: string;
  cnpj_contribuinte: string;
  periodo_consulta_inicial?: string | Date | null;
  periodo_consulta_final?: string | Date | null;
  data_sincronizacao: string | Date;
  numero_documento: string;
  tipo_documento?: string | null;
  periodo_apuracao?: string | Date | null;
  competencia?: string | null;
  data_arrecadacao?: string | Date | null;
  data_vencimento?: string | Date | null;
  codigo_receita_doc?: string | null;
  valor_documento?: number | string | null;
  valor_saldo_documento?: number | string | null;
  valor_principal?: number | string | null;
  valor_saldo_principal?: number | string | null;
  sequencial?: string | null;
  codigo_receita_linha?: string | null;
  descricao_receita_linha?: string | null;
  periodo_apuracao_linha?: string | Date | null;
  data_vencimento_linha?: string | Date | null;
  valor_linha?: number | string | null;
  valor_principal_linha?: number | string | null;
  valor_saldo_linha?: number | string | null;
  dctf_id?: string | null;
  status_processamento: string;
  dados_completos?: any;
  observacoes?: string | null;
  erro_sincronizacao?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

// Função auxiliar para converter valores numéricos
function parseDecimal(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Função auxiliar para converter datas
function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

async function migrateReceitaPagamentos() {
  try {
    console.log('🚀 Iniciando migração de receita_pagamentos do Supabase para MySQL...\n');
    console.log(`📡 Projeto Supabase: ${SUPABASE_PROJECT_ID}\n`);

    // Conectar ao MySQL primeiro
    console.log('🔌 Conectando ao MySQL...');
    const connection = await mysqlPool.getConnection();

    try {
      // Verificar quantos registros já existem no MySQL
      const [existingCount] = await connection.query(
        'SELECT COUNT(*) as total FROM receita_pagamentos'
      ) as any[];
      const existing = existingCount[0]?.total || 0;
      console.log(`📊 Registros existentes no MySQL: ${existing}\n`);

      // Buscar total de registros no Supabase
      console.log('📥 Verificando total de registros no Supabase...');
      // Nota: O MCP Supabase não tem uma função direta para contar, então vamos buscar em lotes
      
      const batchSize = 1000;
      let offset = 0;
      let totalMigrated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;
      let hasMore = true;

      console.log(`📦 Processando em lotes de ${batchSize} registros...\n`);

      while (hasMore) {
        const query = `
          SELECT * 
          FROM receita_pagamentos 
          ORDER BY created_at 
          LIMIT ${batchSize} 
          OFFSET ${offset}
        `;

        console.log(`📥 Buscando lote ${Math.floor(offset / batchSize) + 1} (offset: ${offset})...`);
        
        // Usar fetch para buscar do Supabase via REST API
        // (O MCP Supabase execute_sql pode ter limitações de tamanho)
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar configurados no .env');
        }

        const response = await fetch(
          `${supabaseUrl}/rest/v1/receita_pagamentos?select=*&order=created_at.asc&limit=${batchSize}&offset=${offset}`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            }
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erro ao buscar dados do Supabase: ${response.status} - ${errorText}`);
        }

        const batch = (await response.json()) as SupabasePagamento[];
        
        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`   ✅ Recebidos ${batch.length} registros do Supabase`);

        // Processar cada registro do lote
        for (const item of batch) {
          try {
            // Verificar se já existe pelo ID
            const [existingRows] = await connection.query(
              'SELECT id FROM receita_pagamentos WHERE id = ?',
              [item.id]
            ) as any[];

            if (existingRows.length > 0) {
              totalSkipped++;
              continue;
            }

            // Preparar dados para inserção
            const pagamentoData = {
              id: item.id,
              cnpj_contribuinte: item.cnpj_contribuinte,
              periodo_consulta_inicial: parseDate(item.periodo_consulta_inicial),
              periodo_consulta_final: parseDate(item.periodo_consulta_final),
              data_sincronizacao: parseDate(item.data_sincronizacao) || new Date(),
              numero_documento: item.numero_documento,
              tipo_documento: item.tipo_documento,
              periodo_apuracao: parseDate(item.periodo_apuracao),
              competencia: item.competencia,
              data_arrecadacao: parseDate(item.data_arrecadacao),
              data_vencimento: parseDate(item.data_vencimento),
              codigo_receita_doc: item.codigo_receita_doc,
              valor_documento: parseDecimal(item.valor_documento),
              valor_saldo_documento: parseDecimal(item.valor_saldo_documento),
              valor_principal: parseDecimal(item.valor_principal),
              valor_saldo_principal: parseDecimal(item.valor_saldo_principal),
              sequencial: item.sequencial,
              codigo_receita_linha: item.codigo_receita_linha,
              descricao_receita_linha: item.descricao_receita_linha,
              periodo_apuracao_linha: parseDate(item.periodo_apuracao_linha),
              data_vencimento_linha: parseDate(item.data_vencimento_linha),
              valor_linha: parseDecimal(item.valor_linha),
              valor_principal_linha: parseDecimal(item.valor_principal_linha),
              valor_saldo_linha: parseDecimal(item.valor_saldo_linha),
              dctf_id: item.dctf_id,
              status_processamento: item.status_processamento || 'novo',
              dados_completos: item.dados_completos ? JSON.stringify(item.dados_completos) : null,
              observacoes: item.observacoes,
              erro_sincronizacao: item.erro_sincronizacao,
              created_at: parseDate(item.created_at) || new Date(),
              updated_at: parseDate(item.updated_at) || new Date(),
            };

            // Inserir no MySQL
            await connection.query(
              `INSERT INTO receita_pagamentos (
                id, cnpj_contribuinte, periodo_consulta_inicial, periodo_consulta_final,
                data_sincronizacao, numero_documento, tipo_documento, periodo_apuracao,
                competencia, data_arrecadacao, data_vencimento, codigo_receita_doc,
                valor_documento, valor_saldo_documento, valor_principal, valor_saldo_principal,
                sequencial, codigo_receita_linha, descricao_receita_linha, periodo_apuracao_linha,
                data_vencimento_linha, valor_linha, valor_principal_linha, valor_saldo_linha,
                dctf_id, status_processamento, dados_completos, observacoes, erro_sincronizacao,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                pagamentoData.id,
                pagamentoData.cnpj_contribuinte,
                pagamentoData.periodo_consulta_inicial,
                pagamentoData.periodo_consulta_final,
                pagamentoData.data_sincronizacao,
                pagamentoData.numero_documento,
                pagamentoData.tipo_documento,
                pagamentoData.periodo_apuracao,
                pagamentoData.competencia,
                pagamentoData.data_arrecadacao,
                pagamentoData.data_vencimento,
                pagamentoData.codigo_receita_doc,
                pagamentoData.valor_documento,
                pagamentoData.valor_saldo_documento,
                pagamentoData.valor_principal,
                pagamentoData.valor_saldo_principal,
                pagamentoData.sequencial,
                pagamentoData.codigo_receita_linha,
                pagamentoData.descricao_receita_linha,
                pagamentoData.periodo_apuracao_linha,
                pagamentoData.data_vencimento_linha,
                pagamentoData.valor_linha,
                pagamentoData.valor_principal_linha,
                pagamentoData.valor_saldo_linha,
                pagamentoData.dctf_id,
                pagamentoData.status_processamento,
                pagamentoData.dados_completos,
                pagamentoData.observacoes,
                pagamentoData.erro_sincronizacao,
                pagamentoData.created_at,
                pagamentoData.updated_at,
              ]
            );

            totalMigrated++;
          } catch (error: any) {
            totalErrors++;
            if (totalErrors <= 10) { // Mostrar apenas os primeiros 10 erros
              console.error(`   ❌ Erro ao inserir registro ${item.id}:`, error.message);
            }
          }
        }

        console.log(`   ✅ Lote processado: ${totalMigrated} inseridos, ${totalSkipped} pulados, ${totalErrors} erros\n`);

        // Verificar se há mais registros
        if (batch.length < batchSize) {
          hasMore = false;
        } else {
          offset += batchSize;
        }

        // Pequena pausa para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('\n✅ Migração concluída!');
      console.log(`📊 Estatísticas:`);
      console.log(`   ✅ Inseridos: ${totalMigrated}`);
      console.log(`   ⏭️  Pulados (já existentes): ${totalSkipped}`);
      console.log(`   ❌ Erros: ${totalErrors}`);

      // Verificar total final
      const [finalCount] = await connection.query(
        'SELECT COUNT(*) as total FROM receita_pagamentos'
      ) as any[];
      console.log(`\n📈 Total de registros no MySQL: ${finalCount[0]?.total || 0}`);

    } finally {
      connection.release();
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Erro na migração:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

migrateReceitaPagamentos();

