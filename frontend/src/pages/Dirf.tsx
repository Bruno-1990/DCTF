import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DocumentTextIcon,
  DocumentIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { parseXmls, getVerbas, type DirfParseResult, type CpfAgregado } from '../services/dirf';

const MESES_LABEL: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function formatPeriodoLabel(perApur: string): string {
  const [ano, mes] = perApur.split('-');
  return mes && ano ? `${MESES_LABEL[mes] || mes}/${ano}` : perApur;
}

const ACCEPT = '.xml';
const MAX_FILES = 100;
const LOADING_BAR_MIN_MS = 3000;
const LOADING_BAR_INTERVAL_MS = 50;

type DirfStage = 'xml' | 'loading' | 'result';

/**
 * Página DIRF: 3 etapas — 1) XML, 2) Barra de carregamento, 3) Resultado.
 */
const Dirf: React.FC = () => {
  const [stage, setStage] = useState<DirfStage>('xml');
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DirfParseResult | null>(null);
  const [verbas, setVerbas] = useState<Record<string, string>>({});
  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const apiDoneRef = useRef(false);
  const pendingResultRef = useRef<DirfParseResult | null>(null);
  const pendingErrorRef = useRef<string | null>(null);
  const pendingVerbasRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (result && result.arquivosProcessados > 0 && resultsSectionRef.current) {
      resultsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  const isXml = (f: File) => f.name.toLowerCase().endsWith('.xml');

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter(isXml);
    setFiles((prev) => {
      const names = new Set(prev.map((x) => x.name));
      const toAdd = list.filter((f) => !names.has(f.name)).slice(0, MAX_FILES - prev.length);
      return prev.length + toAdd.length <= MAX_FILES ? [...prev, ...toAdd] : prev;
    });
    setResult(null);
    setError(null);
  }, []);

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setResult(null);
    setError(null);
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setResult(null);
    setError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const applyPendingAndFinish = useCallback(() => {
    if (pendingErrorRef.current) setError(pendingErrorRef.current);
    if (Object.keys(pendingVerbasRef.current).length > 0) setVerbas(pendingVerbasRef.current);
    if (pendingResultRef.current) setResult(pendingResultRef.current);
    setLoading(false);
    setProgress(0);
    progressRef.current = 0;
    apiDoneRef.current = false;
    pendingResultRef.current = null;
    pendingErrorRef.current = null;
    pendingVerbasRef.current = {};
    setStage('result');
  }, []);

  const tryFinishAndGoToResult = useCallback(() => {
    if (progressRef.current >= 100 && apiDoneRef.current) {
      setTimeout(() => applyPendingAndFinish(), 0);
    }
  }, [applyPendingAndFinish]);

  const goToXmlStage = useCallback(() => {
    setStage('xml');
    setFiles([]);
    setResult(null);
    setError(null);
  }, []);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) {
      setError('Selecione ou arraste pelo menos um arquivo .xml');
      return;
    }
    setStage('loading');
    setLoading(true);
    setProgress(0);
    setError(null);
    setResult(null);
    progressRef.current = 0;
    apiDoneRef.current = false;
    pendingResultRef.current = null;
    pendingErrorRef.current = null;
    pendingVerbasRef.current = {};

    const steps = Math.ceil(LOADING_BAR_MIN_MS / LOADING_BAR_INTERVAL_MS);
    const stepValue = 100 / steps;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + stepValue, 100);
        progressRef.current = next;
        if (next >= 100) {
          clearInterval(timer);
          tryFinishAndGoToResult();
        }
        return next;
      });
    }, LOADING_BAR_INTERVAL_MS);

    try {
      const [parseRes, verbasRes] = await Promise.all([
        parseXmls(files),
        getVerbas().catch(() => ({ success: false, data: {} })),
      ]);
      if (verbasRes.success && verbasRes.data) pendingVerbasRef.current = verbasRes.data;
      if (!parseRes.success) {
        pendingErrorRef.current = parseRes.error || 'Falha ao processar XMLs';
      } else if (parseRes.data) {
        pendingResultRef.current = parseRes.data;
      }
    } catch (err) {
      pendingErrorRef.current = err instanceof Error ? err.message : 'Erro ao processar';
    } finally {
      apiDoneRef.current = true;
      tryFinishAndGoToResult();
    }
  }, [files, tryFinishAndGoToResult]);

  const formatCpf = (cpf: string) => {
    const n = cpf.replace(/\D/g, '').slice(0, 11);
    if (n.length !== 11) return cpf;
    return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
  };

  const formatMoney = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Cabeçalho (padrão Clientes) */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black opacity-10" />
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-3">DIRF</h1>
            <p className="text-blue-100 text-lg">
              Processamento de XMLs eSocial S-5002 (evtIrrfBenef) e totalizadores por CPF, mês e ano.
            </p>
          </div>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-48 h-48 bg-white opacity-5 rounded-full blur-3xl" />
        </div>
      </div>

      {/* ——— Etapa 1: XML ——— */}
      {stage === 'xml' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Arquivos XML (eSocial S-5002) * (máximo {MAX_FILES} arquivos)
            </label>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`relative transition-all duration-200 border-2 border-dashed rounded-lg p-8 min-h-[150px] flex flex-col items-center justify-center ${
                dragOver
                  ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <div className="text-center space-y-4 w-full">
                {dragOver ? (
                  <>
                    <div className="mx-auto w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                      <ArrowUpTrayIcon className="h-8 w-8 text-white" />
                    </div>
                    <p className="text-lg font-medium text-blue-600">Solte os arquivos aqui</p>
                  </>
                ) : (
                  <>
                    <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <DocumentIcon className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">
                        Arraste e solte os arquivos XML aqui
                      </p>
                      <p className="text-xs text-gray-500">ou</p>
                      <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
                        <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
                        Selecionar arquivos
                        <input
                          type="file"
                          accept={ACCEPT}
                          multiple
                          onChange={(e) => {
                            if (e.target.files?.length) addFiles(e.target.files);
                            e.target.value = '';
                          }}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Formato: .xml | Múltiplos arquivos (até {MAX_FILES})
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 bg-gray-50/80 border-b border-gray-100">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-indigo-100 text-indigo-700 font-semibold text-sm">
                    {files.length}
                  </span>
                  <span className="text-gray-700 font-medium">arquivo(s) selecionado(s)</span>
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Limpar todos
                </button>
              </div>
              <ul className="max-h-48 overflow-y-auto dirf-file-list">
                {files.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-gray-700 hover:bg-indigo-50/50 border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <span className="truncate font-mono text-gray-800">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.name)}
                      className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remover"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleProcess}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-md shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
                >
                  <DocumentTextIcon className="h-5 w-5" />
                  Processar XMLs
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}

          <style>{`
            .dirf-file-list::-webkit-scrollbar { width: 8px; }
            .dirf-file-list::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
            .dirf-file-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            .dirf-file-list::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          `}</style>
        </>
      )}

      {/* ——— Etapa 2: Barra de carregamento ——— (mesma largura do cabeçalho) */}
      {stage === 'loading' && (
        <div className="w-full rounded-2xl border border-indigo-100 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <ArrowPathIcon className="h-7 w-7 text-indigo-600 animate-spin flex-shrink-0" />
              <p className="text-gray-700 font-medium text-base">Processando XMLs…</p>
            </div>
            <span className="text-base font-semibold text-indigo-600 tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="h-4 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-gray-500 text-sm mt-3">
            {progress >= 100 ? 'Concluído. Redirecionando aos resultados…' : 'Aguarde, em breve você será levado aos resultados.'}
          </p>
        </div>
      )}

      {/* ——— Etapa 3: Resultado ——— */}
      {stage === 'result' && (
        <>
          {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}

          {result && Object.keys(result.errosPorArquivo).length > 0 && (
            <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <h3 className="font-medium text-amber-900 mb-2">Erros por arquivo</h3>
              <ul className="text-sm text-amber-800 space-y-1">
                {Object.entries(result.errosPorArquivo).map(([nome, msg]) => (
                  <li key={nome}>
                    <strong>{nome}:</strong> {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result && result.arquivosProcessados > 0 && Object.keys(result.porCpf).length > 0 && (
            <div ref={resultsSectionRef} className="scroll-mt-6">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-gray-900">Totalizadores por CPF</h2>
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-4 py-1.5 text-sm font-medium text-indigo-800">
                  {result.arquivosProcessados} arquivo(s) processado(s)
                </span>
              </div>
              <div className="space-y-8">
                {Object.entries(result.porCpf).map(([cpf, agg]) => (
                  <CpfTabela
                    key={cpf}
                    cpf={cpf}
                    agg={agg}
                    formatCpf={formatCpf}
                    formatMoney={formatMoney}
                    verbas={verbas}
                  />
                ))}
              </div>
            </div>
          )}

          {result && result.arquivosProcessados > 0 && Object.keys(result.porCpf).length === 0 && (
            <p className="text-gray-500 text-sm">Nenhum dado de beneficiário encontrado nos XMLs (eventos S-5002).</p>
          )}

          <div className="mt-8">
            <button
              type="button"
              onClick={goToXmlStage}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              Processar novos arquivos
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const MESES_PER_PAGE = 4;

/** Tabela por CPF: colunas = meses (paginados) + Total, sem barra de rolagem horizontal */
function CpfTabela({
  cpf,
  agg,
  formatCpf,
  formatMoney,
  verbas,
}: {
  cpf: string;
  agg: CpfAgregado;
  formatCpf: (s: string) => string;
  formatMoney: (n: number) => string;
  verbas: Record<string, string>;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const { mesesOrdenados, codVerbasOrdenados, valorPorMesVerba, totaisPorMes, totalAno } =
    useMemo(() => {
      const mesesSet = new Set<string>();
      const verbasSet = new Set<string>();
      Object.entries(agg.meses).forEach(([per, mes]) => {
        mesesSet.add(per);
        Object.keys(mes.verbas).forEach((cod) => verbasSet.add(cod));
      });
      const mesesOrdenados = Array.from(mesesSet).sort();
      const codVerbasOrdenados = Array.from(verbasSet).sort(
        (a, b) => Number(a) - Number(b) || a.localeCompare(b)
      );

      const valorPorMesVerba: Record<string, Record<string, number>> = {};
      codVerbasOrdenados.forEach((cod) => {
        valorPorMesVerba[cod] = {};
        mesesOrdenados.forEach((per) => {
          const v = agg.meses[per]?.verbas[cod] ?? 0;
          valorPorMesVerba[cod][per] = v;
        });
      });

      const totaisPorMes: Record<string, number> = {};
      mesesOrdenados.forEach((per) => {
        totaisPorMes[per] = agg.meses[per]?.totalMes ?? 0;
      });

      return {
        mesesOrdenados,
        codVerbasOrdenados,
        valorPorMesVerba,
        totaisPorMes,
        totalAno: agg.totalAno,
      };
    }, [agg]);

  const totalPages = Math.max(1, Math.ceil(mesesOrdenados.length / MESES_PER_PAGE));
  const safeStart = Math.min(pageIndex, totalPages - 1) * MESES_PER_PAGE;
  const visibleMonthsSafe = mesesOrdenados.slice(safeStart, safeStart + MESES_PER_PAGE);

  const descVerba = (cod: string) => verbas[cod] || `Verba ${cod}`;

  /** Tooltip da descrição: para verba 7900 (verba diversa), explica que valores negativos = descontos pela folha. */
  const titleVerba = (cod: string) => {
    const desc = descVerba(cod);
    if (cod === '7900' || cod.startsWith('7900_')) {
      return `${desc}\n\nValores negativos = descontos que transitam pela folha (ex.: convênio farmácia, consignações).`;
    }
    return desc;
  };

  const dataRows = codVerbasOrdenados.filter((cod) => {
    const porMes = valorPorMesVerba[cod];
    return Object.values(porMes).reduce((a, b) => a + b, 0) !== 0;
  });

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white shadow-lg shadow-gray-200/40 overflow-hidden">
      {/* Cabeçalho do card: CPF */}
      <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">CPF</span>
        <p className="font-semibold text-gray-900 text-lg mt-0.5 font-mono">{formatCpf(cpf)}</p>
      </div>

      <div className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100/90">
              <th className="px-4 py-3.5 text-left font-semibold text-gray-700 min-w-0">
                Descrição
              </th>
              {visibleMonthsSafe.map((per) => (
                <th
                  key={per}
                  className="px-3 py-3.5 text-right font-semibold text-gray-600 text-xs"
                >
                  {formatPeriodoLabel(per)}
                </th>
              ))}
              {Array.from({ length: MESES_PER_PAGE - visibleMonthsSafe.length }).map((_, i) => (
                <th key={`empty-${i}`} className="px-3 py-3.5" aria-hidden />
              ))}
              <th className="px-4 py-3.5 text-right font-semibold text-indigo-700 bg-indigo-50/80 min-w-[7rem]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {dataRows.map((cod, idx) => {
              const porMes = valorPorMesVerba[cod];
              const totalLinha = Object.values(porMes).reduce((a, b) => a + b, 0);
              const isEven = idx % 2 === 0;
              return (
                <tr
                  key={cod}
                  className={`border-b border-gray-100 last:border-b-0 ${isEven ? 'bg-white' : 'bg-gray-50/50'} hover:bg-indigo-50/40 transition-colors`}
                >
                  <td className={`px-4 py-3 text-gray-800 truncate ${isEven ? 'bg-white' : 'bg-gray-50/50'}`} title={titleVerba(cod)}>
                    {descVerba(cod)}
                  </td>
                  {visibleMonthsSafe.map((per) => (
                    <td key={per} className="px-3 py-3 text-right font-mono text-gray-700 tabular-nums text-xs">
                      {porMes[per] !== 0 ? formatMoney(porMes[per]) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  {Array.from({ length: MESES_PER_PAGE - visibleMonthsSafe.length }).map((_, i) => (
                    <td key={`empty-${i}`} className="px-3 py-3" aria-hidden />
                  ))}
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900 tabular-nums bg-indigo-50/30">
                    {formatMoney(totalLinha)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gradient-to-r from-indigo-100 to-blue-100 font-semibold border-t-2 border-indigo-200">
              <td className="px-4 py-4 text-gray-900 bg-gradient-to-r from-indigo-100 to-blue-100">
                Soma mensal
              </td>
              {visibleMonthsSafe.map((per) => (
                <td key={per} className="px-3 py-4 text-right font-mono text-gray-800 tabular-nums">
                  {totaisPorMes[per] !== 0 ? formatMoney(totaisPorMes[per]) : <span className="text-gray-400">—</span>}
                </td>
              ))}
              {Array.from({ length: MESES_PER_PAGE - visibleMonthsSafe.length }).map((_, i) => (
                <td key={`empty-${i}`} className="px-3 py-4" aria-hidden />
              ))}
              <td className="px-4 py-4 text-right font-mono font-bold text-indigo-900 tabular-nums bg-indigo-200/50">
                {formatMoney(totalAno)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-indigo-600 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            {visibleMonthsSafe[0] ? formatPeriodoLabel(visibleMonthsSafe[0]) : ''}
            {visibleMonthsSafe.length > 1 && visibleMonthsSafe[visibleMonthsSafe.length - 1]
              ? ` – ${formatPeriodoLabel(visibleMonthsSafe[visibleMonthsSafe.length - 1])}` : ''}
            <span className="text-gray-400 ml-1">({Math.min(pageIndex + 1, totalPages)}/{totalPages})</span>
          </span>
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageIndex >= totalPages - 1}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-indigo-600 disabled:opacity-40 disabled:pointer-events-none"
          >
            Próximo
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default Dirf;
