/**
 * COMPONENTE: Seção de Clientes sem DCTF mas COM Movimento no SCI
 * 
 * Módulo 2: Lista clientes que NÃO têm DCTF na competência vigente,
 * mas TÊM movimento no Banco SCI no mês anterior.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';
import { exportToExcel } from '../../utils/exportExcel';
import { FiltroConferencias, filtrarPorCnpjOuRazao, filtrarPorProcuracao } from './FiltroConferencias';

interface ClienteSemDCTFComMovimento {
  cnpj: string;
  razao_social: string;
  regime_tributario?: string | null;
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

function formatTipoMovimento(tipo: string): string {
  const tiposMovimento: Record<string, string> = {
    'CTB': 'CONTÁBIL',
    'FISE': 'FISCAL ENTRADA',
    'FPG': 'TRABALHISTA',
    'FISS': 'FISCAL SAÍDA',
  };
  return tiposMovimento[tipo.toUpperCase()] || tipo;
}

function getTipoMovimentoColor(tipo: string): string {
  const colors: Record<string, string> = {
    'CTB': 'bg-blue-100 text-blue-800 border-blue-200',
    'FISE': 'bg-green-100 text-green-800 border-green-200',
    'FPG': 'bg-purple-100 text-purple-800 border-purple-200',
    'FISS': 'bg-orange-100 text-orange-800 border-orange-200',
  };
  return colors[tipo.toUpperCase()] || 'bg-gray-100 text-gray-800 border-gray-200';
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
  error = null,
  expanded: expandedProp,
  onToggle,
}: Props) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp !== undefined ? expandedProp : internalExpanded;
  const [filtro, setFiltro] = useState('');
  const [mostrarTodosComProcuracao, setMostrarTodosComProcuracao] = useState(false);
  const clientesPorProcuracao = mostrarTodosComProcuracao ? clientes : filtrarPorProcuracao(clientes);
  const clientesFiltrados = filtrarPorCnpjOuRazao(clientesPorProcuracao, filtro);

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtro, mostrarTodosComProcuracao]);

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
  const [modalCliente, setModalCliente] = useState<ClienteSemDCTFComMovimento | null>(null);
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
    const listaExportar = clientesFiltrados;
    if (listaExportar.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      setExporting(true);
      const data = listaExportar.map((cliente) => [
        cliente.razao_social || '—',
        formatCNPJ(cliente.cnpj) || '—',
        cliente.competencia_obrigacao,
        cliente.competencia_movimento,
        cliente.tipos_movimento.map(tipo => formatTipoMovimento(tipo)).join(', ') || '—',
        cliente.total_movimentacoes.toString(),
        formatDate(cliente.prazoVencimento),
        cliente.diasAteVencimento.toString(),
        cliente.possivelObrigacaoEnvio ? 'Sim' : 'Não',
        cliente.motivoObrigacao || '—',
      ]);

      await exportToExcel({
        filename: `clientes-sem-dctf-com-movimento-${competenciaVigente.replace('/', '-')}-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Clientes sem DCTF c/ Movimento',
        headers: ['Empresa', 'CNPJ', 'Competência Obrigação', 'Movimento em', 'Tipos Movimento', 'Total Movimentações', 'Vencimento', 'Dias até Vencimento', 'Possível Obrigação', 'Motivo'],
        data,
        title: `Clientes sem DCTF mas com Movimento - Competência ${competenciaVigente}`,
        metadata: {
          'Data de Exportação': new Date().toLocaleString('pt-BR'),
          'Total de Clientes': listaExportar.length.toString(),
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
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
                  <ExclamationTriangleIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Divergência Detectada</h2>
                  <p className="text-orange-100 text-sm">Análise de obrigação DCTF</p>
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
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
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

              {/* Motivo da Divergência */}
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  MOTIVO DA DIVERGÊNCIA
                </h3>
                <p className="text-sm text-red-700 leading-relaxed">
                  {modalCliente.motivoObrigacao || 
                   `Cliente teve ${modalCliente.total_movimentacoes} movimentação(ões) em ${modalCliente.competencia_movimento}, mas ainda não transmitiu DCTF para ${modalCliente.competencia_obrigacao}.`}
                </p>
              </div>

              {/* Detalhes da Movimentação */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">DETALHES DA MOVIMENTAÇÃO</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Competência com Movimento</p>
                      <p className="text-base font-semibold text-gray-900">{modalCliente.competencia_movimento}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">DCTF Obrigatória</p>
                      <p className="text-base font-semibold text-red-600">{modalCliente.competencia_obrigacao}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Total de Movimentações</p>
                      <p className="text-base font-semibold text-gray-900">{modalCliente.total_movimentacoes}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Vencimento</p>
                      <p className="text-base font-semibold text-gray-900">{formatDate(modalCliente.prazoVencimento)}</p>
                    </div>
                  </div>
                </div>

                {/* Tipos de Movimento */}
                {modalCliente.tipos_movimento && modalCliente.tipos_movimento.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">TIPOS DE MOVIMENTO DETECTADOS</h3>
                    <div className="flex flex-wrap gap-2">
                      {modalCliente.tipos_movimento.map((tipo, idx) => (
                        <span 
                          key={idx} 
                          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold border uppercase tracking-wide ${getTipoMovimentoColor(tipo)}`}
                          title={`Código: ${tipo}`}
                        >
                          {formatTipoMovimento(tipo)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status de Prazo */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">STATUS DE PRAZO</h3>
                  <div className={`rounded-lg p-4 ${
                    modalCliente.diasAteVencimento < 0 
                      ? 'bg-red-50 border border-red-200' 
                      : modalCliente.diasAteVencimento <= 5 
                      ? 'bg-amber-50 border border-amber-200' 
                      : 'bg-blue-50 border border-blue-200'
                  }`}>
                    <p className={`text-sm font-semibold ${
                      modalCliente.diasAteVencimento < 0 
                        ? 'text-red-800' 
                        : modalCliente.diasAteVencimento <= 5 
                        ? 'text-amber-800' 
                        : 'text-blue-800'
                    }`}>
                      {modalCliente.diasAteVencimento < 0 
                        ? `⚠️ Vencido há ${Math.abs(modalCliente.diasAteVencimento)} dias` 
                        : modalCliente.diasAteVencimento <= 5 
                        ? `⏰ Faltam apenas ${modalCliente.diasAteVencimento} dias para o vencimento` 
                        : `✓ ${modalCliente.diasAteVencimento} dias até o vencimento`
                      }
                    </p>
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
                  const cnpjLimpo = modalCliente.cnpj.replace(/\D/g, '');
                  navigate(`/clientes?tab=lancamentos&cnpj=${cnpjLimpo}`);
                  setModalCliente(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                Ver
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
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              Clientes sem DCTF mas com Movimento
            </h2>
            <p className="text-sm text-gray-600">
              Clientes que tiveram movimento no mês anterior, mas ainda não enviaram a DCTF para {competenciaVigente}. 
              Estes clientes precisam enviar a declaração.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-gray-700 bg-white px-5 py-2.5 rounded-xl border-2 border-gray-300">
            {loading ? (
              <span className="text-gray-500">Carregando...</span>
            ) : (
              <>
                Total: <span className="text-gray-900 font-bold">{clientesPorProcuracao.length}</span>
                {filtro.trim() ? ` (${clientesFiltrados.length} filtrado${clientesFiltrados.length !== 1 ? 's' : ''})` : ' clientes'}
              </>
            )}
          </div>
          {!loading && clientes.length > 0 && (
            <FiltroConferencias value={filtro} onChange={setFiltro} />
          )}
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
        </div>
      </div>

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
          ) : clientesFiltrados.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <InformationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                {filtro.trim() ? 'Nenhum resultado para o filtro informado.' : `Nenhum cliente encontrado sem DCTF mas com movimento no SCI para a competência ${competenciaVigente}.`}
              </p>
              {filtro.trim() && <p className="text-xs text-gray-500 mt-2">Tente outro CNPJ ou Razão Social.</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center px-6 py-3 border-b border-gray-200 bg-gray-50/70" onClick={(e) => e.stopPropagation()}>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={mostrarTodosComProcuracao}
                    onChange={(e) => {
                      setMostrarTodosComProcuracao(e.target.checked);
                      setPaginaAtual(1);
                    }}
                    className="w-5 h-5 text-amber-500 border-2 border-gray-300 rounded focus:ring-2 focus:ring-amber-400 focus:ring-offset-0 cursor-pointer transition-all duration-200 checked:bg-amber-500 checked:border-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-amber-600 transition-colors select-none">
                    Todos com procuração
                  </span>
                  <span className="text-xs text-gray-500 italic">
                    (Desmarcado: apenas clientes com Razão Social e CNPJ)
                  </span>
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">CNPJ</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Regime</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Competência Obrigação</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Movimento em</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Tipos Movimento</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Total Movimentações</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Vencimento</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Dias até Vencimento</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Possível Obrigação de Envio</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Lançamentos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clientesFiltrados
                      .slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina)
                      .map((cliente, index) => {
                        const diasAteVencimento = cliente.diasAteVencimento || 0;
                        const severidade = diasAteVencimento < 0 ? 'high' : diasAteVencimento <= 5 ? 'high' : 'medium';
                        const id = `${cliente.cnpj}-${index}`;

                        return (
                          <tr key={id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                              <button
                                onClick={() => setModalCliente(cliente)}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left transition-colors cursor-pointer"
                              >
                                {cliente.razao_social || '—'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-mono whitespace-nowrap">{formatCNPJ(cliente.cnpj)}</span>
                                <button
                                  onClick={() => copyToClipboard(cliente.cnpj, id)}
                                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 cursor-pointer"
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
                              {cliente.regime_tributario ? String(cliente.regime_tributario).toUpperCase() : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              <span className="font-semibold text-red-600">{cliente.competencia_obrigacao}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{cliente.competencia_movimento}</td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              <div className="flex flex-wrap gap-1.5">
                                {cliente.tipos_movimento && cliente.tipos_movimento.length > 0 ? (
                                  cliente.tipos_movimento.map((tipo, idx) => (
                                    <span 
                                      key={idx} 
                                      className={`inline-flex items-center border px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide ${getTipoMovimentoColor(tipo)}`}
                                      title={tipo}
                                    >
                                      {formatTipoMovimento(tipo)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs text-center">{cliente.total_movimentacoes}</td>
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
                                    className="inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-200 px-2.5 py-0.5 text-xs font-medium cursor-pointer"
                                    title={cliente.motivoObrigacao}
                                  >
                                    <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                    Sim
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center rounded-full bg-gray-100 text-gray-800 border border-gray-200 px-2.5 py-0.5 text-xs font-medium cursor-pointer"
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
                                onClick={() => {
                                  const cnpjLimpo = cliente.cnpj.replace(/\D/g, '');
                                  navigate(`/clientes?tab=lancamentos&cnpj=${cnpjLimpo}`);
                                }}
                                className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                              >
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                Ver
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {clientesFiltrados.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtual}
                    totalPages={Math.ceil(clientesFiltrados.length / itensPorPagina)}
                    totalItems={clientesFiltrados.length}
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

