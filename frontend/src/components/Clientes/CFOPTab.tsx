/**
 * Aba CFOP na página Clientes: visualizações Soma Anual, Entradas (1.xxx, 2.xxx, 3.xxx) e Saídas (5.xxx, 6.xxx, 7.xxx).
 * Dados vêm da API ou da importação de PDF. Trocar de vista não recarrega dados (preserva PDF importado).
 */

import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import { cfopService, type CFOPMensal, type CFOPAnual } from '../../services/cfop';
import { formatCurrency } from '../../utils/formatCurrency';
import LoadingSpinner from '../UI/LoadingSpinner';
import Alert from '../UI/Alert';
import {
  ChartBarIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

/** Vista atual: resumo com totais, tabela de entradas ou tabela de saídas. */
type ViewModeCFOP = 'soma-anual' | 'entradas' | 'saidas';

function computeSomaAnual(items: CFOPMensal[]): CFOPAnual[] {
  const byKey: Record<string, { ano: number; cfop: string; descricao: string; valor_soma: number }> = {};
  for (const r of items) {
    const ano = r.ano ?? new Date().getFullYear();
    const key = `${ano}-${r.cfop}`;
    if (!byKey[key]) {
      byKey[key] = { ano, cfop: r.cfop, descricao: r.descricao || '', valor_soma: 0 };
    }
    byKey[key].valor_soma += r.valor ?? 0;
  }
  return Object.values(byKey).sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.cfop.localeCompare(b.cfop));
}

function totalValor(items: CFOPMensal[]): number {
  return items.reduce((s, r) => s + (r.valor ?? 0), 0);
}

function totalSomaAnual(somaAnual: CFOPAnual[]): number {
  return somaAnual.reduce((s, r) => s + (r.valor_soma ?? 0), 0);
}

