/**
 * Serviço para sincronizar dados DCTF do Supabase para MySQL
 * Usado na área administrativa para atualizar declarações
 */

import { supabaseAdmin, supabase } from '../config/database';
import { createSupabaseAdapter } from './SupabaseAdapter';
import { ApiResponse } from '../types';

interface SyncProgress {
  total: number;
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  currentBatch: number;
  totalBatches: number;
}

export class DCTFSyncService {
  private mysqlAdapter: any;
  private batchSize: number = 100; // Processar 100 registros por vez

  constructor() {
    this.mysqlAdapter = createSupabaseAdapter();
  }

  /**
   * Verifica se o Supabase está disponível
   */
  isSupabaseAvailable(): boolean {
    return !!(supabaseAdmin || supabase);
  }

  /**
   * Sincroniza todas as declarações DCTF do Supabase para MySQL
   * @param onProgress Callback para reportar progresso
   */
  async syncFromSupabase(
    onProgress?: (progress: SyncProgress) => void
  ): Promise<ApiResponse<SyncProgress>> {
    try {
      // Verificar se Supabase está disponível
      const supabaseClient = supabaseAdmin || supabase;
      if (!supabaseClient) {
        return {
          success: false,
          error: 'Supabase não está configurado. Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env',
        };
      }

      console.log('[DCTF Sync] Iniciando sincronização do Supabase para MySQL...');

      // 1. Contar total de registros no Supabase
      const { count, error: countError } = await supabaseClient
        .from('dctf_declaracoes')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('[DCTF Sync] Erro ao contar registros:', countError);
        return {
          success: false,
          error: `Erro ao contar registros no Supabase: ${countError.message}`,
        };
      }

      const total = count || 0;
      console.log(`[DCTF Sync] Total de registros no Supabase: ${total}`);

      if (total === 0) {
        return {
          success: true,
          data: {
            total: 0,
            processed: 0,
            inserted: 0,
            updated: 0,
            errors: 0,
            currentBatch: 0,
            totalBatches: 0,
          },
          message: 'Nenhum registro encontrado no Supabase para sincronizar',
        };
      }

      // 2. Calcular número de lotes
      const totalBatches = Math.ceil(total / this.batchSize);
      let processed = 0;
      let inserted = 0;
      let updated = 0;
      let errors = 0;

      // 3. Processar em lotes
      for (let batch = 0; batch < totalBatches; batch++) {
        const from = batch * this.batchSize;
        const to = Math.min(from + this.batchSize - 1, total - 1);

        console.log(`[DCTF Sync] Processando lote ${batch + 1}/${totalBatches} (registros ${from + 1}-${to + 1})`);

        // Buscar lote do Supabase
        const { data: batchData, error: fetchError } = await supabaseClient
          .from('dctf_declaracoes')
          .select('*')
          .range(from, to)
          .order('created_at', { ascending: true });

        if (fetchError) {
          console.error(`[DCTF Sync] Erro ao buscar lote ${batch + 1}:`, fetchError);
          errors += this.batchSize;
          continue;
        }

        if (!batchData || batchData.length === 0) {
          console.log(`[DCTF Sync] Lote ${batch + 1} vazio, pulando...`);
          continue;
        }

        // 4. Inserir/atualizar cada registro no MySQL usando upsert
        for (const record of batchData) {
          try {
            // Verificar se o registro já existe no MySQL (por id)
            const { data: existingData } = await this.mysqlAdapter
              .from('dctf_declaracoes')
              .select('id')
              .eq('id', record.id)
              .limit(1);

            const exists = existingData && existingData.length > 0;
            
            // Usar upsert para inserir ou atualizar automaticamente
            const mappedRecord = this.mapSupabaseToMySQL(record);
            
            // Usar upsert com id como chave de conflito
            const { error: upsertError } = await this.mysqlAdapter
              .from('dctf_declaracoes')
              .upsert(mappedRecord, { onConflict: 'id' });

            if (upsertError) {
              console.error(`[DCTF Sync] Erro ao fazer upsert do registro ${record.id}:`, upsertError);
              console.error(`[DCTF Sync] Dados tentados:`, JSON.stringify(mappedRecord, null, 2));
              console.error(`[DCTF Sync] Erro completo:`, JSON.stringify(upsertError, null, 2));
              errors++;
            } else {
              // Contar baseado na verificação anterior
              if (exists) {
                updated++;
              } else {
                inserted++;
              }
            }

            processed++;

            // Reportar progresso
            if (onProgress) {
              onProgress({
                total,
                processed,
                inserted,
                updated,
                errors,
                currentBatch: batch + 1,
                totalBatches,
              });
            }
          } catch (recordError: any) {
            console.error(`[DCTF Sync] Erro ao processar registro ${record.id}:`, recordError);
            errors++;
            processed++;
          }
        }

        // Pequeno delay entre lotes para não sobrecarregar
        if (batch < totalBatches - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      const result: SyncProgress = {
        total,
        processed,
        inserted,
        updated,
        errors,
        currentBatch: totalBatches,
        totalBatches,
      };

      console.log('[DCTF Sync] Sincronização concluída:', result);

      return {
        success: true,
        data: result,
        message: `Sincronização concluída: ${inserted} inseridos, ${updated} atualizados, ${errors} erros`,
      };
    } catch (error: any) {
      console.error('[DCTF Sync] Erro geral na sincronização:', error);
      return {
        success: false,
        error: error.message || 'Erro desconhecido ao sincronizar dados',
      };
    }
  }

  /**
   * Mapeia dados do Supabase para formato MySQL
   * Inclui TODAS as colunas que existem no Supabase
   */
  private mapSupabaseToMySQL(supabaseRecord: any): any {
    // Normalizar cliente_id: se for CNPJ formatado ou não for UUID válido, usar NULL
    let clienteId = supabaseRecord.cliente_id || null;
    if (clienteId) {
      // Se cliente_id não é um UUID válido (tem formato de CNPJ com pontos/barras), usar NULL
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clienteId)) {
        // Não é UUID válido, provavelmente é CNPJ formatado - usar NULL
        clienteId = null;
      }
    }

    const mapped: any = {
      id: supabaseRecord.id,
      cliente_id: clienteId, // Pode ser NULL
      cnpj: supabaseRecord.cnpj || null,
      periodo_apuracao: supabaseRecord.periodo_apuracao || supabaseRecord.periodo || null,
      data_transmissao: supabaseRecord.data_transmissao || supabaseRecord.dataTransmissao || null,
      situacao: supabaseRecord.situacao || null,
    };

    // Adicionar todas as outras colunas que podem existir no Supabase
    const optionalFields = [
      'tipo_ni',
      'categoria',
      'origem',
      'tipo',
      'debito_apurado',
      'saldo_a_pagar',
      'metadados',
      'hora_transmissao',
      'numero_recibo',
      'data_declaracao',
      'numero_identificacao',
      'created_at',
      'updated_at',
    ];

    for (const field of optionalFields) {
      if (supabaseRecord[field] !== undefined) {
        mapped[field] = supabaseRecord[field];
      }
    }

    // Garantir que created_at e updated_at existem
    if (!mapped.created_at) {
      mapped.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    if (!mapped.updated_at) {
      mapped.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    return mapped;
  }
}

