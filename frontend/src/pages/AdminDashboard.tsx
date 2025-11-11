import React, { useEffect, useMemo, useState } from "react";
import { AdminDashboardSnapshotResponse, fetchAdminDashboardSnapshotResponse } from "../services/dashboard";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import Alert from "../components/UI/Alert";

const AdminDashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAdminDashboardSnapshotResponse();
        setSnapshot(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar o painel";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const cards = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return [
      {
        id: "total-declarations",
        label: "Declarações monitoradas",
        value: snapshot.metrics.totals.declarations,
        format: "integer" as const,
      },
      {
        id: "balance-total",
        label: "Saldo pendente",
        value: snapshot.metrics.financial.balanceTotal,
        format: "currency" as const,
      },
      {
        id: "balance-ratio",
        label: "Percentual pendente",
        value: snapshot.metrics.financial.balanceRatio,
        format: "percentage" as const,
      },
    ];
  }, [snapshot]);

  const alerts = snapshot?.metrics.alerts ?? [];

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Painel Administrativo</h1>
          <p className="text-gray-600 mt-1">Resumo inteligente das declarações e alertas das últimas competências.</p>
        </div>
        {snapshot && (
          <span className="text-sm text-gray-500">
            Atualizado em {new Date(snapshot.meta.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <Alert type="error" title="Erro ao carregar dados" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Carregando painel" />
        </div>
      )}

      {!loading && snapshot && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {cards.map((card) => (
              <div key={card.id} className="bg-white shadow rounded-lg p-6">
                <p className="text-sm font-medium text-gray-500">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  {card.format === "currency" &&
                    card.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  {card.format === "integer" && card.value.toLocaleString("pt-BR")}
                  {card.format === "percentage" && `${(card.value * 100).toFixed(1)}%`}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Navegação rápida</h2>
              <ul className="space-y-3">
                {snapshot.navigation.routes.map((route) => (
                  <li key={route.moduleId} className="flex items-center justify-between border-b pb-3">
                    <div>
                      <p className="font-medium text-gray-800">{route.moduleId}</p>
                      <p className="text-sm text-gray-500">Seção: {route.sectionId}</p>
                    </div>
                    <a
                      href={route.href}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Abrir
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Alertas recentes</h2>
              {alerts.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum alerta crítico no momento.</p>
              ) : (
                <ul className="space-y-3">
                  {alerts.slice(0, 5).map((alert, index) => (
                    <li key={`${alert.identification}-${index}`} className="border-b pb-2">
                      <p className="text-sm font-medium text-gray-800">
                        {alert.identification} — {alert.period ?? "-"}
                      </p>
                      <p className="text-sm text-gray-600">{alert.message}</p>
                      <span
                        className={`inline-block mt-1 text-xs font-semibold px-2 py-1 rounded ${{
                          low: "bg-green-100 text-green-700",
                          medium: "bg-yellow-100 text-yellow-700",
                          high: "bg-red-100 text-red-700",
                        }[alert.severity]}`}
                      >
                        {alert.severity.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;

