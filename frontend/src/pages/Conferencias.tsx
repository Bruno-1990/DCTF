import { useEffect, useMemo, useState } from 'react';
import type { ConferenceIssue } from '../services/conferences';
import { fetchConferenceSummary } from '../services/conferences';
import { format } from 'date-fns';

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
        <h1 className="text-2xl font-semibold text-slate-900">Conferências e Alertas Legais</h1>
        <p className="text-sm text-slate-500 max-w-3xl">
          Monitoramos automaticamente o cumprimento dos prazos legais estabelecidos pela IN RFB 2.005/2021 e outras normas. Revise os itens abaixo para evitar autuações e multas.
        </p>
        {generatedAt && (
          <p className="text-xs text-slate-400">Atualizado em {formatDate(generatedAt)}</p>
        )}
      </header>

      <section className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-medium text-slate-800">Entrega dentro do prazo legal</h2>
            <p className="text-sm text-slate-500">Classificamos o risco considerando atrasos e proximidade do vencimento (art. 10, IN RFB 2.005/2021).</p>
          </div>
          <div className="text-sm text-slate-500">Total: {orderedIssues.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Empresa</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">CNPJ</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Competência</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Vencimento Legal</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Data de Envio</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Situação</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Severidade</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Resumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orderedIssues.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                    Nenhuma pendência encontrada. Todas as declarações analisadas estão dentro do prazo.
                  </td>
                </tr>
              )}
              {orderedIssues.map(issue => (
                <tr key={issue.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800 font-medium">{issue.businessName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{issue.identification}</td>
                  <td className="px-4 py-3 text-slate-600">{issue.period}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(issue.dueDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(issue.transmissionDate)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{issue.status ?? '—'}</td>
                  <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                  <td className="px-4 py-3 text-slate-600">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
