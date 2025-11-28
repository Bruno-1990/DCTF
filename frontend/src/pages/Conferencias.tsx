/**
 * PÁGINA: Conferências
 * 
 * Exibe todas as conferências do sistema de forma organizada e dinâmica.
 */

import { useState, useEffect } from 'react';
import { fetchConferenceSummary } from '../services/conferences-modules';
import type { ConferenceSummary } from '../services/conferences-modules';
import { ClientesSemDCTFVigenteSection } from '../components/conferences/ClientesSemDCTFVigenteSection';
import { ClientesSemDCTFComMovimentoSection } from '../components/conferences/ClientesSemDCTFComMovimentoSection';
import { DCTFsForaDoPrazoSection } from '../components/conferences/DCTFsForaDoPrazoSection';
import { DCTFsPeriodoInconsistenteSection } from '../components/conferences/DCTFsPeriodoInconsistenteSection';
import { ClientesSemMovimentacaoSection } from '../components/conferences/ClientesSemMovimentacaoSection';
import { ClientesHistoricoAtrasoSection } from '../components/conferences/ClientesHistoricoAtrasoSection';
import { ClientesDispensadosDCTFSection } from '../components/conferences/ClientesDispensadosDCTFSection';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

export default function Conferencias() {
  const [summary, setSummary] = useState<ConferenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      console.log('[Conferências] Carregando dados...');
      const data = await fetchConferenceSummary();
      console.log('[Conferências] Dados carregados:', data);
      setSummary(data);
    } catch (err: any) {
      console.error('[Conferências] Erro ao carregar:', err);
      console.error('[Conferências] Stack:', err.stack);
      setError(err.message || 'Erro ao carregar conferências. Tente novamente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData(true);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl min-h-screen">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="space-y-3 mt-6">
              <div className="h-24 bg-gray-200 rounded"></div>
              <div className="h-24 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl min-h-screen">
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <ExclamationTriangleIcon className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Erro ao Carregar Conferências</h1>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl min-h-screen">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  const { modulos, estatisticas, competenciaVigente } = summary;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl min-h-screen">
      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Conferências</h1>
            <p className="text-gray-600">
              Competência vigente: <span className="font-semibold">{competenciaVigente.competencia}</span>
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <ChartBarIcon className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Total de Issues</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{estatisticas.totalIssues}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-1">Sem DCTF Vigente</p>
            <p className="text-2xl font-bold text-gray-900">{estatisticas.totalClientesSemDCTFVigente}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-1">Sem DCTF c/ Movimento</p>
            <p className="text-2xl font-bold text-gray-900">{estatisticas.totalClientesSemDCTFComMovimento}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <p className="text-sm font-medium text-amber-700 mb-1">Fora do Prazo</p>
            <p className="text-2xl font-bold text-amber-900">{estatisticas.totalDCTFsForaDoPrazo}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm font-medium text-purple-700 mb-1">Período Inconsistente</p>
            <p className="text-2xl font-bold text-purple-900">{estatisticas.totalDCTFsPeriodoInconsistente}</p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
            <p className="text-sm font-medium text-indigo-700 mb-1">Sem Movimentação</p>
            <p className="text-2xl font-bold text-indigo-900">{estatisticas.totalClientesSemMovimentacao}</p>
          </div>
        </div>
      </div>

          {/* Módulos de Conferência */}
          <div className="space-y-6">
            {/* Módulo 1: Clientes sem DCTF Vigente */}
            {modulos.clientesSemDCTFVigente.length > 0 && (
              <ClientesSemDCTFVigenteSection
                clientes={modulos.clientesSemDCTFVigente}
                competenciaVigente={competenciaVigente.competencia}
                loading={false}
                error={null}
              />
            )}

            {/* Módulo 2: Clientes sem DCTF com Movimento */}
            {modulos.clientesSemDCTFComMovimento.length > 0 && (
              <ClientesSemDCTFComMovimentoSection
                clientes={modulos.clientesSemDCTFComMovimento}
                competenciaVigente={competenciaVigente.competencia}
                loading={false}
                error={null}
              />
            )}

            {/* Módulo 2.1: DCTFs Enviadas Fora do Prazo */}
            {modulos.dctfsForaDoPrazo.length > 0 && (
              <DCTFsForaDoPrazoSection
                dctfs={modulos.dctfsForaDoPrazo}
                loading={false}
                error={null}
              />
            )}

            {/* Módulo 2.2: DCTFs com Período Inconsistente */}
            {modulos.dctfsPeriodoInconsistente.length > 0 && (
              <DCTFsPeriodoInconsistenteSection
                dctfs={modulos.dctfsPeriodoInconsistente}
                loading={false}
                error={null}
              />
            )}

            {/* Módulo 5.1: Clientes sem Movimentação há mais de 12 meses */}
            {modulos.clientesSemMovimentacao.length > 0 && (
              <ClientesSemMovimentacaoSection
                clientes={modulos.clientesSemMovimentacao}
                loading={false}
                error={null}
              />
            )}

            {/* Módulo 6.2: Clientes com Histórico de Atraso */}
            {modulos.clientesHistoricoAtraso.length > 0 && (
              <ClientesHistoricoAtrasoSection
                clientes={modulos.clientesHistoricoAtraso}
                loading={false}
                error={null}
              />
            )}

            {/* Módulo 7: Clientes Dispensados de Transmitir DCTF */}
            <ClientesDispensadosDCTFSection
              clientes={modulos.clientesDispensadosDCTF}
              loading={false}
              error={null}
            />
          </div>
    </div>
  );
}
