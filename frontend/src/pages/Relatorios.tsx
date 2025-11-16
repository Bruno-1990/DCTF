import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { useRelatorios } from '../hooks/useRelatorios';
import { relatoriosService } from '../services/relatorios';
import { dctfService } from '../services/dctf';

const RelatoriosPage: React.FC = () => {
  const { items, load, loading, error, clearError } = useRelatorios();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [tipoRelatorio, setTipoRelatorio] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [generatingTarget, setGeneratingTarget] = useState<string | null>(null);

  const fetchData = (params: { page: number; limit: number }) =>
    load({
      ...params,
      tipoRelatorio: tipoRelatorio || undefined,
    })
      .then(({ pagination }) => {
        setTotal(pagination?.total ?? null);
        setTotalPages(pagination?.totalPages ?? null);
      })
      .catch(() => {});

  useEffect(() => {
    fetchData({ page, limit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  // Buscar automaticamente quando o tipo de relatório mudar
  useEffect(() => {
    if (tipoRelatorio || !tipoRelatorio) {
      setPage(1);
      fetchData({ page: 1, limit });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoRelatorio]);

  const filtered = useMemo(() => items, [items]);
  const canGoNext = totalPages != null ? page < totalPages : filtered.length === limit;

  const handleDownload = async (id: string, titulo: string, formato: 'pdf' | 'xlsx' = 'pdf') => {
    try {
      const blob = await relatoriosService.downloadHistory(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = titulo.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '') || 'relatorio';
      link.href = url;
      link.download = `${safeTitle}.${formato}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao baixar relatório do histórico:', err);
    }
  };

  const handleGenerate = async (reportType: 'gerencial' | 'clientes' | 'dctf' | 'conferencia' | 'pendentes' | 'pagamentos-pendentes', format: 'pdf' | 'xlsx') => {
    try {
      setGeneratingTarget(`${reportType}-${format}`);
      // Tratamentos especiais gerados no front
      if (reportType === 'pagamentos-pendentes') {
        await gerarRelatorioPagamentosPendentesXLSX();
        await fetchData({ page: 1, limit });
        setPage(1);
        return;
      }
      // Para DCTFs Em Aberto, preferir backend (usa conferências/prazos vigentes); passamos months=6 por padrão
      const extraFilters = reportType === 'pendentes' ? { months: 6 } : {};
      const blob = await relatoriosService.generateAndDownload({ reportType, format, ...(extraFilters as any) });

      // Se o backend retornar JSON (erro), exibir mensagem
      if (blob.type && blob.type.includes('application/json')) {
        try {
          const text = await blob.text();
          const parsed = JSON.parse(text);
          alert(parsed?.message || parsed?.error || 'Falha ao gerar relatório.');
        } catch {
          alert('Falha ao gerar relatório.');
        }
        return;
      }

      // Fallback para blobs vazios
      if (!blob || (blob as any).size === 0) {
        alert('Relatório retornou vazio.');
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = `${reportType}-report`.replace(/[^a-zA-Z0-9-_]+/g, '_');
      link.href = url;
      link.download = `${safeTitle}_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      // Tentar disparar o download
      try {
        link.click();
      } catch {
        // Fallback: abrir em nova aba
        window.open(url, '_blank');
      }
      setTimeout(() => {
        link.remove();
        window.URL.revokeObjectURL(url);
      }, 0);
      await fetchData({ page: 1, limit });
      setPage(1);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
    } finally {
      setGeneratingTarget(null);
    }
  };

  // Geração client-side: Relatório de Pagamentos Pendentes (XLSX)
  const gerarRelatorioPagamentosPendentesXLSX = async () => {
    try {
      const res = await fetch('/api/receita-pagamentos');
      if (!res.ok) {
        throw new Error(`Falha ao buscar pagamentos (${res.status})`);
      }
      const body = await res.json();
      const data: any[] = body?.data ?? [];

      // Agrupar por CNPJ e por numeroDocumento (estrutura pai -> filhos)
      const byCliente = new Map<string, { nome: string; cnpj: string; documentos: Map<string, any[]> }>();
      data.forEach((item: any) => {
        const cnpjOriginal = item.cnpj || item.cnpj_contribuinte || '';
        const cnpjLimpo = String(cnpjOriginal).replace(/\D/g, '');
        const chave = cnpjLimpo.length === 14 ? cnpjLimpo : (cnpjOriginal || 'SEM_CNPJ');
        if (!byCliente.has(chave)) {
          byCliente.set(chave, {
            nome: item.clienteNome || chave,
            cnpj: chave,
            documentos: new Map(),
          });
        }
        const cli = byCliente.get(chave)!;
        const ndoc = item.numeroDocumento;
        if (!cli.documentos.has(ndoc)) cli.documentos.set(ndoc, []);
        cli.documentos.get(ndoc)!.push(item);
      });

      const formatDate = (s: string) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');
      const maskCNPJ = (value: string) => {
        const digits = String(value).replace(/\D/g, '');
        if (digits.length <= 2) return digits;
        if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
        if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
        if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
      };

      // Montagem com ExcelJS para suportar estilos de cabeçalho
      const header = [
        'Cliente',
        'CNPJ',
        'Nº Documento / Seq',
        'Tipo / Descrição',
        'Competência/Período',
        'Vencimento',
        'Arrecadação',
        'Valor',
        'Saldo',
        'Status',
        'Cód Receita',
      ];
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Pagamentos Pendentes', {
        views: [{ state: 'frozen', ySplit: 1 }], // Cabeçalho fixo
      });
      sheet.addRow(header);

      // Iterar por cliente
      for (const [, cli] of byCliente) {
        for (const [, registros] of cli.documentos) {
          const semSeq = registros.filter((r) => !r.sequencial);
          const comSeq = registros.filter((r) => r.sequencial);
          const pai = semSeq[0] || { ...comSeq[0] } || registros[0];
          if (!pai) continue;
          const saldoPai = Number(pai.valorSaldoDocumento ?? 0);
          const temFilhoPendente = comSeq.some((f: any) => (f.valorSaldoLinha ?? f.valorSaldoDocumento ?? 0) > 0);
          if (saldoPai <= 0 && !temFilhoPendente) continue; // só pendentes
          // Linha do Pai no formato plano
          sheet.addRow([
            cli.nome,
            maskCNPJ(cli.cnpj),
            pai.numeroDocumento,
            pai.tipoDocumento || '—',
            (pai.competencia || pai.periodoApuracao?.substring(0, 7) || '—'),
            formatDate(pai.dataVencimento),
            formatDate(pai.dataArrecadacao),
            pai.valorDocumento ?? 0,
            pai.valorSaldoDocumento ?? 0,
            (Number(pai.valorSaldoDocumento ?? 0) === 0 ? 'Pago' : 'Pendente'),
            '', // código receita (somente filhos)
          ]);
          // filhos
          comSeq
            .sort((a: any, b: any) => Number(a.sequencial || 0) - Number(b.sequencial || 0))
            .forEach((f: any, idx: number) => {
              const saldoFilho = f.valorSaldoLinha ?? f.valorSaldoDocumento ?? 0;
              if (saldoFilho <= 0) return;
              sheet.addRow([
                cli.nome,
                maskCNPJ(cli.cnpj),
                `#${f.sequencial || idx + 1}`,
                f.descricaoReceitaLinha || '—',
                f.periodoApuracaoLinha ? formatDate(f.periodoApuracaoLinha).substring(3) : (f.competencia || '—'),
                f.dataVencimentoLinha ? formatDate(f.dataVencimentoLinha) : '—',
                '—',
                f.valorLinha ?? f.valorDocumento ?? 0,
                saldoFilho,
                (Number(saldoFilho) === 0 ? 'Pago' : 'Pendente'),
                f.codigoReceitaLinha || '—',
              ]);
            });
          // Linha em branco após cada bloco (pai + filhos) para leitura
          sheet.addRow(['', '', '', '', '', '', '', '', '', '', '']);
        }
      }

      // Estilos: cabeçalho azul, fonte branca, centralizado; altura linhas
      sheet.getRow(1).height = 30;
      sheet.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      });
      sheet.eachRow((row, number) => {
        if (number !== 1) row.height = 25;
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
        });
      });
      // Larguras aproximadas com base no conteúdo
      for (let c = 1; c <= header.length; c++) {
        let max = header[c - 1].length + 2;
        sheet.eachRow((row) => {
          const v = row.getCell(c).value as any;
          const len = String(v ?? '').length + 2;
          if (len > max) max = len;
        });
        sheet.getColumn(c).width = Math.min(60, Math.max(10, max));
      }

      const wbout = await workbook.xlsx.writeBuffer();
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pagamentos_pendentes_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Falha ao gerar relatório de pagamentos pendentes.');
    }
  };

  // Geração client-side: DCTFs Em Aberto (fallback – só se backend indisponível)
  const gerarRelatorioDCTFPendentesXLSX = async () => {
    // Buscar todas DCTFs (sem filtro de status para garantir retorno)
    const { items } = await dctfService.getAll({ limit: 1000, page: 1 });
    // Fallback: se API não suportar status, filtrar manualmente
    const pendentes = (items || []).filter((d: any) => {
      const status = String(d.status || d.situacao || '').toLowerCase();
      const isPendente = status.includes('pend') || status.includes('abert') || status.includes('nao') || (d.saldoAPagar ?? 0) > 0;
      return isPendente;
    });
    // Agrupar por CNPJ e pegar o último por período
    const byCnpj = new Map<string, any>();
    pendentes.forEach(d => {
      const cnpj = d.cliente?.cnpj || d.cliente?.cnpj_limpo || d.numeroIdentificacao || '';
      const key = String(cnpj).replace(/\D/g, '');
      const cur = byCnpj.get(key);
      if (!cur) {
        byCnpj.set(key, d);
      } else {
        // comparar período/ data
        const pA = new Date(String(d.periodoApuracao || d.periodo) + '-01');
        const pB = new Date(String(cur.periodoApuracao || cur.periodo) + '-01');
        if (pA > pB) byCnpj.set(key, d);
      }
    });
    const header = [
      'Cliente',
      'CNPJ',
      'Período',
      'Status',
      'Data Declaração',
      'Data Transmissão',
      'Débito Apurado',
      'Saldo a Pagar',
    ];
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('DCTFs Em Aberto', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(header);
    Array.from(byCnpj.values()).forEach((d: any) => {
      sheet.addRow([
        d.cliente?.nome || d.cliente?.razao_social || '—',
        d.cliente?.cnpj || d.cliente?.cnpj_limpo || '—',
        d.periodoApuracao || d.periodo || '—',
        d.status || d.situacao || '—',
        d.dataDeclaracao ? new Date(d.dataDeclaracao).toLocaleDateString('pt-BR') : '—',
        d.dataTransmissao ? new Date(d.dataTransmissao).toLocaleDateString('pt-BR') : '—',
        d.debitoApurado ?? 0,
        d.saldoAPagar ?? 0,
      ]);
    });
    // Estilo cabeçalho
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    });
    // Linhas e alinhamento
    sheet.eachRow((row, idx) => {
      if (idx !== 1) row.height = 25;
      row.eachCell((cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      });
    });
    // Larguras
    for (let c = 1; c <= header.length; c++) {
      let max = header[c - 1].length + 2;
      sheet.eachRow((row) => {
        const v = row.getCell(c).value as any;
        const len = String(v ?? '').length + 2;
        if (len > max) max = len;
      });
      sheet.getColumn(c).width = Math.min(60, Math.max(10, max));
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dctfs_em_aberto_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Relatórios</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {[
          { key: 'gerencial', title: 'Relatório Gerencial', description: 'Visão consolidada das DCTFs monitoradas.' },
          { key: 'conferencia', title: 'Relatório de Conferências', description: 'Pendências legais e conferência de prazos.' },
          { key: 'clientes', title: 'Relatório de Clientes', description: 'Resumo por contribuinte com saldos e status.' },
          { key: 'dctf', title: 'Relatório DCTF', description: 'Lista detalhada das declarações transmitidas.' },
          { key: 'pendentes', title: 'DCTFs Em Aberto', description: 'Declarações em aberto com prazo vigente e últimos registros DCTF.' },
          { key: 'pagamentos-pendentes', title: 'Pagamentos Pendentes', description: 'Pagamentos em aberto por cliente e documento (estrutura Pai → Filho).' },
        ].map(card => (
          <div key={card.key} className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 flex flex-col gap-3 items-center justify-center text-center">
            <div>
              <h2 className="text-base font-medium text-gray-800 text-center">{card.title}</h2>
              <p className="text-xs text-gray-500 text-center mt-2">{card.description}</p>
            </div>
            <div className="flex gap-3 justify-center w-full">
              <button
                onClick={() => handleGenerate(card.key as any, 'xlsx')}
                disabled={generatingTarget === `${card.key}-xlsx`}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 text-center"
              >
                {generatingTarget === `${card.key}-xlsx` ? 'Gerando…' : 'Gerar XLSX'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
        <h2 className="text-base font-medium text-gray-800 mb-3">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <label className="flex flex-col text-xs text-gray-600">
            Tipo de relatório
            <select
              value={tipoRelatorio}
              onChange={(e) => setTipoRelatorio(e.target.value)}
              className="mt-1 px-2 py-1 border rounded"
            >
              <option value="">Todos</option>
              <option value="gerencial">Relatório Gerencial</option>
              <option value="conferencia">Relatório de Conferências</option>
              <option value="clientes">Relatório de Clientes</option>
              <option value="dctf">Relatório DCTF</option>
              <option value="pendentes">DCTFs Em Aberto</option>
              <option value="pagamentos-pendentes">Pagamentos Pendentes</option>
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded mb-4">
          {error}
          <button onClick={clearError} className="ml-3 underline">
            fechar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-gray-600">
          {loading ? 'Carregando…' : total != null && totalPages != null ? `Página ${page} de ${totalPages} — Total: ${total}` : `Total exibido: ${filtered.length}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50 text-xs"
          >
            Anterior
          </button>
          <span className="text-xs">
            Página {page}
            {totalPages != null ? ` de ${totalPages}` : ''}
          </span>
          <button
            disabled={!canGoNext}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50 text-xs"
          >
            Próxima
          </button>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="ml-2 px-2 py-1 border rounded text-xs">
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Formato</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Declaração</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criado em</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-900">
                  <div className="flex flex-col">
                    <span>{r.titulo}</span>
                    {r.notes && <span className="text-xs text-gray-500">{r.notes}</span>}
                    {r.period && <span className="text-xs text-gray-500">Competência: {r.period}</span>}
                    {r.responsible && <span className="text-xs text-gray-500">Responsável: {r.responsible}</span>}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{r.tipoRelatorio}</td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{r.formato?.toUpperCase() ?? (r.arquivoPdf ? 'PDF' : '—')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{r.declaracaoId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-xs flex flex-col md:flex-row md:items-center md:gap-3 gap-2">
                  {r.downloadUrl ? (
                    <button
                      onClick={() => handleDownload(r.id, r.titulo, r.formato ?? 'pdf')}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Baixar {r.formato?.toUpperCase() ?? 'PDF'}
                    </button>
                  ) : null}
                  {r.arquivoPdf && !r.downloadUrl ? (
                    <a href={r.arquivoPdf} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                      Baixar PDF
                    </a>
                  ) : null}
                  {r.arquivoXlsx ? (
                    <a href={r.arquivoXlsx} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                      Baixar XLSX
                    </a>
                  ) : null}
                  {!r.downloadUrl && !r.arquivoPdf && !r.arquivoXlsx ? (
                    <span className="text-gray-400">Sem arquivo</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RelatoriosPage;
