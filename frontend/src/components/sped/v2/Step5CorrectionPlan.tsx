import React, { useState, useMemo } from 'react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  FunnelIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  BoltIcon,
  FireIcon,
} from '@heroicons/react/24/outline';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export interface Correcao {
  id: string;
  chave_nfe?: string;
  tipo: string;
  campo: string;
  valor_antes: number;
  valor_depois: number;
  diferenca: number;
  regra_aplicada?: string;
  score_confianca: number;
  impacto_estimado: number;
  classificacao: 'ERRO' | 'REVISAR' | 'LEGÍTIMO';
  bloqueado: boolean;
  motivo_bloqueio?: string;
  explicacao?: string;
  contexto?: Record<string, any>;
}

export interface TotaisCorrecao {
  tipo: string;
  quantidade: number;
  impacto_total: number;
  quantidade_bloqueadas: number;
  impacto_bloqueadas: number;
  quantidade_erro: number;
  quantidade_revisar: number;
  quantidade_legitimo: number;
}

export interface PlanoCorrecoes {
  correcoes: Correcao[];
  totais_por_tipo: Record<string, TotaisCorrecao>;
  itens_bloqueados: Correcao[];
  impacto_total: number;
  impacto_bloqueadas: number;
  total_correcoes: number;
  total_erro: number;
  total_revisar: number;
  total_legitimo: number;
}

type PerfilExecucao = 'SEGURO' | 'INTERMEDIARIO' | 'AVANCADO';

interface Step5CorrectionPlanProps {
  plano: PlanoCorrecoes;
  onAplicarCorrecoes?: (correcoesSelecionadas: Correcao[], perfil: PerfilExecucao) => void;
  onVisualizarEvidencias?: (correcao: Correcao) => void;
}

