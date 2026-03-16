import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { fetchTopFaturamento, type TopFaturamentoItem } from '../../services/enhancedDashboard';

const ANOS_DISPONIVEIS = [2025, 2024];

const TopFaturamentoChart: React.FC = () => {
  const navigate = useNavigate();
  const [ano, setAno] = useState(2025);
  const [data, setData] = useState<TopFaturamentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const loadData = useCallback(async (year: number) => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTopFaturamento(year, 10);
      setData(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar faturamento.');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(ano);
  }, [ano, loadData]);

  const chartData = React.useMemo(() => {
    return data.map((item) => ({
      ...item,
      name: item.businessName.length > 30
        ? `${item.businessName.substring(0, 30)}...`
        : item.businessName,
      fullName: item.businessName,
    }));
  }, [data]);

  const handleBarClick = (entry: { cnpj?: string }) => {
    if (entry?.cnpj) {
      const cnpjLimpo = String(entry.cnpj).replace(/\D/g, '');
      navigate(`/dctf?search=${cnpjLimpo}`);
    }
  };

  if (loading && data.length === 0) {
    return (
      <section id="secao-faturamento" className="scroll-mt-6 bg-white shadow rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top 10 Empresas por Faturamento</h2>
        <div className="h-96 flex items-center justify-center text-gray-500">Carregando...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section id="secao-faturamento" className="scroll-mt-6 bg-white shadow rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top 10 Empresas por Faturamento</h2>
        <p className="text-sm text-red-600">{error}</p>
      </section>
    );
  }

  if (chartData.length === 0) {
    return (
      <section id="secao-faturamento" className="scroll-mt-6 bg-white shadow rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Top 10 Empresas por Faturamento</h2>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ANOS_DISPONIVEIS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-gray-500">Nenhum dado de faturamento disponível para o ano selecionado.</p>
      </section>
    );
  }

  const maxFaturamento = Math.max(...chartData.map((d) => d.faturamento));

  return (
    <section id="secao-faturamento" className="scroll-mt-6 bg-white shadow rounded-xl p-6 mb-8" aria-labelledby="titulo-faturamento">
      <div className="flex items-center justify-between mb-4">
        <h2 id="titulo-faturamento" className="text-xl font-semibold text-gray-900">Top 10 Empresas por Faturamento</h2>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {ANOS_DISPONIVEIS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="h-96 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 20, right: 30, left: 150, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              horizontal={true}
              vertical={false}
              opacity={0.5}
            />
            <XAxis
              type="number"
              stroke="#9ca3af"
              style={{ fontSize: '11px', fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => {
                if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
                return `R$ ${value}`;
              }}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#9ca3af"
              style={{ fontSize: '11px', fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                border: 'none',
                borderRadius: '12px',
                fontSize: '13px',
                padding: '12px 16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
              }}
              formatter={(value: number) => currencyFormatter.format(value)}
              labelFormatter={(label) => {
                const entry = chartData.find((d) => d.name === label);
                return entry ? `${entry.fullName}\nCNPJ: ${entry.cnpj}\nFaturamento ${ano}: ${currencyFormatter.format(entry.faturamento)}` : label;
              }}
              labelStyle={{
                fontWeight: 600,
                color: '#111827',
                marginBottom: '8px',
              }}
            />
            <Bar
              dataKey="faturamento"
              radius={[0, 8, 8, 0]}
              onClick={(payload: { name?: string }) => {
                const entry = chartData.find((d) => d.name === payload?.name);
                if (entry) handleBarClick(entry);
              }}
              style={{ cursor: 'pointer' }}
              animationDuration={800}
            >
              {chartData.map((entry, index) => {
                const intensity = maxFaturamento > 0 ? entry.faturamento / maxFaturamento : 0;
                const color = intensity > 0.7 ? '#059669' : intensity > 0.4 ? '#10b981' : '#34d399';
                return <Cell key={`cell-${index}`} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Clique em uma barra para ver os detalhes do cliente. Dados do cache de faturamento (SCI).
      </p>
    </section>
  );
};

export default TopFaturamentoChart;
