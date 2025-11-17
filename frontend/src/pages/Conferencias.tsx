import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ConferenceIssue } from '../services/conferences';
import { fetchConferenceSummary } from '../services/conferences';
import { format } from 'date-fns';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../components/Pagination';

function formatDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'dd/MM/yyyy');
}

function formatCNPJ(cnpj?: string | null) {
  if (!cnpj) return '—';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cnpj;
}

type SeverityTagProps = {
  severity: ConferenceIssue['severity'];
};

function SeverityTag({ severity }: SeverityTagProps) {
  const styles: Record<ConferenceIssue['severity'], string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
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
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

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

  // Resetar para página 1 quando issues mudarem
  useEffect(() => {
    setPaginaAtual(1);
  }, [issues.length]);

  // Calcular paginação
  const totalPaginas = Math.ceil(orderedIssues.length / itensPorPagina);
  const indiceInicio = (paginaAtual - 1) * itensPorPagina;
  const indiceFim = indiceInicio + itensPorPagina;
  const issuesPaginadas = useMemo(() => {
    return orderedIssues.slice(indiceInicio, indiceFim);
  }, [orderedIssues, indiceInicio, indiceFim]);

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
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm text-gray-600">Carregando conferências...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-xl">
          <p className="text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <ClipboardDocumentCheckIcon className="h-8 w-8 text-blue-600" />
          Conferências e Alertas Legais
        </h1>
        <p className="text-gray-600 mb-2">
          Monitoramos automaticamente o cumprimento dos prazos legais estabelecidos pela IN RFB 2.005/2021 e outras normas. Revise os itens abaixo para evitar autuações e multas.
        </p>
        {generatedAt && (
          <p className="text-sm text-gray-500 flex items-center gap-1">
            <ClockIcon className="h-4 w-4" />
            Atualizado em {formatDate(generatedAt)}
          </p>
        )}
      </div>

      {/* Seção de Conferências */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
              Entrega dentro do prazo legal
            </h2>
            <p className="text-sm text-gray-600">
              Classificamos o risco considerando atrasos e proximidade do vencimento (art. 10, IN RFB 2.005/2021).
            </p>
          </div>
          <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
            Total: <span className="text-gray-900">{orderedIssues.length}</span> pendências
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento Legal</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Data de Envio</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Situação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orderedIssues.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-gray-500">
                    Nenhuma pendência encontrada. Todas as declarações analisadas estão dentro do prazo.
                  </td>
                </tr>
              ) : (
                issuesPaginadas.map(issue => {
                  const isExpanded = expanded.has(issue.id);
                  return (
                    <Fragment key={issue.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                            <button
                              onClick={() => copyToClipboard(issue.identification, issue.id)}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
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
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.dueDate)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.transmissionDate)}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize text-xs">{issue.status ?? '—'}</td>
                        <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {issue.actionPlan ? (
                            <button
                              type="button"
                              onClick={() => toggleActionPlan(issue.id)}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                            </button>
                          ) : (
                            <span className="text-gray-400">Sem plano cadastrado</span>
                          )}
                        </td>
                      </tr>
                      {issue.actionPlan && isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={9} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                            <strong>Plano de ação:</strong> {issue.actionPlan}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {!isLoading && orderedIssues.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <Pagination
              currentPage={paginaAtual}
              totalPages={totalPaginas}
              totalItems={orderedIssues.length}
              itemsPerPage={itensPorPagina}
              onPageChange={setPaginaAtual}
              itemLabel="pendência"
            />
          </div>
        )}
      </div>
    </div>
  );
}
