import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import Alert from "../components/UI/Alert";
import { fetchEnhancedDashboard, type EnhancedDashboardData } from "../services/enhancedDashboard";
import { fetchConferenceSummary, type ConferenceSummary } from "../services/conferences-modules";
import HeroSection from "../components/Dashboard/HeroSection";
import FinancialEvolutionChart from "../components/Dashboard/FinancialEvolutionChart";
import TopClientsChart from "../components/Dashboard/TopClientsChart";
import TopFaturamentoChart from "../components/Dashboard/TopFaturamentoChart";
import SitfMetricsSection from "../components/Dashboard/SitfMetricsSection";
import PeriodComparison from "../components/Dashboard/PeriodComparison";
import AlertsSection from "../components/Dashboard/AlertsSection";
import ConferenceSummaryCard from "../components/Dashboard/ConferenceSummaryCard";
import DashboardFilters, { type DashboardFilters as DashboardFiltersType } from "../components/Dashboard/DashboardFilters";
import { ArrowPathIcon } from '@heroicons/react/24/outline';

const AdminDashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<EnhancedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conferenceSummary, setConferenceSummary] = useState<ConferenceSummary | null>(null);
  const [conferenceError, setConferenceError] = useState<string | null>(null);
  const [conferenceLoading, setConferenceLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
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
        setError(null);
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

  useEffect(() => {
    let cancelled = false;
    const loadConference = async () => {
      setConferenceLoading(true);
      setConferenceError(null);
      try {
        const summary = await fetchConferenceSummary();
        if (!cancelled) setConferenceSummary(summary);
      } catch (err) {
        if (!cancelled) {
          setConferenceError(err instanceof Error ? err.message : "Erro ao carregar conferências");
        }
      } finally {
        if (!cancelled) setConferenceLoading(false);
      }
    };
    loadConference();
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const results = await Promise.allSettled([
      fetchEnhancedDashboard(months),
      fetchConferenceSummary(),
    ]);
    if (results[0].status === "fulfilled") {
      setData(results[0].value);
      setError(null);
    } else {
      setError(results[0].reason instanceof Error ? results[0].reason.message : "Erro ao atualizar");
    }
    if (results[1].status === "fulfilled") {
      setConferenceSummary(results[1].value);
      setConferenceError(null);
    } else {
      setConferenceError(results[1].reason instanceof Error ? results[1].reason.message : "Erro ao atualizar conferências");
    }
    setRefreshing(false);
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
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <DashboardFilters
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Navegação por seções (âncoras) - Aba Faturamento e demais */}
      <nav className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-gray-200" aria-label="Seções do dashboard">
        <a href="#secao-visao-geral" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Visão Geral</a>
        <a href="#secao-evolucao" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Evolução</a>
        <a href="#secao-top-clientes" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Top Clientes</a>
        <a href="#secao-faturamento" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Faturamento</a>
        <a href="#secao-sitf" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">SITF</a>
        <a href="#secao-comparativo" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Comparativo</a>
        <a href="#secao-alertas" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Alertas</a>
      </nav>

      {/* Hero Section - Cards Principais */}
      <section id="secao-visao-geral" className="scroll-mt-6" aria-labelledby="titulo-visao-geral">
        <HeroSection data={data.hero} />
      </section>

      {/* Evolução Financeira e Conferências DCTF */}
      <section id="secao-evolucao" className="scroll-mt-6 mb-8" aria-label="Evolução financeira e conferências">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FinancialEvolutionChart data={data.financial.evolution} />
          <ConferenceSummaryCard
            data={conferenceSummary}
            error={conferenceError}
            loading={conferenceLoading}
          />
        </div>
      </section>

      {/* Top 10 Clientes */}
      <div id="secao-top-clientes" className="scroll-mt-6">
        <TopClientsChart data={data.financial.topClients} />
      </div>

      {/* Faturamento - Top 10 por ano (cache SCI) */}
      <TopFaturamentoChart />

      {/* Seção SITF */}
      <div id="secao-sitf" className="scroll-mt-6">
        <SitfMetricsSection data={data.sitf} />
      </div>

      {/* Comparativo de Períodos */}
      <div id="secao-comparativo" className="scroll-mt-6">
        <PeriodComparison data={data.comparisons} />
      </div>

      {/* Seção de Alertas */}
      <div id="secao-alertas" className="scroll-mt-6">
        <AlertsSection data={data.alerts} />
      </div>
    </div>
  );
};

export default AdminDashboard;
