import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import Alert from '../components/UI/Alert';
import { Pagination } from '../components/Pagination';
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
  const location = useLocation();
  const [cnpj, setCnpj] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [pagamentos, setPagamentos] = useState<ReceitaPagamentoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());
  const [filtroNumeroDocumento, setFiltroNumeroDocumento] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendente' | 'pago'>('todos');
  const [filtroCliente, setFiltroCliente] = useState(''); // Filtro por Razão Social ou CNPJ
  const [consultandoReceita, setConsultandoReceita] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;
  const filtroClienteInputRef = useRef<HTMLInputElement>(null);
  const cnpjFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('cnpj') || '';
    return raw.replace(/\D/g, '');
  }, [location.search]);

  // Preencher CNPJ a partir da query string (?cnpj=) ao entrar via "Adicionar"
  useEffect(() => {
    if (cnpjFromQuery && cnpjFromQuery.length === 14) {
      setCnpj(formatCNPJ(cnpjFromQuery));
    }
  }, [cnpjFromQuery]);

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

  // Agrupar pagamentos por cliente, depois por documento (com filtros por número de documento e status)
  const clientesAgrupados = useMemo(() => {
    // Filtrar pagamentos pelo número de documento se houver filtro
    let pagamentosFiltrados = filtroNumeroDocumento
      ? pagamentos.filter(item =>
          item.numeroDocumento
            .toLowerCase()
            .includes(filtroNumeroDocumento.toLowerCase().trim())
        )
      : pagamentos;
    
    // Aplicar filtro de status nos pagamentos (não nos documentos finais, pois precisamos agrupar primeiro)
    // O filtro de status será aplicado nos documentos após o agrupamento

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

    let clientesArray = Array.from(clientesMap.values());
    
    // Aplicar filtro de status nos documentos
    if (filtroStatus !== 'todos') {
      clientesArray = clientesArray.map(cliente => {
        const documentosFiltrados = cliente.documentos.filter(doc => {
          if (filtroStatus === 'pago') {
            return doc.valorSaldoDocumento === 0;
          } else if (filtroStatus === 'pendente') {
            return doc.valorSaldoDocumento > 0;
          }
          return true;
        });
        
        // Recalcular totais do cliente baseado nos documentos filtrados
        const totalDocumentos = documentosFiltrados.length;
        const totalLinhas = documentosFiltrados.reduce((sum, doc) => sum + 1 + doc.filhos.length, 0);
        const valorTotal = documentosFiltrados.reduce((sum, doc) => sum + doc.valorDocumento, 0);
        const valorSaldoTotal = documentosFiltrados.reduce((sum, doc) => sum + doc.valorSaldoDocumento, 0);
        
        return {
          ...cliente,
          documentos: documentosFiltrados,
          totalDocumentos,
          totalLinhas,
          valorTotal,
          valorSaldoTotal,
        };
      }).filter(cliente => cliente.totalDocumentos > 0); // Remover clientes sem documentos após filtro
    }
    
    console.log('[Pagamentos] Clientes agrupados:', clientesArray.length, clientesArray.map(c => ({ cnpj: c.cnpj, nome: c.nome, documentos: c.totalDocumentos })));
    
    return clientesArray;
  }, [pagamentos, filtroNumeroDocumento, filtroStatus]);

  // Resetar para página 1 quando filtros mudarem
  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroNumeroDocumento, filtroStatus, filtroCliente, pagamentos.length]);

  // Buscar automaticamente ao digitar no filtro de Cliente (com debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Buscar sempre que houver mudança no filtro de cliente
      carregarPagamentosDoBanco();
    }, 500); // Debounce de 500ms para evitar muitas requisições

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroCliente]); // Executa quando o filtro de cliente muda

  // Calcular paginação
  const totalPaginas = Math.ceil(clientesAgrupados.length / itensPorPagina);
  const indiceInicio = (paginaAtual - 1) * itensPorPagina;
  const indiceFim = indiceInicio + itensPorPagina;
  const clientesPaginados = useMemo(() => {
    return clientesAgrupados.slice(indiceInicio, indiceFim);
  }, [clientesAgrupados, indiceInicio, indiceFim]);

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
    const value = e.target.value;
    // Aplicar máscara de CNPJ sempre (campo usado apenas para consultar Receita)
    const formatted = formatCNPJ(value);
    setCnpj(formatted);
  };

  const handleFiltroClienteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Verificar se parece ser um CNPJ (tem apenas dígitos e alguns caracteres de formatação)
    const cnpjLimpo = value.replace(/\D/g, '');
    
    // Se tem 14 ou mais dígitos ou parece estar digitando um CNPJ, aplicar máscara
    // Se parece ser nome (tem letras), não aplicar máscara
    const pareceCNPJ = /^[\d.\s/-]*$/.test(value) && (cnpjLimpo.length > 0 || value.length > 0 && /[\d./-]/.test(value));
    
    if (pareceCNPJ) {
      const formatted = formatCNPJ(value);
      setFiltroCliente(formatted);
    } else {
      // Se não parece CNPJ (tem letras), permitir digitar normalmente (nome do cliente)
      setFiltroCliente(value);
    }
  };

  // Ao clicar no CNPJ listado, preencher o filtro e focar o campo
  const handleSelecionarCNPJNoFiltro = (cnpjLimpo: string) => {
    const masked = formatCNPJ(cnpjLimpo);
    setFiltroCliente(masked);
    setPaginaAtual(1);
    // Colapsar quaisquer expansões para evitar confusão visual
    setExpandedClientes(new Set());
    setExpandedDocs(new Set());
    // Focar o campo após atualização do estado
    setTimeout(() => {
      filtroClienteInputRef.current?.focus();
      // Colocar o cursor no fim
      const input = filtroClienteInputRef.current;
      if (input) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }, 0);
  };

  // Buscar pagamentos salvos do banco ao carregar a página
  const carregarPagamentosDoBanco = async () => {
    setLoading(true);
    setError(null);
    setShowError(false);

    try {
      // Construir query string com filtros opcionais
      const params = new URLSearchParams();
      
      // Verificar se o filtroCliente parece ser um CNPJ (tem 14 dígitos) ou nome
      if (filtroCliente.trim()) {
        const cnpjLimpoFiltro = filtroCliente.replace(/\D/g, '');
        const pareceCNPJ = cnpjLimpoFiltro.length === 14;
        
        if (pareceCNPJ) {
          // Se parece CNPJ, enviar como CNPJ
          params.append('cnpj', cnpjLimpoFiltro);
        } else {
          // Se não parece CNPJ, enviar como nome do cliente
          params.append('nomeCliente', filtroCliente.trim());
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
          const cnpjsUnicos = [...new Set(pagamentosRetornados.map((p: any) => {
            const cnpjOriginal = p.cnpj || p.cnpj_contribuinte || '';
            return cnpjOriginal.replace(/\D/g, '');
          }).filter((cnpj: string) => cnpj.length === 14))];
          console.log('[Pagamentos] Total de pagamentos:', pagamentosRetornados.length);
          console.log('[Pagamentos] CNPJs únicos nos pagamentos:', cnpjsUnicos.length);
          console.log('[Pagamentos] Lista de CNPJs únicos:', cnpjsUnicos);
          
          // Log de quantos pagamentos por CNPJ
          const pagamentosPorCNPJ = new Map<string, number>();
          pagamentosRetornados.forEach((p: any) => {
            const cnpjOriginal = p.cnpj || p.cnpj_contribuinte || '';
            const cnpjLimpo = cnpjOriginal.replace(/\D/g, '');
            if (cnpjLimpo.length === 14) {
              pagamentosPorCNPJ.set(cnpjLimpo, (pagamentosPorCNPJ.get(cnpjLimpo) || 0) + 1);
            }
          });
          console.log('[Pagamentos] Pagamentos por CNPJ:', Array.from(pagamentosPorCNPJ.entries()).map(([cnpj, count]) => ({ cnpj, count })));
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

  // Nota: Removemos a busca automática do CNPJ pois agora ele é usado apenas para consultar Receita

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

    setLoading(true);
    setError(null);
    setShowError(false);
    setSuccessMessage(null);
    setShowSuccess(false);

    try {
      // Pré-validação: checar token (e autorização para o CNPJ) antes de consultar
      const validResp = await axios.get('/api/receita/validar-token', { params: { cnpj: cnpjLimpo } });
      if (!validResp.data?.success) {
        throw new Error(validResp.data?.error || validResp.data?.message || 'Falha ao validar token/acesso na Receita');
      }

      // Exibir confirmação e iniciar processamento
      setSuccessMessage('Access Token válido. Iniciando consulta...');
      setShowSuccess(true);
      setConsultandoReceita(true);

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
      setSuccessMessage('Consulta concluída com sucesso.');
      setShowSuccess(true);
      // Limpar campos de pesquisa após sucesso
      setCnpj('');
      setDataInicial('');
      setDataFinal('');
        } catch (err: any) {
          console.error('[Pagamentos] Erro ao consultar Receita Federal:', err);
          
          // Extrair mensagem de erro detalhada
          let errorMessage = 'Erro ao consultar pagamentos na Receita Federal';
          let errorDetails: string | undefined;

          const status = err.response?.status;
          if (status === 401) {
            errorMessage = 'Erro de autenticação: Token inválido ou expirado. Valide o acesso e tente novamente.';
          } else if (status === 403) {
            errorMessage = 'Erro de autorização: Acesso negado pela Receita Federal (verifique a procuração do CNPJ).';
          } else if (err.response?.data) {
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
      // Limpar campos de pesquisa após erro
      setCnpj('');
      setDataInicial('');
      setDataFinal('');
        } finally {
          setConsultandoReceita(false);
          setLoading(false);
        }
  };

  // Verificar apenas o acesso (token/procuração) sem consultar pagamentos
  // (A validação de token/procuração é feita automaticamente dentro do fluxo de consulta)

  // (Removido) Exportação de relatório de pendentes pela aba Pagamentos

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Seção de Consulta à Receita Federal */}
      <div className="bg-white shadow rounded-lg p-6 w-full max-w-full">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Consultar Receita Federal</h2>
        
        {/* Formulário de Consulta */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-2">
              CNPJ <span className="text-red-500">*</span>
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
              Data Inicial <span className="text-red-500">*</span>
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
              Data Final <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="dataFinal"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleConsultarReceita}
              disabled={loading || !cnpj || !dataInicial || !dataFinal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={!cnpj || !dataInicial || !dataFinal ? 'Preencha CNPJ, Data Inicial e Data Final para consultar a Receita Federal' : 'Consultar dados atualizados na Receita Federal'}
            >
              {consultandoReceita ? (
                <span className="flex items-center justify-center">
                  <span className="mr-2"><LoadingSpinner size="sm" /></span>
                  Buscando...
                </span>
              ) : (
                'Buscar na Receita'
              )}
            </button>
          </div>
        </div>

        {/* Alertas */}
        {showSuccess && successMessage && (
          <div className="mt-4">
            <Alert type="success" onClose={() => setShowSuccess(false)}>
              <div className="line-clamp-6 whitespace-pre-wrap">{successMessage}</div>
            </Alert>
          </div>
        )}

        {/* Alert de Erro */}
        {showError && error && (
          <div className="mt-4">
            <Alert type="error" onClose={() => setShowError(false)}>
              <div className="whitespace-pre-wrap break-words">{error}</div>
            </Alert>
          </div>
        )}
      </div>

      {/* Seção de Filtros */}
      {pagamentos.length > 0 && (
        <div className="bg-white shadow rounded-lg p-4 w-full max-w-full">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h2>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Filtro por Razão Social / CNPJ */}
            <div className="flex items-center gap-2">
              <label htmlFor="filtroCliente" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Razão Social / CNPJ:
              </label>
              <input
                type="text"
                id="filtroCliente"
                placeholder="00.000.000/0000-00 ou nome do cliente"
                value={filtroCliente}
                onChange={handleFiltroClienteChange}
                ref={filtroClienteInputRef}
                className="w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {filtroCliente && (
                <button
                  onClick={() => setFiltroCliente('')}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 focus:outline-none"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Filtro por Número de Documento */}
            <div className="flex items-center gap-2">
              <label htmlFor="filtroNumeroDocumento" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Nº Documento:
              </label>
              <input
                type="text"
                id="filtroNumeroDocumento"
                placeholder="Digite o número do documento..."
                value={filtroNumeroDocumento}
                onChange={(e) => setFiltroNumeroDocumento(e.target.value)}
                className="w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {filtroNumeroDocumento && (
                <button
                  onClick={() => setFiltroNumeroDocumento('')}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 focus:outline-none"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Filtro por Status */}
            <div className="flex items-center gap-2">
              <label htmlFor="filtroStatus" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Status:
              </label>
              <select
                id="filtroStatus"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as 'todos' | 'pendente' | 'pago')}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
              </select>
            </div>
          </div>
          
          {/* Botão para limpar todos os filtros */}
          {(filtroCliente || filtroNumeroDocumento || filtroStatus !== 'todos') && (
            <div className="mt-4">
              <button
                onClick={() => {
                  setFiltroCliente('');
                  setFiltroNumeroDocumento('');
                  setFiltroStatus('todos');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 focus:outline-none border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          )}
          
          {(filtroCliente || filtroNumeroDocumento || filtroStatus !== 'todos') && (
            <p className="mt-2 text-sm text-gray-500">
              Mostrando {totais.totalClientes} cliente(s) de {totais.totalClientesOriginal} | {totais.totalDocumentos} documento(s) de {totais.totalDocumentosOriginal} | {totais.totalLinhas} linha(s) de {totais.totalLinhasOriginal}
              {filtroStatus !== 'todos' && (
                <span className="ml-2 text-blue-600 font-medium">
                  • Filtro: {filtroStatus === 'pendente' ? 'Pendente' : 'Pago'}
                </span>
              )}
            </p>
          )}
          
        </div>
      )}

      {/* Totais */}
      {pagamentos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 gap-4 w-full max-w-full">
          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">
              Clientes
              {(filtroNumeroDocumento || filtroStatus !== 'todos') && <span className="text-xs text-gray-400 ml-1">(filtrado)</span>}
            </div>
            <div className="text-xl font-bold text-purple-600 mt-1 truncate">{totais.totalClientes}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">
              Documentos Únicos
              {(filtroNumeroDocumento || filtroStatus !== 'todos') && <span className="text-xs text-gray-400 ml-1">(filtrado)</span>}
            </div>
            <div className="text-xl font-bold text-gray-900 mt-1 truncate">{totais.totalDocumentos}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Total de Linhas</div>
            <div className="text-xl font-bold text-blue-600 mt-1 truncate">{totais.totalLinhas}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Valor Total</div>
            <div className="text-lg font-bold text-gray-900 mt-1 break-words overflow-wrap-anywhere">{formatCurrency(totais.valorTotalDocumentos)}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Valor Pago</div>
            <div className="text-lg font-bold text-green-600 mt-1 break-words overflow-wrap-anywhere">{formatCurrency(totais.valorTotalPago)}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Saldo Pendente</div>
            <div className="text-lg font-bold text-red-600 mt-1 break-words overflow-wrap-anywhere">{formatCurrency(totais.valorTotalSaldo)}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Documentos Pagos</div>
            <div className="text-xl font-bold text-green-600 mt-1 truncate">{totais.documentosPagos}</div>
          </div>

          <div className="bg-white shadow rounded-lg p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Documentos Pendentes</div>
            <div className="text-xl font-bold text-red-600 mt-1 truncate">{totais.documentosPendentes}</div>
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
                {clientesPaginados.map((cliente) => {
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
                            <button
                              type="button"
                              className="text-left text-xs font-normal text-blue-600 mt-1 hover:underline"
                              title="Filtrar por este CNPJ"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelecionarCNPJNoFiltro(cliente.cnpj);
                              }}
                            >
                              CNPJ: {formatCNPJ(cliente.cnpj)}
                            </button>
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
            Nenhum pagamento encontrado no banco de dados. Use a seção "Consultar Receita Federal" acima para buscar novos pagamentos.
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

      {/* Paginação */}
      {!loading && pagamentos.length > 0 && clientesAgrupados.length > 0 && (
        <Pagination
          currentPage={paginaAtual}
          totalPages={totalPaginas}
          totalItems={clientesAgrupados.length}
          itemsPerPage={itensPorPagina}
          onPageChange={setPaginaAtual}
          itemLabel="cliente"
        />
      )}
    </div>
  );
};

export default Pagamentos;

