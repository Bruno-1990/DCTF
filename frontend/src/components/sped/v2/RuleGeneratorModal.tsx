/**
 * Modal de Geração Automática de Regras
 * Permite ao usuário gerar e aprovar regras baseadas em RAG para divergências não cobertas
 */

import React, { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { SparklesIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface RegraGerada {
  id: string;
  padrao: string;
  cfop: string;
  cst: string;
  titulo: string;
  explicacao_rag: string;
  codigo_python: string;
  confianca: number;
  casos_abrangidos: number;
  referencias_legais: string[];
  tipo_acao: 'LEGITIMO' | 'REVISAR' | 'ERRO';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  validationId: string;
  divergenciasSemRegra: any[];
  onRegrasAplicadas: () => void;
}

export const RuleGeneratorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  validationId,
  divergenciasSemRegra,
  onRegrasAplicadas
}) => {
  const [loading, setLoading] = useState(false);
  const [regrasGeradas, setRegrasGeradas] = useState<RegraGerada[]>([]);
  const [regrasAprovadas, setRegrasAprovadas] = useState<Set<string>>(new Set());
  const [etapa, setEtapa] = useState<'inicial' | 'gerando' | 'revisando' | 'aplicando'>('inicial');

  const handleGerarRegras = async () => {
    setLoading(true);
    setEtapa('gerando');

    try {
      const response = await fetch('/api/sped/v2/rules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validationId,
          divergenciasSemRegra
        })
      });

      const data = await response.json();

      if (data.success) {
        setRegrasGeradas(data.regras);
        setEtapa('revisando');
        
        // Marcar todas como aprovadas por padrão (alta confiança)
        const autoAprovadas = new Set(
          data.regras
            .filter((r: RegraGerada) => r.confianca >= 70)
            .map((r: RegraGerada) => r.id)
        );
        setRegrasAprovadas(autoAprovadas);
      }
    } catch (error) {
      console.error('Erro ao gerar regras:', error);
      alert('Erro ao gerar regras. Tente novamente.');
      setEtapa('inicial');
    } finally {
      setLoading(false);
    }
  };

  const handleAplicarRegras = async () => {
    setLoading(true);
    setEtapa('aplicando');

    const regras = regrasGeradas.filter(r => regrasAprovadas.has(r.id));

    try {
      const response = await fetch('/api/sped/v2/rules/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validationId,
          regrasAprovadas: regras
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${regras.length} regras aplicadas com sucesso!`);
        onRegrasAplicadas();
        onClose();
      }
    } catch (error) {
      console.error('Erro ao aplicar regras:', error);
      alert('Erro ao aplicar regras. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRegra = (id: string) => {
    const novas = new Set(regrasAprovadas);
    if (novas.has(id)) {
      novas.delete(id);
    } else {
      novas.add(id);
    }
    setRegrasAprovadas(novas);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-4xl w-full bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center">
              <SparklesIcon className="h-6 w-6 mr-2" />
              <Dialog.Title className="text-lg font-semibold">
                Gerador Automático de Regras
              </Dialog.Title>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            
            {/* Etapa Inicial */}
            {etapa === 'inicial' && (
              <div className="text-center py-8">
                <SparklesIcon className="h-16 w-16 text-indigo-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  Divergências Não Cobertas por Regras
                </h3>
                <p className="text-gray-600 mb-6">
                  Encontramos <strong>{divergenciasSemRegra.length} divergências</strong> que não são explicadas pelas regras atuais.
                </p>
                <p className="text-sm text-gray-500 mb-8">
                  Vamos consultar nossa base de conhecimento (RAG) para gerar regras automáticas para esses casos.
                  Você poderá revisar e aprovar cada regra antes de aplicá-las.
                </p>
                <button
                  onClick={handleGerarRegras}
                  disabled={loading}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Gerando...' : '🤖 Gerar Regras Automáticas'}
                </button>
              </div>
            )}

            {/* Etapa Gerando */}
            {etapa === 'gerando' && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold mb-2">Consultando Base de Conhecimento...</h3>
                <p className="text-gray-600">
                  Isso pode levar alguns minutos. Estamos analisando a legislação e gerando regras personalizadas.
                </p>
              </div>
            )}

            {/* Etapa Revisando */}
            {etapa === 'revisando' && (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">
                    {regrasGeradas.length} Regras Geradas
                  </h3>
                  <p className="text-sm text-gray-600">
                    Revise as regras abaixo e aprove aquelas que deseja adicionar ao sistema.
                    Regras com alta confiança (≥70%) já estão pré-selecionadas.
                  </p>
                </div>

                <div className="space-y-4">
                  {regrasGeradas.map((regra) => (
                    <div
                      key={regra.id}
                      className={`border rounded-lg p-4 ${
                        regrasAprovadas.has(regra.id)
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg mb-1">{regra.titulo}</h4>
                          <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
                              CFOP {regra.cfop}
                            </span>
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded font-mono">
                              CST {regra.cst}
                            </span>
                            <span className={`px-2 py-1 rounded font-semibold ${
                              regra.tipo_acao === 'LEGITIMO' ? 'bg-green-100 text-green-800' :
                              regra.tipo_acao === 'REVISAR' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {regra.tipo_acao}
                            </span>
                            <span className="text-gray-500">
                              {regra.casos_abrangidos} casos
                            </span>
                            <span className={`font-semibold ${
                              regra.confianca >= 70 ? 'text-green-600' :
                              regra.confianca >= 50 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {regra.confianca}% confiança
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleRegra(regra.id)}
                          className={`ml-4 flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center ${
                            regrasAprovadas.has(regra.id)
                              ? 'bg-indigo-600 border-indigo-600'
                              : 'border-gray-300'
                          }`}
                        >
                          {regrasAprovadas.has(regra.id) && (
                            <CheckIcon className="h-4 w-4 text-white" />
                          )}
                        </button>
                      </div>

                      <div className="mb-3">
                        <p className="text-sm text-gray-700 italic">
                          {regra.explicacao_rag.substring(0, 300)}...
                        </p>
                      </div>

                      {regra.referencias_legais && regra.referencias_legais.length > 0 && (
                        <div className="mb-3 text-xs text-gray-600">
                          <strong>Referências:</strong> {regra.referencias_legais.join(', ')}
                        </div>
                      )}

                      <details className="text-sm">
                        <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800 font-medium">
                          Ver código Python gerado
                        </summary>
                        <pre className="mt-2 bg-gray-100 p-3 rounded overflow-x-auto text-xs">
                          <code>{regra.codigo_python}</code>
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Etapa Aplicando */}
            {etapa === 'aplicando' && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold mb-2">Aplicando Regras...</h3>
                <p className="text-gray-600">
                  Salvando regras no sistema. Aguarde...
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {etapa === 'revisando' && (
            <div className="border-t px-6 py-4 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {regrasAprovadas.size} de {regrasGeradas.length} regras selecionadas
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAplicarRegras}
                  disabled={regrasAprovadas.size === 0 || loading}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Aplicar {regrasAprovadas.size} Regra(s)
                </button>
              </div>
            </div>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