const Step5CorrectionPlan: React.FC<Step5CorrectionPlanProps> = ({
  plano,
  onAplicarCorrecoes,
  onVisualizarEvidencias,
}) => {
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('todos');
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [agrupamento, setAgrupamento] = useState<'nenhum' | 'tipo' | 'documento' | 'regra'>('nenhum');
  const [incluirRevisar, setIncluirRevisar] = useState<boolean>(false);
  const [perfilExecucao, setPerfilExecucao] = useState<PerfilExecucao>('SEGURO');
  const [correcoesSelecionadas, setCorrecoesSelecionadas] = useState<Set<string>>(new Set());

  // Filtrar correções baseado nos filtros
  const correcoesFiltradas = useMemo(() => {
    let filtradas = [...plano.correcoes];

    // Filtrar por tipo
    if (filtroTipo !== 'todos') {
      filtradas = filtradas.filter((c) => c.tipo === filtroTipo);
    }

    // Filtrar por classificação
    if (filtroClassificacao !== 'todos') {
      filtradas = filtradas.filter((c) => c.classificacao === filtroClassificacao);
    }

    // Filtrar por busca textual
    if (filtroBusca) {
      const buscaLower = filtroBusca.toLowerCase();
      filtradas = filtradas.filter(
        (c) =>
          c.campo.toLowerCase().includes(buscaLower) ||
          c.regra_aplicada?.toLowerCase().includes(buscaLower) ||
          c.chave_nfe?.toLowerCase().includes(buscaLower) ||
          c.explicacao?.toLowerCase().includes(buscaLower)
      );
    }

    // Filtrar REVISAR se necessário
    if (!incluirRevisar) {
      filtradas = filtradas.filter((c) => c.classificacao !== 'REVISAR');
    }

    // Aplicar perfil de execução
    if (perfilExecucao === 'SEGURO') {
      filtradas = filtradas.filter((c) => c.classificacao === 'ERRO' && c.score_confianca >= 80);
    } else if (perfilExecucao === 'INTERMEDIARIO') {
      filtradas = filtradas.filter(
        (c) => (c.classificacao === 'ERRO' || c.classificacao === 'REVISAR') && c.score_confianca >= 60
      );
    }
    // AVANÇADO inclui todas exceto LEGÍTIMO (já filtrado acima)

    return filtradas;
  }, [plano.correcoes, filtroTipo, filtroClassificacao, filtroBusca, incluirRevisar, perfilExecucao]);

  // Agrupar correções
  const correcoesAgrupadas = useMemo(() => {
    if (agrupamento === 'nenhum') {
      return { 'Todas': correcoesFiltradas };
    }

    const grupos: Record<string, Correcao[]> = {};

    correcoesFiltradas.forEach((correcao) => {
      let chave = 'Outros';

      if (agrupamento === 'tipo') {
        chave = correcao.tipo;
      } else if (agrupamento === 'documento') {
        chave = correcao.chave_nfe || 'Sem documento';
      } else if (agrupamento === 'regra') {
        chave = correcao.regra_aplicada || 'Sem regra';
      }

      if (!grupos[chave]) {
        grupos[chave] = [];
      }
      grupos[chave].push(correcao);
    });

    return grupos;
  }, [correcoesFiltradas, agrupamento]);

  // Calcular totais das correções filtradas
  const totaisFiltrados = useMemo(() => {
    const totais: Record<string, TotaisCorrecao> = {};
    let impactoTotal = 0;
    let impactoBloqueadas = 0;

    correcoesFiltradas.forEach((correcao) => {
      if (!totais[correcao.tipo]) {
        totais[correcao.tipo] = {
          tipo: correcao.tipo,
          quantidade: 0,
          impacto_total: 0,
          quantidade_bloqueadas: 0,
          impacto_bloqueadas: 0,
          quantidade_erro: 0,
          quantidade_revisar: 0,
          quantidade_legitimo: 0,
        };
      }

      const total = totais[correcao.tipo];
      total.quantidade++;
      total.impacto_total += correcao.impacto_estimado;
      impactoTotal += correcao.impacto_estimado;

      if (correcao.bloqueado) {
        total.quantidade_bloqueadas++;
        total.impacto_bloqueadas += correcao.impacto_estimado;
        impactoBloqueadas += correcao.impacto_estimado;
      }

      if (correcao.classificacao === 'ERRO') total.quantidade_erro++;
      else if (correcao.classificacao === 'REVISAR') total.quantidade_revisar++;
      else if (correcao.classificacao === 'LEGÍTIMO') total.quantidade_legitimo++;
    });

    return { totais, impactoTotal, impactoBloqueadas };
  }, [correcoesFiltradas]);

  const formatarValor = (valor: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const getClassificacaoIcon = (classificacao: string) => {
    switch (classificacao) {
      case 'ERRO':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'REVISAR':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      case 'LEGÍTIMO':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      default:
        return null;
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

  const handleToggleSelecao = (correcaoId: string) => {
    setCorrecoesSelecionadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(correcaoId)) {
        novo.delete(correcaoId);
      } else {
        novo.add(correcaoId);
      }
      return novo;
    });
  };

  const handleAplicarCorrecoes = () => {
    const selecionadas = correcoesFiltradas.filter((c) => correcoesSelecionadas.has(c.id));
    if (onAplicarCorrecoes) {
      onAplicarCorrecoes(selecionadas, perfilExecucao);
    }
  };

  const tiposUnicos = useMemo(() => {
    const tipos = new Set(plano.correcoes.map((c) => c.tipo));
    return Array.from(tipos);
  }, [plano.correcoes]);

  return (
    <div className="space-y-6">
      {/* Header com totais */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Plano de Correções</h2>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              Total: {correcoesFiltradas.length} correções
            </span>
            <span className="text-sm font-medium text-gray-900">
              Impacto: {formatarValor(totaisFiltrados.impactoTotal)}
            </span>
          </div>
        </div>

        {/* Cards de totais por tipo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Object.values(totaisFiltrados.totais).map((total) => (
            <div key={total.tipo} className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">{total.tipo}</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{total.quantidade}</div>
              <div className="mt-1 text-sm text-gray-600">
                Impacto: {formatarValor(total.impacto_total)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros e controles */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Filtro por tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              {tiposUnicos.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por classificação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Classificação</label>
            <select
              value={filtroClassificacao}
              onChange={(e) => setFiltroClassificacao(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              <option value="ERRO">ERRO</option>
              <option value="REVISAR">REVISAR</option>
              <option value="LEGÍTIMO">LEGÍTIMO</option>
            </select>
          </div>

          {/* Agrupamento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Agrupar por</label>
            <select
              value={agrupamento}
              onChange={(e) => setAgrupamento(e.target.value as any)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="nenhum">Nenhum</option>
              <option value="tipo">Tipo</option>
              <option value="documento">Documento</option>
              <option value="regra">Regra</option>
            </select>
          </div>

          {/* Busca */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <input
              type="text"
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              placeholder="Buscar correções..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Perfis de execução */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Perfil de Execução</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setPerfilExecucao('SEGURO')}
              className={classNames(
                'flex items-center p-4 rounded-lg border-2 transition-colors',
                perfilExecucao === 'SEGURO'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <ShieldCheckIcon className="h-6 w-6 text-indigo-600 mr-3" />
              <div className="text-left">
                <div className="font-medium text-gray-900">SEGURO</div>
                <div className="text-xs text-gray-500">Apenas ERRO com score ≥ 80</div>
              </div>
            </button>

            <button
              onClick={() => setPerfilExecucao('INTERMEDIARIO')}
              className={classNames(
                'flex items-center p-4 rounded-lg border-2 transition-colors',
                perfilExecucao === 'INTERMEDIARIO'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <BoltIcon className="h-6 w-6 text-yellow-600 mr-3" />
              <div className="text-left">
                <div className="font-medium text-gray-900">INTERMEDIÁRIO</div>
                <div className="text-xs text-gray-500">ERRO + REVISAR com score ≥ 60</div>
              </div>
            </button>

            <button
              onClick={() => setPerfilExecucao('AVANCADO')}
              className={classNames(
                'flex items-center p-4 rounded-lg border-2 transition-colors',
                perfilExecucao === 'AVANCADO'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <FireIcon className="h-6 w-6 text-red-600 mr-3" />
              <div className="text-left">
                <div className="font-medium text-gray-900">AVANÇADO</div>
                <div className="text-xs text-gray-500">Todas exceto LEGÍTIMO</div>
              </div>
            </button>
          </div>
        </div>

        {/* Checkbox incluir REVISAR */}
        <div className="mt-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={incluirRevisar}
              onChange={(e) => setIncluirRevisar(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="ml-2 text-sm text-gray-700">
              Incluir correções classificadas como REVISAR
            </span>
          </label>
        </div>
      </div>

      {/* Lista de correções */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Correções</h3>
            {correcoesSelecionadas.size > 0 && (
              <button
                onClick={handleAplicarCorrecoes}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Aplicar {correcoesSelecionadas.size} correção(ões)
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {Object.entries(correcoesAgrupadas).map(([grupo, correcoes]) => (
            <div key={grupo} className="border-b border-gray-200 last:border-b-0">
              {agrupamento !== 'nenhum' && (
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900">{grupo}</h4>
                  <span className="text-xs text-gray-500">{correcoes.length} correção(ões)</span>
                </div>
              )}

              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={correcoes.every((c) => correcoesSelecionadas.has(c.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCorrecoesSelecionadas(
                              new Set([...correcoesSelecionadas, ...correcoes.map((c) => c.id)])
                            );
                          } else {
                            const novo = new Set(correcoesSelecionadas);
                            correcoes.forEach((c) => novo.delete(c.id));
                            setCorrecoesSelecionadas(novo);
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Campo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Antes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Depois
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Diferença
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Classificação
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {correcoes.map((correcao) => (
                    <tr
                      key={correcao.id}
                      className={classNames(
                        correcoesSelecionadas.has(correcao.id) && 'bg-indigo-50',
                        correcao.bloqueado && 'opacity-50'
                      )}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={correcoesSelecionadas.has(correcao.id)}
                          onChange={() => handleToggleSelecao(correcao.id)}
                          disabled={correcao.bloqueado}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{correcao.campo}</div>
                        <div className="text-xs text-gray-500">{correcao.tipo}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatarValor(correcao.valor_antes)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatarValor(correcao.valor_depois)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={classNames(
                            'text-sm font-medium',
                            correcao.diferenca > 0 ? 'text-red-600' : 'text-green-600'
                          )}
                        >
                          {formatarValor(correcao.diferenca)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getClassificacaoBadge(correcao.classificacao)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{correcao.score_confianca.toFixed(1)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {onVisualizarEvidencias && (
                          <button
                            onClick={() => onVisualizarEvidencias(correcao)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            Ver evidências
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {correcoesFiltradas.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">Nenhuma correção encontrada com os filtros aplicados</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Step5CorrectionPlan;

