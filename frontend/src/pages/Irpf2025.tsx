import React, { useState, useEffect } from 'react';
import { useClientes } from '../hooks/useClientes';
import { irpfService, type FaturamentoAnual } from '../services/irpf';
import type { Cliente } from '../types';
import {
  BuildingOfficeIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  CurrencyDollarIcon,
  ArrowUpIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import ExcelJS from 'exceljs';

const Irpf2025: React.FC = () => {
  const { loadClientes } = useClientes();
  const [todosClientes, setTodosClientes] = useState<Cliente[]>([]);
  const [clientesComDados, setClientesComDados] = useState<
    Map<
      string,
      {
        cliente: Cliente;
        faturamento: FaturamentoAnual[];
        loadingFaturamento: boolean;
        errorFaturamento?: string;
        carregado: boolean;
      }
    >
  >(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [anoAtual] = useState(new Date().getFullYear());
  const [loadingClientes, setLoadingClientes] = useState(true);
  const carregandoRef = React.useRef(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showAvisoFaturamento, setShowAvisoFaturamento] = useState(() => {
    // Verificar se o usuário já fechou o aviso anteriormente
    const fechado = localStorage.getItem('irpf-aviso-faturamento-fechado');
    return fechado !== 'true';
  });
  const [exportando, setExportando] = useState(false);
  
  // Sempre os últimos 2 anos completos (ex: 2024 e 2025 se estamos em 2026)
  const anosParaBuscar = [anoAtual - 2, anoAtual - 1];

  // Carregar todos os clientes de uma vez (como na aba participação)
  useEffect(() => {
    if (carregandoRef.current) return;
    if (todosClientes.length > 0) return; // Já carregou
    
    carregandoRef.current = true;
    setLoadingClientes(true);

    const carregarTodosClientes = async () => {
      try {
        const todosClientesArray: Cliente[] = [];
        let pagina = 1;
        let temMais = true;

        while (temMais) {
          const resultado = await loadClientes({
            page: pagina,
            limit: 100, // Máximo permitido pelo backend
            search: '',
          });

          todosClientesArray.push(...resultado.items);
          
          if (resultado.pagination) {
            temMais = pagina < resultado.pagination.totalPages;
            pagina++;
          } else {
            temMais = resultado.items.length === 100; // Se retornou 100, pode ter mais
            pagina++;
          }

          // Delay menor para ser mais rápido
          if (temMais) {
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
        }

        // Só atualizar estados quando TODOS os clientes estiverem carregados
        // Isso garante que a lista apareça de uma vez (como na participação)
        setTodosClientes(todosClientesArray);
        await inicializarClientes(todosClientesArray);
      } catch (error: any) {
        console.error('Erro ao carregar clientes:', error);
      } finally {
        setLoadingClientes(false);
        carregandoRef.current = false;
      }
    };

    carregarTodosClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inicializarClientes = async (clientesList: Cliente[]) => {
    // Filtrar apenas matrizes (mesma lógica da aba Participação)
    const apenasMatrizes = clientesList.filter(
      (c) => c.tipo_empresa === 'Matriz'
    );
    
    // Filtrar apenas matrizes com código SCI
    const clientesComCodigoSCI = apenasMatrizes.filter(
      (c) => c.codigo_sci && !isNaN(Number(c.codigo_sci))
    );

    // Primeiro, inicializar o map com os clientes
    setClientesComDados((prev) => {
      const novoMap = new Map(prev);
      
      clientesComCodigoSCI.forEach((cliente) => {
        // Só adicionar se ainda não existe no map
        if (!novoMap.has(cliente.id)) {
          novoMap.set(cliente.id, {
            cliente,
            faturamento: [],
            loadingFaturamento: false,
            carregado: false,
          });
        }
        // Se já existe, manter os dados existentes (incluindo faturamento carregado)
      });

      return novoMap;
    });

    // Depois, carregar automaticamente os dados do cache para todos os clientes
    // Isso garante que os dados sejam restaurados quando a página é recarregada
    try {
      const promises = clientesComCodigoSCI.map(async (cliente) => {
        try {
          const result = await irpfService.buscarApenasCache(cliente.id, anosParaBuscar);
          const data = result.data || [];
          const empresas = result.empresas;

          // Somar matriz + filiais quando houver múltiplos estabelecimentos (mesmo critério da aba Faturamento SCI)
          const faturamentoCompleto = (() => {
            if (empresas && empresas.length > 0) {
              return anosParaBuscar.map((ano) => {
                let valorTotal = 0;
                let mediaMensal = 0;
                for (const emp of empresas) {
                  const item = emp.data?.find((f: FaturamentoAnual) => f.ano === ano);
                  if (item) {
                    valorTotal += item.valorTotal ?? 0;
                    mediaMensal += item.mediaMensal ?? 0;
                  }
                }
                return { ano, valorTotal, mediaMensal, meses: [] };
              });
            }
            return anosParaBuscar.map((ano) => {
              const encontrado = data.find((f: FaturamentoAnual) => f.ano === ano);
              return encontrado || { ano, valorTotal: 0, mediaMensal: 0, meses: [] };
            });
          })();

          setClientesComDados((prev) => {
            const novo = new Map(prev);
            const atual = novo.get(cliente.id);
            if (atual) {
              novo.set(cliente.id, {
                ...atual,
                faturamento: faturamentoCompleto,
                carregado: true,
                loadingFaturamento: false,
                errorFaturamento: undefined,
              });
            }
            return novo;
          });
        } catch (error: any) {
          // Se não encontrar no cache, não é erro - apenas não marca como carregado
          console.log(`[IRPF] Cache não encontrado para cliente ${cliente.id}:`, error.message);
          // Não atualizar o estado - deixar como não carregado para o usuário poder carregar manualmente
        }
      });

      // Aguardar todas as requisições, mas não bloquear se algumas falharem
      await Promise.allSettled(promises);
    } catch (error: any) {
      console.error('[IRPF] Erro ao carregar cache inicial:', error);
    }
  };

  // Detectar scroll para mostrar botão "voltar ao topo"
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const shouldShow = scrollY > 300;
      setShowScrollToTop(shouldShow);
      
      // Notificar Layout para esconder/mostrar o menu lateral
      if (shouldShow) {
        window.dispatchEvent(new CustomEvent('showScrollToTopButton'));
      } else {
        window.dispatchEvent(new CustomEvent('hideScrollToTopButton'));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Função para voltar ao topo
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Função para exportar dados do IRPF
  const handleExportarIRPF = async () => {
    if (exportando) return;
    
    setExportando(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('IRPF 2026', {
        views: [{ 
          state: 'frozen', 
          ySplit: 1,
          showGridLines: false // Remover linhas de grade
        }],
      });

      // Cabeçalhos
      const headers = [
        'CNPJ',
        'RAZÃO SOCIAL',
        'NOME SÓCIO',
        'CPF SÓCIO',
        'QUALIFICAÇÃO SÓCIO',
        'PARTICIPAÇÃO %',
        'VALOR PARTICIPAÇÃO',
        'FATURAMENTO 2024',
        'FATURAMENTO 2025',
      ];

      // Adicionar cabeçalhos na linha 1
      const headerRow = sheet.addRow(headers);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF10B981' }, // Verde esmeralda
        };
        cell.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
          size: 12,
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        // Bordas discretas apenas no cabeçalho
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });

      // Processar dados
      const dataRows: any[][] = [];
      let cnpjAnterior = '';
      
      clientesFiltrados.forEach((item, index) => {
        const { cliente, faturamento } = item;
        const capitalSocial =
          typeof cliente.capital_social === 'string'
            ? parseFloat(cliente.capital_social)
            : cliente.capital_social || 0;

        const cnpj = formatarCNPJ(cliente.cnpj_limpo || cliente.cnpj || '');
        const razaoSocial = cliente.razao_social || cliente.nome || 'Sem nome';
        
        // Se é um novo CNPJ e não é o primeiro, adicionar 2 linhas em branco
        if (index > 0 && cnpj !== cnpjAnterior && cnpjAnterior !== '') {
          dataRows.push([]); // Linha em branco 1
          dataRows.push([]); // Linha em branco 2
        }
        
        cnpjAnterior = cnpj;
        
        // Obter faturamentos (sempre 2024 e 2025)
        const fat2024 = faturamento.find((f) => f.ano === 2024);
        const fat2025 = faturamento.find((f) => f.ano === 2025);
        const valorFat2024 = typeof fat2024?.valorTotal === 'number' ? fat2024.valorTotal : parseFloat(String(fat2024?.valorTotal || 0));
        const valorFat2025 = typeof fat2025?.valorTotal === 'number' ? fat2025.valorTotal : parseFloat(String(fat2025?.valorTotal || 0));

        // Se tem sócios, criar uma linha por sócio
        if (cliente.socios && cliente.socios.length > 0) {
          cliente.socios.forEach((socio) => {
            let participacaoPercentual = typeof socio.participacao_percentual === 'number' 
              ? socio.participacao_percentual 
              : parseFloat(String(socio.participacao_percentual || 0));
            
            // Garantir que participação seja no máximo 100% (se vier como 50.00 ao invés de 0.50, converter)
            if (participacaoPercentual > 1 && participacaoPercentual <= 100) {
              participacaoPercentual = participacaoPercentual / 100;
            } else if (participacaoPercentual > 100) {
              participacaoPercentual = 1; // Limitar a 100%
            }
            
            const participacaoValor = typeof socio.participacao_valor === 'number'
              ? socio.participacao_valor
              : parseFloat(String(socio.participacao_valor || (capitalSocial * participacaoPercentual)));

            dataRows.push([
              cnpj,
              razaoSocial,
              socio.nome || '-',
              socio.cpf || '-',
              socio.qual || '-',
              participacaoPercentual,
              participacaoValor,
              valorFat2024,
              valorFat2025,
            ]);
          });
        } else {
          // Se não tem sócios, criar uma linha sem dados de sócio
          dataRows.push([
            cnpj,
            razaoSocial,
            '-',
            '-',
            '-',
            null,
            null,
            valorFat2024,
            valorFat2025,
          ]);
        }
      });

        // Adicionar dados
      dataRows.forEach((row) => {
        // Se a linha está vazia (linha em branco entre CNPJs), adicionar linha vazia
        if (row.length === 0 || row.every(cell => cell === null || cell === '')) {
          sheet.addRow([]);
          return;
        }
        
        const dataRow = sheet.addRow(row);
        dataRow.height = 20;
        // Aplicar bordas discretas em todas as células desta linha (linha com dados)
        dataRow.eachCell((cell, colNumber) => {
          // Coluna 3 (NOME SÓCIO) deve ser alinhada à esquerda, demais colunas centralizadas
          const isNomeSocio = colNumber === 3;
          cell.alignment = {
            vertical: 'middle',
            horizontal: (colNumber <= 2 || isNomeSocio) ? 'left' : 'center',
            wrapText: false,
          };
          // Bordas discretas em todas as células da linha (linha com registros)
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
          
          // Formatação especial para colunas numéricas
          if (colNumber === 6) {
            // Coluna PARTICIPAÇÃO % - formato percentual com zeros à esquerda
            if (cell.value !== null && cell.value !== '-') {
              cell.numFmt = '00.00%';
            }
          } else if (colNumber === 7 || colNumber === 8 || colNumber === 9) {
            // Colunas de valores monetários (VALOR PARTICIPAÇÃO, FAT 2024, FAT 2025)
            if (cell.value !== null && cell.value !== '-') {
              cell.numFmt = 'R$ #,##0.00';
            }
          }
        });
      });

      // Ajustar largura das colunas
      sheet.columns = [
        { width: 18 }, // CNPJ
        { width: 40 }, // RAZÃO SOCIAL
        { width: 30 }, // NOME SÓCIO
        { width: 18 }, // CPF SÓCIO
        { width: 25 }, // QUALIFICAÇÃO SÓCIO
        { width: 15 }, // PARTICIPAÇÃO %
        { width: 20 }, // VALOR PARTICIPAÇÃO
        { width: 20 }, // FATURAMENTO 2024
        { width: 20 }, // FATURAMENTO 2025
      ];

      // Gerar arquivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dataExportacao = new Date().toISOString().split('T')[0];
      link.download = `irpf_2026_${dataExportacao}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erro ao exportar IRPF:', error);
      alert('Erro ao exportar dados: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setExportando(false);
    }
  };



  const formatarCNPJ = (cnpj?: string) => {
    if (!cnpj) return '-';
    const limpo = cnpj.replace(/\D/g, '');
    return limpo.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  };

  const formatarMoeda = (valor: number | string | null | undefined) => {
    if (valor === null || valor === undefined || valor === '') return 'R$ 0,00';
    
    // Converter string para número, removendo formatação se necessário
    let num: number;
    if (typeof valor === 'string') {
      // Remove espaços, pontos de milhar e substitui vírgula por ponto
      const limpo = valor.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      num = parseFloat(limpo);
    } else {
      num = valor;
    }
    
    if (isNaN(num) || num === 0) return 'R$ 0,00';
    
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatarPercentual = (valor: number | null | undefined) => {
    if (valor === null || valor === undefined) return '0,00%';
    return `${valor.toFixed(2)}%`;
  };

  const clientesFiltrados = Array.from(clientesComDados.values()).filter(
    (item) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const cnpj = item.cliente.cnpj?.toLowerCase() || '';
      const razaoSocial =
        item.cliente.razao_social?.toLowerCase() ||
        item.cliente.nome?.toLowerCase() ||
        '';
      return cnpj.includes(term) || razaoSocial.includes(term);
    }
  );

  const clientesComCodigoSCI = clientesFiltrados.length;
  const clientesCarregados = clientesFiltrados.filter((item) => item.carregado)
    .length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black opacity-10"></div>
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-3 flex items-center gap-3">
              <CurrencyDollarIcon className="h-8 w-8" />
              IRPF 2026
            </h1>
            <p className="text-emerald-100 text-lg">Dados para declaração de Imposto de Renda Pessoa Física 2026</p>
          </div>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-48 h-48 bg-white opacity-5 rounded-full blur-3xl"></div>
        </div>
      </div>

      {/* Busca */}
      <div className="mb-6">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por CNPJ ou Razão Social..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <button
            onClick={handleExportarIRPF}
            disabled={exportando || clientesFiltrados.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Exportar dados para Excel"
          >
            <ArrowDownTrayIcon className={`h-5 w-5 ${exportando ? 'animate-spin' : ''}`} />
            {exportando ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>
        {clientesComCodigoSCI > 0 && showAvisoFaturamento && (
          <div className="mt-4 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3 relative">
            <div className="flex-1 pr-4">
              <div className="text-sm text-gray-700">
                <span className="font-medium">{clientesComCodigoSCI}</span> cliente
                {clientesComCodigoSCI !== 1 ? 's' : ''} com código SCI
                {clientesCarregados > 0 && (
                  <span className="text-emerald-600 ml-2">
                    ({clientesCarregados} com faturamento carregado)
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                💡 Acesse as abas "Participação" e "Faturamento SCI" em Clientes para atualizar os dados de sócios e faturamento
              </div>
            </div>
            <button
              onClick={() => {
                setShowAvisoFaturamento(false);
                localStorage.setItem('irpf-aviso-faturamento-fechado', 'true');
              }}
              className="flex-shrink-0 p-1 hover:bg-emerald-100 rounded-full transition-colors duration-200"
              title="Fechar aviso"
              aria-label="Fechar aviso"
            >
              <XMarkIcon className="h-5 w-5 text-gray-500 hover:text-gray-700" />
            </button>
          </div>
        )}
        {clientesComCodigoSCI > 0 && !showAvisoFaturamento && (
          <div className="mt-4 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="text-sm text-gray-700">
              <span className="font-medium">{clientesComCodigoSCI}</span> cliente
              {clientesComCodigoSCI !== 1 ? 's' : ''} com código SCI
              {clientesCarregados > 0 && (
                <span className="text-emerald-600 ml-2">
                  ({clientesCarregados} com faturamento carregado)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {loadingClientes && (
        <div className="text-center py-12">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando clientes... Isso pode levar alguns segundos.</p>
        </div>
      )}

      {/* Só renderizar lista quando terminar de carregar (como na participação) */}
      {!loadingClientes && clientesFiltrados.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600">
            {searchTerm
              ? 'Nenhum cliente encontrado com os filtros aplicados.'
              : 'Nenhum cliente com código SCI encontrado.'}
          </p>
        </div>
      )}

      {/* Lista de Clientes - Só renderiza quando terminar de carregar */}
      {!loadingClientes && (
      <div className="space-y-6">
        {clientesFiltrados.map((item) => {
          const { cliente, faturamento, errorFaturamento } = item;
          const capitalSocial =
            typeof cliente.capital_social === 'string'
              ? parseFloat(cliente.capital_social)
              : cliente.capital_social || 0;

          return (
            <div
              key={cliente.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Cabeçalho */}
              <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-500 rounded-full p-3">
                      <BuildingOfficeIcon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {cliente.razao_social || cliente.nome || 'Sem nome'}
                      </h2>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm text-gray-600">
                          CNPJ: {formatarCNPJ(cliente.cnpj_limpo || cliente.cnpj || '')}
                        </span>
                        <span className="text-sm text-gray-600">
                          Capital Social: {formatarMoeda(capitalSocial)}
                        </span>
                        {cliente.codigo_sci && (
                          <span className="text-sm text-gray-600">
                            Código SCI: {cliente.codigo_sci}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {cliente.socios && cliente.socios.length > 0 && (
                    <div className="bg-emerald-100 px-3 py-1 rounded-full">
                      <span className="text-sm font-medium text-emerald-800">
                        {cliente.socios.length} sócio
                        {cliente.socios.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Seção Sócios */}
                {cliente.socios && cliente.socios.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-emerald-200">
                      <div className="bg-emerald-100 rounded-lg p-2">
                        <UserGroupIcon className="h-6 w-6 text-emerald-600" />
                      </div>
                      <h3 className="text-xl font-bold text-emerald-700">
                        Sócios ({cliente.socios.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Nome
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              CPF
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Qualificação
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Participação
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Valor
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {cliente.socios.map((socio, idx) => {
                            const participacaoValor =
                              socio.participacao_valor ||
                              (capitalSocial *
                                (socio.participacao_percentual || 0)) /
                                100;

                            return (
                              <tr key={socio.id || idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div className="bg-emerald-100 rounded-full w-8 h-8 flex items-center justify-center">
                                      <span className="text-sm font-medium text-emerald-700">
                                        {socio.nome.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <span className="text-sm text-gray-900">
                                      {socio.nome}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {socio.cpf || '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {socio.qual || '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-sm font-medium">
                                    {formatarPercentual(
                                      socio.participacao_percentual
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-green-700">
                                  {formatarMoeda(participacaoValor)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Seção Faturamento */}
                <div>
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-emerald-200">
                    <div className="bg-emerald-100 rounded-lg p-2">
                      <ChartBarIcon className="h-6 w-6 text-emerald-600" />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-700">
                      Faturamento
                    </h3>
                  </div>

                  {errorFaturamento ? (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg">
                      <p className="text-sm">
                        <strong>Aviso:</strong> Dados não disponíveis. Acesse a aba "Faturamento SCI" em Clientes para atualizar.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Sempre exibir os 2 últimos anos, mesmo que zerados */}
                      {anosParaBuscar.map((ano) => {
                        const fat = faturamento.find((f) => f.ano === ano) || {
                          ano,
                          valorTotal: 0,
                          mediaMensal: 0,
                          meses: [],
                        };
                        return (
                        <div
                          key={fat.ano}
                          className="bg-gray-50 rounded-lg border border-gray-200 p-4"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-base font-semibold text-gray-900">
                              Faturamento {fat.ano}
                            </h4>
                            <span className="text-lg font-bold text-green-700">
                              {formatarMoeda(fat.valorTotal)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mb-2">
                            Período: 01/01/{fat.ano} a 31/12/{fat.ano}
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Média Mensal:</span>
                            <span className="font-semibold text-emerald-700">
                              {formatarMoeda(fat.mediaMensal || 0)}
                            </span>
                          </div>
                          {fat.meses.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs font-medium text-gray-700 mb-2">
                                Detalhamento Mensal:
                              </p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                {fat.meses.map((mes, idx) => (
                                  <div
                                    key={idx}
                                    className="flex justify-between items-center"
                                  >
                                    <span className="text-gray-600">
                                      {mes.mes.toString().padStart(2, '0')}/
                                      {mes.ano}
                                    </span>
                                    <span className="font-medium text-gray-900">
                                      {formatarMoeda(mes.valor)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Botão Voltar ao Topo */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-4 bg-gradient-to-r from-emerald-400 to-teal-500 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-300 animate-bounce hover:animate-none flex items-center justify-center group"
          title="Voltar ao topo"
          aria-label="Voltar ao topo"
        >
          <ArrowUpIcon className="h-6 w-6 group-hover:translate-y-[-2px] transition-transform duration-300" />
        </button>
      )}
    </div>
  );
};

export default Irpf2025;

