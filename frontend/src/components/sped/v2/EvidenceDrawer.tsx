import React, { useState, Fragment } from 'react';
import { Dialog, Transition, Tab } from '@headlessui/react';
import { XMarkIcon, DocumentTextIcon, TableCellsIcon, BookOpenIcon } from '@heroicons/react/24/outline';
// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export interface EvidenciaXML {
  chave_nfe: string;
  tipo: string;
  campo: string;
  valor: number;
  descricao: string;
  tag_xml?: string;
  contexto?: Record<string, any>;
}

export interface EvidenciaSPED {
  chave_nfe?: string;
  registro: string;
  tipo: string;
  campo: string;
  valor: number;
  descricao: string;
  linha_sped?: string;
  contexto?: Record<string, any>;
}

export interface EvidenciaComparacao {
  campo: string;
  valor_xml?: number;
  valor_sped?: number;
  diferenca?: number;
  percentual_diferenca?: number;
  regra_aplicada?: string;
  explicacao?: string;
  classificacao?: string;
}

export interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidencias_xml?: EvidenciaXML[];
  evidencias_sped?: EvidenciaSPED[];
  comparacao?: EvidenciaComparacao;
  chave_nfe?: string;
}

const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  isOpen,
  onClose,
  evidencias_xml = [],
  evidencias_sped = [],
  comparacao,
  chave_nfe,
}) => {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    { id: 0, name: 'XML', icon: DocumentTextIcon },
    { id: 1, name: 'SPED', icon: TableCellsIcon },
    { id: 2, name: 'Regra', icon: BookOpenIcon },
  ];

  const formatarValor = (valor: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const formatarXML = (tag_xml?: string, valor?: number): string => {
    if (!tag_xml) return '';
    
    // Simular estrutura XML formatada
    const partes = tag_xml.split('/');
    let xml = '';
    let indent = 0;
    
    partes.forEach((parte, index) => {
      if (parte) {
        const isValor = index === partes.length - 1 && valor !== undefined;
        const indentacao = '  '.repeat(indent);
        
        if (isValor) {
          xml += `${indentacao}<${parte}>${formatarValor(valor || 0)}</${parte}>\n`;
        } else {
          xml += `${indentacao}<${parte}>\n`;
          indent++;
        }
      }
    });
    
    // Fechar tags
    for (let i = indent - 1; i >= 0; i--) {
      xml += '  '.repeat(i) + `</${partes[partes.length - 2 - (indent - 1 - i)]}>\n`;
    }
    
    return xml || tag_xml;
  };

  const formatarSPED = (linha_sped?: string): string => {
    if (!linha_sped) return '';
    
    const campos = linha_sped.split('|');
    const registro = campos[1] || '';
    const camposFormatados = campos.slice(2).map((campo, idx) => {
      if (!campo) return '';
      return `  Campo ${idx + 1}: ${campo}`;
    }).filter(Boolean).join('\n');
    
    return `Registro: ${registro}\n${camposFormatados}`;
  };

  const destacarDiferenca = (valor1?: number, valor2?: number): { antes: string; depois: string; temDiferenca: boolean } => {
    const antes = valor1 !== undefined ? formatarValor(valor1) : 'N/A';
    const depois = valor2 !== undefined ? formatarValor(valor2) : 'N/A';
    const temDiferenca = valor1 !== undefined && valor2 !== undefined && Math.abs(valor1 - valor2) > 0.01;
    
    return { antes, depois, temDiferenca };
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500 sm:duration-700"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500 sm:duration-700"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-4xl">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                    {/* Header */}
                    <div className="bg-gray-50 px-4 py-6 sm:px-6">
                      <div className="flex items-center justify-between">
                        <Dialog.Title className="text-lg font-medium text-gray-900">
                          Evidências - {chave_nfe || 'Documento'}
                        </Dialog.Title>
                        <button
                          type="button"
                          className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          onClick={onClose}
                        >
                          <span className="sr-only">Fechar</span>
                          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200">
                      <nav className="-mb-px flex space-x-8 px-4" aria-label="Tabs">
                        {tabs.map((tab) => {
                          const Icon = tab.icon;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={classNames(
                                tab.id === activeTab
                                  ? 'border-indigo-500 text-indigo-600'
                                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                                'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium'
                              )}
                            >
                              <Icon
                                className={classNames(
                                  tab.id === activeTab ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500',
                                  '-ml-0.5 mr-2 h-5 w-5'
                                )}
                                aria-hidden="true"
                              />
                              {tab.name}
                            </button>
                          );
                        })}
                      </nav>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                      {/* Tab XML */}
                      {activeTab === 0 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium text-gray-900">Evidências XML</h3>
                          {evidencias_xml.length === 0 ? (
                            <p className="text-sm text-gray-500">Nenhuma evidência XML disponível</p>
                          ) : (
                            <div className="space-y-6">
                              {evidencias_xml.map((evidencia, idx) => {
                                const { antes, depois, temDiferenca } = destacarDiferenca(
                                  comparacao?.valor_xml,
                                  comparacao?.valor_sped
                                );
                                
                                return (
                                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <h4 className="text-sm font-medium text-gray-900">{evidencia.campo}</h4>
                                      <span className="text-xs text-gray-500">{evidencia.tipo}</span>
                                    </div>
                                    
                                    <div className="mt-2">
                                      <div className="bg-gray-50 rounded p-3 font-mono text-sm">
                                        <pre className="whitespace-pre-wrap text-gray-800">
                                          {formatarXML(evidencia.tag_xml, evidencia.valor)}
                                        </pre>
                                      </div>
                                    </div>
                                    
                                    {temDiferenca && comparacao && (
                                      <div className="mt-4 grid grid-cols-2 gap-4">
                                        <div className={classNames(
                                          "p-3 rounded border",
                                          temDiferenca ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
                                        )}>
                                          <div className="text-xs text-gray-500 mb-1">Antes</div>
                                          <div className="text-sm font-medium text-gray-900">{antes}</div>
                                        </div>
                                        <div className={classNames(
                                          "p-3 rounded border",
                                          temDiferenca ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                                        )}>
                                          <div className="text-xs text-gray-500 mb-1">Depois</div>
                                          <div className="text-sm font-medium text-gray-900">{depois}</div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div className="mt-2 text-xs text-gray-500">{evidencia.descricao}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab SPED */}
                      {activeTab === 1 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium text-gray-900">Evidências SPED</h3>
                          {evidencias_sped.length === 0 ? (
                            <p className="text-sm text-gray-500">Nenhuma evidência SPED disponível</p>
                          ) : (
                            <div className="space-y-6">
                              {evidencias_sped.map((evidencia, idx) => {
                                const { antes, depois, temDiferenca } = destacarDiferenca(
                                  comparacao?.valor_xml,
                                  comparacao?.valor_sped
                                );
                                
                                return (
                                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <h4 className="text-sm font-medium text-gray-900">
                                        {evidencia.registro} - {evidencia.campo}
                                      </h4>
                                      <span className="text-xs text-gray-500">{evidencia.tipo}</span>
                                    </div>
                                    
                                    <div className="mt-2">
                                      <div className="bg-gray-50 rounded p-3 font-mono text-sm">
                                        <pre className="whitespace-pre-wrap text-gray-800">
                                          {formatarSPED(evidencia.linha_sped)}
                                        </pre>
                                      </div>
                                    </div>
                                    
                                    <div className="mt-2">
                                      <div className="text-sm font-medium text-gray-900">
                                        Valor: {formatarValor(evidencia.valor)}
                                      </div>
                                    </div>
                                    
                                    {temDiferenca && comparacao && (
                                      <div className="mt-4 grid grid-cols-2 gap-4">
                                        <div className={classNames(
                                          "p-3 rounded border",
                                          temDiferenca ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
                                        )}>
                                          <div className="text-xs text-gray-500 mb-1">Antes</div>
                                          <div className="text-sm font-medium text-gray-900">{antes}</div>
                                        </div>
                                        <div className={classNames(
                                          "p-3 rounded border",
                                          temDiferenca ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                                        )}>
                                          <div className="text-xs text-gray-500 mb-1">Depois</div>
                                          <div className="text-sm font-medium text-gray-900">{depois}</div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div className="mt-2 text-xs text-gray-500">{evidencia.descricao}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab Regra */}
                      {activeTab === 2 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium text-gray-900">Regra Aplicada</h3>
                          {!comparacao?.explicacao && !comparacao?.regra_aplicada ? (
                            <p className="text-sm text-gray-500">Nenhuma regra disponível</p>
                          ) : (
                            <div className="space-y-4">
                              {comparacao.regra_aplicada && (
                                <div className="border border-gray-200 rounded-lg p-4">
                                  <h4 className="text-sm font-medium text-gray-900 mb-2">Regra</h4>
                                  <div className="bg-indigo-50 border border-indigo-200 rounded p-3">
                                    <p className="text-sm text-gray-800">{comparacao.regra_aplicada}</p>
                                  </div>
                                </div>
                              )}
                              
                              {comparacao.explicacao && (
                                <div className="border border-gray-200 rounded-lg p-4">
                                  <h4 className="text-sm font-medium text-gray-900 mb-2">Explicação</h4>
                                  <div className="prose prose-sm max-w-none">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                      {comparacao.explicacao.split('.').map((sentenca, idx) => {
                                        const isDestaque = sentenca.includes('CFOP') || 
                                                          sentenca.includes('CST') || 
                                                          sentenca.includes('legislação') ||
                                                          sentenca.includes('Ato COTEPE');
                                        return (
                                          <span
                                            key={idx}
                                            className={classNames(
                                              isDestaque && "bg-yellow-100 px-1 rounded font-medium"
                                            )}
                                          >
                                            {sentenca}.
                                          </span>
                                        );
                                      })}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {comparacao.classificacao && (
                                <div className="border border-gray-200 rounded-lg p-4">
                                  <h4 className="text-sm font-medium text-gray-900 mb-2">Classificação</h4>
                                  <div className={classNames(
                                    "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium",
                                    comparacao.classificacao === 'ERRO' && "bg-red-100 text-red-800",
                                    comparacao.classificacao === 'REVISAR' && "bg-yellow-100 text-yellow-800",
                                    comparacao.classificacao === 'LEGÍTIMO' && "bg-green-100 text-green-800"
                                  )}>
                                    {comparacao.classificacao}
                                  </div>
                                </div>
                              )}
                              
                              {comparacao.diferenca !== undefined && (
                                <div className="border border-gray-200 rounded-lg p-4">
                                  <h4 className="text-sm font-medium text-gray-900 mb-2">Diferença</h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <div className="text-xs text-gray-500 mb-1">Valor Absoluto</div>
                                      <div className="text-sm font-medium text-gray-900">
                                        {formatarValor(comparacao.diferenca)}
                                      </div>
                                    </div>
                                    {comparacao.percentual_diferenca !== undefined && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">Percentual</div>
                                        <div className="text-sm font-medium text-gray-900">
                                          {comparacao.percentual_diferenca.toFixed(2)}%
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                          onClick={onClose}
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default EvidenceDrawer;

