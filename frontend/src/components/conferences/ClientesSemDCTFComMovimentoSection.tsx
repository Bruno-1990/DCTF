/**
 * COMPONENTE: Seção de Clientes sem DCTF mas COM Movimento no SCI
 * 
 * Módulo 2: Lista clientes que NÃO têm DCTF na competência vigente,
 * mas TÊM movimento no Banco SCI no mês anterior.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';

interface ClienteSemDCTFComMovimento {
  cnpj: string;
  razao_social: string;
  cod_emp: number | null;
  competencia_obrigacao: string;
  competencia_movimento: string;
  tipos_movimento: string[];
  total_movimentacoes: number;
  prazoVencimento: string;
  diasAteVencimento: number;
  possivelObrigacaoEnvio: boolean;
  motivoObrigacao?: string;
}

interface Props {
  clientes: ClienteSemDCTFComMovimento[];
  competenciaVigente: string;
  loading?: boolean;
  error?: string | null;
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

function SeverityTag({ severity, label }: { severity: 'high' | 'medium' | 'low'; label: string }) {
  const styles = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {label}
    </span>
  );
}

export function ClientesSemDCTFComMovimentoSection({ 
  clientes, 
  competenciaVigente,
  loading = false,
  error = null 
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const itensPorPagina = 10;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1">
          {expanded ? (
            <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          )}
          <div className="flex-1 text-left">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              Clientes sem DCTF mas COM Movimento no SCI
            </h2>
            <p className="text-sm text-gray-600">
              Clientes que <strong>NÃO têm DCTF</strong> na competência vigente ({competenciaVigente}), 
              mas <strong>TÊM movimento</strong> no Banco SCI no mês anterior.
              Estes clientes têm <strong>obrigação de enviar DCTF</strong> conforme IN RFB 2.237/2024.
            </p>
          </div>
        </div>
        <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
          {loading ? (
            <span className="text-gray-500">Carregando...</span>
          ) : (
            <>
              Total: <span className="text-gray-900">{clientes.length}</span> clientes
            </>
          )}
        </div>
      </button>

      {expanded && (
        <>
          {loading ? (
            <div className="px-6 py-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-600">Carregando clientes sem DCTF com movimento...</p>
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
                Nenhum cliente encontrado sem DCTF mas com movimento no SCI para a competência {competenciaVigente}.
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
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Competência Obrigação</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Movimento em</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Tipos Movimento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Total Movimentações</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Dias até Vencimento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Possível Obrigação de Envio</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clientes
                      .slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina)
                      .map((cliente, index) => {
                        const diasAteVencimento = cliente.diasAteVencimento || 0;
                        const severidade = diasAteVencimento < 0 ? 'high' : diasAteVencimento <= 5 ? 'high' : 'medium';
                        const id = `${cliente.cnpj}-${index}`;

                        return (
                          <tr key={id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                              {cliente.razao_social || '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span>
                                <button
                                  onClick={() => copyToClipboard(cliente.cnpj, id)}
                                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                  title="Copiar CNPJ"
                                >
                                  {copiedId === id ? (
                                    <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                  ) : (
                                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              <span className="font-semibold text-red-600">{cliente.competencia_obrigacao}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{cliente.competencia_movimento}</td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              <div className="flex flex-wrap gap-1">
                                {cliente.tipos_movimento && cliente.tipos_movimento.length > 0 ? (
                                  cliente.tipos_movimento.map((tipo, idx) => (
                                    <span key={idx} className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                                      {tipo}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{cliente.total_movimentacoes}</td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cliente.prazoVencimento)}</td>
                            <td className="px-4 py-3">
                              <SeverityTag
                                severity={severidade}
                                label={diasAteVencimento < 0 ? `${Math.abs(diasAteVencimento)} dias vencido` : `${diasAteVencimento} dias`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {cliente.possivelObrigacaoEnvio ? (
                                  <span
                                    className="inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-200 px-2.5 py-0.5 text-xs font-medium cursor-help"
                                    title={cliente.motivoObrigacao}
                                  >
                                    <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                    Sim
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center rounded-full bg-gray-100 text-gray-800 border border-gray-200 px-2.5 py-0.5 text-xs font-medium cursor-help"
                                    title={cliente.motivoObrigacao}
                                  >
                                    <InformationCircleIcon className="w-3 h-3 mr-1" />
                                    Verificar
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <button
                                onClick={() => navigate(`/clientes/${cliente.cnpj}`)}
                                className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                              >
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                Ver Lançamentos
                              </button>
                            </td>
                          </tr>
                        );
                      })}
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

