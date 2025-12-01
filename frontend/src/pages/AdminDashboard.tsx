import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import Alert from "../components/UI/Alert";
import { fetchEnhancedDashboard, type EnhancedDashboardData } from "../services/enhancedDashboard";
import HeroSection from "../components/Dashboard/HeroSection";
import FinancialEvolutionChart from "../components/Dashboard/FinancialEvolutionChart";
import TopClientsChart from "../components/Dashboard/TopClientsChart";
import SitfMetricsSection from "../components/Dashboard/SitfMetricsSection";
import PeriodComparison from "../components/Dashboard/PeriodComparison";
import AlertsSection from "../components/Dashboard/AlertsSection";
import DashboardFilters, { type DashboardFilters as DashboardFiltersType } from "../components/Dashboard/DashboardFilters";

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<EnhancedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Inicializar filtros da URL ou usar padrões
  const [filters, setFilters] = useState<DashboardFiltersType>(() => {
    const period = (searchParams.get('period') as DashboardFiltersType['period']) || '6m';
    const status = (searchParams.get('status') as DashboardFiltersType['status']) || 'all';
    const clientSearch = searchParams.get('client') || undefined;
    
    return {
      period,
      status,
      clientSearch,
    };
  });

  // Converter período para meses
  const months = useMemo(() => {
    switch (filters.period) {
      case '3m': return 3;
      case '6m': return 6;
      case '12m': return 12;
      case 'current_month': return 1;
      case 'current_quarter': return 3;
      default: return 6;
    }
  }, [filters.period]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const dashboardData = await fetchEnhancedDashboard(months);
        setData(dashboardData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar o dashboard";
        setError(message);
        console.error("Erro ao carregar dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [months]);

  // Atualizar URL quando filtros mudarem
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.period !== '6m') params.set('period', filters.period);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.clientSearch) params.set('client', filters.clientSearch);
    
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Carregando dashboard" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert type="error" title="Erro ao carregar dados" onClose={() => setError(null)}>
          {error}
        </Alert>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert type="warning" title="Sem dados">
          Nenhum dado disponível no momento.
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Visão consolidada e inteligente dos dados do sistema
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <span className="text-sm text-gray-500">
            Atualizado em {new Date(data.meta.generatedAt).toLocaleString('pt-BR')}
          </span>
        </div>
      </div>

      {/* Filtros */}
      <DashboardFilters
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Hero Section - Cards Principais */}
      <HeroSection data={data.hero} />

      {/* Gráfico de Evolução Financeira */}
      <FinancialEvolutionChart data={data.financial.evolution} />

      {/* Top 10 Clientes */}
      <TopClientsChart data={data.financial.topClients} />

      {/* Seção SITF */}
      <SitfMetricsSection data={data.sitf} />

      {/* Comparativo de Períodos */}
      <PeriodComparison data={data.comparisons} />

      {/* Seção de Alertas */}
      <AlertsSection data={data.alerts} />
    </div>
  );
};

export default AdminDashboard;
