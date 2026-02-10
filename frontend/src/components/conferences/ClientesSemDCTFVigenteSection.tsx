/**
 * COMPONENTE: Seção de Clientes sem DCTF na Competência Vigente
 * 
 * Módulo 1: Lista todos os clientes cadastrados que NÃO têm DCTF
 * enviada para a competência vigente (mês anterior à data atual).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  InformationCircleIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';
import { exportToExcel } from '../../utils/exportExcel';

interface ClienteSemDCTFVigente {
  id: string;
  cnpj: string;
  razao_social: string;
  competencia_vigente: string;
  vencimento: string;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

interface Props {
  clientes: ClienteSemDCTFVigente[];
  competenciaVigente: string;
  loading?: boolean;
  error?: string | null;
  expanded?: boolean;
  onToggle?: () => void;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
}

function formatCNPJ(cnpj?: string | null) {
  if (!cnpj) return '—';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cnpj;
}

function SeverityTag({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const labels = {
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

export function ClientesSemDCTFVigenteSection({ 
  clientes, 
  competenciaVigente,
  loading = false,
  error = null,
  expanded: expandedProp,
  onToggle
}: Props) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp !== undefined ? expandedProp : internalExpanded;
  
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [modalCliente, setModalCliente] = useState<ClienteSemDCTFVigente | null>(null);
  const navigate = useNavigate();
  const itensPorPagina = 10;

  const copyToClipboard = async (text: string, id: string) => {
    try {
      // Tenta usar a API moderna de clipboard
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback para contextos não-seguros (HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  const handleExportar = async () => {
    if (clientes.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      setExporting(true);
      const data = clientes.map((cliente) => [
        cliente.razao_social || '—',
        formatCNPJ(cliente.cnpj) || '—',
        cliente.competencia_vigente,
        formatDate(cliente.vencimento),
        cliente.severidade === 'high' ? 'Alta' : cliente.severidade === 'medium' ? 'Média' : 'Baixa',
        cliente.mensagem,
      ]);

      await exportToExcel({
        filename: `clientes-sem-dctf-${competenciaVigente.replace('/', '-')}-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Clientes sem DCTF',
        headers: ['Empresa', 'CNPJ', 'Competência', 'Vencimento', 'Severidade', 'Mensagem'],
        data,
        title: `Clientes sem DCTF - Competência ${competenciaVigente}`,
        metadata: {
          'Data de Exportação': new Date().toLocaleString('pt-BR'),
          'Total de Clientes': clientes.length.toString(),
          'Competência Vigente': competenciaVigente,
        },
      });
    } catch (err: any) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar dados: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setExporting(false);
    }
  };

  // Componente do Modal de Divergência
  const DivergenciaModal = () => {
    if (!modalCliente) return null;

    return (
      <AnimatePresence>
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setModalCliente(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
                  <BuildingOfficeIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Cliente sem DCTF</h2>
                  <p className="text-amber-100 text-sm">Análise de pendência</p>
                </div>
              </div>
              <button
                onClick={() => setModalCliente(null)}
                className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Informações da Empresa */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <h3 className="text-sm font-semibold text-gray-500 mb-3">EMPRESA</h3>
                <p className="text-lg font-bold text-gray-900 mb-2">{modalCliente.razao_social}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">CNPJ:</span>
                  <span className="font-mono text-sm font-medium text-gray-900">{formatCNPJ(modalCliente.cnpj)}</span>
                  <button
                    onClick={() => copyToClipboard(modalCliente.cnpj, 'modal')}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Copiar CNPJ"
                  >
                    {copiedId === 'modal' ? (
                      <CheckIcon className="w-4 h-4 text-green-600" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Motivo da Pendência */}
              <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  MOTIVO DA PENDÊNCIA
                </h3>
                <p className="text-sm text-amber-700 leading-relaxed">
                  {modalCliente.mensagem || 
                   `Cliente não possui DCTF transmitida para a competência ${modalCliente.competencia_vigente}.`}
                </p>
              </div>

              {/* Detalhes da Competência */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">DETALHES DA COMPETÊNCIA</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Competência</p>
                      <p className="text-base font-semibold text-amber-600">{modalCliente.competencia_vigente}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Vencimento</p>
                      <p className="text-base font-semibold text-gray-900">{formatDate(modalCliente.vencimento)}</p>
                    </div>
                  </div>
                </div>

                {/* Nível de Severidade */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">NÍVEL DE SEVERIDADE</h3>
                  <div className={`rounded-lg p-4 ${
                    modalCliente.severidade === 'high' 
                      ? 'bg-red-50 border border-red-200' 
                      : modalCliente.severidade === 'medium' 
                      ? 'bg-amber-50 border border-amber-200' 
                      : 'bg-blue-50 border border-blue-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {modalCliente.severidade === 'high' && (
                        <span className="inline-flex items-center bg-red-100 text-red-800 px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-200">
                          🔴 Alta Prioridade
                        </span>
                      )}
                      {modalCliente.severidade === 'medium' && (
                        <span className="inline-flex items-center bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg text-sm font-semibold border border-amber-200">
                          🟡 Média Prioridade
                        </span>
                      )}
                      {modalCliente.severidade === 'low' && (
                        <span className="inline-flex items-center bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-sm font-semibold border border-blue-200">
                          🔵 Baixa Prioridade
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer do Modal com Ações */}
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <button
                onClick={() => setModalCliente(null)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium text-sm transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  navigate(`/clientes/${modalCliente.cnpj}`);
                  setModalCliente(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <InformationCircleIcon className="h-4 w-4" />
                Ver Detalhes
              </button>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      {/* Modal de Divergência */}
      <DivergenciaModal />
      
      <div
        onClick={handleToggle}
        className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 flex-1">
          {expanded ? (
            <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          )}
          <div className="flex-1 text-left">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <BuildingOfficeIcon className="h-5 w-5 text-amber-600" />
              Clientes sem DCTF
            </h2>
            <p className="text-sm text-gray-600">
              Clientes que ainda não enviaram a DCTF para {competenciaVigente}. Verifique se há necessidade de envio.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-gray-700 bg-white px-5 py-2.5 rounded-xl border-2 border-gray-300">
            {loading ? (
              <span className="text-gray-500">Carregando...</span>
            ) : (
              <>
                Total: <span className="text-gray-900 font-bold">{clientes.length}</span> clientes
              </>
            )}
          </div>
          {!loading && clientes.length > 0 && (
            <motion.button
              onClick={handleExportar}
              disabled={exporting}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="glow-border-linear inline-flex items-center gap-2.5 px-5 py-2.5 bg-white text-emerald-600 text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative z-0"
              title="Exportar para Excel"
            >
              <ArrowDownTrayIcon className="h-5 w-5 relative z-10" />
              <span className="relative z-10">{exporting ? 'Exportando...' : 'Exportar'}</span>
            </motion.button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {loading ? (
            <div className="px-6 py-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-600">Carregando clientes sem DCTF...</p>
            </div>
          ) : error ? (
            <div className="px-6 py-4">
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                <strong>Erro:</strong> {error}
              </div>
            </div>
          ) : clientes.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <InformationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Nenhum cliente encontrado sem DCTF na competência {competenciaVigente}.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Todos os clientes cadastrados têm DCTF enviada para esta competência.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">CNPJ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clientes
                      .slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina)
                      .map((cliente) => (
                        <tr key={cliente.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                            <button
                              onClick={() => setModalCliente(cliente)}
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left transition-colors"
                            >
                              {cliente.razao_social || '—'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span>
                              <button
                                onClick={() => copyToClipboard(cliente.cnpj, cliente.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === cliente.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            <span className="font-semibold text-amber-600">{cliente.competencia_vigente}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cliente.vencimento)}</td>
                          <td className="px-4 py-3">
                            <SeverityTag severity={cliente.severidade} />
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <button
                              onClick={() => navigate(`/clientes/${cliente.cnpj}`)}
                              className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                            >
                              Ver Detalhes
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {clientes.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtual}
                    totalPages={Math.ceil(clientes.length / itensPorPagina)}
                    totalItems={clientes.length}
                    itemsPerPage={itensPorPagina}
                    onPageChange={setPaginaAtual}
                    itemLabel="cliente"
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}







