import React, { useState, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import type { Correcao, PlanoCorrecoes } from './Step5CorrectionPlan';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  required: boolean;
  description?: string;
}

interface Step6ApprovalProps {
  isOpen: boolean;
  onClose: () => void;
  plano: PlanoCorrecoes;
  correcoesSelecionadas: Correcao[];
  perfilExecucao: 'SEGURO' | 'INTERMEDIARIO' | 'AVANCADO';
  onConfirmar: (modoSimulacao: boolean) => void;
}

const Step6Approval: React.FC<Step6ApprovalProps> = ({
  isOpen,
  onClose,
  plano,
  correcoesSelecionadas,
  perfilExecucao,
  onConfirmar,
}) => {
  const [nivel, setNivel] = useState<1 | 2>(1);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [modoSimulacao, setModoSimulacao] = useState<boolean>(false);
  const [confirmacaoTexto, setConfirmacaoTexto] = useState<string>('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [bloqueado, setBloqueado] = useState<boolean>(false);

  // Calcular estatísticas das correções selecionadas
  const estatisticas = useMemo(() => {
    const impactoTotal = correcoesSelecionadas.reduce((sum, c) => sum + c.impacto_estimado, 0);
    const quantidadeErro = correcoesSelecionadas.filter((c) => c.classificacao === 'ERRO').length;
    const quantidadeRevisar = correcoesSelecionadas.filter((c) => c.classificacao === 'REVISAR').length;
    const scoreMedio =
      correcoesSelecionadas.reduce((sum, c) => sum + c.score_confianca, 0) /
      correcoesSelecionadas.length;

    return {
      total: correcoesSelecionadas.length,
      impactoTotal,
      quantidadeErro,
      quantidadeRevisar,
      scoreMedio: isNaN(scoreMedio) ? 0 : scoreMedio,
    };
  }, [correcoesSelecionadas]);

  // Verificar travas e avisos
  useMemo(() => {
    const novosAvisos: string[] = [];
    let novoBloqueado = false;

    // Trava por impacto muito alto
    if (estatisticas.impactoTotal > 100000) {
      novosAvisos.push('Impacto total muito alto (> R$ 100.000). Confirmação adicional necessária.');
      novoBloqueado = true;
    } else if (estatisticas.impactoTotal > 50000) {
      novosAvisos.push('Impacto total alto (> R$ 50.000). Revise cuidadosamente antes de confirmar.');
    }

    // Trava por muitas correções REVISAR
    if (estatisticas.quantidadeRevisar > estatisticas.total * 0.5) {
      novosAvisos.push('Mais de 50% das correções são REVISAR. Considere revisar manualmente.');
    }

    // Trava por score médio baixo
    if (estatisticas.scoreMedio < 60) {
      novosAvisos.push('Score médio de confiança baixo (< 60). Revise as correções antes de aplicar.');
    }

    // Trava por perfil avançado com muitas correções
    if (perfilExecucao === 'AVANCADO' && estatisticas.total > 100) {
      novosAvisos.push('Perfil AVANÇADO com muitas correções. Confirme que deseja prosseguir.');
    }

    setAvisos(novosAvisos);
    setBloqueado(novoBloqueado);
  }, [estatisticas, perfilExecucao]);

  // Inicializar checklist quando avançar para nível 2
  React.useEffect(() => {
    if (nivel === 2) {
      setChecklist([
        {
          id: 'totais',
          label: 'Verificar totais e impacto',
          checked: false,
          required: true,
          description: 'Confirme que os totais e impacto estão corretos',
        },
        {
          id: 'perfil',
          label: 'Confirmar perfil de execução',
          checked: false,
          required: true,
          description: `Perfil selecionado: ${perfilExecucao}`,
        },
        {
          id: 'revisar',
          label: 'Revisar correções críticas',
          checked: false,
          required: estatisticas.quantidadeErro > 0,
          description: 'Revise as correções classificadas como ERRO',
        },
        {
          id: 'backup',
          label: 'Backup do arquivo SPED',
          checked: false,
          required: true,
          description: 'Backup será criado automaticamente antes das correções',
        },
      ]);
    }
  }, [nivel, perfilExecucao, estatisticas.quantidadeErro]);

  const handleChecklistChange = (id: string, checked: boolean) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, checked } : item)));
  };

  const handleAprovarNivel1 = () => {
    setNivel(2);
  };

  const handleConfirmarNivel2 = () => {
    // Validar checklist
    const checklistObrigatorio = checklist.filter((item) => item.required);
    const todosMarcados = checklistObrigatorio.every((item) => item.checked);

    if (!todosMarcados) {
      alert('Por favor, complete todos os itens obrigatórios do checklist.');
      return;
    }

    // Validar confirmação de texto se impacto alto
    if (estatisticas.impactoTotal > 50000) {
      if (confirmacaoTexto !== 'CONFIRMAR') {
        alert('Por favor, digite "CONFIRMAR" para prosseguir com impacto alto.');
        return;
      }
    }

    // Validar se não está bloqueado
    if (bloqueado && confirmacaoTexto !== 'CONFIRMAR') {
      alert('Confirmação adicional necessária. Digite "CONFIRMAR" para prosseguir.');
      return;
    }

    onConfirmar(modoSimulacao);
    onClose();
  };

  const formatarValor = (valor: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const getPerfilIcon = () => {
    switch (perfilExecucao) {
      case 'SEGURO':
        return <ShieldCheckIcon className="h-6 w-6 text-indigo-600" />;
      case 'INTERMEDIARIO':
        return <CheckCircleIcon className="h-6 w-6 text-yellow-600" />;
      case 'AVANCADO':
        return <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />;
    }
  };

  const getPerfilNome = () => {
    switch (perfilExecucao) {
      case 'SEGURO':
        return 'SEGURO';
      case 'INTERMEDIARIO':
        return 'INTERMEDIÁRIO';
      case 'AVANCADO':
        return 'AVANÇADO';
    }
  };

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="bg-indigo-600 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-lg font-medium text-white">
                      {nivel === 1 ? 'Aprovar Plano de Correções' : 'Confirmação Final'}
                    </Dialog.Title>
                    <button
                      type="button"
                      className="rounded-md text-indigo-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                      onClick={onClose}
                    >
                      <span className="sr-only">Fechar</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-6 py-6">
                  {/* Nível 1: Aprovar Plano */}
                  {nivel === 1 && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Resumo do Plano</h3>

                        {/* Estatísticas */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-sm text-gray-500">Total de Correções</div>
                            <div className="text-2xl font-bold text-gray-900">{estatisticas.total}</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-sm text-gray-500">Impacto Total</div>
                            <div className="text-2xl font-bold text-gray-900">
                              {formatarValor(estatisticas.impactoTotal)}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-sm text-gray-500">ERRO</div>
                            <div className="text-2xl font-bold text-red-600">{estatisticas.quantidadeErro}</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-sm text-gray-500">REVISAR</div>
                            <div className="text-2xl font-bold text-yellow-600">
                              {estatisticas.quantidadeRevisar}
                            </div>
                          </div>
                        </div>

                        {/* Perfil de Execução */}
                        <div className="border border-gray-200 rounded-lg p-4 mb-6">
                          <div className="flex items-center space-x-3">
                            {getPerfilIcon()}
                            <div>
                              <div className="text-sm font-medium text-gray-900">Perfil de Execução</div>
                              <div className="text-lg font-bold text-gray-900">{getPerfilNome()}</div>
                            </div>
                          </div>
                        </div>

                        {/* Avisos */}
                        {avisos.length > 0 && (
                          <div className="space-y-2">
                            {avisos.map((aviso, idx) => (
                              <div
                                key={idx}
                                className={classNames(
                                  'flex items-start p-3 rounded-md',
                                  bloqueado
                                    ? 'bg-red-50 border border-red-200'
                                    : 'bg-yellow-50 border border-yellow-200'
                                )}
                              >
                                <ExclamationTriangleIcon
                                  className={classNames(
                                    'h-5 w-5 mt-0.5 mr-2',
                                    bloqueado ? 'text-red-600' : 'text-yellow-600'
                                  )}
                                />
                                <span
                                  className={classNames(
                                    'text-sm',
                                    bloqueado ? 'text-red-800' : 'text-yellow-800'
                                  )}
                                >
                                  {aviso}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Modo Simulação */}
                        <div className="mt-6">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={modoSimulacao}
                              onChange={(e) => setModoSimulacao(e.target.checked)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">
                              Modo Simulação (apenas visualizar, não aplicar correções)
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Nível 2: Confirmação Final */}
                  {nivel === 2 && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Checklist de Validação</h3>

                        <div className="space-y-3">
                          {checklist.map((item) => (
                            <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                              <label className="flex items-start">
                                <input
                                  type="checkbox"
                                  checked={item.checked}
                                  onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
                                  className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="ml-3 flex-1">
                                  <div className="flex items-center">
                                    <span className="text-sm font-medium text-gray-900">{item.label}</span>
                                    {item.required && (
                                      <span className="ml-2 text-xs text-red-600">*</span>
                                    )}
                                  </div>
                                  {item.description && (
                                    <div className="mt-1 text-xs text-gray-500">{item.description}</div>
                                  )}
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>

                        {/* Input de confirmação para impacto alto */}
                        {(estatisticas.impactoTotal > 50000 || bloqueado) && (
                          <div className="mt-6 border border-red-200 rounded-lg p-4 bg-red-50">
                            <label className="block text-sm font-medium text-red-900 mb-2">
                              Confirmação Adicional Requerida
                            </label>
                            <p className="text-sm text-red-700 mb-3">
                              Devido ao alto impacto, digite <strong>"CONFIRMAR"</strong> para prosseguir:
                            </p>
                            <input
                              type="text"
                              value={confirmacaoTexto}
                              onChange={(e) => setConfirmacaoTexto(e.target.value)}
                              placeholder="Digite CONFIRMAR"
                              className="w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500"
                            />
                          </div>
                        )}

                        {/* Resumo final */}
                        <div className="mt-6 bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-gray-900 mb-2">Resumo Final</h4>
                          <div className="space-y-1 text-sm text-gray-600">
                            <div>Total de correções: {estatisticas.total}</div>
                            <div>Impacto total: {formatarValor(estatisticas.impactoTotal)}</div>
                            <div>Perfil: {getPerfilNome()}</div>
                            <div>Modo: {modoSimulacao ? 'Simulação' : 'Aplicação Real'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex justify-between">
                  {nivel === 1 ? (
                    <>
                      <button
                        type="button"
                        className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                        onClick={onClose}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleAprovarNivel1}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      >
                        Aprovar e Continuar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                        onClick={() => setNivel(1)}
                      >
                        Voltar
                      </button>
                      <div className="flex space-x-3">
                        <button
                          type="button"
                          className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                          onClick={onClose}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmarNivel2}
                          disabled={
                            bloqueado &&
                            confirmacaoTexto !== 'CONFIRMAR' &&
                            estatisticas.impactoTotal > 50000
                          }
                          className={classNames(
                            'rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm',
                            bloqueado && confirmacaoTexto !== 'CONFIRMAR' && estatisticas.impactoTotal > 50000
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                          )}
                        >
                          {modoSimulacao ? 'Simular' : 'Confirmar e Aplicar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default Step6Approval;

