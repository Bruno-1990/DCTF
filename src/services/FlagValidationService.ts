import { DCTFAnalysisService } from './DCTFAnalysisService';
import { DCTFIngestionService } from './DCTFIngestionService';
import { AuditTrailService } from './AuditTrailService';
import { AnalysisResult } from './DCTFAnalysisService';
import { Flag } from '../models/Flag';
import { FlagAlertService } from './FlagAlertService';

export class FlagValidationService {
  private analysis = new DCTFAnalysisService();
  private ingestion = new DCTFIngestionService();
  private flags = new Flag();
  private alerts = new FlagAlertService();

  async runForDeclaracao(declaracaoId: string): Promise<AnalysisResult> {
    const result = await this.analysis.analyzeDeclaracao(declaracaoId);

    if (result.success && result.data) {
      await this.dispararAlertas(declaracaoId);
      await AuditTrailService.record({
        event: 'flags.validation.success',
        context: {
          dctfId: declaracaoId,
          findings: result.data.summary,
        },
      });
      return result.data;
    }

    await AuditTrailService.record({
      event: 'flags.validation.error',
      context: { dctfId: declaracaoId },
      payload: { error: result.error },
    });
    throw new Error(result.error || 'Erro ao validar flags da DCTF');
  }

  async runForCliente(clienteId: string): Promise<AnalysisResult[]> {
    const datasetResp = await this.ingestion.buildDataset({ clienteId, includeDados: false });
    if (!datasetResp.success || !datasetResp.data) {
      throw new Error(datasetResp.error || 'Erro ao carregar declarações do cliente');
    }

    const results: AnalysisResult[] = [];
    for (const decl of datasetResp.data.declaracoes) {
      results.push(await this.runForDeclaracao(decl.id));
    }

    await AuditTrailService.record({
      event: 'flags.validation.batch',
      context: {
        clienteId,
        declaracoes: results.length,
      },
    });

    return results;
  }

  async runForPeriodo(periodo: string): Promise<AnalysisResult[]> {
    const datasetResp = await this.ingestion.buildDataset({ periodo, includeDados: false });
    if (!datasetResp.success || !datasetResp.data) {
      throw new Error(datasetResp.error || 'Erro ao carregar declarações do período');
    }

    const results: AnalysisResult[] = [];
    for (const decl of datasetResp.data.declaracoes) {
      results.push(await this.runForDeclaracao(decl.id));
    }

    await AuditTrailService.record({
      event: 'flags.validation.period',
      context: {
        periodo,
        declaracoes: results.length,
      },
    });

    return results;
  }

  async runForAll(): Promise<AnalysisResult[]> {
    const datasetResp = await this.ingestion.buildDataset({ includeDados: false });
    if (!datasetResp.success || !datasetResp.data) {
      throw new Error(datasetResp.error || 'Erro ao carregar declarações');
    }

    const results: AnalysisResult[] = [];
    for (const decl of datasetResp.data.declaracoes) {
      results.push(await this.runForDeclaracao(decl.id));
    }

    await AuditTrailService.record({
      event: 'flags.validation.full',
      context: {
        declaracoes: results.length,
        clientes: datasetResp.data.totals.clientes,
      },
    });

    return results;
  }

  private async dispararAlertas(declaracaoId: string): Promise<void> {
    const flagsResp = await this.flags.findByDeclaracao(declaracaoId);
    if (!flagsResp.success || !flagsResp.data) return;

    for (const flag of flagsResp.data) {
      if (flag.resolvido) continue;
      if (flag.severidade === 'critica') {
        await this.alerts.notifyCritical(flag);
      } else if (flag.severidade === 'alta') {
        await this.alerts.notifyHigh(flag);
      }
    }
  }
}


