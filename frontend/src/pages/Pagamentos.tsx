import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import Alert from '../components/UI/Alert';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface ReceitaPagamentoItem {
  cnpj?: string;
  clienteNome?: string;
  clienteId?: string;
  clienteEncontrado?: boolean; // Flag indicando se o cliente foi encontrado na tabela
  clienteNaoEncontrado?: boolean; // Flag indicando se tentou buscar mas não encontrou
  numeroDocumento: string;
  tipoDocumento: string;
  periodoApuracao: string;
  competencia: string;
  dataArrecadacao: string;
  dataVencimento: string;
  codigoReceitaDoc: string;
  valorDocumento: number;
  valorSaldoDocumento: number;
  valorPrincipal: number;
  valorSaldoPrincipal: number;
  sequencial?: string;
  codigoReceitaLinha?: string;
  descricaoReceitaLinha?: string;
  periodoApuracaoLinha?: string;
  dataVencimentoLinha?: string;
  valorLinha?: number;
  valorPrincipalLinha?: number;
  valorSaldoLinha?: number;
}

interface DocumentoPai {
  numeroDocumento: string;
  tipoDocumento: string;
  periodoApuracao: string;
  competencia: string;
  dataArrecadacao: string;
  dataVencimento: string;
  codigoReceitaDoc: string;
  valorDocumento: number;
  valorSaldoDocumento: number;
  valorPrincipal: number;
  valorSaldoPrincipal: number;
  filhos: ReceitaPagamentoItem[];
}

interface ClienteAgrupado {
  cnpj: string;
  nome: string;
  clienteEncontrado: boolean; // Flag indicando se o cliente foi encontrado na tabela
  clienteNaoEncontrado: boolean; // Flag indicando se tentou buscar mas não encontrou
  documentos: DocumentoPai[];
  totalDocumentos: number;
  totalLinhas: number;
  valorTotal: number;
  valorSaldoTotal: number;
}

