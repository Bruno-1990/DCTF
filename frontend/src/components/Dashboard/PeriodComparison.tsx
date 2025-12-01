import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface PeriodComparisonProps {
  data: {
    currentPeriod: {
      declarations: number;
      balance: number;
      completionRate: number;
      alerts: number;
    };
    previousPeriod: {
      declarations: number;
      balance: number;
      completionRate: number;
      alerts: number;
    };
    variations: {
      declarations: number;
      balance: number;
      completionRate: number;
      alerts: number;
    };
  };
}

const PeriodComparison: React.FC<PeriodComparisonProps> = ({ data }) => {
  const numberFormatter = new Intl.NumberFormat('pt-BR');
  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const getVariationColor = (variation: number) => {
    if (variation > 0) return 'text-green-600';
    if (variation < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getVariationIcon = (variation: number) => {
    if (variation > 0) return '↑';
    if (variation < 0) return '↓';
    return '→';
  };

  const comparisonData = [
    {
      metric: 'Declarações',
      current: data.currentPeriod.declarations,
      previous: data.previousPeriod.declarations,
      variation: data.variations.declarations,
    },
    {
      metric: 'Saldo Pendente',
      current: data.currentPeriod.balance,
      previous: data.previousPeriod.balance,
      variation: data.variations.balance,
    },
    {
      metric: 'Taxa Conclusão',
      current: data.currentPeriod.completionRate,
      previous: data.previousPeriod.completionRate,
      variation: data.variations.completionRate,
    },
    {
      metric: 'Alertas',
      current: data.currentPeriod.alerts,
      previous: data.previousPeriod.alerts,
      variation: data.variations.alerts,
    },
  ];

  return (
    <section className="bg-white shadow rounded-lg p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Comparativo: Período Atual vs Anterior</h2>
      
      {/* Cards Comparativos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {comparisonData.map((item) => (
          <div
            key={item.metric}
            className="flex flex-col gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200"
          >
            <p className="text-sm font-medium text-gray-600">{item.metric}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold text-gray-900">
                {item.metric === 'Saldo Pendente'
                  ? currencyFormatter.format(item.current)
                  : item.metric === 'Taxa Conclusão'
                  ? `${item.current.toFixed(1)}%`
                  : numberFormatter.format(item.current)}
              </p>
              <span className={`text-xs font-semibold ${getVariationColor(item.variation)}`}>
                {getVariationIcon(item.variation)} {Math.abs(item.variation).toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Anterior:{' '}
              {item.metric === 'Saldo Pendente'
                ? currencyFormatter.format(item.previous)
                : item.metric === 'Taxa Conclusão'
                ? `${item.previous.toFixed(1)}%`
                : numberFormatter.format(item.previous)}
            </p>
          </div>
        ))}
      </div>

      {/* Gráfico de Barras Comparativo */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={comparisonData.map((item) => ({
              metric: item.metric,
              'Período Atual': item.metric === 'Saldo Pendente' 
                ? item.current / 1000 // Dividir por 1000 para melhor visualização
                : item.metric === 'Taxa Conclusão'
                ? item.current
                : item.current,
              'Período Anterior': item.metric === 'Saldo Pendente'
                ? item.previous / 1000
                : item.metric === 'Taxa Conclusão'
                ? item.previous
                : item.previous,
            }))}
            margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              vertical={false}
              opacity={0.5}
            />
            <XAxis
              dataKey="metric"
              stroke="#9ca3af"
              style={{ fontSize: '11px', fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#9ca3af"
              style={{ fontSize: '11px', fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
              formatter={(value: number, name: string) => {
                const item = comparisonData.find(d => d.metric === name);
                if (!item) return value;
                
                if (item.metric === 'Saldo Pendente') {
                  return currencyFormatter.format(value * 1000);
                }
                if (item.metric === 'Taxa Conclusão') {
                  return `${value.toFixed(1)}%`;
                }
                return numberFormatter.format(value);
              }}
            />
            <Legend />
            <Bar
              dataKey="Período Atual"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              animationDuration={800}
            />
            <Bar
              dataKey="Período Anterior"
              fill="#9ca3af"
              radius={[4, 4, 0, 0]}
              animationDuration={800}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export default PeriodComparison;

