import React, { useState, useMemo } from 'react';
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import EvidenceDrawer from './EvidenceDrawer';
import type { EvidenciaXML, EvidenciaSPED, EvidenciaComparacao } from './EvidenceDrawer';
import type { DivergenciaClassificada } from './ClassificationView';
import { AnalysisReport } from './AnalysisReport';
import { RuleGeneratorModal } from './RuleGeneratorModal';
import { SparklesIcon } from '@heroicons/react/24/outline';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface Step4ResultsViewProps {
  divergencias: DivergenciaClassificada[];
  onVerEvidencias?: (divergencia: DivergenciaClassificada) => void;
  onNext?: () => void;
  onBack?: () => void;
  validationId?: string;
}

const Step4ResultsView: React.FC<Step4ResultsViewProps> = ({
  divergencias,
  onVerEvidencias,
  onNext,
  onBack,
  validationId,
}) => {
  // Debug: Log das divergências recebidas
  React.useEffect(() => {
    console.log('[Step4ResultsView] 📊 Divergências recebidas:', divergencias);
    console.log('[Step4ResultsView] 📊 Total de divergências:', divergencias?.length || 0);
    if (divergencias && divergencias.length > 0) {
      console.log('[Step4ResultsView] 📊 Primeira divergência:', divergencias[0]);
    }
  }, [divergencias]);
  
  const [sidebarAberto, setSidebarAberto] = useState<boolean>(true);
  const [modalRegraAberto, setModalRegraAberto] = useState<boolean>(false);
  const [filtros, setFiltros] = useState({
    classificacao: 'todos',
    impacto: 'todos',
    nao_conciliado: false,
    cfop: '',
    cst: '',
    st: false,
    ajustes: false,
  });
  const [busca, setBusca] = useState<string>('');
  const [ordenacao, setOrdenacao] = useState<'impacto' | 'score' | 'diferenca'>('impacto');
  const [divergenciaSelecionada, setDivergenciaSelecionada] = useState<DivergenciaClassificada | null>(null);
  const [mostrarEvidencias, setMostrarEvidencias] = useState<boolean>(false);

  const divergenciasFiltradas = useMemo(() => {
    console.log('[Step4ResultsView] 🔍 Aplicando filtros. Total antes:', divergencias.length);
    let filtradas = [...divergencias];

    // Filtros
    if (filtros.classificacao !== 'todos') {
      filtradas = filtradas.filter((d) => d.classificacao === filtros.classificacao);
    }
    if (filtros.impacto !== 'todos') {
      filtradas = filtradas.filter((d) => d.impacto === filtros.impacto);
    }
    if (filtros.nao_conciliado) {
      filtradas = filtradas.filter((d) => !d.chave_nfe);
    }
    if (filtros.cfop) {
      filtradas = filtradas.filter((d) => d.tipo.toLowerCase().includes(filtros.cfop.toLowerCase()));
    }
    if (filtros.cst) {
      filtradas = filtradas.filter((d) => d.tipo.toLowerCase().includes(filtros.cst.toLowerCase()));
    }
    if (filtros.st) {
      filtradas = filtradas.filter((d) => d.tipo.toLowerCase().includes('st'));
    }
    if (filtros.ajustes) {
      filtradas = filtradas.filter((d) => d.tipo.toLowerCase().includes('ajuste'));
    }

    // Busca
    if (busca) {
      const buscaLower = busca.toLowerCase();
      filtradas = filtradas.filter(
        (d) =>
          d.campo.toLowerCase().includes(buscaLower) ||
          d.tipo.toLowerCase().includes(buscaLower) ||
          d.explicacao?.toLowerCase().includes(buscaLower)
      );
    }

    // Ordenação
    filtradas.sort((a, b) => {
      if (ordenacao === 'impacto') {
        const ordemImpacto = { alto: 3, medio: 2, baixo: 1, nenhum: 0 };
        return ordemImpacto[b.impacto] - ordemImpacto[a.impacto];
      } else if (ordenacao === 'score') {
        return b.score_confianca - a.score_confianca;
      } else {
        return Math.abs(b.diferenca) - Math.abs(a.diferenca);
      }
    });

    console.log('[Step4ResultsView] ✅ Total após filtros:', filtradas.length);
    return filtradas;
  }, [divergencias, filtros, busca, ordenacao]);

  // Identificar divergências sem regra (score baixo ou sem explicação clara)
  const divergenciasSemRegra = useMemo(() => {
    return divergencias.filter(
      d => !d.contexto?.regra_aplicada || d.contexto?.score_confianca < 30
    );
  }, [divergencias]);

  const handleVerEvidencias = (divergencia: DivergenciaClassificada) => {
    setDivergenciaSelecionada(divergencia);
    setMostrarEvidencias(true);
  };

  const getClassificacaoIcon = (classificacao: string) => {
    switch (classificacao) {
      case 'ERRO':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'REVISAR':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      case 'LEGÍTIMO':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    }
  };

  const getClassificacaoBadge = (classificacao: string) => {
    const classes = {
      ERRO: 'bg-red-100 text-red-800',
      REVISAR: 'bg-yellow-100 text-yellow-800',
      LEGÍTIMO: 'bg-green-100 text-green-800',
    };

    return (
      <span
        className={classNames(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          classes[classificacao as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        )}
      >
        {getClassificacaoIcon(classificacao)}
        <span className="ml-1">{classificacao}</span>
      </span>
    );
  };

  const getImpactoBadge = (impacto: string) => {
    const classes = {
      alto: 'bg-red-100 text-red-800',
      medio: 'bg-yellow-100 text-yellow-800',
      baixo: 'bg-blue-100 text-blue-800',
      nenhum: 'bg-gray-100 text-gray-800',
    };

    return (
      <span
        className={classNames(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          classes[impacto as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        )}
      >
        {impacto.charAt(0).toUpperCase() + impacto.slice(1)}
      </span>
    );
  };

  const formatarValor = (valor: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  // Preparar evidências para o drawer
  const evidenciasXML: EvidenciaXML[] = divergenciaSelecionada
    ? [
        {
          chave_nfe: divergenciaSelecionada.chave_nfe || '',
          tipo: divergenciaSelecionada.tipo,
          campo: divergenciaSelecionada.campo,
          valor: divergenciaSelecionada.valor_xml || 0,
          descricao: `Valor XML para ${divergenciaSelecionada.campo}`,
        },
      ]
    : [];

  const evidenciasSPED: EvidenciaSPED[] = divergenciaSelecionada
    ? [
        {
          registro: 'C170',
          tipo: divergenciaSelecionada.tipo,
          campo: divergenciaSelecionada.campo,
          valor: divergenciaSelecionada.valor_sped || 0,
          descricao: `Valor SPED para ${divergenciaSelecionada.campo}`,
        },
      ]
    : [];

  const comparacao: EvidenciaComparacao | undefined = divergenciaSelecionada
    ? {
        campo: divergenciaSelecionada.campo,
        valor_xml: divergenciaSelecionada.valor_xml,
        valor_sped: divergenciaSelecionada.valor_sped,
        diferenca: divergenciaSelecionada.diferenca,
        regra_aplicada: divergenciaSelecionada.explicacao,
        explicacao: divergenciaSelecionada.explicacao,
        classificacao: divergenciaSelecionada.classificacao,
      }
    : undefined;

  return (
    <div className="flex h-full">
      {/* Sidebar de Filtros */}
      {sidebarAberto && (
        <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <FunnelIcon className="h-5 w-5 text-gray-500" />
              Filtros
            </h3>
            <button
              onClick={() => setSidebarAberto(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Fechar filtros"
            >
              <XCircleIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 mt-4">
            {/* Classificação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Classificação</label>
              <select
                value={filtros.classificacao}
                onChange={(e) => setFiltros({ ...filtros, classificacao: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="todos">Todos</option>
                <option value="ERRO">ERRO</option>
                <option value="REVISAR">REVISAR</option>
                <option value="LEGÍTIMO">LEGÍTIMO</option>
              </select>
            </div>

            {/* Impacto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Impacto</label>
              <select
                value={filtros.impacto}
                onChange={(e) => setFiltros({ ...filtros, impacto: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="todos">Todos</option>
                <option value="alto">Alto</option>
                <option value="medio">Médio</option>
                <option value="baixo">Baixo</option>
                <option value="nenhum">Nenhum</option>
              </select>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filtros.nao_conciliado}
                  onChange={(e) => setFiltros({ ...filtros, nao_conciliado: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Não conciliado</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filtros.st}
                  onChange={(e) => setFiltros({ ...filtros, st: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Substituição Tributária</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filtros.ajustes}
                  onChange={(e) => setFiltros({ ...filtros, ajustes: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Com ajustes</span>
              </label>
            </div>

            {/* CFOP/CST */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CFOP</label>
              <input
                type="text"
                value={filtros.cfop}
                onChange={(e) => setFiltros({ ...filtros, cfop: e.target.value })}
                placeholder="Ex: 5101"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CST</label>
              <input
                type="text"
                value={filtros.cst}
                onChange={(e) => setFiltros({ ...filtros, cst: e.target.value })}
                placeholder="Ex: 00"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {/* Header com busca e ordenação */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 gap-4">
              <h2 className="text-2xl font-bold text-gray-900 flex-1 min-w-0">
                <span className="block truncate">
                  Resultados da Validação
                  {divergencias.length > 0 && (
                    <span className="ml-3 text-lg font-normal text-gray-600">
                      ({divergenciasFiltradas.length} de {divergencias.length})
                    </span>
                  )}
                </span>
              </h2>
              {!sidebarAberto && (
                <button
                  onClick={() => setSidebarAberto(true)}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                  aria-label="Abrir filtros"
                >
                  <FunnelIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            
            {/* Botões de Navegação no Topo */}
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
              <button
                onClick={onBack}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ChevronLeftIcon className="h-5 w-5 mr-2" />
                Voltar
              </button>
            
              {divergencias.length > 0 && (
                <button
                  onClick={onNext}
                  className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Avançar para Correções
                  <ChevronRightIcon className="h-5 w-5 ml-2" />
                </button>
              )}
            </div>
          </div>
          
          {/* Relatório de Análise */}
          {divergencias.length > 0 && (
            <AnalysisReport divergencias={divergencias} />
          )}

          {/* Banner de Divergências Não Cobertas */}
          {divergenciasSemRegra.length > 0 && validationId && (
            <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-orange-900 flex items-center gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5" />
                    {divergenciasSemRegra.length} Divergências Não Explicadas
                  </h4>
                  <p className="text-sm text-orange-700 mt-1">
                    Algumas divergências não foram cobertas pelas regras atuais.
                    Gere regras automáticas usando nossa base de conhecimento.
                  </p>
                </div>
                <button
                  onClick={() => setModalRegraAberto(true)}
                  className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 flex-shrink-0"
                >
                  <SparklesIcon className="h-5 w-5" />
                  Gerar Regras ({divergenciasSemRegra.length})
                </button>
              </div>
            </div>
          )}
          
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Busca */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar divergências..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  aria-label="Buscar divergências"
                />
              </div>

              {/* Ordenação */}
              <div>
                <select
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value as any)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  aria-label="Ordenar resultados"
                >
                  <option value="impacto">Impacto (Alto primeiro)</option>
                  <option value="score">Score de Confiança</option>
                  <option value="diferenca">Diferença (Maior primeiro)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cards de Divergências */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {divergenciasFiltradas.map((div) => (
              <div
                key={div.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                {/* Cabeçalho */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    {getClassificacaoIcon(div.classificacao)}
                    <span className="text-sm font-medium text-gray-900">{div.campo}</span>
                  </div>
                  {getClassificacaoBadge(div.classificacao)}
                </div>

                {/* Corpo */}
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Diferença</div>
                    <div className="text-lg font-bold text-gray-900">{formatarValor(div.diferenca)}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Score de Confiança</div>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={classNames(
                            'h-2 rounded-full',
                            div.score_confianca >= 80 && 'bg-red-500',
                            div.score_confianca >= 50 && div.score_confianca < 80 && 'bg-yellow-500',
                            div.score_confianca < 50 && 'bg-green-500'
                          )}
                          style={{ width: `${div.score_confianca}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {div.score_confianca.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Impacto</div>
                    {getImpactoBadge(div.impacto)}
                  </div>

                  {div.explicacao && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Explicação</div>
                      <p className="text-xs text-gray-700 line-clamp-2">{div.explicacao}</p>
                    </div>
                  )}
                </div>

                {/* Rodapé */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleVerEvidencias(div)}
                    className="w-full text-sm text-indigo-600 hover:text-indigo-900 font-medium"
                  >
                    Ver evidências
                  </button>
                </div>
              </div>
            ))}
          </div>

          {divergenciasFiltradas.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              {divergencias.length === 0 ? (
                <>
                  <p className="text-lg font-medium text-gray-700 mb-2">
                    Nenhuma divergência encontrada
                  </p>
                  <p className="text-sm text-gray-500">
                    A validação foi concluída, mas não foram identificadas divergências entre os arquivos XML e SPED.
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Debug: Total de divergências recebidas: {divergencias.length}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium text-gray-700 mb-2">
                    Nenhuma divergência encontrada com os filtros aplicados
                  </p>
                  <p className="text-sm text-gray-500">
                    Existem {divergencias.length} divergência(s), mas nenhuma corresponde aos filtros selecionados.
                  </p>
                  <button
                    onClick={() => {
                      setFiltros({
                        classificacao: 'todos',
                        impacto: 'todos',
                        nao_conciliado: false,
                        cfop: '',
                        cst: '',
                        st: false,
                        ajustes: false,
                      });
                      setBusca('');
                    }}
                    className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Limpar todos os filtros
                  </button>
                </>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Evidence Drawer */}
      {mostrarEvidencias && divergenciaSelecionada && (
        <EvidenceDrawer
          isOpen={mostrarEvidencias}
          onClose={() => {
            setMostrarEvidencias(false);
            setDivergenciaSelecionada(null);
          }}
          evidencias_xml={evidenciasXML}
          evidencias_sped={evidenciasSPED}
          comparacao={comparacao}
          chave_nfe={divergenciaSelecionada.chave_nfe}
        />
      )}

      {/* Modal de Geração de Regras */}
      {validationId && (
        <RuleGeneratorModal
          isOpen={modalRegraAberto}
          onClose={() => setModalRegraAberto(false)}
          validationId={validationId}
          divergenciasSemRegra={divergenciasSemRegra}
          onRegrasAplicadas={() => {
            // Recarregar validação para mostrar novas regras aplicadas
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};

export default Step4ResultsView;

