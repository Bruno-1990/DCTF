/**
 * Serviço de backup/restauração da tabela dctf_declaracoes (MySQL).
 * Backup é gerado antes de cada sincronização Supabase → MySQL.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getConnection } from '../config/mysql';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups', 'dctf_declaracoes');
const TABLE_NAME = 'dctf_declaracoes';
const MAX_BACKUPS = 10; // Manter apenas os N backups mais recentes

export interface LastBackupInfo {
  filename: string;
  date: string;       // ISO 8601
  dateFormatted: string; // ex: 26/02/2026 14:30
  path: string;
}

export class DCTFBackupService {
  private isDateTimeType(mysqlDataType: string): boolean {
    const t = mysqlDataType.toLowerCase();
    return t === 'timestamp' || t === 'datetime';
  }

  private toMysqlDateTimeUTC(date: Date): string {
    // MySQL TIMESTAMP/DATETIME não aceita ISO com 'T'/'Z'
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private toMysqlDateUTC(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  /**
   * Cria backup da tabela dctf_declaracoes (exporta para JSON com timestamp).
   * Deve ser chamado ANTES de iniciar a sincronização.
   */
  async createBackup(): Promise<{ success: boolean; filename?: string; error?: string }> {
    this.ensureBackupDir();
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `dctf_declaracoes_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    try {
      const conn = await getConnection();
      try {
        const [rows] = await conn.execute(`SELECT * FROM ${TABLE_NAME}`);
        const data = Array.isArray(rows) ? rows : [];
        const content = JSON.stringify({ table: TABLE_NAME, exportedAt: now.toISOString(), rows: data }, null, 0);
        fs.writeFileSync(filepath, content, 'utf8');
        this.pruneOldBackups();
        return { success: true, filename };
      } finally {
        conn.release();
      }
    } catch (err: any) {
      console.error('[DCTF Backup] Erro ao criar backup:', err);
      return { success: false, error: err.message || 'Erro ao criar backup' };
    }
  }

  private pruneOldBackups(): void {
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('dctf_declaracoes_') && f.endsWith('.json'))
        .map((f) => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime);
      while (files.length > MAX_BACKUPS) {
        const old = files.pop()!;
        fs.unlinkSync(old.path);
      }
    } catch (_) {}
  }

  /**
   * Retorna o backup mais recente (para exibir no botão Restaurar).
   */
  getLastBackup(): LastBackupInfo | null {
    this.ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('dctf_declaracoes_') && f.endsWith('.json'))
      .map((f) => path.join(BACKUP_DIR, f))
      .filter((p) => fs.statSync(p).isFile())
      .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
    if (files.length === 0) return null;
    const filepath = files[0];
    const stat = fs.statSync(filepath);
    const filename = path.basename(filepath);
    const date = stat.mtime;
    const dateFormatted = date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      filename,
      date: date.toISOString(),
      dateFormatted,
      path: filepath,
    };
  }

  /**
   * Restaura a tabela dctf_declaracoes a partir do backup mais recente.
   */
  async restoreFromLastBackup(): Promise<{ success: boolean; restored: number; error?: string }> {
    const last = this.getLastBackup();
    if (!last) {
      return { success: false, restored: 0, error: 'Nenhum backup encontrado' };
    }

    try {
      const raw = fs.readFileSync(last.path, 'utf8');
      const { rows } = JSON.parse(raw) as { table: string; exportedAt: string; rows: any[] };
      if (!Array.isArray(rows) || rows.length === 0) {
        const conn = await getConnection();
        try {
          await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
          await conn.execute(`TRUNCATE TABLE ${TABLE_NAME}`);
          await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
        } finally {
          conn.release();
        }
        return { success: true, restored: 0 };
      }

      const conn = await getConnection();
      let foreignKeyChecksDisabled = false;
      try {
        // Descobrir colunas/tipos atuais no MySQL para normalizar datas e evitar inserir colunas inexistentes
        const [dbCols] = (await conn.execute(
          `SELECT COLUMN_NAME as name, DATA_TYPE as dataType
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [TABLE_NAME]
        )) as [Array<{ name: string; dataType: string }>, any];

        const dbTypeByName = new Map<string, string>();
        for (const c of dbCols || []) {
          if (c?.name) dbTypeByName.set(String(c.name), String(c.dataType || '').toLowerCase());
        }

        const backupColumns = Object.keys(rows[0]).filter((k) => k !== undefined && k !== null && String(k).trim().length > 0);
        const columns = backupColumns.filter((c) => dbTypeByName.has(c));

        if (columns.length === 0) {
          return { success: false, restored: 0, error: 'Backup não possui colunas compatíveis com o schema atual do MySQL' };
        }

        const normalizeValueForColumn = (columnName: string, value: any): any => {
          if (value === undefined || value === null) return null;
          const t = dbTypeByName.get(columnName);
          if (!t) return value;

          // Se vier como Date (pouco provável após JSON.parse), normalizar
          if (value instanceof Date) {
            if (t === 'date') return this.toMysqlDateUTC(value);
            if (this.isDateTimeType(t)) return this.toMysqlDateTimeUTC(value);
            return value;
          }

          if (typeof value === 'string') {
            const v = value.trim();
            if (!v) return v;

            // ISO 8601 (ex: 2025-11-21T12:46:25.000Z) -> MySQL
            if (v.includes('T')) {
              const d = new Date(v);
              if (!Number.isNaN(d.getTime())) {
                if (t === 'date') return this.toMysqlDateUTC(d);
                if (this.isDateTimeType(t)) return this.toMysqlDateTimeUTC(d);
              }

              // Fallback simples (evita "Incorrect datetime value" quando o parse falha por algum motivo)
              if (this.isDateTimeType(t)) {
                return v.replace('T', ' ').replace(/Z$/i, '').replace(/\.\d{1,6}$/, '');
              }
            }

            // Se a coluna é DATE e vier com horário, manter só YYYY-MM-DD
            if (t === 'date') {
              const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
              if (m) return m[1];
            }
          }

          return value;
        };

        await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
        foreignKeyChecksDisabled = true;
        await conn.execute(`TRUNCATE TABLE ${TABLE_NAME}`);
        const BATCH = 100;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const placeholders = batch.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
          const sql = `INSERT INTO ${TABLE_NAME} (${columns.join(', ')}) VALUES ${placeholders}`;
          const values = batch.flatMap((row) => columns.map((c) => normalizeValueForColumn(c, row?.[c])));
          await conn.execute(sql, values);
        }
        await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
        foreignKeyChecksDisabled = false;
        return { success: true, restored: rows.length };
      } finally {
        // IMPORTANTE: garantir que a conexão não volte ao pool com FK checks desativado
        if (foreignKeyChecksDisabled) {
          try {
            await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
          } catch (_) {}
        }
        conn.release();
      }
    } catch (err: any) {
      console.error('[DCTF Backup] Erro ao restaurar:', err);
      return { success: false, restored: 0, error: err.message || 'Erro ao restaurar' };
    }
  }
}
