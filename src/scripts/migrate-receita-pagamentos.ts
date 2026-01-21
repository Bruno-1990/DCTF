/**
 * Script para migrar dados de receita_pagamentos do Supabase para MySQL
 * Usa MCP Supabase para buscar dados
 */

import 'dotenv/config';
import { mysqlPool } from '../config/mysql';

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
  valor_documento?: number | null;
  valor_saldo_documento?: number | null;
  valor_principal?: number | null;
  valor_saldo_principal?: number | null;
  sequencial?: string | null;
  codigo_receita_linha?: string | null;
  descricao_receita_linha?: string | null;
  periodo_apuracao_linha?: string | Date | null;
  data_vencimento_linha?: string | Date | null;
  valor_linha?: number | null;
  valor_principal_linha?: number | null;
  valor_saldo_linha?: number | null;
  dctf_id?: string | null;
  status_processamento: string;
  dados_completos?: any;
  observacoes?: string | null;
  erro_sincronizacao?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

async function migrateReceitaPagamentos() {
  try {
    console.log('🚀 Iniciando migração de receita_pagamentos do Supabase para MySQL...\n');

    // Verificar se há URL do Supabase configurada
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('❌ SUPABASE_URL não configurada nas variáveis de ambiente');
      console.log('💡 Configure SUPABASE_URL no arquivo .env para migrar os dados');
      process.exit(1);
    }

    console.log('📡 Conectando ao Supabase...');
    console.log(`   URL: ${supabaseUrl}\n`);

    // Usar o modelo para buscar dados (ele ainda pode estar usando Supabase se configurado)
    // Mas vamos usar uma abordagem direta via fetch para garantir
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseKey) {
      console.error('❌ SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY não configurada');
      process.exit(1);
    }

    // Buscar dados do Supabase
    console.log('📥 Buscando dados do Supabase...');
    const response = await fetch(`${supabaseUrl}/rest/v1/receita_pagamentos?select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao buscar dados do Supabase: ${response.status} - ${errorText}`);
    }

    const jsonData = await response.json();
    const supabaseData: SupabasePagamento[] = Array.isArray(jsonData) ? jsonData : [];
    console.log(`✅ Encontrados ${supabaseData.length} registros no Supabase\n`);

    if (supabaseData.length === 0) {
      console.log('⚠️  Nenhum dado para migrar');
      process.exit(0);
    }

    // Conectar ao MySQL
    console.log('🔌 Conectando ao MySQL...');
    const connection = await mysqlPool.getConnection();

    try {
      // Verificar quantos registros já existem no MySQL
      const [existingCount] = await connection.query(
        'SELECT COUNT(*) as total FROM receita_pagamentos'
      ) as any[];
      const existing = existingCount[0]?.total || 0;
      console.log(`📊 Registros existentes no MySQL: ${existing}\n`);

      // Preparar dados para inserção
      console.log('📝 Preparando dados para inserção...');
      const { ReceitaPagamentoModel } = await import('../models/ReceitaPagamento');
      const pagamentosModel = new ReceitaPagamentoModel();
      
      let inserted = 0;
      let skipped = 0;
      let errors = 0;

      // Processar em lotes de 100
      const batchSize = 100;
      for (let i = 0; i < supabaseData.length; i += batchSize) {
        const batch = supabaseData.slice(i, i + batchSize);
        console.log(`📦 Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(supabaseData.length / batchSize)} (${batch.length} registros)...`);

        for (const item of batch) {
          try {
            // Verificar se já existe pelo ID
            const [existingRows] = await connection.query(
              'SELECT id FROM receita_pagamentos WHERE id = ?',
              [item.id]
            ) as any[];

            if (existingRows.length > 0) {
              skipped++;
              continue;
            }

            // Preparar dados para inserção
            const pagamentoData: any = {
              id: item.id,
              cnpj_contribuinte: item.cnpj_contribuinte,
              periodo_consulta_inicial: item.periodo_consulta_inicial ? new Date(item.periodo_consulta_inicial) : null,
              periodo_consulta_final: item.periodo_consulta_final ? new Date(item.periodo_consulta_final) : null,
              data_sincronizacao: item.data_sincronizacao ? new Date(item.data_sincronizacao) : new Date(),
              numero_documento: item.numero_documento,
              tipo_documento: item.tipo_documento,
              periodo_apuracao: item.periodo_apuracao ? new Date(item.periodo_apuracao) : null,
              competencia: item.competencia,
              data_arrecadacao: item.data_arrecadacao ? new Date(item.data_arrecadacao) : null,
              data_vencimento: item.data_vencimento ? new Date(item.data_vencimento) : null,
              codigo_receita_doc: item.codigo_receita_doc,
              valor_documento: item.valor_documento,
              valor_saldo_documento: item.valor_saldo_documento,
              valor_principal: item.valor_principal,
              valor_saldo_principal: item.valor_saldo_principal,
              sequencial: item.sequencial,
              codigo_receita_linha: item.codigo_receita_linha,
              descricao_receita_linha: item.descricao_receita_linha,
              periodo_apuracao_linha: item.periodo_apuracao_linha ? new Date(item.periodo_apuracao_linha) : null,
              data_vencimento_linha: item.data_vencimento_linha ? new Date(item.data_vencimento_linha) : null,
              valor_linha: item.valor_linha,
              valor_principal_linha: item.valor_principal_linha,
              valor_saldo_linha: item.valor_saldo_linha,
              dctf_id: item.dctf_id,
              status_processamento: item.status_processamento || 'novo',
              dados_completos: item.dados_completos ? JSON.stringify(item.dados_completos) : null,
              observacoes: item.observacoes,
              erro_sincronizacao: item.erro_sincronizacao,
              created_at: item.created_at ? new Date(item.created_at) : new Date(),
              updated_at: item.updated_at ? new Date(item.updated_at) : new Date(),
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

            inserted++;
          } catch (error: any) {
            errors++;
            console.error(`   ❌ Erro ao inserir registro ${item.id}:`, error.message);
          }
        }
      }

      console.log('\n✅ Migração concluída!');
      console.log(`📊 Estatísticas:`);
      console.log(`   ✅ Inseridos: ${inserted}`);
      console.log(`   ⏭️  Pulados (já existentes): ${skipped}`);
      console.log(`   ❌ Erros: ${errors}`);

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

