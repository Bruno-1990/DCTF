import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { AdminDashboardSnapshotResponse } from "../services/dashboard";
import { fetchAdminDashboardSnapshot } from "../services/dashboard";
import { fetchConferenceSummary, type ConferenceSummary } from "../services/conferences";
import { dctfService } from "../services/dctf";
import { relatoriosService } from "../services/relatorios";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import Alert from "../components/UI/Alert";

const friendlyRouteLabels: Record<string, string> = {
  "dashboard-overview": "Visão executiva",
  "obligation-tracking": "Monitoramento de obrigações",
  "financial-monitoring": "Visão financeira",
  "alerts-management": "Gestão de alertas",
  configuration: "Configurações e integrações",
};

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshotResponse | null>(null);
  const [conferenceSummary, setConferenceSummary] = useState<ConferenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conferenceError, setConferenceError] = useState<string | null>(null);
  const [openDeclarationsPage, setOpenDeclarationsPage] = useState(1);
  const itemsPerPage = 10;
  const [showTransmissionDetails, setShowTransmissionDetails] = useState(false);

  // Função para visualizar todos os registros de um CNPJ na página DCTF
  const handleVisualize = (cnpj: string) => {
    // Limpar o CNPJ (remover formatação) e navegar para DCTF com o filtro
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    navigate(`/dctf?search=${cnpjLimpo}`);
  };

  useEffect(() => {
    const load = async () => {
      const [snapshotResult, conferenceResult] = await Promise.allSettled([
        fetchAdminDashboardSnapshot(),
        fetchConferenceSummary(6),
      ]);

      if (snapshotResult.status === "fulfilled") {
        setSnapshot(snapshotResult.value);
      } else {
        const message = snapshotResult.reason instanceof Error ? snapshotResult.reason.message : "Erro ao carregar o painel";
        setError(message);
      }

      if (conferenceResult.status === "fulfilled") {
        setConferenceSummary(conferenceResult.value);
      } else {
        setConferenceError("Não foi possível carregar as conferências.");
        console.error("Erro ao carregar conferências", conferenceResult.reason);
      }

      setLoading(false);
    };

    load();
  }, []);

  const alerts = snapshot?.metrics.alerts ?? [];
  const dueDateIssues = conferenceSummary?.rules.dueDate ?? [];

  const alertStats = useMemo(() => {
    const total = alerts.length;
    const high = alerts.filter((alert) => alert.severity === "high").length;
    const medium = alerts.filter((alert) => alert.severity === "medium").length;
    const low = total - high - medium;
    return { total, high, medium, low };
  }, [alerts]);

  // Agrupar alertas por tipo e priorizar por severidade
  const organizedAlerts = useMemo(() => {
    // Filtrar apenas alertas críticos (high e medium) e excluir "processing" que é apenas informativo
    const criticalAlerts = alerts.filter(
      (alert) => 
        (alert.severity === "high" || alert.severity === "medium") &&
        alert.type !== "processing"
    );

    // Ordenar por severidade (high primeiro) e depois por tipo
    const sorted = [...criticalAlerts].sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "high" ? -1 : 1;
      }
      return a.type.localeCompare(b.type);
    });

    // Agrupar por tipo
    const grouped = sorted.reduce((acc, alert) => {
      const type = alert.type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(alert);
      return acc;
    }, {} as Record<string, typeof alerts>);

    return { sorted, grouped, total: criticalAlerts.length };
  }, [alerts]);

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      missing_period: "Período Faltante",
      pending_balance: "Saldo Pendente",
      zero_debit: "Débito Zerado",
      retification_series: "Série de Retificações",
      processing: "Em Processamento",
      data_inconsistency: "Inconsistência de Dados",
    };
    return labels[type] || type;
  };

  const declarationPeriods = useMemo(
    () => (snapshot ? Object.keys(snapshot.metrics.totals.byPeriod ?? {}) : []),
    [snapshot]
  );

  const numberFormatter = useMemo(() => new Intl.NumberFormat("pt-BR"), []);
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    []
  );
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat("pt-BR"), []);

  const navigationRoutes = snapshot?.navigation.routes ?? [];

  const statusSummary = snapshot?.metrics.statusSummary ?? {
    delivered: 0,
    received: 0,
    inProgress: 0,
    errors: 0,
    total: 0,
  };

  const statusItems = useMemo(() => {
    const total = statusSummary.total || statusSummary.delivered + statusSummary.received + statusSummary.errors;
    const safeTotal = total > 0 ? total : 1;
    return [
      {
        key: "delivered",
        label: "Entregues",
        value: statusSummary.delivered,
        helper: "Protocoladas sem pendências",
        color: "bg-emerald-500",
      },
      {
        key: "received",
        label: "Recebidas",
        value: statusSummary.received,
        helper:
          statusSummary.inProgress > 0
            ? `Em andamento: ${statusSummary.inProgress}`
            : "Aguardando validação/envio",
        color: "bg-blue-500",
      },
      {
        key: "errors",
        label: "Erros",
        value: statusSummary.errors,
        helper: "Necessitam correção",
        color: "bg-rose-500",
      },
    ].map((item) => ({
      ...item,
      percentage: Math.round((item.value / safeTotal) * 100),
    }));
  }, [statusSummary]);

  // Filtrar declarações em aberto com prazo vigente
  // Inclui todas as declarações "em andamento" que ainda estão dentro do prazo,
  // não apenas as próximas ao vencimento (severity 'medium')
  const openWithValidDueDateData = useMemo(() => {
    if (!conferenceSummary) return { items: [], total: 0, totalPages: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const allFiltered = dueDateIssues.filter((issue) => {
      // Não estão concluídas (status não é 'concluido')
      const status = (issue.status ?? '').toLowerCase();
      const notCompleted = status !== 'concluido';
      
      // E que ainda estão dentro do prazo (dueDate ainda não passou)
      const dueDate = new Date(issue.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const stillValid = dueDate >= today;
      
      // Incluir declarações com severity 'medium' (próximas ao vencimento - até 5 dias)
      // E também severity 'low' (ainda têm tempo, mas são "em andamento" e precisam ser monitoradas)
      // Excluir severity 'high' apenas se já vencidas (já tratadas na seção de conferência de prazos)
      const hasValidDueDate = issue.severity === 'medium' || issue.severity === 'low';
      
      return notCompleted && stillValid && hasValidDueDate;
    });
    
    // Ordenar por severidade (medium primeiro, pois são mais urgentes) e depois por data de vencimento
    const sorted = [...allFiltered].sort((a, b) => {
      const severityRank = { medium: 0, low: 1, high: 2 };
      if (severityRank[a.severity] !== severityRank[b.severity]) {
        return severityRank[a.severity] - severityRank[b.severity];
      }
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    const total = sorted.length;
    const totalPages = Math.ceil(total / itemsPerPage);
    const startIndex = (openDeclarationsPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    const paginatedItems = sorted
      .slice(startIndex, endIndex)
      .map((issue, index) => ({
        ...issue,
        rank: startIndex + index + 1,
      }));
    
    return {
      items: paginatedItems,
      total,
      totalPages,
    };
  }, [conferenceSummary, dueDateIssues, openDeclarationsPage, itemsPerPage]);

  const openWithValidDueDate = openWithValidDueDateData.items;

  const transmissionsList = useMemo(() => {
    if (!snapshot) return [];
    const entries = Object.entries(snapshot.metrics.operations.transmissionsByDate ?? {});
    return entries
      .map(([date, count]) => {
        const parsed = new Date(date);
        const formatted = Number.isNaN(parsed.getTime())
          ? date
          : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
        const shortDate = Number.isNaN(parsed.getTime())
          ? date
          : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        return { date, formatted, shortDate, count };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12); // Últimos 12 registros para o gráfico
  }, [snapshot]);

  const topDueDateIssues = useMemo(() => dueDateIssues.slice(0, 6), [dueDateIssues]);

  const cards = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return [
      {
        id: "total-declarations",
        label: "Declarações monitoradas",
        helper: `${declarationPeriods.length} competências recentes` ,
        render: () => numberFormatter.format(snapshot.metrics.totals.declarations),
      },
      {
        id: "balance-total",
        label: "Saldo em aberto",
        helper: "Somatório das declarações com valores pendentes",
        render: () => currencyFormatter.format(snapshot.metrics.financial.balanceTotal),
      },
      {
        id: "balance-ratio",
        label: "Percentual pendente",
        helper: "Relação entre saldo pendente e débito apurado",
        render: () => `${(snapshot.metrics.financial.balanceRatio * 100).toFixed(1)}%`,
      },
      {
        id: "alerts-total",
        label: "Alertas ativos",
        helper: `${alertStats.high} críticos · ${alertStats.medium} moderados` ,
        render: () => numberFormatter.format(alertStats.total),
      },
    ];
  }, [snapshot, declarationPeriods.length, alertStats, numberFormatter, currencyFormatter]);

  const renderNavigationButton = (path: string, moduleId: string) => {
    const label = friendlyRouteLabels[moduleId] ?? moduleId.replace(/-/g, " ");
    return (
      <a
        key={moduleId}
        href={path}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg border border-blue-100 transition"
      >
        {label}
        <span aria-hidden>→</span>
      </a>
    );
  };

  const renderBusinessName = (businessName?: string, identification?: string) =>
    businessName && businessName.trim().length > 0 ? businessName : identification ?? 'N/A';

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return dateFormatter.format(parsed);
  };

  const renderSeverityPill = (severity: "low" | "medium" | "high") => {
    const map = {
      low: "bg-green-100 text-green-700 border-green-200",
      medium: "bg-amber-100 text-amber-700 border-amber-200",
      high: "bg-red-100 text-red-700 border-red-200",
    } as const;

    const label = severity === "high" ? "Alta" : severity === "medium" ? "Média" : "Baixa";

    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${map[severity]}`}>{label}</span>;
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Painel Administrativo</h1>
          <p className="text-gray-600 mt-1">
            Panorama consolidado das declarações DCTF e indicadores de risco{' '}
            {declarationPeriods.length > 0 && (
              <span className="font-medium text-gray-700">(últimas {declarationPeriods.length} competências)</span>
            )}.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          {snapshot && (
            <span className="text-sm text-gray-500">
              Atualizado em {new Date(snapshot.meta.generatedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {error && (
        <Alert type="error" title="Erro ao carregar dados" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {conferenceError && (
        <Alert type="warning" title="Conferências indisponíveis" onClose={() => setConferenceError(null)}>
          {conferenceError}
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Carregando painel" />
        </div>
      )}

      {!loading && snapshot && (
        <>
          <section id="executive-overview" className="bg-white shadow rounded-lg p-6 mb-8">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {cards.map((card) => (
                  <div key={card.id} className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-gray-500">{card.label}</p>
                    {card.helper && <p className="text-xs text-gray-400">{card.helper}</p>}
                    <p className="text-3xl font-semibold text-gray-900">{card.render()}</p>
                  </div>
                ))}
              </div>
              {statusItems.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                  {statusItems.map((item) => (
                    <div key={item.key} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">{item.label}</span>
                        <span className="text-gray-500">{numberFormatter.format(item.value)}</span>
                      </div>
                      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div className={`${item.color} h-2`} style={{ width: `${Math.min(100, item.percentage)}%` }} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {item.helper}
                        {statusSummary.total > 0 ? ` · ${item.percentage}% do total` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {navigationRoutes.length > 0 && (
                <nav className="flex flex-wrap gap-3 border-t border-gray-100 pt-4">
                  {navigationRoutes.map((route) => renderNavigationButton(route.path, route.moduleId))}
                </nav>
              )}
            </div>
          </section>

          <section id="financial-monitoring" className="bg-white shadow rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Declarações em aberto com prazo vigente</h2>
            {openWithValidDueDateData.total === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma declaração em aberto com prazo vigente encontrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead>
                    <tr className="text-xs uppercase text-gray-500 border-b">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Contribuinte</th>
                      <th className="py-2 pr-4">CNPJ</th>
                      <th className="py-2 pr-4">Competência</th>
                      <th className="py-2 pr-4">Prazo de vencimento</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {openWithValidDueDate.map((item) => {
                      const dueDate = new Date(item.dueDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      dueDate.setHours(0, 0, 0, 0);
                      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-gray-500">{item.rank}</td>
                          <td className="py-2 pr-4 text-gray-800 font-medium">{renderBusinessName(item.businessName, item.identification)}</td>
                          <td className="py-2 pr-4 text-gray-500">{item.identification}</td>
                          <td className="py-2 pr-4 text-gray-600">{item.period}</td>
                          <td className="py-2 pr-4 text-gray-600">
                            {formatDate(item.dueDate)}
                            {daysUntilDue > 0 && (
                              <span className="ml-2 text-xs text-gray-500">
                                ({daysUntilDue} {daysUntilDue === 1 ? 'dia' : 'dias'})
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4">{renderSeverityPill(item.severity)}</td>
                          <td className="py-2 pr-4">
                            <button
                              onClick={() => handleVisualize(item.identification)}
                              className="px-4 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100 hover:border-blue-300 hover:text-blue-800 transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 shadow-sm hover:shadow"
                              title="Visualizar todos os registros deste CNPJ na página DCTF"
                            >
                              Visualizar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {openWithValidDueDateData.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      Mostrando {((openDeclarationsPage - 1) * itemsPerPage) + 1} a {Math.min(openDeclarationsPage * itemsPerPage, openWithValidDueDateData.total)} de {openWithValidDueDateData.total} declarações
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setOpenDeclarationsPage((p) => Math.max(1, p - 1))}
                        disabled={openDeclarationsPage <= 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      <span className="text-sm text-gray-700 px-3">
                        Página {openDeclarationsPage} de {openWithValidDueDateData.totalPages}
                      </span>
                      <button
                        onClick={() => setOpenDeclarationsPage((p) => Math.min(openWithValidDueDateData.totalPages, p + 1))}
                        disabled={openDeclarationsPage >= openWithValidDueDateData.totalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {dueDateIssues && (
            <section id="compliance-checks" className="bg-white shadow rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Conferência de prazos legais</h2>
                  <p className="text-sm text-gray-500">
                    Baseada na IN RFB 2.005/2021 (art. 10) para monitorar envios fora do prazo ou em risco.
                  </p>
                </div>
                <Link
                  to="/conferencias"
                  className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Ver todas as pendências
                  <span aria-hidden>→</span>
                </Link>
              </div>
              {topDueDateIssues.length === 0 ? (
                <p className="text-sm text-gray-500">Todas as competências analisadas estão dentro do prazo.</p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Empresa</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">CNPJ</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Competência</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Vencimento</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Entrega</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Severidade</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Resumo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {topDueDateIssues.map((issue) => (
                        <tr key={issue.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 font-medium">{renderBusinessName(issue.businessName, issue.identification)}</td>
                          <td className="px-3 py-2 text-gray-600">{issue.identification}</td>
                          <td className="px-3 py-2 text-gray-600">{issue.period}</td>
                          <td className="px-3 py-2 text-gray-600">{formatDate(issue.dueDate)}</td>
                          <td className="px-3 py-2 text-gray-600">{formatDate(issue.transmissionDate)}</td>
                          <td className="px-3 py-2">{renderSeverityPill(issue.severity)}</td>
                          <td className="px-3 py-2 text-gray-600">{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <div id="alerts-and-risk" className="bg-white shadow rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Central de Alertas</h2>
                {organizedAlerts.total > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    {organizedAlerts.total} alerta{organizedAlerts.total !== 1 ? 's' : ''} crítico{organizedAlerts.total !== 1 ? 's' : ''} 
                    {alertStats.high > 0 && ` · ${alertStats.high} de alta prioridade`}
                  </p>
                )}
              </div>
            </div>

            {organizedAlerts.total === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-2">Nenhum alerta crítico no momento.</p>
                <p className="text-xs text-gray-400">
                  {alerts.length > 0 && `${alerts.length} alerta${alerts.length !== 1 ? 's' : ''} informativo${alerts.length !== 1 ? 's' : ''} foram filtrados.`}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(organizedAlerts.grouped).map(([type, typeAlerts]) => (
                  <div key={type} className="border-l-4 border-gray-200 pl-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-700">
                        {getAlertTypeLabel(type)}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {typeAlerts.length} {typeAlerts.length === 1 ? 'ocorrência' : 'ocorrências'}
                      </span>
                    </div>
                    <ul className="space-y-3">
                      {typeAlerts.slice(0, 5).map((alert, index) => (
                        <li key={`${alert.identification}-${alert.period}-${index}`} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-semibold text-gray-800 truncate">
                                  {renderBusinessName(alert.businessName, alert.identification)}
                                </p>
                                <span
                                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${
                                    {
                                      low: "bg-green-100 text-green-700",
                                      medium: "bg-yellow-100 text-yellow-700",
                                      high: "bg-red-100 text-red-700",
                                    }[alert.severity]
                                  }`}
                                >
                                  {alert.severity === "high" ? "ALTO" : "MÉDIO"}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mb-1">
                                {alert.identification} {alert.period && `· ${alert.period}`}
                              </p>
                              <p className="text-sm text-gray-700 leading-relaxed">{alert.message}</p>
                              {alert.context && (
                                <div className="mt-2 text-xs text-gray-600">
                                  {alert.context.balance && (
                                    <span className="inline-block mr-3">
                                      Saldo: <strong>{currencyFormatter.format(alert.context.balance)}</strong>
                                    </span>
                                  )}
                                  {alert.context.previousDebit && (
                                    <span className="inline-block mr-3">
                                      Débito anterior: <strong>{currencyFormatter.format(alert.context.previousDebit)}</strong>
                                    </span>
                                  )}
                                  {alert.context.length && (
                                    <span className="inline-block">
                                      {alert.context.length} retificação{alert.context.length !== 1 ? 'ões' : ''}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                      {typeAlerts.length > 5 && (
                        <li className="text-xs text-gray-500 text-center py-2">
                          + {typeAlerts.length - 5} {typeAlerts.length - 5 === 1 ? 'outro alerta' : 'outros alertas'} deste tipo
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <section id="obligation-tracking" className="bg-white shadow rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Linha do tempo de transmissões</h2>
            {transmissionsList.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma transmissão registrada nas competências recentes.</p>
            ) : (
              <div className="space-y-4">
                <div className="h-80 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={transmissionsList} 
                      margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                    >
                      <defs>
                        <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke="#e5e7eb" 
                        vertical={false}
                        opacity={0.5}
                      />
                      <XAxis 
                        dataKey="shortDate" 
                        stroke="#9ca3af"
                        style={{ fontSize: '11px', fontWeight: 500 }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                      />
                      <YAxis 
                        stroke="#9ca3af"
                        style={{ fontSize: '11px', fontWeight: 500 }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        width={40}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                          backdropFilter: 'blur(10px)',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '13px',
                          padding: '12px 16px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                        }}
                        labelStyle={{ 
                          fontWeight: 600, 
                          color: '#111827',
                          marginBottom: '8px'
                        }}
                        itemStyle={{ 
                          color: '#3b82f6',
                          fontWeight: 600
                        }}
                        labelFormatter={(value) => {
                          const item = transmissionsList.find(t => t.shortDate === value);
                          return item ? item.formatted : value;
                        }}
                        formatter={(value: number) => [`${value} ${value === 1 ? 'transmissão' : 'transmissões'}`, '']}
                        cursor={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        dot={{ 
                          fill: '#3b82f6', 
                          r: 5,
                          strokeWidth: 2,
                          stroke: '#fff',
                          className: 'drop-shadow-sm'
                        }}
                        activeDot={{ 
                          r: 8, 
                          stroke: '#fff',
                          strokeWidth: 3,
                          fill: '#2563eb',
                          className: 'drop-shadow-md'
                        }}
                        animationDuration={1000}
                        animationEasing="ease-out"
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="none"
                        fill="url(#colorGradient)"
                        animationDuration={1000}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => setShowTransmissionDetails(!showTransmissionDetails)}
                    className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200 flex items-center gap-2"
                  >
                    <span>Detalhes</span>
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${showTransmissionDetails ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                {showTransmissionDetails && (
                  <div className="mt-4 pt-4 border-t border-gray-200 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-xs text-gray-500 mb-3 font-medium">Detalhes por data:</p>
                    <ul className="space-y-2">
                      {transmissionsList.slice().reverse().map((item) => (
                        <li key={item.date} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-gray-50 transition-colors">
                          <span className="text-gray-700">{item.formatted}</span>
                          <span className="font-semibold text-gray-900">
                            {item.count} {item.count === 1 ? "transmissão" : "transmissões"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          <section id="configuration" className="bg-white shadow rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Configurações e integrações</h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              {snapshot.meta.notes || "Ajuste as permissões e integrações conforme a política interna."}
            </p>
            <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
              <li>Modo de autenticação: {snapshot.meta.authenticationModes.join(", ")}.</li>
              <li>Crie uma chave de API exclusiva para cada integração externa.</li>
              <li>Mantenha auditoria das integrações críticas e revise no mínimo uma vez por trimestre.</li>
            </ul>
          </section>
        </>
      )}

    </div>
  );
};

export default AdminDashboard;

