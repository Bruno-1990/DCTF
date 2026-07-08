/**
 * Serviço para sincronizar dados DCTF da tabela MySQL `scrapecac` para `dctf_declaracoes`.
 *
 * Fonte: outro projeto (scraping do e-CAC) popula `scrapecac` no mesmo banco MySQL.
 * Destino: tabela `dctf_declaracoes` consumida pelo frontend.
 *
 * Substitui a antiga sincronização Supabase -> MySQL.
 */

import { mysqlPool } from '../config/mysql';
import { ApiResponse } from '../types';

interface SyncProgress {
  total: number;
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  /** Registros ignorados por já existir no destino (mesmo id) */
  skippedDuplicate?: number;
  /** IDs ignorados (já existiam no destino) */
  skippedIds?: string[];
  currentBatch: number;
  totalBatches: number;
}

interface ScrapecacRow {
  id: string;
  tipo_ni: string;
  numero_identificacao: string;
  periodo_apuracao: string;
  data_transmissao: string;
  categoria: string;
  origem: string;
  tipo: string;
  situacao: string;
  debito_apurado: string;
  saldo_a_pagar: string;
  extracted_at: Date;
}

export class DCTFSyncService {
  private batchSize: number = 100;

  /**
   * Mantém compatibilidade com o controller — agora apenas confirma que o pool MySQL existe.
   */
  isSupabaseAvailable(): boolean {
    return !!mysqlPool;
  }

  /**
   * Sincroniza todas as declarações de `scrapecac` para `dctf_declaracoes`.
   */
  async syncFromScrapecac(
    onProgress?: (progress: SyncProgress) => void
  ): Promise<ApiResponse<SyncProgress & { errorLog?: string[] }>> {
    const errorLog: string[] = [];

    try {
      console.log('[DCTF Sync] Iniciando sincronização de scrapecac → dctf_declaracoes...');

      // 1. Total na origem
      const [countRows] = await mysqlPool.query<any[]>('SELECT COUNT(*) AS n FROM scrapecac');
      const total = Number(countRows[0]?.n || 0);
      console.log(`[DCTF Sync] Total na scrapecac: ${total}`);

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
          message: 'Nenhum registro encontrado em scrapecac para sincronizar',
        };
      }

      const totalBatches = Math.ceil(total / this.batchSize);
      let processed = 0;
      let inserted = 0;
      const updated = 0;
      let errors = 0;
      let skippedDuplicate = 0;
      const skippedIds: string[] = [];

