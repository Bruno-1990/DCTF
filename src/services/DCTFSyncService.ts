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
  /** Registros ignorados por já existir no MySQL (mesmo ID) */
  skippedDuplicate?: number;
  /** IDs que foram ignorados (já existiam). Se MySQL estava limpo = duplicatas no Supabase */
  skippedIds?: string[];
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
  ): Promise<ApiResponse<SyncProgress & { errorLog?: string[] }>> {
    const errorLog: string[] = []; // Log de erros detalhados
    
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
            skippedDuplicate: 0,
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
      let skippedDuplicate = 0;
      const skippedIds: string[] = [];

      // 3. Processar em lotes
      for (let batch = 0; batch < totalBatches; batch++) {
        const from = batch * this.batchSize;
        const to = Math.min(from + this.batchSize - 1, total - 1);

        console.log(`[DCTF Sync] Processando lote ${batch + 1}/${totalBatches} (registros ${from + 1}-${to + 1})`);

        // Buscar lote do Supabase (ordem estável: created_at + id para paginação sem repetir registros)
        const { data: batchData, error: fetchError } = await supabaseClient
          .from('dctf_declaracoes')
          .select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);

        if (fetchError) {
          console.error(`[DCTF Sync] Erro ao buscar lote ${batch + 1}:`, fetchError);
          errors += this.batchSize;
          continue;
        }

        if (!batchData || batchData.length === 0) {
          console.log(`[DCTF Sync] Lote ${batch + 1} vazio, pulando...`);
          continue;
        }

        // 4. Inserir apenas registros novos (sem atualização por similaridade)
        for (const record of batchData) {
          try {
            const mappedRecord = this.mapSupabaseToMySQL(record);

            // Verificar se o ID já existe no MySQL → pular (registro já sincronizado)
            const { data: existingById } = await this.mysqlAdapter
              .from('dctf_declaracoes')
              .select('id')
              .eq('id', mappedRecord.id)
              .limit(1);

            if (existingById && existingById.length > 0) {
              skippedDuplicate++;
              if (mappedRecord.id) skippedIds.push(String(mappedRecord.id));
              processed++;
              if (onProgress) {
                onProgress({
                  total,
                  processed,
                  inserted,
                  updated,
                  errors,
                  skippedDuplicate,
                  skippedIds: [...skippedIds],
                  currentBatch: batch + 1,
                  totalBatches,
                });
              }
              continue;
            }

            // Inserir registro (igualdade é por ID; mesmo CNPJ+período com outros campos diferentes = registros distintos)
            const { error: insertError } = await this.mysqlAdapter
              .from('dctf_declaracoes')
              .insert(mappedRecord);

            if (insertError) {
              const errorMsg = `INSERT FALHOU - ID: ${record.id}, CNPJ: ${mappedRecord.cnpj}, Período: ${mappedRecord.periodo_apuracao}, Erro: ${JSON.stringify(insertError)}`;
              errorLog.push(errorMsg);
              console.error(`[DCTF Sync] ❌ ERRO ao inserir registro ${record.id}:`, JSON.stringify(insertError, null, 2));
              errors++;
            } else {
              inserted++;
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
                skippedDuplicate,
                skippedIds: [...skippedIds],
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
        skippedDuplicate,
        skippedIds: skippedIds.length > 0 ? skippedIds : undefined,
        currentBatch: totalBatches,
        totalBatches,
      };

      console.log('[DCTF Sync] Sincronização concluída:', result);
      if (skippedDuplicate > 0) {
        console.log(`[DCTF Sync] ${skippedDuplicate} registro(s) ignorado(s): já existia no MySQL (mesmo ID). IDs: ${skippedIds.join(', ')}`);
        console.log('[DCTF Sync] Se o MySQL estava limpo antes do sync, esses IDs estão duplicados no Supabase (mesmo UUID em mais de um registro).');
      }
      
      // Salvar log de erros se houver
      if (errorLog.length > 0) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const logPath = path.join(process.cwd(), 'sync-errors.log');
          const timestamp = new Date().toISOString();
          const logContent = `\n\n=== SYNC ERROR LOG - ${timestamp} ===\n` + 
            errorLog.join('\n') + 
            `\n=== END LOG ===\n`;
          
          fs.appendFileSync(logPath, logContent);
          console.log(`[DCTF Sync] Log de erros salvo em: ${logPath}`);
        } catch (logError) {
          console.error('[DCTF Sync] Erro ao salvar log:', logError);
        }
      }

      const msgParts = [`${inserted} inseridos`];
      if (skippedDuplicate > 0) msgParts.push(`${skippedDuplicate} ignorados (já existia mesmo ID)`);
      if (errors > 0) msgParts.push(`${errors} erros`);
      if (errorLog.length > 0) msgParts.push('(ver sync-errors.log)');
      return {
        success: true,
        data: { ...result, errorLog },
        message: `Sincronização concluída: ${msgParts.join(', ')}`,
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
   * Valida e corrige timestamps inválidos
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

    /**
     * Valida e corrige timestamps com componentes de tempo inválidos
     * Exemplo: '2026-01-05 15:64:31' vira '2026-01-05 00:00:00'
     */
    const sanitizeTimestamp = (timestamp: any): string | null => {
      if (!timestamp) return null;
      
      const timestampStr = String(timestamp).trim();
      if (!timestampStr) return null;
      
      // Regex para detectar timestamp com formato: YYYY-MM-DD HH:MM:SS
      const timestampRegex = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/;
      const match = timestampStr.match(timestampRegex);
      
      if (match) {
        const [, date, hours, minutes, seconds] = match;
        const h = parseInt(hours, 10);
        const m = parseInt(minutes, 10);
        const s = parseInt(seconds, 10);
        
        // Validar componentes de tempo
        if (h > 23 || m > 59 || s > 59) {
          console.warn(`[DCTF Sync] ⚠️ Timestamp inválido detectado: ${timestampStr}. Usando apenas data: ${date} 00:00:00`);
          return `${date} 00:00:00`;
        }
      }
      
      // Se já está no formato correto ou é apenas uma data (YYYY-MM-DD), retornar como está
      return timestampStr;
    };

    // Normalizar data_transmissao: combinar com hora_transmissao se disponível
    let dataTransmissao = supabaseRecord.data_transmissao || supabaseRecord.dataTransmissao || null;
    if (dataTransmissao) {
      // Se temos hora_transmissao, combinar
      if (supabaseRecord.hora_transmissao) {
        // Extrair apenas a data (YYYY-MM-DD)
        const dateOnly = dataTransmissao.split('T')[0].split(' ')[0];
        // Combinar com hora e VALIDAR
        dataTransmissao = sanitizeTimestamp(`${dateOnly} ${supabaseRecord.hora_transmissao}`);
      } else {
        // Se é apenas uma data (sem hora), adicionar 00:00:00
        if (!dataTransmissao.includes('T') && !dataTransmissao.includes(':')) {
          dataTransmissao = `${dataTransmissao} 00:00:00`;
        } else {
          // Converter ISO para formato MySQL (YYYY-MM-DD HH:MM:SS)
          const date = new Date(dataTransmissao);
          if (!isNaN(date.getTime())) {
            dataTransmissao = date.toISOString().slice(0, 19).replace('T', ' ');
          }
        }
        // Validar o timestamp final
        dataTransmissao = sanitizeTimestamp(dataTransmissao);
      }
    }

    const mapped: any = {
      id: supabaseRecord.id,
      cliente_id: clienteId, // Pode ser NULL
      cnpj: supabaseRecord.cnpj || null,
      periodo_apuracao: supabaseRecord.periodo_apuracao || supabaseRecord.periodo || null,
      data_transmissao: dataTransmissao,
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
      'status',
      'total_registros',
    ];

    for (const field of optionalFields) {
      if (supabaseRecord[field] !== undefined) {
        mapped[field] = supabaseRecord[field];
      }
    }

    // Normalizar timestamps para formato MySQL
    if (supabaseRecord.created_at) {
      const date = new Date(supabaseRecord.created_at);
      if (!isNaN(date.getTime())) {
        mapped.created_at = date.toISOString().slice(0, 19).replace('T', ' ');
      }
    } else {
      mapped.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    if (supabaseRecord.updated_at) {
      const date = new Date(supabaseRecord.updated_at);
      if (!isNaN(date.getTime())) {
        mapped.updated_at = date.toISOString().slice(0, 19).replace('T', ' ');
      }
    } else {
      mapped.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    return mapped;
  }
}

