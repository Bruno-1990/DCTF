import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface IUploadHistory {
  id: string;
  clienteId: string;
  clienteNome?: string;
  periodo: string;
  filename: string;
  totalLinhas: number;
  processadas: number;
  status: 'sucesso' | 'erro';
  mensagem?: string;
  timestamp: string; // ISO
}

export class UploadHistory extends DatabaseService<IUploadHistory> {
  private static memoryStore: IUploadHistory[] = [];
  constructor() {
    super('upload_history');
  }

  async add(entry: Omit<IUploadHistory, 'id'> & { id?: string }): Promise<ApiResponse<IUploadHistory>> {
    const record: IUploadHistory = {
      id: entry.id || (global as any).crypto?.randomUUID?.() || Date.now().toString(),
      clienteId: entry.clienteId,
      clienteNome: entry.clienteNome,
      periodo: entry.periodo,
      filename: entry.filename,
      totalLinhas: entry.totalLinhas,
      processadas: entry.processadas,
      status: entry.status,
      mensagem: entry.mensagem,
      timestamp: entry.timestamp,
    };

    if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
      UploadHistory.memoryStore.unshift(record);
      UploadHistory.memoryStore = UploadHistory.memoryStore.slice(0, 500);
      return { success: true, data: record };
    }

    return this.create({
      id: record.id,
      clienteId: record.clienteId,
      clienteNome: record.clienteNome,
      periodo: record.periodo,
      filename: record.filename,
      totalLinhas: record.totalLinhas,
      processadas: record.processadas,
      status: record.status,
      mensagem: record.mensagem,
      timestamp: record.timestamp,
    });
  }

  async list(params: { page?: number; limit?: number; clienteId?: string; periodo?: string }): Promise<ApiResponse<{ items: IUploadHistory[]; total: number }>> {
    const { page = 1, limit = 10, clienteId, periodo } = params;

    if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
      let data = UploadHistory.memoryStore;
      if (clienteId) data = data.filter(i => i.clienteId === clienteId);
      if (periodo) data = data.filter(i => i.periodo === periodo);
      const start = (page - 1) * limit;
      const end = start + limit;
      return { success: true, data: { items: data.slice(start, end), total: data.length } };
    }

    const adapter = this.supabase as any;
    let query = adapter.from(this.tableName).select('*', { count: 'exact' }).order('timestamp', { ascending: false });
    if (clienteId) query = query.eq('clienteId', clienteId);
    if (periodo) query = query.eq('periodo', periodo);
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    const { data, error, count } = await query.range(start, end);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { items: (data as IUploadHistory[]) || [], total: count || 0 } };
  }
}
