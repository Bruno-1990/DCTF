/**
 * PÁGINA: Conferências (Nova estrutura modular)
 * 
 * Esta página foi refeita do zero com uma estrutura modular e organizada.
 * Cada seção é um componente separado e independente.
 */

import { useEffect, useState } from 'react';
import {
  DocumentTextIcon,
  ClockIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { fetchConferenceSummary, type ConferenceSummary } from '../services/conferences-modules';
import { ClientesSemDCTFVigenteSection } from '../components/conferences/ClientesSemDCTFVigenteSection';
import { ClientesSemDCTFComMovimentoSection } from '../components/conferences/ClientesSemDCTFComMovimentoSection';

export default function ConferenciasNova() {
  const [summary, setSummary] = useState<ConferenceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchConferenceSummary();
        setSummary(data);
      } catch (err: any) {
        console.error('Erro ao carregar conferências:', err);
        setError(err.message || 'Erro ao carregar dados de conferências');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Carregando conferências...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <InformationCircleIcon className="h-6 w-6 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">Erro ao carregar conferências</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3 mb-2">
                <DocumentTextIcon className="h-8 w-8 text-blue-600" />
                Conferências DCTF
              </h1>
              <p className="text-sm text-gray-600">
                Análise completa de conformidade e obrigatoriedade de envio de DCTF
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Competência Vigente</div>
              <div className="text-lg font-semibold text-gray-900">{summary.competenciaVigente.competencia}</div>
              <div className="text-xs text-gray-500 mt-1">
                Gerado em {new Date(summary.generatedAt).toLocaleString('pt-BR')}
              </div>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <ClockIcon className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-medium text-gray-600">Clientes sem DCTF Vigente</h3>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.estatisticas.totalClientesSemDCTFVigente}</div>
            <div className="text-xs text-gray-500 mt-1">Clientes cadastrados sem DCTF</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <InformationCircleIcon className="h-5 w-5 text-red-600" />
              <h3 className="text-sm font-medium text-gray-600">Clientes sem DCTF com Movimento</h3>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.estatisticas.totalClientesSemDCTFComMovimento}</div>
            <div className="text-xs text-gray-500 mt-1">Possível obrigação de envio</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <DocumentTextIcon className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-medium text-gray-600">Total de Issues</h3>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.estatisticas.totalIssues}</div>
            <div className="text-xs text-gray-500 mt-1">Total de problemas encontrados</div>
          </div>
        </div>

        {/* Módulos de Conferência */}
        <ClientesSemDCTFVigenteSection
          clientes={summary.modulos.clientesSemDCTFVigente}
          competenciaVigente={summary.competenciaVigente.competencia}
        />

        <ClientesSemDCTFComMovimentoSection
          clientes={summary.modulos.clientesSemDCTFComMovimento}
          competenciaVigente={summary.competenciaVigente.competencia}
        />
      </div>
    </div>
  );
}








