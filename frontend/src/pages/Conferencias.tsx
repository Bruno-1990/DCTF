/**
 * PÁGINA: Conferências
 *
 * Exibe todas as conferências do sistema de forma organizada e dinâmica.
 * As seções podem ser reordenadas por arrastar e soltar (estilo Kanban); a ordem é salva no localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchConferenceSummary } from '../services/conferences-modules';
import type { ConferenceSummary } from '../services/conferences-modules';
import { ClientesSemDCTFVigenteSection } from '../components/conferences/ClientesSemDCTFVigenteSection';
import { ClientesSemDCTFComMovimentoSection } from '../components/conferences/ClientesSemDCTFComMovimentoSection';
import { DCTFsForaDoPrazoSection } from '../components/conferences/DCTFsForaDoPrazoSection';
import { DCTFsPeriodoInconsistenteSection } from '../components/conferences/DCTFsPeriodoInconsistenteSection';
import { ClientesSemMovimentacaoSection } from '../components/conferences/ClientesSemMovimentacaoSection';
import { ClientesEmAndamentoSection } from '../components/conferences/ClientesEmAndamentoSection';
import { ClientesDispensadosDCTFSection } from '../components/conferences/ClientesDispensadosDCTFSection';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  ClockIcon,
  DocumentTextIcon,
  XCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

const STORAGE_KEY_SECTION_ORDER = 'conferencias-section-order';

const DEFAULT_SECTION_ORDER = [
  'clientesSemDCTFVigente',
  'clientesSemDCTFComMovimento',
  'clientesDispensadosDCTF',
  'dctfsForaDoPrazo',
  'dctfsPeriodoInconsistente',
  'clientesSemMovimentacao',
  'clientesEmAndamento',
] as const;

type SectionKey = (typeof DEFAULT_SECTION_ORDER)[number];

function loadSectionOrder(): SectionKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SECTION_ORDER);
    if (!raw) return [...DEFAULT_SECTION_ORDER];
    const parsed = JSON.parse(raw) as string[];
    const validSet = new Set(DEFAULT_SECTION_ORDER as unknown as string[]);
    const fromStorage = parsed.filter((k) => validSet.has(k)) as SectionKey[];
    const missing = (DEFAULT_SECTION_ORDER as unknown as SectionKey[]).filter((k) => !fromStorage.includes(k));
    return fromStorage.length ? [...fromStorage, ...missing] : [...DEFAULT_SECTION_ORDER];
  } catch {
    return [...DEFAULT_SECTION_ORDER];
  }
}

function saveSectionOrder(order: SectionKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY_SECTION_ORDER, JSON.stringify(order));
  } catch {
    // ignore
  }
}

export default function Conferencias() {
  const [summary, setSummary] = useState<ConferenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(() => loadSectionOrder());
  const [draggingKey, setDraggingKey] = useState<SectionKey | null>(null);

  // Estado para controlar quais seções estão expandidas
  const [expandedSections, setExpandedSections] = useState<{
    clientesSemDCTFVigente: boolean;
    clientesSemDCTFComMovimento: boolean;
    dctfsForaDoPrazo: boolean;
    dctfsPeriodoInconsistente: boolean;
    clientesSemMovimentacao: boolean;
    clientesEmAndamento: boolean;
    clientesDispensadosDCTF: boolean;
  }>({
    clientesSemDCTFVigente: false,
    clientesSemDCTFComMovimento: false,
    dctfsForaDoPrazo: false,
    dctfsPeriodoInconsistente: false,
    clientesSemMovimentacao: false,
    clientesEmAndamento: false,
    clientesDispensadosDCTF: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const expandAllSections = () => {
    setExpandedSections({
      clientesSemDCTFVigente: true,
      clientesSemDCTFComMovimento: true,
      dctfsForaDoPrazo: true,
      dctfsPeriodoInconsistente: true,
      clientesSemMovimentacao: true,
      clientesEmAndamento: true,
      clientesDispensadosDCTF: true,
    });
  };

  const handleSectionDragStart = useCallback((e: React.DragEvent, key: SectionKey) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a, select, textarea, [contenteditable="true"]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ key }));
    setDraggingKey(key);
  }, []);

  const handleSectionDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleSectionDrop = useCallback(
    (e: React.DragEvent, dropKey: SectionKey) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingKey(null);
      const raw = e.dataTransfer.getData('text/plain') as SectionKey | '';
      if (!raw || raw === dropKey) return;
      const fromIndex = sectionOrder.indexOf(raw);
      const toIndex = sectionOrder.indexOf(dropKey);
      if (fromIndex === -1 || toIndex === -1) return;
      const next = [...sectionOrder];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      setSectionOrder(next);
      saveSectionOrder(next);
    },
    [sectionOrder]
  );

  const handleSectionDragEnd = useCallback(() => {
    setDraggingKey(null);
  }, []);

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

  const { modulos, modulosMeta, estatisticas, competenciaVigente } = summary;

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
                          
        {/* Estatísticas: 4 cartões em cima, 4 em baixo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {/* Card 1: Total de Pendências (visão geral - sempre primeiro) */}
          <button
            onClick={expandAllSections}
            className="glow-card-blue bg-white rounded-xl p-6 shadow-md border-3 border-blue-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <ChartBarIcon className="h-8 w-8 text-blue-600 mb-3" />
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Total de Pendências</p>
            <p className="text-4xl font-bold text-blue-600">{estatisticas.totalIssues}</p>
          </button>

          {/* Card 2: Sem DCTF Vigente (crítico - sempre visível) */}
          <button
            onClick={() => toggleSection('clientesSemDCTFVigente')}
            className="glow-card-red bg-white rounded-xl p-6 shadow-md border-3 border-red-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-red-50 transition-colors cursor-pointer"
          >
            <BuildingOfficeIcon className="h-8 w-8 text-red-600 mb-3" />
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Sem DCTF Vigente</p>
            <p className="text-4xl font-bold text-red-600">{estatisticas.totalClientesSemDCTFVigente}</p>
          </button>

          {/* Card 3: Sem DCTF c/ Movimento (crítico - sempre visível) */}
          <button
            onClick={() => toggleSection('clientesSemDCTFComMovimento')}
            className="glow-card-orange bg-white rounded-xl p-6 shadow-md border-3 border-orange-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <ExclamationTriangleIcon className="h-8 w-8 text-orange-600 mb-3" />
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Sem DCTF c/ Movimento</p>
            <p className="text-4xl font-bold text-orange-600">{estatisticas.totalClientesSemDCTFComMovimento}</p>
          </button>

          {/* Card 4: Período Inconsistente (atenção - sempre visível) */}
          <button
            onClick={() => toggleSection('dctfsPeriodoInconsistente')}
            className="glow-card-purple bg-white rounded-xl p-6 shadow-md border-3 border-purple-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-purple-50 transition-colors cursor-pointer"
          >
            <DocumentTextIcon className="h-8 w-8 text-purple-600 mb-3" />
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Período Inconsistente</p>
            <p className="text-4xl font-bold text-purple-600">{estatisticas.totalDCTFsPeriodoInconsistente}</p>
          </button>

          {/* Card 5: Clientes Sem Obrigação (informativo - sempre visível) */}
          <button
            onClick={() => toggleSection('clientesDispensadosDCTF')}
            className="glow-card-green bg-white rounded-xl p-6 shadow-md border-3 border-green-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-green-50 transition-colors cursor-pointer"
            title="Clientes que transmitiram DCTF 'Original sem movimento' e não tiveram movimentação na competência vigente. Dispensados de transmitir conforme IN RFB 2.237/2024, Art. 3º, § 3º."
          >
            <InformationCircleIcon className="h-8 w-8 text-green-600 mb-3" />
            <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Sem Obrigação</p>
            <p className="text-xs text-gray-500 mb-1">(Original s/ Mov.)</p>
            <p className="text-4xl font-bold text-green-600">{estatisticas.totalClientesDispensadosDCTF}</p>
            <p className="text-[10px] text-gray-400 mt-1">IN RFB 2.237/2024</p>
          </button>

          {/* Card 6: Fora do Prazo (condicional - aparece quando tem dados) */}
          {estatisticas.totalDCTFsForaDoPrazo > 0 && (
            <button
              onClick={() => toggleSection('dctfsForaDoPrazo')}
              className="glow-card-yellow bg-white rounded-xl p-6 shadow-md border-3 border-yellow-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-yellow-50 transition-colors cursor-pointer"
            >
              <ClockIcon className="h-8 w-8 text-yellow-600 mb-3" />
              <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Fora do Prazo</p>
              <p className="text-4xl font-bold text-yellow-600">{estatisticas.totalDCTFsForaDoPrazo}</p>
            </button>
          )}

          {/* Card 7: Sem Movimentação (condicional - aparece quando tem dados) */}
          {estatisticas.totalClientesSemMovimentacao > 0 && (
            <button
              onClick={() => toggleSection('clientesSemMovimentacao')}
              className="glow-card-indigo bg-white rounded-xl p-6 shadow-md border-3 border-indigo-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              <XCircleIcon className="h-8 w-8 text-indigo-600 mb-3" />
              <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Sem Movimentação</p>
              <p className="text-4xl font-bold text-indigo-600">{estatisticas.totalClientesSemMovimentacao}</p>
            </button>
          )}

          {/* Card 8: Em Andamento - SEMPRE VISÍVEL (apenas registros em andamento) */}
          <button
            onClick={() => toggleSection('clientesEmAndamento')}
            className="glow-card-pink bg-white rounded-xl p-6 shadow-md border-3 border-blue-500 text-center flex flex-col items-center justify-center h-[170px] hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <ArrowPathIcon className="h-8 w-8 text-blue-600 mb-3" />
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Em Andamento</p>
            <p className="text-4xl font-bold text-blue-600">{estatisticas.totalDCTFsEmAndamento}</p>
          </button>

        </div>
              </div>

          {/* Módulos de Conferência – ordem tipo Kanban (arraste o card para reordenar) */}
          <div className="space-y-4">
            <p className="text-sm text-gray-500 mb-2">
              Arraste um card para cima ou para baixo para reordenar. A ordem é salva automaticamente.
            </p>
            {sectionOrder.map((sectionKey) => {
              const isDragging = draggingKey === sectionKey;
              return (
                <div
                  key={sectionKey}
                  onDragOver={handleSectionDragOver}
                  onDrop={(e) => handleSectionDrop(e, sectionKey)}
                  className={isDragging ? 'rounded-xl border-2 border-blue-400 bg-blue-50/50 opacity-80 transition-all duration-200' : 'transition-all duration-200'}
                >
                  <div
                    draggable
                    onDragStart={(e) => handleSectionDragStart(e, sectionKey)}
                    onDragEnd={handleSectionDragEnd}
                    className="cursor-grab active:cursor-grabbing outline-none"
                    title="Arraste para reordenar"
                  >
                      {sectionKey === 'clientesSemDCTFVigente' && (
                        <ClientesSemDCTFVigenteSection
                          clientes={modulos.clientesSemDCTFVigente}
                          competenciaVigente={competenciaVigente.competencia}
                          loading={false}
                          error={null}
                          expanded={expandedSections.clientesSemDCTFVigente}
                          onToggle={() => toggleSection('clientesSemDCTFVigente')}
                        />
                      )}
                      {sectionKey === 'clientesSemDCTFComMovimento' && (
                        <ClientesSemDCTFComMovimentoSection
                          clientes={modulos.clientesSemDCTFComMovimento}
                          competenciaVigente={competenciaVigente.competencia}
                          loading={false}
                          error={null}
                          expanded={expandedSections.clientesSemDCTFComMovimento}
                          onToggle={() => toggleSection('clientesSemDCTFComMovimento')}
                        />
                      )}
                      {sectionKey === 'clientesDispensadosDCTF' && (
                        <ClientesDispensadosDCTFSection
                          clientes={modulos.clientesDispensadosDCTF}
                          loading={false}
                          error={null}
                          expanded={expandedSections.clientesDispensadosDCTF}
                          onToggle={() => toggleSection('clientesDispensadosDCTF')}
                        />
                      )}
                      {sectionKey === 'dctfsForaDoPrazo' && (
                        <DCTFsForaDoPrazoSection
                          dctfs={modulos.dctfsForaDoPrazo}
                          loading={false}
                          error={null}
                          expanded={expandedSections.dctfsForaDoPrazo}
                          onToggle={() => toggleSection('dctfsForaDoPrazo')}
                        />
                      )}
                      {sectionKey === 'dctfsPeriodoInconsistente' && (
                        <DCTFsPeriodoInconsistenteSection
                          dctfs={modulos.dctfsPeriodoInconsistente}
                          loading={false}
                          error={null}
                          expanded={expandedSections.dctfsPeriodoInconsistente}
                          onToggle={() => toggleSection('dctfsPeriodoInconsistente')}
                        />
                      )}
                      {sectionKey === 'clientesSemMovimentacao' && (
                        <ClientesSemMovimentacaoSection
                          clientes={modulos.clientesSemMovimentacao}
                          loading={false}
                          error={null}
                          expanded={expandedSections.clientesSemMovimentacao}
                          onToggle={() => toggleSection('clientesSemMovimentacao')}
                        />
                      )}
                      {sectionKey === 'clientesEmAndamento' && (
                        <ClientesEmAndamentoSection
                          dctfs={modulos.dctfsEmAndamento}
                          loading={false}
                          error={null}
                          expanded={expandedSections.clientesEmAndamento}
                          onToggle={() => toggleSection('clientesEmAndamento')}
                        />
                      )}
                  </div>
                </div>
              );
            })}
          </div>
    </div>
  );
}