const CFOPTab: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewModeCFOP>('soma-anual');

  const [entradaMensal, setEntradaMensal] = useState<CFOPMensal[]>([]);
  const [entradaSomaAnual, setEntradaSomaAnual] = useState<CFOPAnual[]>([]);
  const [saidaMensal, setSaidaMensal] = useState<CFOPMensal[]>([]);
  const [saidaSomaAnual, setSaidaSomaAnual] = useState<CFOPAnual[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const carregarEntrada = async () => {
    setError(null);
    try {
      const res = await cfopService.getEntrada(undefined);
      setEntradaMensal(res.items);
      setEntradaSomaAnual(res.somaAnual ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Erro ao carregar CFOP de entrada.');
      setEntradaMensal([]);
      setEntradaSomaAnual([]);
    }
  };

  const carregarSaida = async () => {
    setError(null);
    try {
      const res = await cfopService.getSaida(undefined);
      setSaidaMensal(res.items);
      setSaidaSomaAnual(res.somaAnual ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Erro ao carregar CFOP de saída.');
      setSaidaMensal([]);
      setSaidaSomaAnual([]);
    }
  };

  const carregar = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([carregarEntrada(), carregarSaida()]);
    } finally {
      setLoading(false);
    }
  };

  // Carregar ao montar. Não recarregar ao trocar de vista (Soma Anual / Entradas / Saídas), para preservar dados (ex.: PDF importado).
  useEffect(() => {
    carregar();
  }, []);

  /** Uma única importação preenche entrada e saída; as abas apenas exibem os resultados. */
  const handleImportarPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportando(true);
    setError(null);
    try {
      const { entrada, saida } = await cfopService.uploadPdf(file);
      setEntradaMensal(entrada.items);
      setEntradaSomaAnual(entrada.somaAnual ?? computeSomaAnual(entrada.items));
      setSaidaMensal(saida.items);
      setSaidaSomaAnual(saida.somaAnual ?? computeSomaAnual(saida.items));
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao processar o PDF.');
    } finally {
      setImportando(false);
    }
  };

  const handleExportarExcel = async () => {
    const totalEntradas = entradaSomaAnual.length;
    const totalSaidas = saidaSomaAnual.length;
    if (totalEntradas === 0 && totalSaidas === 0) {
      setError('Não há dados de CFOP para exportar. Importe um PDF primeiro.');
      return;
    }
    setExportando(true);
    setError(null);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'DCTF CFOP';
      const sheet = workbook.addWorksheet('CFOP', {
        views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
        properties: { defaultRowHeight: 20, showGridLines: false },
      });

      const HEADER_ROW = 1;
      const HEADER_HEIGHT = 24;
      const ROW_HEIGHT = 20;
      const COLS = { ANO: 1, CFOP: 2, DESCRICAO: 3, VALOR: 4 };

      // Cabeçalho
      sheet.getRow(HEADER_ROW).height = HEADER_HEIGHT;
      sheet.getCell(HEADER_ROW, COLS.ANO).value = 'ANO';
      sheet.getCell(HEADER_ROW, COLS.CFOP).value = 'CFOP';
      sheet.getCell(HEADER_ROW, COLS.DESCRICAO).value = 'DESCRIÇÃO';
      sheet.getCell(HEADER_ROW, COLS.VALOR).value = 'VALOR (SOMA)';
      for (let c = 1; c <= 4; c++) {
        const cell = sheet.getCell(HEADER_ROW, c);
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: c === COLS.DESCRICAO ? 'left' : 'center',
          wrapText: false,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      }

      let row = 2;

      // Linhas de Entrada
      for (const r of entradaSomaAnual) {
        sheet.getRow(row).height = ROW_HEIGHT;
        sheet.getCell(row, COLS.ANO).value = r.ano;
        sheet.getCell(row, COLS.CFOP).value = r.cfop;
        sheet.getCell(row, COLS.DESCRICAO).value = r.descricao || '—';
        sheet.getCell(row, COLS.VALOR).value = formatCurrency(r.valor_soma);
        for (let c = 1; c <= 4; c++) {
          const cell = sheet.getCell(row, c);
          cell.alignment = {
            vertical: 'middle',
            horizontal: c === COLS.DESCRICAO ? 'left' : 'center',
            wrapText: false,
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          };
        }
        row += 1;
      }

      // Duas linhas em branco (sem borda — só onde há dados) (altura definida para manter layout)
      sheet.getRow(row).height = ROW_HEIGHT;
      row += 1;
      sheet.getRow(row).height = ROW_HEIGHT;
      row += 1;

      // Lançamentos de Saída
      for (const r of saidaSomaAnual) {
        sheet.getRow(row).height = ROW_HEIGHT;
        sheet.getCell(row, COLS.ANO).value = r.ano;
        sheet.getCell(row, COLS.CFOP).value = r.cfop;
        sheet.getCell(row, COLS.DESCRICAO).value = r.descricao || '—';
        sheet.getCell(row, COLS.VALOR).value = formatCurrency(r.valor_soma);
        for (let c = 1; c <= 4; c++) {
          const cell = sheet.getCell(row, c);
          cell.alignment = {
            vertical: 'middle',
            horizontal: c === COLS.DESCRICAO ? 'left' : 'center',
            wrapText: false,
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          };
        }
        row += 1;
      }

      sheet.getColumn(COLS.ANO).width = 10;
      sheet.getColumn(COLS.CFOP).width = 12;
      sheet.getColumn(COLS.DESCRICAO).width = 60;
      sheet.getColumn(COLS.VALOR).width = 18;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dataExportacao = new Date().toISOString().split('T')[0];
      link.download = `cfop_entrada_saida_${dataExportacao}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar planilha Excel.');
    } finally {
      setExportando(false);
    }
  };

  const totalEntradas = totalSomaAnual(entradaSomaAnual) || totalValor(entradaMensal);
  const totalSaidas = totalSomaAnual(saidaSomaAnual) || totalValor(saidaMensal);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Cabeçalho: título, filtros, Exportar Excel, Importar PDF */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-gray-600" />
            CFOP
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Valores por CFOP de entrada (1.xxx, 2.xxx, 3.xxx) e saída (5.xxx, 6.xxx, 7.xxx) — soma anual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportarExcel}
            disabled={exportando || (entradaSomaAnual.length === 0 && saidaSomaAnual.length === 0)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowDownTrayIcon className={`h-4 w-4 ${exportando ? 'animate-spin' : ''}`} />
            Exportar Excel
          </button>
          <input
            type="file"
            ref={pdfInputRef}
            accept=".pdf"
            onChange={handleImportarPdf}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={importando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <DocumentTextIcon className={`h-4 w-4 ${importando ? 'animate-pulse' : ''}`} />
            Importar PDF
          </button>
        </div>
      </div>

      {/* Abas logo acima do relatório: Soma Anual | Entradas | Saídas */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setViewMode('soma-anual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'soma-anual'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Soma Anual
        </button>
        <button
          type="button"
          onClick={() => setViewMode('entradas')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'entradas'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Entradas
        </button>
        <button
          type="button"
          onClick={() => setViewMode('saidas')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'saidas'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Saídas
        </button>
      </div>

      {error && (
        <Alert type="error" onClose={() => setError(null)} className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : viewMode === 'soma-anual' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-6">
            <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-2 mb-2">
              <ArrowDownTrayIcon className="h-4 w-4" />
              Entradas
            </h3>
            <p className="text-2xl font-bold text-blue-900">{formatCurrency(totalEntradas)}</p>
            <p className="text-xs text-blue-600 mt-1">
              {entradaSomaAnual.length} CFOPs na soma anual
            </p>
            {entradaSomaAnual.length > 0 && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs font-medium text-blue-700 mb-1">Por ano:</p>
                <ul className="text-sm text-blue-800 space-y-0.5">
                  {Array.from(new Set(entradaSomaAnual.map((r) => r.ano))).sort((a, b) => b - a).map((ano) => {
                    const somaAno = entradaSomaAnual.filter((r) => r.ano === ano).reduce((s, r) => s + (r.valor_soma ?? 0), 0);
                    return <li key={ano}>{ano}: {formatCurrency(somaAno)}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-6">
            <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-2 mb-2">
              <ArrowUpTrayIcon className="h-4 w-4" />
              Saídas
            </h3>
            <p className="text-2xl font-bold text-emerald-900">{formatCurrency(totalSaidas)}</p>
            <p className="text-xs text-emerald-600 mt-1">
              {saidaSomaAnual.length} CFOPs na soma anual
            </p>
            {saidaSomaAnual.length > 0 && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <p className="text-xs font-medium text-emerald-700 mb-1">Por ano:</p>
                <ul className="text-sm text-emerald-800 space-y-0.5">
                  {Array.from(new Set(saidaSomaAnual.map((r) => r.ano))).sort((a, b) => b - a).map((ano) => {
                    const somaAno = saidaSomaAnual.filter((r) => r.ano === ano).reduce((s, r) => s + (r.valor_soma ?? 0), 0);
                    return <li key={ano}>{ano}: {formatCurrency(somaAno)}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'entradas' ? (
        entradaSomaAnual.length === 0 ? (
          <EstadoVazio tipo="entradas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ano</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CFOP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor (soma)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entradaSomaAnual.map((r, i) => (
                  <tr key={`${r.ano}-${r.cfop}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{r.ano}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">{r.cfop}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.descricao || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {formatCurrency(r.valor_soma)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        saidaSomaAnual.length === 0 ? (
          <EstadoVazio tipo="saidas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ano</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CFOP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor (soma)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {saidaSomaAnual.map((r, i) => (
                  <tr key={`${r.ano}-${r.cfop}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{r.ano}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">{r.cfop}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.descricao || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {formatCurrency(r.valor_soma)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};

function EstadoVazio({ tipo }: { tipo: 'entradas' | 'saidas' }) {
  const isEntrada = tipo === 'entradas';
  return (
    <div className="text-center py-12 px-4 bg-gray-50 rounded-xl border border-gray-200">
      <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900">
        {isEntrada ? 'Nenhum dado de CFOP de entrada' : 'Nenhum dado de CFOP de saída'}
      </h3>
      <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
        {isEntrada
          ? 'CFOP de entrada (1.xxx, 2.xxx, 3.xxx). Use o botão "Importar PDF" acima para enviar o relatório — as abas Entradas e Saídas serão preenchidas de uma vez.'
          : 'CFOP de saída (5.xxx, 6.xxx, 7.xxx). Use o botão "Importar PDF" acima para enviar o relatório — as abas Entradas e Saídas serão preenchidas de uma vez.'}
      </p>
    </div>
  );
}

export default CFOPTab;
