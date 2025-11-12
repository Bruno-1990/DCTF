import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type AdminReportFormat = 'pdf' | 'xlsx';

export interface AdminReportHistoryRecord {
  id: string;
  title: string;
  reportType: string;
  format: AdminReportFormat;
  extension: string;
  mimeType: string;
  period?: string;
  identification?: string;
  filePath: string;
  createdAt: string;
  responsible?: string;
  notes?: string;
  filters?: Record<string, any>;
}

interface RegisterOptions {
  title: string;
  reportType: string;
  buffer: Buffer;
  format: AdminReportFormat;
  extension?: string;
  mimeType?: string;
  period?: string;
  identification?: string;
  responsible?: string;
  notes?: string;
  filters?: Record<string, any>;
}

interface ListOptions {
  page?: number;
  limit?: number;
  reportType?: string;
  identification?: string;
  period?: string;
}

class AdminReportHistoryService {
  private records: AdminReportHistoryRecord[] = [];

  private readonly directoryPath: string;
  private readonly metadataFilePath: string;

  constructor() {
    this.directoryPath = path.resolve(process.cwd(), 'tmp', 'admin-reports');
    this.metadataFilePath = path.join(this.directoryPath, 'history.json');
    fs.mkdirSync(this.directoryPath, { recursive: true });
    this.loadFromDisk();
  }

  register(options: RegisterOptions): AdminReportHistoryRecord {
    const id = randomUUID();
    const extension = options.extension ?? (options.format === 'xlsx' ? 'xlsx' : 'pdf');
    const mimeType = options.mimeType ?? this.resolveMimeType(options.format);
    const fileName = `${id}.${extension}`;
    const filePath = path.join(this.directoryPath, fileName);
    fs.writeFileSync(filePath, options.buffer);

    const record: AdminReportHistoryRecord = {
      id,
      title: options.title,
      reportType: options.reportType,
      format: options.format,
      extension,
      mimeType,
      period: options.period,
      identification: options.identification,
      filePath,
      createdAt: new Date().toISOString(),
      responsible: options.responsible,
      notes: options.notes,
      filters: options.filters,
    };

    this.records.unshift(record);
    this.saveToDisk();
    return record;
  }

  list(options: ListOptions = {}) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, options.limit ?? 10);

    let filtered = [...this.records];

    if (options.reportType) {
      const reportTypeLower = options.reportType.toLowerCase();
      filtered = filtered.filter(record => record.reportType.toLowerCase() === reportTypeLower);
    }

    if (options.identification) {
      const identificationLower = options.identification.toLowerCase();
      filtered = filtered.filter(record => (record.identification ?? '').toLowerCase().includes(identificationLower));
    }

    if (options.period) {
      const normalizedPeriod = options.period.trim();
      filtered = filtered.filter(record => record.period === normalizedPeriod || record.filters?.period === normalizedPeriod);
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const items = filtered.slice(startIndex, endIndex);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  getRecord(id: string): AdminReportHistoryRecord | undefined {
    return this.records.find(record => record.id === id);
  }

  getFileStream(id: string) {
    const record = this.getRecord(id);
    if (!record) {
      return null;
    }

    if (!fs.existsSync(record.filePath)) {
      return null;
    }

    return fs.createReadStream(record.filePath);
  }

  getDownloadFileName(record: AdminReportHistoryRecord): string {
    const safeTitle = record.title.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
    const base = safeTitle || 'relatorio';
    return `${base}_${record.id}.${record.extension}`;
  }

  private resolveMimeType(format: AdminReportFormat): string {
    if (format === 'xlsx') {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return 'application/pdf';
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.metadataFilePath)) {
        this.records = [];
        return;
      }

      const raw = fs.readFileSync(this.metadataFilePath, 'utf-8');
      if (!raw) {
        this.records = [];
        return;
      }

      const data = JSON.parse(raw) as AdminReportHistoryRecord[];
      const normalized = Array.isArray(data)
        ? data
            .filter(record => record && record.id && record.filePath)
            .map(record => {
              const format = record.format ?? 'pdf';
              const extension = record.extension ?? (format === 'xlsx' ? 'xlsx' : 'pdf');
              const mimeType = record.mimeType ?? this.resolveMimeType(format);
              return {
                ...record,
                format,
                extension,
                mimeType,
              } satisfies AdminReportHistoryRecord;
            })
            .filter(record => fs.existsSync(record.filePath))
        : [];

      this.records = normalized;
    } catch (error) {
      console.warn('Não foi possível carregar histórico de relatórios gerenciais. Reiniciando armazenamento.', error);
      this.records = [];
    }
  }

  private saveToDisk() {
    try {
      const payload = JSON.stringify(this.records, null, 2);
      fs.writeFileSync(this.metadataFilePath, payload, 'utf-8');
    } catch (error) {
      console.error('Não foi possível salvar histórico de relatórios gerenciais.', error);
    }
  }
}

export default new AdminReportHistoryService();
