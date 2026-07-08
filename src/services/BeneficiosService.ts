/**
 * Serviço de Benefícios — parsing de planilha CSV/XLSX e importação (Compete + Invest)
 */

import * as XLSX from 'xlsx';
import { BeneficioCompete, IBeneficioCompete } from '../models/Beneficio';
import { BeneficioInvest, IBeneficioInvest } from '../models/BeneficioInvest';

// ─── Helpers de data ───

function isValidDate(y: number, m: number, d: number): boolean {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function toISODate(y: number, m: number, d: number): string | null {
  if (!isValidDate(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDate(value: any): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return toISODate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number') {
    if (value < 1 || value > 2958465) return null;
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return toISODate(parsed.y, parsed.m, parsed.d);
    return null;
  }
  const str = String(value).trim().replace(/\u00A0/g, ' ');
  if (!str) return null;
  const brMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (brMatch) return toISODate(parseInt(brMatch[3]), parseInt(brMatch[2]), parseInt(brMatch[1]));
  const isoMatch = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (isoMatch) return toISODate(parseInt(isoMatch[1]), parseInt(isoMatch[2]), parseInt(isoMatch[3]));
  const nativeParsed = new Date(str);
  if (!isNaN(nativeParsed.getTime())) return toISODate(nativeParsed.getFullYear(), nativeParsed.getMonth() + 1, nativeParsed.getDate());
  return null;
}

// ─── Parser genérico de planilha ───

function parseRows(buffer: Buffer, filename: string): any[][] {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    // Detectar encoding
    let content = buffer.toString('utf-8');
    if (content.includes('�')) content = buffer.toString('latin1');
    const csvBuffer = Buffer.from(content, 'utf-8');

    // Detectar separador pela primeira linha
    const firstLine = content.split(/\r?\n/)[0] || '';
    const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

    // Usar xlsx para parsear CSV — respeita aspas e quebras de linha dentro de campos
    const workbook = XLSX.read(csvBuffer, { type: 'buffer', raw: true, FS: sep });
    const sheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
}

function mapRows<T>(rows: any[][], columnMap: string[], dateFields: Set<string>, requiredFields: string[]): T[] {
  if (rows.length < 2) throw new Error('Planilha vazia ou sem dados (apenas cabeçalho).');
  const dataRows = rows.slice(1).filter(row => row.some(cell => cell != null && cell !== ''));

  return dataRows
    .map(row => {
      const record: any = {};
      columnMap.forEach((field, index) => {
        let value = row[index] ?? null;
        if (dateFields.has(field)) {
          value = parseDate(value);
        } else if (value != null) {
          value = String(value).trim() || null;
        }
        record[field] = value;
      });
      return record;
    })
    .filter(r => requiredFields.every(f => r[f]));
}

// ─── Compete ───

const COMPETE_COLUMNS: string[] = [
  'razao_social', 'inscricao_estadual', 'cnpj', 'municipio',
  'portaria_inclusao', 'data_portaria', 'portaria_exclusao', 'data_portaria_exclusao',
  'contrato', 'processo', 'processo_inclusao', 'processo_exclusao',
  'data_inicio', 'data_final',
];

const COMPETE_DATE_FIELDS = new Set(['data_portaria', 'data_portaria_exclusao', 'data_inicio', 'data_final']);

// ─── Invest ───

const INVEST_COLUMNS: string[] = [
  'numero', 'data_cadastro', 'processo', 'ementa', 'base_legal', 'tipo',
  'cnpj', 'inscricao_estadual', 'razao_social', 'municipio', 'situacao',
  'data_assinatura', 'data_publicacao_dio', 'data_inicio_vigencia', 'data_final_vigencia',
  'data_prorrogacao', 'data_cancelamento', 'data_suspensao', 'data_revogacao',
];

const INVEST_DATE_FIELDS = new Set([
  'data_cadastro', 'data_assinatura', 'data_publicacao_dio',
  'data_inicio_vigencia', 'data_final_vigencia',
  'data_prorrogacao', 'data_cancelamento', 'data_suspensao', 'data_revogacao',
]);

// ─── Service ───

export class BeneficiosService {
  private competeModel = new BeneficioCompete();
  private investModel = new BeneficioInvest();

  // ─── Compete ───

  parseCompete(buffer: Buffer, filename: string) {
    const rows = parseRows(buffer, filename);
    return mapRows<Omit<IBeneficioCompete, 'id' | 'created_at' | 'updated_at'>>(
      rows, COMPETE_COLUMNS, COMPETE_DATE_FIELDS, ['razao_social', 'cnpj']
    );
  }

  async importarCompete(buffer: Buffer, filename: string): Promise<{ importados: number; total: number }> {
    const registros = this.parseCompete(buffer, filename);
    await this.competeModel.limparTudo();
    const result = await this.competeModel.importarLote(registros);
    if (!result.success) throw new Error(result.error || 'Erro ao importar');
    return { importados: result.data!.importados, total: registros.length };
  }

  async listarCompete(page = 1, limit = 50, busca?: string) {
    const { mysqlPool } = await import('../config/mysql');
    const offset = (page - 1) * limit;
    let where = '';
    const params: any[] = [];
    if (busca) {
      where = `WHERE razao_social LIKE ? OR cnpj LIKE ? OR municipio LIKE ?`;
      const like = `%${busca}%`;
      params.push(like, like, like);
    }
    const [countRows] = await mysqlPool.query<any[]>(`SELECT COUNT(*) as total FROM beneficio_compete ${where}`, params);
    const total = countRows[0]?.total || 0;
    const [dataRows] = await mysqlPool.query<any[]>(
      `SELECT * FROM beneficio_compete ${where} ORDER BY razao_social ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { items: dataRows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async comparacaoCompete(page = 1, limit = 50, busca?: string) {
    return this.competeModel.listarComparacao(page, limit, busca);
  }

  async limparCompete() { return this.competeModel.limparTudo(); }

  // ─── Invest ───

  parseInvest(buffer: Buffer, filename: string) {
    const rows = parseRows(buffer, filename);
    return mapRows<Omit<IBeneficioInvest, 'id' | 'created_at' | 'updated_at'>>(
      rows, INVEST_COLUMNS, INVEST_DATE_FIELDS, ['razao_social', 'cnpj']
    );
  }

  async importarInvest(buffer: Buffer, filename: string): Promise<{ importados: number; total: number }> {
    const registros = this.parseInvest(buffer, filename);
    await this.investModel.limparTudo();
    const result = await this.investModel.importarLote(registros);
    if (!result.success) throw new Error(result.error || 'Erro ao importar');
    return { importados: result.data!.importados, total: registros.length };
  }

  async listarInvest(page = 1, limit = 50, busca?: string) {
    const { mysqlPool } = await import('../config/mysql');
    const offset = (page - 1) * limit;
    let where = '';
    const params: any[] = [];
    if (busca) {
      where = `WHERE razao_social LIKE ? OR cnpj LIKE ? OR municipio LIKE ?`;
      const like = `%${busca}%`;
      params.push(like, like, like);
    }
    const [countRows] = await mysqlPool.query<any[]>(`SELECT COUNT(*) as total FROM beneficio_invest ${where}`, params);
    const total = countRows[0]?.total || 0;
    const [dataRows] = await mysqlPool.query<any[]>(
      `SELECT * FROM beneficio_invest ${where} ORDER BY razao_social ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { items: dataRows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async comparacaoInvest(page = 1, limit = 50, busca?: string) {
    return this.investModel.listarComparacao(page, limit, busca);
  }

  async limparInvest() { return this.investModel.limparTudo(); }
}
