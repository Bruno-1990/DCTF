/**
 * COMPONENTE: Seção de Clientes Dispensados de Transmitir DCTF
 * 
 * Módulo 7: Lista clientes que NÃO têm obrigação de transmitir DCTF na competência vigente
 * porque já transmitiram "Original sem movimento" em vigência passada e não tiveram
 * movimentação no mês atual.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  InformationCircleIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';
import { exportToExcel } from '../../utils/exportExcel';

interface ClienteDispensadoDCTF {
  id: string;
  cnpj: string;
  razao_social: string;
  periodo_original_sem_movimento: string;
  data_transmissao_original: string;
  competencia_vigente: string;
  tem_movimentacao_atual: boolean;
  mensagem: string;
}

interface Props {
  clientes: ClienteDispensadoDCTF[];
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

export function ClientesDispensadosDCTFSection({ 
  clientes, 
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
  const itensPorPagina = 10;

  const copyToClipboard = async (text: string, id: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
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
        cliente.periodo_original_sem_movimento,
        formatDate(cliente.data_transmissao_original),
        cliente.competencia_vigente,
        cliente.tem_movimentacao_atual ? '⚠️ Obrigação Retornou (Movimento detectado)' : '✓ Dispensado (Obrigação retorna com movimento)',
        cliente.mensagem,
      ]);

      await exportToExcel({
        filename: `clientes-dispensados-dctf-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Clientes Dispensados DCTF',
        headers: ['Empresa', 'CNPJ', 'Período Original sem Movimento', 'Data Transmissão Original', 'Competência Vigente', 'Status da Dispensa', 'Mensagem'],
        data,
        title: 'Clientes Dispensados de Transmitir DCTF',
        metadata: {
          'Data de Exportação': new Date().toLocaleString('pt-BR'),
          'Total de Clientes': clientes.length.toString(),
        },
      });
    } catch (err: any) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar dados: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
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
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              Clientes Sem Obrigação de Transmitir DCTF
            </h2>
            <p className="text-sm text-gray-600">
              Clientes que transmitiram "Original sem movimento" e estão <strong>dispensados</strong> conforme <strong>IN RFB 2.237/2024, Art. 3º, § 3º</strong>. 
              A obrigação <strong>retorna automaticamente</strong> quando houver movimentação no mês.
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
              <p className="mt-2 text-sm text-gray-600">Carregando clientes dispensados...</p>
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
              <p className="text-sm text-gray-600 mb-2">
                Nenhum cliente dispensado encontrado.
              </p>
              <p className="text-xs text-gray-500">
                Todos os clientes têm obrigação de transmitir DCTF ou não se enquadram nos critérios de dispensa conforme IN RFB 2.237/2024.
              </p>
            </div>
          ) : (
            <>
              {/* Nota Informativa sobre a Legislação */}
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
                <div className="flex items-start gap-3">
                  <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      Dispensa de Transmissão - IN RFB 2.237/2024, Art. 3º, § 3º
                    </p>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Clientes que transmitiram <strong>"Original sem movimento"</strong> em vigência passada estão <strong>dispensados</strong> de transmitir DCTF 
                      nos meses seguintes, desde que não tenham movimentação. A obrigação <strong>retorna automaticamente</strong> quando houver movimentação no mês.
                    </p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">CNPJ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Período Original sem Movimento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Data Transmissão</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Competência Vigente</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Status da Dispensa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clientes
                      .slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina)
                      .map((cliente) => (
                        <tr key={cliente.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                            {cliente.razao_social || '—'}
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
                            <span className="font-semibold text-blue-600">{cliente.periodo_original_sem_movimento}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cliente.data_transmissao_original)}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            <span className="font-semibold text-gray-800">{cliente.competencia_vigente}</span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex flex-col gap-1">
                              {cliente.tem_movimentacao_atual ? (
                                <>
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 w-fit">
                                    ⚠️ Obrigação Retornou
                                  </span>
                                  <span className="text-[10px] text-red-600">
                                    Movimento detectado
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                                    ✓ Dispensado
                                  </span>
                                  <span className="text-[10px] text-gray-500">
                                    Obrigação retorna com movimento
                                  </span>
                                </>
                              )}
                            </div>
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

