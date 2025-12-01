import React from 'react';
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

interface TopClientsChartProps {
  data: Array<{
    clientId: string;
    businessName: string;
    cnpj: string;
    balanceDue: number;
    pendingDeclarations: number;
  }>;
}

const TopClientsChart: React.FC<TopClientsChartProps> = ({ data }) => {
  const navigate = useNavigate();
  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  // Limitar a top 10 e preparar dados para o gráfico
  const chartData = React.useMemo(() => {
    return data.slice(0, 10).map((client) => ({
      ...client,
      name: client.businessName.length > 30 
        ? `${client.businessName.substring(0, 30)}...` 
        : client.businessName,
      fullName: client.businessName,
    }));
  }, [data]);

  const handleBarClick = (data: any, index: number) => {
    if (data?.cnpj) {
      const cnpjLimpo = data.cnpj.replace(/\D/g, '');
      navigate(`/dctf?search=${cnpjLimpo}`);
    }
  };

  if (chartData.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top 10 Clientes com Maior Saldo Pendente</h2>
        <p className="text-sm text-gray-500">Nenhum cliente com saldo pendente encontrado.</p>
      </div>
    );
  }

  // Calcular valor máximo para normalizar cores
  const maxBalance = Math.max(...chartData.map(d => d.balanceDue));

  return (
    <section className="bg-white shadow rounded-lg p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Top 10 Clientes com Maior Saldo Pendente</h2>
      
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
                const entry = chartData.find(d => d.name === label);
                return entry ? `${entry.fullName}\nCNPJ: ${entry.cnpj}\nDeclarações pendentes: ${entry.pendingDeclarations}` : label;
              }}
              labelStyle={{
                fontWeight: 600,
                color: '#111827',
                marginBottom: '8px',
              }}
            />
            <Bar
              dataKey="balanceDue"
              radius={[0, 8, 8, 0]}
              onClick={(data: any) => {
                const entry = chartData.find(d => d.name === data.name);
                if (entry) {
                  handleBarClick(entry, 0);
                }
              }}
              style={{ cursor: 'pointer' }}
              animationDuration={800}
            >
              {chartData.map((entry, index) => {
                const intensity = entry.balanceDue / maxBalance;
                const color = intensity > 0.7 
                  ? '#dc2626' 
                  : intensity > 0.4 
                  ? '#ea580c' 
                  : '#f97316';
                return (
                  <Cell key={`cell-${index}`} fill={color} />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <p className="text-xs text-gray-500 mt-4">
        Clique em uma barra para ver os detalhes do cliente
      </p>
    </section>
  );
};

export default TopClientsChart;

