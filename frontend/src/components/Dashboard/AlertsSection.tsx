import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Alert {
  type: string;
  severity: 'low' | 'medium' | 'high';
  identification: string;
  businessName?: string;
  period?: string;
  message: string;
}

interface AlertsSectionProps {
  data: {
    critical: Alert[];
    byType: Record<string, Alert[]>;
    newSinceLastVisit: number;
  };
}

const AlertsSection: React.FC<AlertsSectionProps> = ({ data }) => {
  const navigate = useNavigate();
  const [showOnlyCritical, setShowOnlyCritical] = useState(false);
  const [resolvedAlerts, setResolvedAlerts] = useState<Set<string>>(new Set());

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      missing_period: 'Período Faltante',
      pending_balance: 'Saldo Pendente',
      zero_debit: 'Débito Zerado',
      retification_series: 'Série de Retificações',
      processing: 'Em Processamento',
      data_inconsistency: 'Inconsistência de Dados',
    };
    return labels[type] || type;
  };

  const formatCNPJ = (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length === 14) {
      return digits
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return cnpj;
  };

  const handleResolve = (alertId: string) => {
    setResolvedAlerts((prev) => new Set([...prev, alertId]));
  };

  const handleVisualize = (cnpj: string) => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    navigate(`/dctf?search=${cnpjLimpo}`);
  };

  // Filtrar alertas não resolvidos
  const activeAlerts = React.useMemo(() => {
    let alerts = data.critical;
    
    if (showOnlyCritical) {
      alerts = alerts.filter(a => a.severity === 'high');
    }
    
    return alerts.filter(
      (alert) => !resolvedAlerts.has(`${alert.identification}-${alert.period}-${alert.type}`)
    );
  }, [data.critical, showOnlyCritical, resolvedAlerts]);

  // Agrupar alertas ativos por tipo
  const alertsByType = React.useMemo(() => {
    const grouped: Record<string, Alert[]> = {};
    activeAlerts.forEach((alert) => {
      if (!grouped[alert.type]) {
        grouped[alert.type] = [];
      }
      grouped[alert.type].push(alert);
    });
    return grouped;
  }, [activeAlerts]);

  if (activeAlerts.length === 0 && resolvedAlerts.size === 0) {
    return (
      <section className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Central de Alertas</h2>
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-2">Nenhum alerta crítico no momento.</p>
          <p className="text-xs text-gray-400">Tudo está funcionando normalmente.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white shadow rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Central de Alertas</h2>
          {data.newSinceLastVisit > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                {data.newSinceLastVisit} {data.newSinceLastVisit === 1 ? 'novo alerta' : 'novos alertas'}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyCritical}
              onChange={(e) => setShowOnlyCritical(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Apenas críticos</span>
          </label>
        </div>
      </div>

      {activeAlerts.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-2">
            Todos os alertas foram resolvidos.
          </p>
          {resolvedAlerts.size > 0 && (
            <button
              onClick={() => setResolvedAlerts(new Set())}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Restaurar alertas resolvidos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(alertsByType).map(([type, typeAlerts]) => (
            <div key={type} className="border-l-4 border-gray-200 pl-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  {getAlertTypeLabel(type)}
                </h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {typeAlerts.length} {typeAlerts.length === 1 ? 'ocorrência' : 'ocorrências'}
                </span>
              </div>
              <ul className="space-y-3">
                {typeAlerts.slice(0, 5).map((alert, index) => {
                  const alertId = `${alert.identification}-${alert.period}-${alert.type}`;
                  
                  return (
                    <li
                      key={`${alertId}-${index}`}
                      className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {alert.businessName || alert.identification}
                            </p>
                            <span
                              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${
                                alert.severity === 'high'
                                  ? 'bg-red-100 text-red-700'
                                  : alert.severity === 'medium'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {alert.severity === 'high' ? 'ALTO' : alert.severity === 'medium' ? 'MÉDIO' : 'BAIXO'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mb-1">
                            {formatCNPJ(alert.identification)} {alert.period && `· ${alert.period}`}
                          </p>
                          <p className="text-sm text-gray-700 leading-relaxed">{alert.message}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleVisualize(alert.identification)}
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
                          >
                            Ver
                          </button>
                          <button
                            onClick={() => handleResolve(alertId)}
                            className="px-3 py-1.5 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                          >
                            Resolver
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
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
    </section>
  );
};

export default AlertsSection;