const Pagamentos: React.FC = () => {
  const [cnpj, setCnpj] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [pagamentos, setPagamentos] = useState<ReceitaPagamentoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());
  const [filtroNumeroDocumento, setFiltroNumeroDocumento] = useState('');
  const [consultandoReceita, setConsultandoReceita] = useState(false);

  // Função para aplicar máscara de CNPJ
  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  };

  // Função para formatar valor monetário
  const formatCurrency = (value: number | undefined | null) => {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Função para formatar data
  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateString;
    }
  };

  // Agrupar pagamentos por cliente, depois por documento (com filtro por número de documento)
  const clientesAgrupados = useMemo(() => {
    // Filtrar pagamentos pelo número de documento se houver filtro
    const pagamentosFiltrados = filtroNumeroDocumento
      ? pagamentos.filter(item =>
          item.numeroDocumento
            .toLowerCase()
            .includes(filtroNumeroDocumento.toLowerCase().trim())
        )
      : pagamentos;

    // Primeiro, agrupar por cliente (CNPJ)
    const clientesMap = new Map<string, ClienteAgrupado>();

    pagamentosFiltrados.forEach(item => {
      // Normalizar CNPJ: limpar formatação e usar como chave única
      const cnpjOriginal = item.cnpj || '';
      const cnpjLimpo = cnpjOriginal.replace(/\D/g, '');
      const cnpjChave = cnpjLimpo.length === 14 ? cnpjLimpo : (cnpjOriginal || 'SEM_CNPJ');
      const nomeCliente = item.clienteNome || cnpjChave;

      if (!clientesMap.has(cnpjChave)) {
        // Verificar se algum pagamento desse CNPJ tem informação sobre busca do cliente
        const pagamentosDoCNPJ = pagamentosFiltrados.filter(p => {
          const pCnpjOriginal = p.cnpj || '';
          const pCnpjLimpo = pCnpjOriginal.replace(/\D/g, '');
          const pCnpjChave = pCnpjLimpo.length === 14 ? pCnpjLimpo : (pCnpjOriginal || 'SEM_CNPJ');
          return pCnpjChave === cnpjChave;
        });
        const clienteEncontrado = pagamentosDoCNPJ.some(p => p.clienteEncontrado === true);
        const clienteNaoEncontrado = pagamentosDoCNPJ.some(p => p.clienteNaoEncontrado === true);

        clientesMap.set(cnpjChave, {
          cnpj: cnpjChave, // Usar CNPJ limpo como chave única
          nome: nomeCliente,
          clienteEncontrado,
          clienteNaoEncontrado,
          documentos: [],
          totalDocumentos: 0,
          totalLinhas: 0,
          valorTotal: 0,
          valorSaldoTotal: 0,
        });
      }
    });

    // Agrupar todos os registros por numeroDocumento
    const registrosPorDocumento = new Map<string, ReceitaPagamentoItem[]>();
    
    pagamentosFiltrados.forEach(item => {
      const numDoc = item.numeroDocumento;
      if (!registrosPorDocumento.has(numDoc)) {
        registrosPorDocumento.set(numDoc, []);
      }
      registrosPorDocumento.get(numDoc)!.push(item);
    });

    // Para cada grupo de documentos, criar o pai e filhos
    registrosPorDocumento.forEach((registros, numeroDocumento) => {
      // Separar registros com e sem sequencial
      const registrosSemSequencial = registros.filter(r => !r.sequencial);
      const registrosComSequencial = registros.filter(r => r.sequencial);

      // Se houver registro sem sequencial, usar o primeiro como pai
      // Caso contrário, criar um pai virtual baseado no primeiro registro com sequencial
      let registroPai: ReceitaPagamentoItem;
      
      if (registrosSemSequencial.length > 0) {
        registroPai = registrosSemSequencial[0];
      } else if (registrosComSequencial.length > 0) {
        // Criar pai virtual baseado no primeiro registro com sequencial
        registroPai = { ...registrosComSequencial[0] };
        // Remover campos específicos de linha para o pai
        delete registroPai.sequencial;
        delete registroPai.codigoReceitaLinha;
        delete registroPai.descricaoReceitaLinha;
        delete registroPai.periodoApuracaoLinha;
        delete registroPai.dataVencimentoLinha;
        delete registroPai.valorLinha;
        delete registroPai.valorPrincipalLinha;
        delete registroPai.valorSaldoLinha;
      } else {
        // Fallback: usar o primeiro registro como está
        registroPai = registros[0];
      }

      // Criar documento pai
      const docPai: DocumentoPai = {
        numeroDocumento: registroPai.numeroDocumento,
        tipoDocumento: registroPai.tipoDocumento,
        periodoApuracao: registroPai.periodoApuracao,
        competencia: registroPai.competencia,
        dataArrecadacao: registroPai.dataArrecadacao,
        dataVencimento: registroPai.dataVencimento,
        codigoReceitaDoc: registroPai.codigoReceitaDoc,
        valorDocumento: registroPai.valorDocumento,
        valorSaldoDocumento: registroPai.valorSaldoDocumento,
        valorPrincipal: registroPai.valorPrincipal,
        valorSaldoPrincipal: registroPai.valorSaldoPrincipal,
        filhos: [],
      };

      // Adicionar todos os registros com sequencial como filhos
      docPai.filhos = registrosComSequencial;

      // Ordenar filhos por sequencial
      docPai.filhos.sort((a, b) => {
        const seqA = parseInt(a.sequencial || '0');
        const seqB = parseInt(b.sequencial || '0');
        return seqA - seqB;
      });

      // Adicionar documento ao cliente correspondente
      // Normalizar CNPJ para buscar na map
      const cnpjOriginalDoc = registroPai.cnpj || '';
      const cnpjLimpoDoc = cnpjOriginalDoc.replace(/\D/g, '');
      const cnpjChaveDoc = cnpjLimpoDoc.length === 14 ? cnpjLimpoDoc : (cnpjOriginalDoc || 'SEM_CNPJ');
      const cliente = clientesMap.get(cnpjChaveDoc);
      
      if (cliente) {
        cliente.documentos.push(docPai);
        cliente.totalDocumentos++;
        cliente.totalLinhas += 1 + docPai.filhos.length;
        cliente.valorTotal += docPai.valorDocumento;
        cliente.valorSaldoTotal += docPai.valorSaldoDocumento;
      } else {
        console.warn(`[Pagamentos] Cliente não encontrado para documento ${numeroDocumento} com CNPJ: ${cnpjOriginalDoc} (chave: ${cnpjChaveDoc})`);
      }
    });

    // Ordenar documentos dentro de cada cliente por data de vencimento
    clientesMap.forEach(cliente => {
      cliente.documentos.sort((a, b) => {
        const dataA = new Date(a.dataVencimento).getTime();
        const dataB = new Date(b.dataVencimento).getTime();
        return dataB - dataA; // Mais recente primeiro
      });
    });

    const clientesArray = Array.from(clientesMap.values());
    console.log('[Pagamentos] Clientes agrupados:', clientesArray.length, clientesArray.map(c => ({ cnpj: c.cnpj, nome: c.nome, documentos: c.totalDocumentos })));
    
    return clientesArray;
  }, [pagamentos, filtroNumeroDocumento]);

  // Calcular totais (baseado em clientes agrupados)
  const totais = useMemo(() => {
    const clientes = clientesAgrupados;
    
    return {
      totalClientes: clientes.length,
      totalDocumentos: clientes.reduce((sum, c) => sum + c.totalDocumentos, 0),
      totalLinhas: clientes.reduce((sum, c) => sum + c.totalLinhas, 0),
      valorTotalDocumentos: clientes.reduce((sum, c) => sum + c.valorTotal, 0),
      valorTotalSaldo: clientes.reduce((sum, c) => sum + c.valorSaldoTotal, 0),
      valorTotalPago: clientes.reduce((sum, c) => sum + (c.valorTotal - c.valorSaldoTotal), 0),
      documentosPagos: clientes.reduce((sum, c) => sum + c.documentos.filter(d => d.valorSaldoDocumento === 0).length, 0),
      documentosPendentes: clientes.reduce((sum, c) => sum + c.documentos.filter(d => d.valorSaldoDocumento > 0).length, 0),
      totalClientesOriginal: new Set(pagamentos.map(p => p.cnpj || 'SEM_CNPJ')).size,
      totalDocumentosOriginal: new Set(pagamentos.filter(p => !p.sequencial).map(p => p.numeroDocumento)).size,
      totalLinhasOriginal: pagamentos.length,
    };
  }, [clientesAgrupados, pagamentos.length]);

  // Verificar se há clientes expandidos para mostrar o cabeçalho da tabela
  const temClientesExpandidos = useMemo(() => {
    return expandedClientes.size > 0;
  }, [expandedClientes]);

  const toggleExpandCliente = (cnpj: string) => {
    setExpandedClientes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cnpj)) {
        // Se já está expandido, apenas colapsar
        newSet.delete(cnpj);
      } else {
        // Se não está expandido, colapsar todos os outros e expandir apenas este
        newSet.clear();
        newSet.add(cnpj);
      }
      return newSet;
    });
  };

  const toggleExpand = (numeroDocumento: string) => {
    setExpandedDocs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(numeroDocumento)) {
        newSet.delete(numeroDocumento);
      } else {
        newSet.add(numeroDocumento);
      }
      return newSet;
    });
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setCnpj(formatted);
  };

  // Buscar pagamentos salvos do banco ao carregar a página
  const carregarPagamentosDoBanco = async () => {
    setLoading(true);
    setError(null);
    setShowError(false);

    try {
      // Construir query string com filtros opcionais
      const params = new URLSearchParams();
      
      if (cnpj) {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        if (cnpjLimpo.length === 14) {
          params.append('cnpj', cnpjLimpo);
        }
      }

      if (dataInicial) {
        params.append('dataInicial', new Date(dataInicial).toISOString().split('T')[0]);
      }

      if (dataFinal) {
        params.append('dataFinal', new Date(dataFinal).toISOString().split('T')[0]);
      }

      const queryString = params.toString();
      const url = `/api/receita-pagamentos${queryString ? `?${queryString}` : ''}`;

      const pagamentosResponse = await axios.get(url);

      if (pagamentosResponse.data.success && pagamentosResponse.data.data) {
        const pagamentosRetornados = pagamentosResponse.data.data;
        console.log('[Pagamentos] Pagamentos retornados do backend:', pagamentosRetornados.length);
        console.log('[Pagamentos] Primeiro pagamento:', pagamentosRetornados[0]);
        
        setPagamentos(pagamentosRetornados);
        
        if (pagamentosRetornados.length === 0) {
          setError('Nenhum pagamento encontrado no banco de dados para os filtros informados.');
          setShowError(true);
        } else {
          setError(null);
          setShowError(false);
          
          // Verificar quantos clientes únicos temos
          const cnpjsUnicos = [...new Set(pagamentosRetornados.map((p: any) => p.cnpj).filter(Boolean))];
          console.log('[Pagamentos] CNPJs únicos nos pagamentos:', cnpjsUnicos.length, cnpjsUnicos.slice(0, 5));
        }
      } else {
        throw new Error(pagamentosResponse.data.error || 'Erro ao buscar pagamentos');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao buscar pagamentos do banco de dados';
      setError(errorMessage);
      setShowError(true);
      setPagamentos([]);
    } finally {
      setLoading(false);
    }
  };

  // Carregar dados ao montar o componente
  useEffect(() => {
    carregarPagamentosDoBanco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Executa apenas uma vez ao montar

  // Nota: Removemos o useEffect automático para filtrar ao digitar
  // O usuário deve clicar em "Filtrar" para aplicar os filtros

  // Consultar Receita Federal e atualizar banco de dados
  const handleConsultarReceita = async () => {
    // Validações
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      setError('CNPJ inválido. Deve conter 14 dígitos.');
      setShowError(true);
      return;
    }

    if (!dataInicial || !dataFinal) {
      setError('Para consultar a Receita Federal, por favor, preencha a data inicial e data final.');
      setShowError(true);
      return;
    }

    setConsultandoReceita(true);
    setLoading(true);
    setError(null);
    setShowError(false);

    try {
      // Converter datas para formato YYYY-MM-DD
      const dataInicialFormatada = new Date(dataInicial).toISOString().split('T')[0];
      const dataFinalFormatada = new Date(dataFinal).toISOString().split('T')[0];

      // Fazer consulta simples na Receita Federal
      // Isso vai consultar, verificar se existe no banco e atualizar/criar
      const consultaResponse = await axios.post(
        '/api/receita/consulta-simples',
        {
          cnpj: cnpjLimpo,
          dataInicial: dataInicialFormatada,
          dataFinal: dataFinalFormatada,
        }
      );

      if (!consultaResponse.data.success) {
        throw new Error(consultaResponse.data.error || 'Erro ao consultar na Receita Federal');
      }

      // Após consultar, recarregar os dados do banco
      await carregarPagamentosDoBanco();

      // Mostrar mensagem de sucesso
      const resultado = consultaResponse.data.data;
      console.log('Consulta à Receita Federal realizada:', resultado);
        } catch (err: any) {
          console.error('[Pagamentos] Erro ao consultar Receita Federal:', err);
          
          // Extrair mensagem de erro detalhada
          let errorMessage = 'Erro ao consultar pagamentos na Receita Federal';
          let errorDetails: string | undefined;

          if (err.response?.data) {
            // Erro do backend
            errorMessage = err.response.data.error || errorMessage;
            errorDetails = err.response.data.details;
            
            // Se houver detalhes, adicionar à mensagem
            if (errorDetails) {
              errorMessage += `\n\nDetalhes: ${errorDetails}`;
            }
          } else if (err.message) {
            errorMessage = err.message;
          }

          // Log detalhado para debug
          console.error('[Pagamentos] Detalhes do erro:', {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            message: errorMessage,
            details: errorDetails,
          });

          setError(errorMessage);
          setShowError(true);
        } finally {
          setConsultandoReceita(false);
          setLoading(false);
        }
  };

  // Filtrar dados do banco (sem consultar Receita Federal)
  const handleFiltrar = () => {
    carregarPagamentosDoBanco();
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="bg-white shadow rounded-lg p-6 w-full max-w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Consulta de Pagamentos - Receita Federal</h1>
        
        {/* Formulário de Pesquisa */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-2">
              CNPJ <span className="text-gray-400 text-xs">(opcional para filtrar)</span>
            </label>
            <input
              type="text"
              id="cnpj"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={handleCnpjChange}
              maxLength={18}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="dataInicial" className="block text-sm font-medium text-gray-700 mb-2">
              Data Inicial <span className="text-gray-400 text-xs">(opcional para filtrar)</span>
            </label>
            <input
              type="date"
              id="dataInicial"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="dataFinal" className="block text-sm font-medium text-gray-700 mb-2">
              Data Final <span className="text-gray-400 text-xs">(opcional para filtrar)</span>
            </label>
            <input
              type="date"
              id="dataFinal"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={handleFiltrar}
                  disabled={loading}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading && !consultandoReceita ? (
                    <span className="flex items-center justify-center">
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Carregando...</span>
                    </span>
                  ) : (
                    'Filtrar'
                  )}
                </button>
                <button
                  onClick={handleConsultarReceita}
                  disabled={loading || !cnpj || !dataInicial || !dataFinal}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!cnpj || !dataInicial || !dataFinal ? 'Preencha CNPJ, Data Inicial e Data Final para consultar a Receita Federal' : 'Consultar dados atualizados na Receita Federal'}
                >
                  {consultandoReceita ? (
                    <span className="flex items-center justify-center">
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Consultando...</span>
                    </span>
                  ) : (
                    'Consultar Receita'
                  )}
                </button>
              </div>
        </div>

            {/* Alert de Erro */}
            {showError && error && (
              <div className="mb-4">
                <Alert type="error" onClose={() => setShowError(false)}>
                  <div className="whitespace-pre-wrap break-words">
                    {error}
                  </div>
                </Alert>
              </div>
            )}
      </div>

      {/* Filtro por Número de Documento */}
      {pagamentos.length > 0 && (
        <div className="bg-white shadow rounded-lg p-4 w-full max-w-full">
          <div className="flex items-center gap-4">
            <label htmlFor="filtroNumeroDocumento" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Filtrar por Nº Documento:
            </label>
            <input
              type="text"
              id="filtroNumeroDocumento"
              placeholder="Digite o número do documento..."
              value={filtroNumeroDocumento}
              onChange={(e) => setFiltroNumeroDocumento(e.target.value)}
              className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {filtroNumeroDocumento && (
              <button
                onClick={() => setFiltroNumeroDocumento('')}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                Limpar filtro
              </button>
            )}
          </div>
          {filtroNumeroDocumento && (
            <p className="mt-2 text-sm text-gray-500">
              Mostrando {totais.totalClientes} cliente(s) de {totais.totalClientesOriginal} | {totais.totalDocumentos} documento(s) de {totais.totalDocumentosOriginal} | {totais.totalLinhas} linha(s) de {totais.totalLinhasOriginal}
            </p>
          )}
        </div>
      )}

      {/* Totais */}
      {pagamentos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 gap-4 w-full max-w-full">
          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">
              Clientes
              {filtroNumeroDocumento && <span className="text-xs text-gray-400 ml-1">(filtrado)</span>}
            </div>
            <div className="text-2xl font-bold text-purple-600 mt-1">{totais.totalClientes}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">
              Documentos Únicos
              {filtroNumeroDocumento && <span className="text-xs text-gray-400 ml-1">(filtrado)</span>}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{totais.totalDocumentos}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">Total de Linhas</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{totais.totalLinhas}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">Valor Total</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totais.valorTotalDocumentos)}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">Valor Pago</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totais.valorTotalPago)}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">Saldo Pendente</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totais.valorTotalSaldo)}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">Documentos Pagos</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{totais.documentosPagos}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-sm font-medium text-gray-500">Documentos Pendentes</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{totais.documentosPendentes}</div>
          </div>
        </div>
      )}

      {/* Lista de Pagamentos Hierárquica por Cliente */}
      {pagamentos.length > 0 && (
        <div className="bg-white shadow rounded-lg flex flex-col overflow-hidden w-full max-w-full">
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              Pagamentos Encontrados ({totais.totalClientes} cliente(s), {totais.totalDocumentos} documentos, {totais.totalLinhas} linhas)
            </h2>
          </div>
          
          <div className="overflow-x-auto relative w-full max-w-full">
            <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'auto', width: '100%' }}>
              {temClientesExpandidos && (
                <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm" style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      {/* Botão de expandir cliente */}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      {/* Botão de expandir documento */}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente / Nº Documento
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo / Descrição
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Competência
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Arrecadação
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Saldo
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
              )}
              <tbody className="bg-white divide-y divide-gray-200">
                {clientesAgrupados.map((cliente) => {
                  const clienteExpandido = expandedClientes.has(cliente.cnpj);
                  const temAlgumExpandido = expandedClientes.size > 0;
                  const deveOcultar = temAlgumExpandido && !clienteExpandido;
                  
                  return (
                    <React.Fragment key={cliente.cnpj}>
                      {/* Linha do Cliente */}
                      <tr 
                        className="bg-blue-50 hover:bg-blue-100 cursor-pointer font-semibold"
                        style={{ display: deveOcultar ? 'none' : 'table-row' }}
                        onClick={() => toggleExpandCliente(cliente.cnpj)}
                      >
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpandCliente(cliente.cnpj);
                            }}
                            className="text-blue-600 hover:text-blue-800 focus:outline-none"
                          >
                            {clienteExpandido ? (
                              <ChevronDownIcon className="h-5 w-5" />
                            ) : (
                              <ChevronRightIcon className="h-5 w-5" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap"></td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-blue-900">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{cliente.nome}</span>
                              {cliente.clienteNaoEncontrado && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800" title="Cliente não encontrado na tabela de clientes. Exibindo CNPJ.">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  Cliente não encontrado
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-normal text-blue-600 mt-1">
                              CNPJ: {formatCNPJ(cliente.cnpj)}
                            </span>
                            <span className="text-xs font-normal text-gray-500 mt-1">
                              ({cliente.totalDocumentos} documento{cliente.totalDocumentos > 1 ? 's' : ''}, {cliente.totalLinhas} linha{cliente.totalLinhas > 1 ? 's' : ''})
                            </span>
                            {cliente.clienteNaoEncontrado && (
                              <span className="text-xs font-normal text-yellow-600 mt-1 italic">
                                * Razão Social não disponível - Cliente não cadastrado na tabela de clientes
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-700">
                          {/* Campo vazio para manter alinhamento */}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap"></td>
                        <td className="px-4 py-4 whitespace-nowrap"></td>
                        <td className="px-4 py-4 whitespace-nowrap"></td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-900">
                          {formatCurrency(cliente.valorTotal)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-bold">
                          <span className={cliente.valorSaldoTotal === 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(cliente.valorSaldoTotal)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap"></td>
                      </tr>

                      {/* Documentos do Cliente */}
                      {clienteExpandido && cliente.documentos.map((docPai) => {
                        const estaPago = docPai.valorSaldoDocumento === 0;
                        const temFilhos = docPai.filhos.length > 0;
                        const estaExpandido = expandedDocs.has(docPai.numeroDocumento);
                        
                        return (
                          <React.Fragment key={docPai.numeroDocumento}>
                            {/* Linha do Documento Pai */}
                            <tr 
                              className={`bg-gray-50 hover:bg-gray-100 ${temFilhos ? 'cursor-pointer' : ''}`} 
                              onClick={() => temFilhos && toggleExpand(docPai.numeroDocumento)}
                            >
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {temFilhos ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpand(docPai.numeroDocumento);
                                    }}
                                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                                  >
                                    {estaExpandido ? (
                                      <ChevronDownIcon className="h-5 w-5" />
                                    ) : (
                                      <ChevronRightIcon className="h-5 w-5" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">•</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                                {docPai.numeroDocumento}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {docPai.tipoDocumento || '—'}
                                {temFilhos && (
                                  <span className="ml-2 text-xs text-gray-400">
                                    ({docPai.filhos.length} desmembramento{docPai.filhos.length > 1 ? 's' : ''})
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {docPai.competencia || docPai.periodoApuracao?.substring(0, 7) || '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(docPai.dataVencimento)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(docPai.dataArrecadacao)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-semibold">
                                {formatCurrency(docPai.valorDocumento)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                                <span className={estaPago ? 'text-green-600' : 'text-red-600'}>
                                  {formatCurrency(docPai.valorSaldoDocumento)}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    estaPago
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {estaPago ? 'Pago' : 'Pendente'}
                                </span>
                              </td>
                            </tr>

                            {/* Linhas dos Filhos (Desmembramentos) */}
                            {estaExpandido && temFilhos && docPai.filhos.map((filho, indexFilho) => {
                              const filhoPago = (filho.valorSaldoLinha ?? filho.valorSaldoDocumento) === 0;
                              return (
                                <tr key={`${docPai.numeroDocumento}-${filho.sequencial || indexFilho}`} className="bg-white hover:bg-gray-50">
                                  <td className="px-4 py-2"></td>
                                  <td className="px-4 py-2"></td>
                                  <td className="px-4 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                                    #{filho.sequencial}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-600">
                                    <div>
                                      <div className="font-medium">{filho.descricaoReceitaLinha || '—'}</div>
                                      {filho.codigoReceitaLinha && (
                                        <div className="text-xs text-gray-400">Cód: {filho.codigoReceitaLinha}</div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    {filho.periodoApuracaoLinha ? formatDate(filho.periodoApuracaoLinha).substring(3) : (filho.competencia || '—')}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    {filho.dataVencimentoLinha ? formatDate(filho.dataVencimentoLinha) : '—'}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    —
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-700">
                                    {formatCurrency(filho.valorLinha ?? filho.valorDocumento)}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium">
                                    <span className={filhoPago ? 'text-green-600' : 'text-red-600'}>
                                      {formatCurrency(filho.valorSaldoLinha ?? filho.valorSaldoDocumento)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-center">
                                    <span
                                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        filhoPago
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {filhoPago ? 'Pago' : 'Pendente'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mensagem quando não há resultados */}
      {!loading && pagamentos.length === 0 && (
        <div className="bg-white shadow rounded-lg p-6 text-center">
          <p className="text-gray-500">
            {cnpj || dataInicial || dataFinal
              ? 'Nenhum pagamento encontrado para os filtros informados.'
              : 'Nenhum pagamento encontrado no banco de dados. Use os filtros acima ou clique em "Consultar Receita" para buscar novos pagamentos.'}
          </p>
        </div>
      )}
      
      {/* Debug: Mostrar informações quando não há clientes agrupados mas há pagamentos */}
      {!loading && pagamentos.length > 0 && clientesAgrupados.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-yellow-800 text-sm">
            ⚠️ Encontrados {pagamentos.length} pagamento(s), mas nenhum cliente foi agrupado. 
            Verifique o console para mais detalhes.
          </p>
        </div>
      )}
    </div>
  );
};

export default Pagamentos;

