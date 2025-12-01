import React from 'react';
import type { EnhancedDashboardData } from '../../services/enhancedDashboard';

interface HeroSectionProps {
  data: EnhancedDashboardData['hero'];
}

const HeroSection: React.FC<HeroSectionProps> = ({ data }) => {
  const numberFormatter = new Intl.NumberFormat("pt-BR");
  const currencyFormatter = new Intl.NumberFormat("pt-BR", { 
    style: "currency", 
    currency: "BRL" 
  });

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return '→';
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getTrendBgColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'bg-green-50 border-green-200';
      case 'down':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const cards = [
    {
      id: 'total-declarations',
      label: 'Declarações Monitoradas',
      value: numberFormatter.format(data.totalDeclarations.value),
      change: data.totalDeclarations.change,
      trend: data.totalDeclarations.trend,
      helper: 'Total de declarações no período',
    },
    {
      id: 'total-balance',
      label: 'Saldo em Aberto',
      value: currencyFormatter.format(data.totalBalance.value),
      change: data.totalBalance.change,
      trend: data.totalBalance.trend,
      helper: 'Somatório dos valores pendentes',
    },
    {
      id: 'critical-alerts',
      label: 'Alertas Críticos',
      value: numberFormatter.format(data.criticalAlerts.value),
      change: data.criticalAlerts.change,
      trend: data.criticalAlerts.trend,
      helper: 'Alertas de alta e média prioridade',
    },
    {
      id: 'valid-certificates',
      label: 'Certidões Válidas',
      value: numberFormatter.format(data.validCertificates.value),
      change: data.validCertificates.change,
      trend: data.validCertificates.trend,
      helper: 'Certidões com validade vigente',
    },
    {
      id: 'completion-rate',
      label: 'Taxa de Conclusão',
      value: `${data.completionRate.value.toFixed(1)}%`,
      change: data.completionRate.change,
      trend: data.completionRate.trend,
      helper: 'Percentual de declarações concluídas',
    },
    {
      id: 'active-clients',
      label: 'Clientes Ativos',
      value: numberFormatter.format(data.activeClients.value),
      change: data.activeClients.change,
      trend: data.activeClients.trend,
      helper: 'Clientes com atividade no período',
    },
  ];

  return (
    <section className="mb-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Visão Geral</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`flex flex-col gap-2 p-4 rounded-lg border transition-all duration-200 hover:shadow-md ${getTrendBgColor(card.trend)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">{card.label}</p>
                  <p className="text-xs text-gray-500">{card.helper}</p>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${getTrendColor(card.trend)}`}>
                  <span>{getTrendIcon(card.trend)}</span>
                  <span>{Math.abs(card.change).toFixed(1)}%</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
              {card.change !== 0 && (
                <p className={`text-xs ${getTrendColor(card.trend)}`}>
                  {card.change > 0 ? '+' : ''}{card.change.toFixed(1)}% vs período anterior
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

