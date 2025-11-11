import { ApiResponse, DCTFAnalysisDataset, NormalizedDCTFDeclaracao } from '../types';
import { DCTF as DCTFModel } from '../models/DCTF';
import { Flag as FlagModel } from '../models/Flag';
import { DCTFIngestionService } from './DCTFIngestionService';
import { ValidationService } from './ValidationService';
import { WebSocketGateway } from './WebSocketGateway';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type AnalysisFinding = {
  code: string;
  severity: Severity;
  message: string;
  actionPlan: string;
  context?: Record<string, any>;
  legalReference?: string;
  estimatedPenalty?: number;
};

export type AnalysisResult = {
  dctfId: string;
  clienteId?: string;
  periodo?: string;
  findings: AnalysisFinding[];
  summary: {
    numFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  riskScore: number;
  estimatedPenalty: number;
};

export class DCTFAnalysisService {
  private dctf = new DCTFModel();
  private flags = new FlagModel();
  private ingestion = new DCTFIngestionService();

  async analyzeDeclaracao(dctfId: string): Promise<ApiResponse<AnalysisResult>> {
    const datasetResp = await this.ingestion.buildDataset({
      declaracaoId: dctfId,
      includeDados: true,
      includeCliente: true,
      logContext: 'analysis',
    });

    if (!datasetResp.success || !datasetResp.data || datasetResp.data.declaracoes.length === 0) {
      return { success: false, error: datasetResp.error || 'DCTF não encontrada' };
    }

    const dataset = datasetResp.data;
    const decl = dataset.declaracoes[0];
    const findings: AnalysisFinding[] = [];

    // 1) Período inválido/futuro
    if (!ValidationService.validatePeriodo(decl.periodo)) {
      findings.push({
        code: 'PERIODO_INVALIDO',
        severity: 'high',
        message: `Período inválido: ${decl.periodo}`,
        actionPlan: 'Corrigir o período para o formato YYYY-MM e reenviar a declaração.',
        legalReference: 'IN RFB nº 2.005/2021, art. 6º',
      });
    } else {
      const [ano, mes] = decl.periodo.split('-').map(Number);
      const agora = new Date();
      const futuridadeMax = new Date(agora.getFullYear(), agora.getMonth() + 4, 1);
      const periodoDate = new Date(ano, mes - 1, 1);
      if (periodoDate > futuridadeMax) {
        findings.push({
          code: 'PERIODO_MUITO_FUTURO',
          severity: 'medium',
          message: `Período muito futuro para ${decl.periodo}`,
          actionPlan: 'Validar se a competência futura está correta; ajustar se necessário.',
          legalReference: 'IN RFB nº 2.005/2021, art. 6º',
        });
      }
    }

    findings.push(...await this.detectDuplicidades(decl));
    findings.push(...await this.validateDataset(dataset));
    findings.push(...await this.detectOmissoes(decl));
    findings.push(...this.detectAtrasoEntrega(decl));

    await this.syncFlags(decl, findings);

    const summary = {
      numFindings: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    };

    const estimatedPenalty = findings.reduce((acc, finding) => acc + (finding.estimatedPenalty || 0), 0);
    const riskScore = this.calculateRiskScore(findings);

    const analysisResult: AnalysisResult = {
      dctfId,
      clienteId: decl.clienteId,
      periodo: decl.periodo,
      findings,
      summary,
      riskScore,
      estimatedPenalty,
    };

    this.emitRealtimeEvents(analysisResult);

    return {
      success: true,
      data: {
        ...analysisResult,
      }
    };
  }

  private async detectDuplicidades(decl: NormalizedDCTFDeclaracao): Promise<AnalysisFinding[]> {
    const findings: AnalysisFinding[] = [];
    if (decl.clienteId && decl.periodo) {
      const dup = await this.dctf.findBy({ cliente_id: decl.clienteId, periodo: decl.periodo });
      if (dup.success && dup.data && dup.data.length > 1) {
        findings.push({
          code: 'DUPLICIDADE_DECLARACAO',
          severity: 'critical',
          message: `Mais de uma declaração para o cliente ${decl.clienteId} e período ${decl.periodo}`,
          actionPlan: 'Identificar a declaração correta, cancelar duplicata e retificar eventuais diferenças.',
          legalReference: 'IN RFB nº 2.005/2021, art. 11',
          estimatedPenalty: 500,
        });
      }
    }
    return findings;
  }

  private async detectOmissoes(decl: NormalizedDCTFDeclaracao): Promise<AnalysisFinding[]> {
    if (!decl.clienteId || !decl.periodo) return [];

    const allDeclResp = await this.ingestion.buildDataset({
      clienteId: decl.clienteId,
      includeDados: false,
      includeCliente: false,
    });

    if (!allDeclResp.success || !allDeclResp.data) return [];

    const periodos = allDeclResp.data.declaracoes.map(d => d.periodo);
    const missing = this.getMissingPeriods(periodos, decl.periodo);
    if (missing.length === 0) return [];

    return missing.map(periodo => ({
      code: 'OMISSAO_DECLARACAO',
      severity: 'critical',
      message: `Período ${periodo} não possui DCTF transmitida para o cliente ${decl.clienteId}`,
      actionPlan: `Providenciar a entrega imediata da DCTF omitida referente à competência ${periodo}.`,
      legalReference: 'IN RFB nº 2.005/2021, arts. 4º e 6º',
      estimatedPenalty: 500,
      context: { periodoOmitido: periodo },
    }));
  }

  private getMissingPeriods(periodos: string[], referencia: string): string[] {
    const parsed = periodos
      .map(p => ValidationService.normalizePeriodo(p))
      .filter((p): p is string => Boolean(p));

    if (!parsed.includes(referencia)) {
      parsed.push(referencia);
    }

    const ordered = parsed
      .map(p => {
        const [ano, mes] = p.split('-').map(Number);
        return { ano, mes, periodo: p };
      })
      .sort((a, b) => (a.ano === b.ano ? a.mes - b.mes : a.ano - b.ano));

    const missing: string[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const current = ordered[i];
      let cursorAno = prev.ano;
      let cursorMes = prev.mes + 1;
      while (cursorAno < current.ano || (cursorAno === current.ano && cursorMes < current.mes)) {
        missing.push(`${cursorAno}-${String(cursorMes).padStart(2, '0')}`);
        cursorMes += 1;
        if (cursorMes > 12) {
          cursorMes = 1;
          cursorAno += 1;
        }
      }
    }

    return missing;
  }

  private detectAtrasoEntrega(decl: NormalizedDCTFDeclaracao): AnalysisFinding[] {
    if (!decl.periodo || !decl.dataDeclaracao) return [];

    const [ano, mes] = decl.periodo.split('-').map(Number);
    const competenciaUltimoDia = new Date(ano, mes, 0);
    const prazoEntrega = new Date(competenciaUltimoDia.getFullYear(), competenciaUltimoDia.getMonth() + 1, 0);

    const dataDeclaracao = new Date(decl.dataDeclaracao);
    if (dataDeclaracao <= prazoEntrega) return [];

    const mesesAtraso = this.diffInMonths(prazoEntrega, dataDeclaracao);
    const multa = Math.min(0.02 * mesesAtraso * (decl.debitoApurado || 0), (decl.debitoApurado || 0) * 0.2);
    const multaBase = Math.max(multa, decl.debitoApurado ? decl.debitoApurado * 0.02 : 200);

    return [
      {
        code: 'ENTREGA_FORA_DO_PRAZO',
        severity: multaBase > 1000 ? 'critical' : 'high',
        message: `Declaração transmitida em ${dataDeclaracao.toISOString()}, após prazo estimado ${prazoEntrega.toISOString()}`,
        actionPlan: 'Emitir DARF da multa por atraso (código 2170) e regularizar o pagamento imediatamente.',
        legalReference: 'Lei nº 9.430/1996, art. 57; IN RFB nº 2.005/2021, art. 12',
        estimatedPenalty: Math.max(200, multaBase),
        context: { mesesAtraso },
      },
    ];
  }

  private diffInMonths(start: Date, end: Date): number {
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();
    return Math.max(1, yearDiff * 12 + monthDiff + (end.getDate() > start.getDate() ? 1 : 0));
  }

  private async validateDataset(dataset: DCTFAnalysisDataset): Promise<AnalysisFinding[]> {
    const findings: AnalysisFinding[] = [];
    const decl = dataset.declaracoes[0];

    let clienteCNPJ: string | undefined;
    if (decl.cliente?.cnpjLimpo) {
      clienteCNPJ = decl.cliente.cnpjLimpo;
    }

    for (const dado of decl.dados) {
      if (clienteCNPJ && dado.cnpjCpf && dado.cnpjCpf.length === 14 && dado.cnpjCpf !== clienteCNPJ) {
        findings.push({
          code: 'CNPJ_DIVERGENTE',
          severity: 'high',
          message: `Linha ${dado.linha}: CNPJ ${dado.cnpjCpf} divergente do cliente ${clienteCNPJ}`,
          actionPlan: 'Alinhar o CNPJ informado na linha à identificação oficial do contribuinte.',
          legalReference: 'IN RFB nº 2.005/2021, art. 8º',
        });
      }

      if ((dado.codigo?.startsWith('0') || dado.codigo?.startsWith('2')) && (dado.valor ?? 0) < 0) {
        findings.push({
          code: 'VALOR_NEGATIVO',
          severity: 'high',
          message: `Linha ${dado.linha}: valor negativo ${dado.valor} para o código ${dado.codigo}`,
          actionPlan: 'Reavaliar o lançamento e corrigir o valor conforme a natureza do tributo.',
          legalReference: 'IN RFB nº 2.005/2021, art. 12, inciso II',
        });
      }
    }

    const receitaLiquida = Math.max(0, decl.stats.receitaTotal - decl.stats.deducaoTotal);
    if (decl.stats.deducaoTotal > decl.stats.receitaTotal && decl.stats.receitaTotal > 0) {
      findings.push({
        code: 'DEDUCAO_SUPERIOR_RECEITA',
        severity: 'high',
        message: `Deduções ${decl.stats.deducaoTotal.toFixed(2)} superiores à receita ${decl.stats.receitaTotal.toFixed(2)}`,
        actionPlan: 'Revisar compensações e deduções; justificar eventuais créditos fiscais antes da transmissão.',
        legalReference: 'Lei nº 9.430/1996, art. 44',
        estimatedPenalty: receitaLiquida * 0.75,
      });
    }

    if (decl.stats.retencaoTotal > receitaLiquida && receitaLiquida > 0) {
      findings.push({
        code: 'RETENCAO_SUPERIOR_RECEITA_LIQUIDA',
        severity: 'high',
        message: `Retenções ${decl.stats.retencaoTotal.toFixed(2)} superiores à receita líquida ${receitaLiquida.toFixed(2)}`,
        actionPlan: 'Ajustar base de retenções e códigos aplicados para compatibilizar com a receita.',
        legalReference: 'IN RFB nº 2.005/2021, Anexos – Tabelas 2 e 8',
      });
    }

    if (!decl.situacao || decl.situacao.toLowerCase() !== 'ativa') {
      findings.push({
        code: 'SITUACAO_NAO_ATIVA',
        severity: 'medium',
        message: `A declaração está com situação "${decl.situacao ?? 'indefinida'}".`,
        actionPlan: 'Verificar se a declaração foi processada corretamente e, se necessário, reenviar ou retificar.',
        legalReference: 'IN RFB nº 2.005/2021, art. 10',
      });
    }

    return findings;
  }

  private async syncFlags(decl: NormalizedDCTFDeclaracao, findings: AnalysisFinding[]): Promise<void> {
    if (!decl.id) return;

    for (const finding of findings) {
      if (finding.severity === 'high' || finding.severity === 'critical') {
        await this.flags.upsertFlag(
          decl.id,
          finding.code,
          finding.message,
          finding.severity === 'critical' ? 'critica' : 'alta'
        );
      }
    }
  }

  private calculateRiskScore(findings: AnalysisFinding[]): number {
    if (findings.length === 0) return 0;

    const weights: Record<Severity, number> = {
      critical: 25,
      high: 15,
      medium: 7,
      low: 3,
    };

    const base = findings.reduce((acc, finding) => acc + weights[finding.severity], 0);
    return Math.min(100, base);
  }

  private emitRealtimeEvents(result: AnalysisResult): void {
    const gateway = WebSocketGateway.getInstance();
    if (!gateway) {
      return;
    }

    const analysisPayload = {
      dctfId: result.dctfId,
      clienteId: result.clienteId,
      periodo: result.periodo,
      findings: result.findings,
      summary: result.summary,
      riskScore: result.riskScore,
      estimatedPenalty: result.estimatedPenalty,
    };

    gateway.emitToAnalysis('analysis.completed', result.dctfId, analysisPayload);

    if (result.clienteId) {
      gateway.emitToClient('analysis.completed', result.clienteId, analysisPayload);
    }

    const criticalOrHigh = result.findings.filter(finding => finding.severity === 'critical' || finding.severity === 'high');
    for (const finding of criticalOrHigh) {
      const flagPayload = {
        dctfId: result.dctfId,
        clienteId: result.clienteId,
        codigo: finding.code,
        severidade: finding.severity === 'critical' ? 'critica' : 'alta',
        mensagem: finding.message,
        actionPlan: finding.actionPlan,
        periodo: result.periodo,
        riskScore: result.riskScore,
      };

      if (finding.severity === 'critical') {
        gateway.broadcastCritical('flags.created', flagPayload);
      } else if (result.clienteId) {
        gateway.emitToClient('flags.created', result.clienteId, flagPayload);
      }

      gateway.emitToAnalysis('flags.updated', result.dctfId, flagPayload);
    }
  }
}


