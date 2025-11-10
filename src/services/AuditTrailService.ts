import { promises as fs } from 'fs';
import path from 'path';

export interface AuditTrailEntry {
  event: string;
  timestamp?: string;
  user?: string;
  context?: Record<string, any>;
  payload?: Record<string, any>;
}

export class AuditTrailService {
  private static logFilePath = path.resolve(process.cwd(), 'logs', 'dctf-analysis.log');

  static async record(entry: AuditTrailEntry): Promise<void> {
    const logEntry: AuditTrailEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    await AuditTrailService.ensureLogFile();
    await fs.appendFile(this.logFilePath, `${JSON.stringify(logEntry)}\n`, { encoding: 'utf8' });
  }

  private static async ensureLogFile(): Promise<void> {
    try {
      await fs.access(this.logFilePath);
    } catch {
      const dir = path.dirname(this.logFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.logFilePath, '', { encoding: 'utf8' });
    }
  }
}


