import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { useRelatorios } from '../hooks/useRelatorios';
import { relatoriosService } from '../services/relatorios';
import { dctfService } from '../services/dctf';
import { clientesService } from '../services/clientes';
import {
  ChartBarIcon,
  DocumentCheckIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  FunnelIcon,
  TableCellsIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

const RelatoriosPage: React.FC = () => {
  const { items, load, loading, error, clearError } = useRelatorios();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [tipoRelatorio, setTipoRelatorio] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [generatingTarget, setGeneratingTarget] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string | null; titulo: string; countdown: number }>({ id: null, titulo: '', countdown: 0 });
  const [deleteTimer, setDeleteTimer] = useState<NodeJS.Timeout | null>(null);

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

  const handleDeleteClick = (id: string, titulo: string) => {
    // Limpar timer anterior se existir
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    
    // Iniciar contagem regressiva de 3 segundos
    setPendingDelete({ id, titulo, countdown: 3 });
    
    let countdown = 3;
    const timer = setInterval(() => {
      countdown -= 1;
      setPendingDelete(prev => ({ ...prev, countdown }));
      
      if (countdown <= 0) {
        clearInterval(timer);
        setDeleteTimer(null);
        // Executar exclusão automaticamente
        executeDelete(id);
      }
    }, 1000);
    
    setDeleteTimer(timer);
  };

  const cancelDelete = () => {
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    setPendingDelete({ id: null, titulo: '', countdown: 0 });
  };

  const executeDelete = async (id: string) => {
    // Limpar estado de exclusão pendente
    setPendingDelete({ id: null, titulo: '', countdown: 0 });

    try {
      const res = await fetch(`/api/dashboard/admin/reports/history/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Atualizar lista
        await fetchData({ page, limit });
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.error || 'Erro ao excluir relatório');
      }
    } catch (e: any) {
      alert('Erro ao excluir relatório');
    }
  };

  // Limpar timer ao desmontar componente
  useEffect(() => {
    return () => {
      if (deleteTimer) {
        clearInterval(deleteTimer);
      }
    };
  }, [deleteTimer]);

  const handleGenerate = async (reportType: 'gerencial' | 'clientes' | 'dctf' | 'conferencia' | 'pendentes' | 'participacao', format: 'pdf' | 'xlsx') => {
    try {
      setGeneratingTarget(`${reportType}-${format}`);
      // Tratamentos especiais gerados no front
      if (reportType === 'participacao') {
        await gerarRelatorioParticipacaoXLSX();
        await fetchData({ page: 1, limit });
        setPage(1);
        return;
      }
      // Para DCTFs Em Aberto, buscar todas as pendentes independente da vigência
      const extraFilters = reportType === 'pendentes' ? { months: 12 } : {};
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

  // Geração client-side: Relatório de Participação Societária
  const gerarRelatorioParticipacaoXLSX = async () => {
    try {
      // Buscar todos os clientes (matrizes) com seus sócios
      let todosClientes: any[] = [];
      let pagina = 1;
      const limite = 100;
      let temMais = true;

      while (temMais) {
        const resposta = await clientesService.getAll({ page: pagina, limit: limite });
        const clientes = resposta.items || [];
        
        // Filtrar apenas matrizes
        const matrizes = clientes.filter((c: any) => c.tipo_empresa === 'Matriz');
        
        // Buscar sócios para cada matriz
        for (const cliente of matrizes) {
          try {
            const clienteCompleto = await clientesService.obterCliente(cliente.id);
            let clienteComSocios: any;
            
            if ((clienteCompleto as any).success && (clienteCompleto as any).data) {
              clienteComSocios = (clienteCompleto as any).data;
            } else if ((clienteCompleto as any).id) {
              clienteComSocios = clienteCompleto;
            } else {
              clienteComSocios = cliente;
            }
            
            todosClientes.push(clienteComSocios);
          } catch (err) {
            console.warn(`Erro ao buscar sócios para cliente ${cliente.id}:`, err);
            todosClientes.push(cliente);
          }
        }
        
        temMais = clientes.length === limite && (resposta.pagination?.totalPages || 0) > pagina;
        pagina++;
        
        // Pequeno delay para não sobrecarregar o servidor
        if (temMais) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // Funções auxiliares
      const formatarCNPJ = (cnpj: string) => {
        const digits = String(cnpj || '').replace(/\D/g, '');
        if (digits.length !== 14) return cnpj || '';
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
      };

      const formatarCPF = (cpf: string) => {
        const digits = String(cpf || '').replace(/\D/g, '');
        if (digits.length !== 11) return cpf || '';
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
      };

      const formatarCpfCnpj = (valor: string) => {
        if (!valor) return '';
        const digits = String(valor).replace(/\D/g, '');
        if (digits.length === 11) return formatarCPF(valor);
        if (digits.length === 14) return formatarCNPJ(valor);
        return valor;
      };

      const formatarMoeda = (valor: number | string | null | undefined) => {
        if (valor === null || valor === undefined || valor === '') return 'R$ 0,00';
        const num = typeof valor === 'string' ? parseFloat(valor.replace(/[^\d,.-]/g, '').replace(',', '.')) : Number(valor);
        if (isNaN(num)) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
      };

      const formatarPercentual = (valor: number | string | null | undefined) => {
        if (valor === null || valor === undefined || valor === '') return '0,00%';
        const num = typeof valor === 'string' ? parseFloat(valor.replace(',', '.')) : Number(valor);
        if (isNaN(num)) return '0,00%';
        return `${num.toFixed(2).replace('.', ',')}%`;
      };

      // Cabeçalhos
      const header = [
        'Empresa',
        'CNPJ',
        'Capital Social',
        'Sócio',
        'CPF / CNPJ',
        'Qualificação',
        'Participação %',
        'Participação Valor',
      ];

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Participação Societária', {
        views: [{ state: 'frozen', ySplit: 1 }], // Cabeçalho fixo
      });

      sheet.addRow(header);

      // Adicionar dados
      todosClientes.forEach((cliente, indexCliente) => {
        const socios = cliente.socios || [];
        const temSocios = socios.length > 0;

        if (temSocios) {
          // Adicionar uma linha para cada sócio
          socios.forEach((socio: any, indexSocio: number) => {
            sheet.addRow([
              indexSocio === 0 ? cliente.razao_social || cliente.nome || '—' : '', // Nome da empresa apenas na primeira linha
              indexSocio === 0 ? formatarCNPJ(cliente.cnpj_limpo || cliente.cnpj || '') : '', // CNPJ apenas na primeira linha
              indexSocio === 0 ? formatarMoeda(cliente.capital_social) : '', // Capital Social apenas na primeira linha
              socio.nome || '—',
              formatarCpfCnpj(socio.cpf || ''),
              socio.qual || socio.qualificacao || '—',
              formatarPercentual(socio.participacao_percentual),
              formatarMoeda(socio.participacao_valor),
            ]);
          });
        } else {
          // Se não tem sócios, adicionar apenas a linha da empresa
          sheet.addRow([
            cliente.razao_social || cliente.nome || '—',
            formatarCNPJ(cliente.cnpj_limpo || cliente.cnpj || ''),
            formatarMoeda(cliente.capital_social),
            '—',
            '—',
            '—',
            '—',
            '—',
          ]);
        }

        // Adicionar 2 linhas em branco entre empresas (exceto após a última)
        if (indexCliente < todosClientes.length - 1) {
          sheet.addRow(['', '', '', '', '', '', '', '']);
          sheet.addRow(['', '', '', '', '', '', '', '']);
        }
      });

      // Estilos: cabeçalho azul, fonte branca, centralizado; altura linhas
      sheet.getRow(1).height = 30;
      sheet.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      sheet.eachRow((row, number) => {
        if (number !== 1) row.height = 25;
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          };
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
        sheet.getColumn(c).width = Math.min(60, Math.max(15, max));
      }

      const wbout = await workbook.xlsx.writeBuffer();
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Fazer download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = `participacao_societaria_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Salvar no histórico
      try {
        const formData = new FormData();
        formData.append('file', blob, fileName);
        formData.append('tipoRelatorio', 'participacao');
        formData.append('titulo', `Participação Societária - ${new Date().toLocaleDateString('pt-BR')}`);
        formData.append('formato', 'xlsx');

        const saveResponse = await fetch('/api/dashboard/admin/reports/history', {
          method: 'POST',
          body: formData,
        });

        if (!saveResponse.ok) {
          console.warn('Falha ao salvar relatório no histórico:', await saveResponse.text());
        }
      } catch (saveError) {
        console.warn('Erro ao salvar relatório no histórico:', saveError);
        // Não bloquear o download se falhar ao salvar
      }
    } catch (e: any) {
      alert(e?.message || 'Falha ao gerar relatório de participação societária.');
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

  const reportCards = [
    { key: 'gerencial', title: 'Relatório Gerencial', description: 'Visão consolidada das DCTFs monitoradas', icon: ChartBarIcon, color: 'blue', anchor: 'historico' },
    { key: 'conferencia', title: 'Relatório de Conferências', description: 'Pendências legais e conferência de prazos', icon: DocumentCheckIcon, color: 'purple', anchor: 'historico' },
    { key: 'clientes', title: 'Relatório de Clientes', description: 'Resumo por contribuinte com saldos e status', icon: BuildingOfficeIcon, color: 'indigo', anchor: 'historico' },
    { key: 'dctf', title: 'Relatório DCTF', description: 'Lista detalhada das declarações transmitidas', icon: DocumentTextIcon, color: 'green', anchor: 'historico' },
    { key: 'pendentes', title: 'DCTFs Em Aberto', description: 'Declarações em aberto com prazo vigente', icon: ExclamationTriangleIcon, color: 'orange', anchor: 'historico' },
    { key: 'participacao', title: 'Participação Societária', description: 'Exportação de empresas e seus sócios', icon: UserGroupIcon, color: 'teal', anchor: 'historico' },
  ];

  const scrollToAnchor = (anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
    purple: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
    green: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
    orange: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
    red: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
    teal: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100',
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Relatórios</h1>
        <p className="text-base text-gray-600">Gere e gerencie relatórios do sistema</p>
      </div>

      {/* Cards de Geração */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <ChartBarIcon className="h-5 w-5 text-gray-600" />
          Gerar Novo Relatório
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportCards.map(card => {
            const Icon = card.icon;
            const isGenerating = generatingTarget === `${card.key}-xlsx`;
            const glowClass = `glow-button-${card.color}`;
            return (
              <div
                key={card.key}
                onClick={() => scrollToAnchor(card.anchor)}
                className={`bg-white border-2 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer ${colorClasses[card.color as keyof typeof colorClasses]}`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`p-3 rounded-lg bg-white/80 ${colorClasses[card.color as keyof typeof colorClasses].split(' ')[0]}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{card.title}</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerate(card.key as any, 'xlsx');
                      setTimeout(() => scrollToAnchor(card.anchor), 500);
                    }}
                    disabled={isGenerating}
                    className={`${glowClass} w-full px-4 py-2.5 bg-white border-2 border-current rounded-lg font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 relative z-0`}
                  >
                    {isGenerating ? (
                      <>
                        <svg className="animate-spin h-4 w-4 relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="relative z-10">Gerando...</span>
                      </>
                    ) : (
                      <>
                        <TableCellsIcon className="h-4 w-4 relative z-10" />
                        <span className="relative z-10">Gerar XLSX</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filtros e Histórico */}
      <div id="historico" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-gray-600" />
            Histórico de Relatórios
          </h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span className="whitespace-nowrap">Filtrar por tipo:</span>
              <select
                value={tipoRelatorio}
                onChange={(e) => setTipoRelatorio(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos</option>
                <option value="gerencial">Relatório Gerencial</option>
                <option value="conferencia">Relatório de Conferências</option>
                <option value="clientes">Relatório de Clientes</option>
                <option value="dctf">Relatório DCTF</option>
                <option value="pendentes">DCTFs Em Aberto</option>
                <option value="participacao">Participação Societária</option>
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={clearError} className="text-red-600 hover:text-red-800 font-medium">
              ✕
            </button>
          </div>
        )}

        {/* Paginação Superior */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Carregando...
              </span>
            ) : total != null && totalPages != null ? (
              <span className="font-medium">Total: <span className="text-gray-900">{total}</span> relatórios</span>
            ) : (
              <span>Exibindo {filtered.length} relatórios</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-700 font-medium">
                Página {page}{totalPages != null ? ` de ${totalPages}` : ''}
              </span>
              <button
                disabled={!canGoNext}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Título</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Formato</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Criado em</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <DocumentTextIcon className="h-12 w-12 text-gray-400" />
                      <p className="text-gray-500 font-medium">Nenhum relatório encontrado</p>
                      <p className="text-sm text-gray-400">Gere um novo relatório usando os cards acima</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{r.titulo}</span>
                        <div className="mt-1 space-y-0.5">
                          {r.notes && <span className="text-xs text-gray-500 block">{r.notes}</span>}
                          {r.period && <span className="text-xs text-gray-500 block">Competência: {r.period}</span>}
                          {r.responsible && <span className="text-xs text-gray-500 block">Responsável: {r.responsible}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {r.tipoRelatorio}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {r.formato?.toUpperCase() ?? (r.arquivoPdf ? 'PDF' : '—')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {r.downloadUrl ? (
                          <button
                            onClick={() => handleDownload(r.id, r.titulo, r.formato ?? 'pdf')}
                            className="glow-border-linear px-3 py-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors border-2 border-emerald-600 relative z-0"
                          >
                            <span className="relative z-10">Baixar {r.formato?.toUpperCase() ?? 'PDF'}</span>
                          </button>
                        ) : r.arquivoPdf && !r.downloadUrl ? (
                          <a
                            href={r.arquivoPdf}
                            target="_blank"
                            rel="noreferrer"
                            className="glow-border-linear px-3 py-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors border-2 border-emerald-600 relative z-0 inline-block"
                          >
                            <span className="relative z-10">Baixar PDF</span>
                          </a>
                        ) : r.arquivoXlsx ? (
                          <a
                            href={r.arquivoXlsx}
                            target="_blank"
                            rel="noreferrer"
                            className="glow-border-linear px-3 py-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors border-2 border-emerald-600 relative z-0 inline-block"
                          >
                            <span className="relative z-10">Baixar XLSX</span>
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400">Sem arquivo</span>
                        )}
                        <button
                          onClick={() => handleDeleteClick(r.id, r.titulo)}
                          className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert de exclusão pendente */}
      {pendingDelete.id && pendingDelete.countdown > 0 && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg shadow-2xl px-6 py-4 min-w-[320px] animate-toast-fade-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">
                  Exclusão em {pendingDelete.countdown} segundo{pendingDelete.countdown !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-white/90 mt-1">
                  Relatório: {pendingDelete.titulo}
                </p>
              </div>
            </div>
            
            {/* Barra de progresso */}
            <div className="w-full bg-yellow-200/30 rounded-full h-2 mb-3">
              <div 
                className="bg-white h-2 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${(pendingDelete.countdown / 3) * 100}%` }}
              />
            </div>
            
            {/* Botão de cancelar */}
            <button
              onClick={cancelDelete}
              className="w-full px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors font-medium"
            >
              Cancelar Exclusão
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes toast-fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-toast-slide-in {
          animation: toast-slide-in 0.3s ease-out;
        }
        .animate-toast-fade-in {
          animation: toast-fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default RelatoriosPage;
