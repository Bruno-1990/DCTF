import React from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

interface SitfMetricsSectionProps {
  data: {
    totalConsultations: number;
    validCertificates: number;
    expiredCertificates: number;
    activeProtocols: number;
    certificateTypes: {
      positiva: number;
      negativa: number;
      positivaComEfeitos: number;
    };
    topExpired: Array<{
      cnpj: string;
      businessName: string;
      expirationDate: string;
      daysUntilExpiration: number;
    }>;
  };
}

const SitfMetricsSection: React.FC<SitfMetricsSectionProps> = ({ data }) => {
  const numberFormatter = new Intl.NumberFormat('pt-BR');
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

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

  // Preparar dados para gráfico de pizza
  const pieData = [
    { name: 'Positiva', value: data.certificateTypes.positiva, color: '#10b981' },
    { name: 'Negativa', value: data.certificateTypes.negativa, color: '#3b82f6' },
    { name: 'Positiva c/ Efeitos', value: data.certificateTypes.positivaComEfeitos, color: '#f59e0b' },
  ].filter(item => item.value > 0);

  const cards = [
    {
      id: 'total-consultations',
      label: 'Total de Consultas',
      value: numberFormatter.format(data.totalConsultations),
      color: 'bg-blue-50 border-blue-200',
    },
    {
      id: 'valid-certificates',
      label: 'Certidões Válidas',
      value: numberFormatter.format(data.validCertificates),
      color: 'bg-green-50 border-green-200',
    },
    {
      id: 'expired-certificates',
      label: 'Certidões Vencidas',
      value: numberFormatter.format(data.expiredCertificates),
      color: 'bg-red-50 border-red-200',
    },
    {
      id: 'active-protocols',
      label: 'Protocolos Ativos',
      value: numberFormatter.format(data.activeProtocols),
      color: 'bg-purple-50 border-purple-200',
    },
  ];

  return (
    <section className="bg-white shadow rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Situação Fiscal (SITF)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Métricas de consultas fiscais e status de certidões
          </p>
        </div>
        <Link
          to="/situacao-fiscal"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Ver detalhes
          <span aria-hidden>→</span>
        </Link>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <div
            key={card.id}
            className={`flex flex-col gap-2 p-4 rounded-lg border ${card.color}`}
          >
            <p className="text-sm font-medium text-gray-600">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de Pizza - Distribuição de Tipos de Certidão */}
      {pieData.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribuição de Tipos de Certidão</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  animationDuration={800}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => numberFormatter.format(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top 5 Empresas com Certidões Vencidas ou Próximas do Vencimento */}
      {data.topExpired.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Certidões Vencidas ou Próximas do Vencimento
          </h3>
          <div className="space-y-3">
            {data.topExpired.map((item, index) => {
              const isExpired = item.daysUntilExpiration < 0;
              const isNearExpiration = item.daysUntilExpiration >= 0 && item.daysUntilExpiration <= 7;
              
              return (
                <div
                  key={`${item.cnpj}-${index}`}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isExpired
                      ? 'bg-red-50 border-red-200'
                      : isNearExpiration
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{item.businessName}</p>
                    <p className="text-xs text-gray-500">{formatCNPJ(item.cnpj)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-600">
                      {dateFormatter.format(new Date(item.expirationDate))}
                    </p>
                    <span
                      className={`text-xs font-semibold ${
                        isExpired
                          ? 'text-red-700'
                          : isNearExpiration
                          ? 'text-amber-700'
                          : 'text-gray-700'
                      }`}
                    >
                      {isExpired
                        ? `Vencida há ${Math.abs(item.daysUntilExpiration)} ${Math.abs(item.daysUntilExpiration) === 1 ? 'dia' : 'dias'}`
                        : `Vence em ${item.daysUntilExpiration} ${item.daysUntilExpiration === 1 ? 'dia' : 'dias'}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default SitfMetricsSection;