      for (let batch = 0; batch < totalBatches; batch++) {
        const offset = batch * this.batchSize;
        console.log(`[DCTF Sync] Lote ${batch + 1}/${totalBatches} (offset ${offset})`);

        const [batchRows] = await mysqlPool.query<any[]>(
          `SELECT id, tipo_ni, numero_identificacao, periodo_apuracao, data_transmissao,
                  categoria, origem, tipo, situacao, debito_apurado, saldo_a_pagar, extracted_at
             FROM scrapecac
             ORDER BY extracted_at ASC, id ASC
             LIMIT ? OFFSET ?`,
          [this.batchSize, offset]
        );

        for (const record of batchRows as ScrapecacRow[]) {
          try {
            const mapped = await this.mapScrapecacToDctf(record);
            if (!mapped) {
              errors++;
              processed++;
              errorLog.push(`MAP FALHOU - id=${record.id}, periodo=${record.periodo_apuracao}`);
              continue;
            }

            const [existing] = await mysqlPool.query<any[]>(
              'SELECT id FROM dctf_declaracoes WHERE id = ? LIMIT 1',
              [mapped.id]
            );
            if (existing.length > 0) {
              skippedDuplicate++;
              skippedIds.push(mapped.id);
              processed++;
              if (onProgress) {
                onProgress({
                  total, processed, inserted, updated, errors, skippedDuplicate,
                  skippedIds: [...skippedIds], currentBatch: batch + 1, totalBatches,
                });
              }
              continue;
            }

            await mysqlPool.query(
              `INSERT INTO dctf_declaracoes
                 (id, cliente_id, cnpj, periodo_apuracao, data_transmissao,
                  situacao, tipo_ni, categoria, origem, tipo,
                  debito_apurado, saldo_a_pagar, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                mapped.id,
                mapped.cliente_id,
                mapped.cnpj,
                mapped.periodo_apuracao,
                mapped.data_transmissao,
                mapped.situacao,
                mapped.tipo_ni,
                mapped.categoria,
                mapped.origem,
                mapped.tipo,
                mapped.debito_apurado,
                mapped.saldo_a_pagar,
                mapped.created_at,
                mapped.updated_at,
              ]
            );
            inserted++;
            processed++;

            if (onProgress) {
              onProgress({
                total, processed, inserted, updated, errors, skippedDuplicate,
                skippedIds: [...skippedIds], currentBatch: batch + 1, totalBatches,
              });
            }
          } catch (recordError: any) {
            const msg = `INSERT FALHOU - id=${record.id}, periodo=${record.periodo_apuracao}, err=${recordError?.sqlMessage || recordError?.message}`;
            console.error('[DCTF Sync] ❌', msg);
            errorLog.push(msg);
            errors++;
            processed++;
          }
        }

        if (batch < totalBatches - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      const result: SyncProgress = {
        total, processed, inserted, updated, errors,
        skippedDuplicate,
        skippedIds: skippedIds.length > 0 ? skippedIds : undefined,
        currentBatch: totalBatches, totalBatches,
      };

      console.log('[DCTF Sync] Concluído:', result);

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
      console.error('[DCTF Sync] Erro geral:', error);
      return {
        success: false,
        error: error?.sqlMessage || error?.message || 'Erro desconhecido ao sincronizar dados',
      };
    }
  }

  /**
   * Alias retrocompatível com o nome antigo. Hoje aponta para syncFromScrapecac.
   */
  async syncFromSupabase(
    onProgress?: (progress: SyncProgress) => void
  ): Promise<ApiResponse<SyncProgress & { errorLog?: string[] }>> {
    return this.syncFromScrapecac(onProgress);
  }

  /**
   * Traduz uma linha de scrapecac para o formato de dctf_declaracoes.
   * Retorna null se a linha for inutilizável.
   */
  private async mapScrapecacToDctf(row: ScrapecacRow): Promise<{
    id: string;
    cliente_id: string | null;
    cnpj: string | null;
    periodo_apuracao: string | null;
    data_transmissao: string | null;
    situacao: string | null;
    tipo_ni: string | null;
    categoria: string | null;
    origem: string | null;
    tipo: string | null;
    debito_apurado: number | null;
    saldo_a_pagar: number | null;
    created_at: string;
    updated_at: string;
  } | null> {
    if (!row.id) return null;

    const cnpjLimpo = (row.numero_identificacao || '').replace(/\D/g, '');
    const clienteId = cnpjLimpo ? await this.lookupClienteIdByCnpj(cnpjLimpo) : null;

    return {
      id: row.id,
      cliente_id: clienteId,
      cnpj: cnpjLimpo || null,
      periodo_apuracao: normalizePeriodo(row.periodo_apuracao),
      data_transmissao: parseBrDateTime(row.data_transmissao),
      situacao: blankToNull(row.situacao),
      tipo_ni: blankToNull(row.tipo_ni),
      categoria: blankToNull(row.categoria),
      origem: blankToNull(row.origem),
      tipo: blankToNull(row.tipo),
      debito_apurado: parseBrNumber(row.debito_apurado),
      saldo_a_pagar: parseBrNumber(row.saldo_a_pagar),
      created_at: toMysqlDateTime(row.extracted_at) || toMysqlDateTime(new Date())!,
      updated_at: toMysqlDateTime(row.extracted_at) || toMysqlDateTime(new Date())!,
    };
  }

  private async lookupClienteIdByCnpj(cnpjLimpo: string): Promise<string | null> {
    if (!cnpjLimpo) return null;
    try {
      const [rows] = await mysqlPool.query<any[]>(
        'SELECT id FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
        [cnpjLimpo]
      );
      return rows[0]?.id || null;
    } catch {
      return null;
    }
  }
}

/** "04/2026" -> "2026-04"; "2026" -> "2026" (mantém); "" -> null. */
function normalizePeriodo(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) return s;
  return s;
}

/** "15/05/2026 17:00:32" -> "2026-05-15 17:00:32"; "" -> null. */
function parseBrDateTime(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === '-') return null;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/);
  if (m) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m;
    const h = Math.min(parseInt(hh, 10), 23);
    const mn = Math.min(parseInt(mi, 10), 59);
    const sc = Math.min(parseInt(ss, 10), 59);
    return `${yyyy}-${mm}-${dd} ${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return toMysqlDateTime(d);
  }
  return null;
}

/** "1.164.177,74" -> 1164177.74; "" -> null. */
function parseBrNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toMysqlDateTime(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function blankToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
