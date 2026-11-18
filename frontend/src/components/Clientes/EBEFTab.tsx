import { useState, useEffect, useCallback, useRef } from 'react';
import { clientesService, type EBEFEscopo } from '../../services/clientes';
import LoadingSpinner from '../UI/LoadingSpinner';
import Alert from '../UI/Alert';
import { ChevronDownIcon, ChevronUpIcon, ArrowPathIcon, ArrowDownTrayIcon, PencilSquareIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import EnvioDatePicker from './EnvioDatePicker';
import type { EBEFParent, EBEFProgress } from '../../types';

/** Formata CNPJ de 14 dígitos para XX.XXX.XXX/XXXX-XX */
function formatCNPJ(cnpj: string): string {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function EBEFTab() {
  const [data, setData] = useState<EBEFParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStarting, setBatchStarting] = useState(false);
  const [progress, setProgress] = useState<EBEFProgress | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [envioSavingId, setEnvioSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [escopo, setEscopo] = useState<EBEFEscopo>('matrizes');
  const [info, setInfo] = useState<string | null>(null);
  // "Reconsultar tudo" pede um segundo clique antes de disparar (leva ~21 s por CNPJ)
  const [confirmandoReconsulta, setConfirmandoReconsulta] = useState(false);

  // ── Carregar dados ──
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await clientesService.listarEBEF(escopo);
      if (res.success) {
        setData(res.data || []);
      } else {
        setError(res.error || 'Erro ao carregar dados e-BEF');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados e-BEF');
    } finally {
      setLoading(false);
    }
  }, [escopo]);

  // ── Polling de progresso ──
  const pollProgress = useCallback(async () => {
    try {
      const res = await clientesService.obterProgressoEBEF(escopo);
      if (res.success) {
        const p = res.data as EBEFProgress;
        setProgress(p);
        if (!p.em_andamento) {
          // Batch terminou
          setBatchRunning(false);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          // Recarregar dados
          loadData();
        }
      }
    } catch {
      // Ignora erros de polling
    }
  }, [loadData, escopo]);

  // ── Iniciar lote ──
  // reconsultar=true refaz também as consultas já concluídas (botão "Reconsultar tudo").
  const handleStartBatch = async (reconsultar = false) => {
    try {
      setBatchStarting(true);
      setInfo(null);
      setConfirmandoReconsulta(false);
      const res = await clientesService.iniciarLoteEBEF(escopo, reconsultar);
      if (res.success && !(res.data?.total > 0)) {
        // Nada na fila: avisa em vez de ficar parado sem resposta
        setInfo('Nenhum CNPJ pendente: todas as consultas já estão concluídas. Use "Reconsultar tudo" para refazê-las.');
      } else if (res.success) {
        setBatchRunning(true);
        // Iniciar polling
        pollRef.current = setInterval(pollProgress, 5000);
        // Primeiro poll imediato
        pollProgress();
      } else {
        setError(res.error || 'Erro ao iniciar consulta em lote');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar consulta em lote');
    } finally {
      setBatchStarting(false);
    }
  };

  // ── Exportar XLSX ──
  const handleExport = async () => {
    try {
      setExporting(true);
      await clientesService.exportarEBEFXlsx(escopo);
    } catch (err: any) {
      setError(err.message || 'Erro ao exportar XLSX');
    } finally {
      setExporting(false);
    }
  };

  // ── Retry individual ──
  const handleRetry = async (consultaId: string) => {
    try {
      setRetryingId(consultaId);
      await clientesService.consultarEBEFFilho(consultaId);
      // Recarregar dados
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Erro ao reconsultar');
    } finally {
      setRetryingId(null);
    }
  };

  // ── Toggle envio do e-BEF (controle manual do usuário) ──
  // enviadoEmIso: data escolhida à mão; sem ela o servidor grava o horário atual.
  const handleToggleEnvio = async (clienteId: string, novoValor: boolean, enviadoEmIso?: string): Promise<boolean> => {
    const anterior = data.find(p => p.id === clienteId);
    // Atualização otimista
    setData(prev => prev.map(p =>
      p.id === clienteId
        ? {
            ...p,
            ebef_enviado: novoValor,
            ebef_enviado_em: novoValor ? (enviadoEmIso || new Date().toISOString()) : null,
          }
        : p
    ));
    try {
      setEnvioSavingId(clienteId);
      const res = await clientesService.atualizarEnvioEBEF(clienteId, novoValor, enviadoEmIso);
      if (res.success) {
        // Sincroniza data exata vinda do servidor
        setData(prev => prev.map(p =>
          p.id === clienteId
            ? {
                ...p,
                ebef_enviado: res.data.ebef_enviado,
                ebef_enviado_em: res.data.ebef_enviado_em,
              }
            : p
        ));
        return true;
      } else {
        // Reverte
        setData(prev => prev.map(p =>
          p.id === clienteId && anterior
            ? { ...p, ebef_enviado: anterior.ebef_enviado, ebef_enviado_em: anterior.ebef_enviado_em }
            : p
        ));
        setError(res.error || 'Erro ao salvar envio do e-BEF');
        return false;
      }
    } catch (err: any) {
      setData(prev => prev.map(p =>
        p.id === clienteId && anterior
          ? { ...p, ebef_enviado: anterior.ebef_enviado, ebef_enviado_em: anterior.ebef_enviado_em }
          : p
      ));
      setError(err?.response?.data?.error || err.message || 'Erro ao salvar envio do e-BEF');
      return false;
    } finally {
      setEnvioSavingId(null);
    }
  };

  // ── Edição manual da data de envio ──
  // Popover de data aberto: qual empresa e o elemento onde ele ancora
  const [editandoData, setEditandoData] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const fecharEdicaoData = useCallback(() => setEditandoData(null), []);

  // ── Formata data para exibição ──
  const formatDataEnvio = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  // ── Toggle accordion ──
  const toggleParent = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Mount ──
  useEffect(() => {
    loadData();
    // Checar se já há batch rodando
    (async () => {
      try {
        const res = await clientesService.obterProgressoEBEF(escopo);
        if (res.success && res.data?.em_andamento) {
          setBatchRunning(true);
          setProgress(res.data);
          pollRef.current = setInterval(pollProgress, 5000);
        }
      } catch { /* ignore */ }
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadData, pollProgress, escopo]);

  // ── Contadores ──
  const totalMaes = data.length;
  const totalFilhos = data.reduce((acc, p) => acc + p.socios_pj.length, 0);
  const totalConcluidos = data.reduce((acc, p) => acc + p.socios_pj.filter(s => s.consulta?.status === 'concluido').length, 0);
  const totalPendentes = data.reduce((acc, p) => acc + p.socios_pj.filter(s => !s.consulta || s.consulta.status === 'pendente').length, 0);
  const totalErros = data.reduce((acc, p) => acc + p.socios_pj.filter(s => s.consulta?.status === 'erro').length, 0);
  const totalEnviados = data.filter(p => p.ebef_enviado).length;

  // ── Status badge ──
  const StatusBadge = ({ status }: { status?: string }) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      concluido: { bg: 'bg-green-100', text: 'text-green-700', label: 'Concluído' },
      pendente: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pendente' },
      processando: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processando' },
      erro: { bg: 'bg-red-100', text: 'text-red-700', label: 'Erro' },
    };
    const s = map[status || 'pendente'] || map.pendente;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {status === 'processando' && <span className="w-2 h-2 mr-1.5 rounded-full bg-blue-500 animate-pulse" />}
        {s.label}
      </span>
    );
  };

  // ── Render ──
  // Spinner de tela cheia só na primeira carga; ao trocar o filtro a lista fica visível até a nova chegar.
  if (loading && data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-12 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">e-BEF — Beneficiários Finais</h2>
            <p className="text-sm text-gray-500 mt-1">
              Identifica os CPFs por trás de sócios PJ (CNPJ) no quadro societário dos clientes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro de escopo: Matrizes (padrão) ou Todos, filiais incluídas */}
            <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Filtrar empresas">
              {([
                { value: 'matrizes', label: 'Matrizes' },
                { value: 'todos', label: 'Todos' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEscopo(opt.value)}
                  aria-pressed={escopo === opt.value}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    escopo === opt.value
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting || data.length === 0}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 ${
                exporting || data.length === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 hover:shadow'
              }`}
            >
              <ArrowDownTrayIcon className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
              {exporting ? 'Exportando...' : 'Exportar XLSX'}
            </button>
            <button
              onClick={() => {
                if (confirmandoReconsulta) handleStartBatch(true);
                else setConfirmandoReconsulta(true);
              }}
              onBlur={() => setConfirmandoReconsulta(false)}
              disabled={batchRunning || batchStarting || totalFilhos === 0}
              title={`Refaz as consultas de todos os ${totalFilhos} CNPJ(s) filho, inclusive as concluídas`}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 ${
                batchRunning || batchStarting || totalFilhos === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : confirmandoReconsulta
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 hover:shadow'
              }`}
            >
              <ArrowPathIcon className="h-4 w-4" />
              {confirmandoReconsulta
                ? `Confirmar? (~${Math.max(1, Math.ceil((totalFilhos * 21) / 60))} min)`
                : 'Reconsultar tudo'}
            </button>
            <button
              onClick={() => handleStartBatch(false)}
              disabled={batchRunning || batchStarting}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 ${
                batchRunning || batchStarting
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white hover:shadow-lg hover:scale-105'
              }`}
            >
              <ArrowPathIcon className={`h-4 w-4 ${batchRunning ? 'animate-spin' : ''}`} />
              {batchStarting ? 'Iniciando...' : batchRunning ? 'Consultando...' : 'Consultar Todos'}
            </button>
          </div>
        </div>

        {/* Barra de progresso */}
        {batchRunning && progress && progress.total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>
                {progress.concluidos + progress.erros} de {progress.total} consultados
                {progress.cnpj_atual && <span className="ml-2 text-blue-600">({formatCNPJ(progress.cnpj_atual)})</span>}
              </span>
              <span>{Math.round(((progress.concluidos + progress.erros) / progress.total) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-gradient-to-r from-indigo-500 to-blue-500 h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${Math.round(((progress.concluidos + progress.erros) / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Erro */}
      {error && (
        <Alert type="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert type="info" onClose={() => setInfo(null)}>
          {info}
        </Alert>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Empresas Mãe', value: totalMaes, color: 'text-gray-700' },
          { label: 'CNPJs Filho', value: totalFilhos, color: 'text-indigo-600' },
          { label: 'Concluídos', value: totalConcluidos, color: 'text-green-600' },
          { label: 'Pendentes', value: totalPendentes, color: 'text-yellow-600' },
          { label: 'Erros', value: totalErros, color: 'text-red-600' },
          { label: 'Enviados', value: totalEnviados, color: 'text-emerald-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Lista vazia */}
      {data.length === 0 && !loading && (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-12 text-center">
          <p className="text-gray-500">Nenhuma empresa com sócios PJ (CNPJ) encontrada.</p>
          <p className="text-sm text-gray-400 mt-2">
            Verifique se os dados de sócios foram importados na aba Participação.
          </p>
        </div>
      )}

      {/* Accordion de empresas mãe */}
      {data.map(parent => (
        <div key={parent.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          {/* Cabeçalho da empresa mãe */}
          <div className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
            <button
              type="button"
              onClick={() => toggleParent(parent.id)}
              className="flex items-center gap-4 text-left flex-1 min-w-0"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{parent.razao_social}</p>
                <p className="text-sm text-gray-500">{formatCNPJ(parent.cnpj_limpo)}</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                {parent.socios_pj.length} sócio(s) PJ
              </span>
            </button>

            {/* Controle de envio do e-BEF (clique não propaga para o accordion) */}
            <div className="inline-flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
              <label
                className="inline-flex items-center gap-2 cursor-pointer select-none"
                title={parent.ebef_enviado ? 'Desmarcar envio' : 'Marcar como enviado'}
              >
                <input
                  type="checkbox"
                  checked={!!parent.ebef_enviado}
                  disabled={envioSavingId === parent.id}
                  onChange={(e) => {
                    if (!e.target.checked && editandoData?.id === parent.id) fecharEdicaoData();
                    handleToggleEnvio(parent.id, e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                />
                <span className={`text-xs font-medium ${parent.ebef_enviado ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {parent.ebef_enviado ? 'Enviado' : 'Enviado?'}
                </span>
              </label>

              {/* Chip da data: clique abre o calendário */}
              <AnimatePresence initial={false}>
                {parent.ebef_enviado && parent.ebef_enviado_em && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, x: -6, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={envioSavingId === parent.id}
                    onClick={(e) => {
                      const anchor = e.currentTarget;
                      setEditandoData(prev => (prev?.id === parent.id ? null : { id: parent.id, anchor }));
                    }}
                    title="Alterar data de envio"
                    aria-label="Alterar data de envio"
                    aria-expanded={editandoData?.id === parent.id}
                    className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-60
                      ${editandoData?.id === parent.id
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 hover:ring-emerald-300'}`}
                  >
                    <CalendarDaysIcon className="h-3.5 w-3.5" />
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={parent.ebef_enviado_em}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="tabular-nums"
                      >
                        {formatDataEnvio(parent.ebef_enviado_em)}
                      </motion.span>
                    </AnimatePresence>
                    <PencilSquareIcon className={`h-3.5 w-3.5 transition-opacity ${editandoData?.id === parent.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {editandoData?.id === parent.id && (
                <EnvioDatePicker
                  anchorEl={editandoData.anchor}
                  value={parent.ebef_enviado_em}
                  saving={envioSavingId === parent.id}
                  onSave={(iso) => handleToggleEnvio(parent.id, true, iso)}
                  onClose={fecharEdicaoData}
                />
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => toggleParent(parent.id)}
              className="ml-3 p-1"
              aria-label={expandedParents.has(parent.id) ? 'Recolher' : 'Expandir'}
            >
              {expandedParents.has(parent.id)
                ? <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                : <ChevronDownIcon className="h-5 w-5 text-gray-400" />
              }
            </button>
          </div>

          {/* Conteúdo expandido */}
          {expandedParents.has(parent.id) && (
            <div className="border-t border-gray-100 px-6 py-4 space-y-4 bg-gray-50/50">
              {parent.socios_pj.map(socio => (
                <div key={`${socio.socio_id}-${socio.cnpj_filho}`} className="bg-white rounded-xl border border-gray-200 p-4">
                  {/* Header do sócio PJ */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-800">{socio.nome}</p>
                      <p className="text-sm text-gray-500">
                        CNPJ: {formatCNPJ(socio.cnpj_filho)}
                        {socio.qual && <span className="ml-2 text-gray-400">({socio.qual})</span>}
                      </p>
                      {socio.consulta?.nome_filho && (
                        <p className="text-sm text-indigo-600 mt-0.5">
                          Razão Social: {socio.consulta.nome_filho}
                          {socio.consulta.situacao_filho && (
                            <span className="ml-2 text-gray-400">— {socio.consulta.situacao_filho}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={socio.consulta?.status} />
                      {socio.consulta?.status === 'erro' && (
                        <button
                          onClick={() => socio.consulta && handleRetry(socio.consulta.id)}
                          disabled={retryingId === socio.consulta?.id}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                          title={socio.consulta?.erro_mensagem || 'Reconsultar'}
                        >
                          <ArrowPathIcon className={`h-3 w-3 ${retryingId === socio.consulta?.id ? 'animate-spin' : ''}`} />
                          Reconsultar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Erro */}
                  {socio.consulta?.status === 'erro' && socio.consulta.erro_mensagem && (
                    <p className="text-xs text-red-500 mb-3 bg-red-50 px-3 py-1.5 rounded-lg">
                      {socio.consulta.erro_mensagem}
                    </p>
                  )}

                  {/* Tabela QSA do filho */}
                  {socio.consulta?.socios && socio.consulta.socios.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Nome do Sócio
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Qualificação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {socio.consulta.socios.map(sf => (
                            <tr key={sf.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2.5 text-sm text-gray-800">{sf.nome}</td>
                              <td className="px-4 py-2.5 text-sm text-gray-600">{sf.qual || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Sem consulta ainda */}
                  {(!socio.consulta || socio.consulta.status === 'pendente') && (
                    <p className="text-xs text-gray-400 italic">
                      Aguardando consulta. Clique em "Consultar Todos" para buscar os dados.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
