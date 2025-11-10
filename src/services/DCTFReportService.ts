import { promises as fs } from 'fs';
import path from 'path';
import { AnalysisFinding, AnalysisResult } from './DCTFAnalysisService';
import { DCTFAnalysisDataset } from '../types';
import { Flag } from '../models/Flag';

export interface ActionPlanReport {
  header: {
    dctfId: string;
    clienteId?: string;
    periodo?: string;
    generatedAt: string;
    totalFindings: number;
    riskScore: number;
    estimatedPenalty: number;
  };
  highlights: {
    critical: AnalysisFinding[];
    high: AnalysisFinding[];
  };
  recommendations: AnalysisFinding[];
  legalReferences: string[];
  summaryTable: Array<{
    code: string;
    description: string;
    severity: string;
    estimatedPenalty?: number;
    legalReference?: string;
  }>;
}

export class DCTFReportService {
  private static flagsModel = new Flag();

  static buildActionPlan(result: AnalysisResult): ActionPlanReport {
    const legalSet = new Set<string>();

    result.findings.forEach(f => {
      if (f.legalReference) {
        legalSet.add(f.legalReference);
      }
    });

    return {
      header: {
        dctfId: result.dctfId,
        clienteId: result.clienteId,
        periodo: result.periodo,
        generatedAt: new Date().toISOString(),
        totalFindings: result.summary.numFindings,
        riskScore: result.riskScore,
        estimatedPenalty: result.estimatedPenalty,
      },
      highlights: {
        critical: result.findings.filter(f => f.severity === 'critical'),
        high: result.findings.filter(f => f.severity === 'high'),
      },
      recommendations: result.findings,
      legalReferences: Array.from(legalSet),
      summaryTable: result.findings.map(f => ({
        code: f.code,
        description: f.message,
        severity: f.severity,
        estimatedPenalty: f.estimatedPenalty,
        legalReference: f.legalReference,
      })),
    };
  }

  static async exportMarkdown(
    report: ActionPlanReport,
    dataset?: DCTFAnalysisDataset,
    outputDir = path.resolve(process.cwd(), 'docs', 'relatorios')
  ): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });
    const fileName = `action-plan-${report.header.dctfId}-${Date.now()}.md`;
    const filePath = path.join(outputDir, fileName);

    const lines: string[] = [];
    lines.push(`# Plano de Ação DCTF ${report.header.dctfId}`);
    lines.push('');
    lines.push(`- Cliente: ${report.header.clienteId ?? 'N/A'}`);
    lines.push(`- Período: ${report.header.periodo ?? 'N/A'}`);
    lines.push(`- Gerado em: ${report.header.generatedAt}`);
    lines.push(`- Risco estimado: ${report.header.riskScore}`);
    lines.push(`- Multa potencial estimada: R$ ${report.header.estimatedPenalty.toFixed(2)}`);
    lines.push('');

    if (dataset) {
      const decl = dataset.declaracoes[0];
      lines.push('## Estatísticas consolidadas');
      lines.push(`- Total de declarações analisadas: ${dataset.totals.declaracoes}`);
      lines.push(`- Receita total: R$ ${decl.stats.receitaTotal.toFixed(2)}`);
      lines.push(`- Deduções totais: R$ ${decl.stats.deducaoTotal.toFixed(2)}`);
      lines.push(`- Retenções totais: R$ ${decl.stats.retencaoTotal.toFixed(2)}`);
      lines.push('');
    }

    const flags = await this.loadOpenFlags(report.header.dctfId);
    lines.push('## Flags pendentes');
    if (flags.length === 0) {
      lines.push('- Nenhuma flag aberta.');
    } else {
      flags.forEach(flag => {
        lines.push(
          `- **${flag.codigoFlag}** (${flag.severidade.toUpperCase()}) - ${flag.descricao}${flag.linhaDctf ? ` (Linha ${flag.linhaDctf})` : ''}`
        );
      });
    }
    lines.push('');

    lines.push('## Achados críticos');
    if (report.highlights.critical.length === 0) {
      lines.push('- Nenhum achado crítico.');
    } else {
      report.highlights.critical.forEach(f => {
        lines.push(`- **${f.code}**: ${f.message}`);
        lines.push(`  - Plano de ação: ${f.actionPlan}`);
        if (f.legalReference) lines.push(`  - Base legal: ${f.legalReference}`);
        if (f.estimatedPenalty) lines.push(`  - Multa estimada: R$ ${f.estimatedPenalty.toFixed(2)}`);
      });
    }
    lines.push('');

    lines.push('## Demais recomendações');
    report.recommendations
      .filter(f => f.severity !== 'critical')
      .forEach(f => {
        lines.push(`- **${f.code}** (${f.severity.toUpperCase()}): ${f.message}`);
        lines.push(`  - Ação: ${f.actionPlan}`);
        if (f.legalReference) lines.push(`  - Base legal: ${f.legalReference}`);
      });
    lines.push('');

    if (report.legalReferences.length > 0) {
      lines.push('## Referências legais');
      report.legalReferences.forEach(ref => lines.push(`- ${ref}`));
    }

    await fs.writeFile(filePath, lines.join('\n'), { encoding: 'utf8' });
    return filePath;
  }

  private static async loadOpenFlags(dctfId: string) {
    const flagsResp = await this.flagsModel.findByDeclaracao(dctfId);
    if (!flagsResp.success || !flagsResp.data) return [];
    return flagsResp.data.filter(flag => !flag.resolvido);
  }
}


