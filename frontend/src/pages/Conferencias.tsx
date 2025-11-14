import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ConferenceIssue } from '../services/conferences';
import { fetchConferenceSummary } from '../services/conferences';
import { format } from 'date-fns';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

function formatDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'dd/MM/yyyy');
}

type SeverityTagProps = {
  severity: ConferenceIssue['severity'];
};

function SeverityTag({ severity }: SeverityTagProps) {
  const styles: Record<ConferenceIssue['severity'], string> = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const labels: Record<ConferenceIssue['severity'], string> = {
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

export default function Conferencias() {
  const [issues, setIssues] = useState<ConferenceIssue[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const summary = await fetchConferenceSummary();
        if (!mounted) return;
        setIssues(summary.rules.dueDate);
        setGeneratedAt(summary.generatedAt);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError('Não foi possível carregar as conferências.');
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const orderedIssues = useMemo(() => {
    const severityOrder: Record<ConferenceIssue['severity'], number> = { high: 0, medium: 1, low: 2 };
    return [...issues].sort((a, b) => {
      if (a.severity === b.severity) {
        return (new Date(a.dueDate).getTime() || 0) - (new Date(b.dueDate).getTime() || 0);
      }
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [issues]);

  const toggleActionPlan = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error('Erro ao copiar para área de transferência:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500">Carregando conferências...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Conferências e Alertas Legais</h1>
        <p className="text-xs text-slate-500 max-w-3xl">
          Monitoramos automaticamente o cumprimento dos prazos legais estabelecidos pela IN RFB 2.005/2021 e outras normas. Revise os itens abaixo para evitar autuações e multas.
        </p>
        {generatedAt && (
          <p className="text-xs text-slate-400">Atualizado em {formatDate(generatedAt)}</p>
        )}
      </header>

      <section className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-base font-medium text-slate-800">Entrega dentro do prazo legal</h2>
            <p className="text-xs text-slate-500">Classificamos o risco considerando atrasos e proximidade do vencimento (art. 10, IN RFB 2.005/2021).</p>
          </div>
          <div className="text-xs text-slate-500">Total: {orderedIssues.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">CNPJ</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Competência</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Vencimento Legal</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Data de Envio</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Situação</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Severidade</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Resumo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Plano de ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orderedIssues.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-slate-500">
                    Nenhuma pendência encontrada. Todas as declarações analisadas estão dentro do prazo.
                  </td>
                </tr>
              )}
              {orderedIssues.map(issue => {
                const isExpanded = expanded.has(issue.id);
                return (
                  <Fragment key={issue.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        <div className="flex items-center gap-2">
                          <span>{issue.identification}</span>
                          <button
                            onClick={() => copyToClipboard(issue.identification, issue.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Copiar CNPJ"
                          >
                            {copiedId === issue.id ? (
                              <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{issue.period}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(issue.dueDate)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(issue.transmissionDate)}</td>
                      <td className="px-4 py-3 text-slate-600 capitalize text-xs">{issue.status ?? '—'}</td>
                      <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{issue.message}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {issue.actionPlan ? (
                          <button
                            type="button"
                            onClick={() => toggleActionPlan(issue.id)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                          </button>
                        ) : (
                          <span className="text-slate-400">Sem plano cadastrado</span>
                        )}
                      </td>
                    </tr>
                    {issue.actionPlan && isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-4 py-3 text-xs text-slate-600 whitespace-pre-wrap">
                          <strong>Plano de ação:</strong> {issue.actionPlan}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
