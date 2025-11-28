/**
 * Componente: Aba de Pagamentos dentro da página de Clientes
 * 
 * Este componente contém toda a funcionalidade de consulta e visualização
 * de pagamentos da Receita Federal, integrado na página de Clientes.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../UI/LoadingSpinner';
import Alert from '../UI/Alert';
import { Pagination } from '../Pagination';
import { ChevronDownIcon, ChevronRightIcon, CreditCardIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ReceitaPagamentoItem {
  id?: string; // ID do pagamento no banco de dados
  cnpj?: string;
  clienteNome?: string;
  clienteId?: string;
  clienteEncontrado?: boolean;
  clienteNaoEncontrado?: boolean;
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
  id?: string; // ID do pagamento principal (sem sequencial)
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
  clienteEncontrado: boolean;
  clienteNaoEncontrado: boolean;
  documentos: DocumentoPai[];
  totalDocumentos: number;
  totalLinhas: number;
  valorTotal: number;
  valorSaldoTotal: number;
}

interface PagamentosTabProps {
  cnpjPreenchido?: string; // CNPJ pré-preenchido quando vem do link "Adicionar"
}

const PagamentosTab: React.FC<PagamentosTabProps> = ({ cnpjPreenchido }) => {
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
  const [filtroCliente, setFiltroCliente] = useState('');
  const [consultandoReceita, setConsultandoReceita] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;
  const filtroClienteInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ pagamentoId: string | null; numeroDocumento: string | null; cnpj: string | null; countdown: number; tipo: 'documento' | 'cliente' }>({ pagamentoId: null, numeroDocumento: null, cnpj: null, countdown: 0, tipo: 'documento' });
  const [deleteTimer, setDeleteTimer] = useState<NodeJS.Timeout | null>(null);
  
  const cnpjFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('cnpj') || '';
    return raw.replace(/\D/g, '');
  }, [location.search]);

  // Preencher CNPJ a partir da query string ou prop
  useEffect(() => {
    const cnpjParaPreencher = cnpjPreenchido || cnpjFromQuery;
    if (cnpjParaPreencher && cnpjParaPreencher.replace(/\D/g, '').length === 14) {
      const cnpjLimpo = cnpjParaPreencher.replace(/\D/g, '');
      setCnpj(formatCNPJ(cnpjLimpo));
      setFiltroCliente(formatCNPJ(cnpjLimpo));
    }
  }, [cnpjPreenchido, cnpjFromQuery]);

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateString;
    }
  };

  // Agrupar pagamentos por cliente, depois por documento
  const clientesAgrupados = useMemo(() => {
    let pagamentosFiltrados = filtroNumeroDocumento
      ? pagamentos.filter(item =>
          item.numeroDocumento
            .toLowerCase()
            .includes(filtroNumeroDocumento.toLowerCase().trim())
        )
      : pagamentos;

    const clientesMap = new Map<string, ClienteAgrupado>();

    pagamentosFiltrados.forEach(item => {
      const cnpjOriginal = item.cnpj || '';
      const cnpjLimpo = cnpjOriginal.replace(/\D/g, '');
      const cnpjChave = cnpjLimpo.length === 14 ? cnpjLimpo : (cnpjOriginal || 'SEM_CNPJ');
      const nomeCliente = item.clienteNome || cnpjChave;

      if (!clientesMap.has(cnpjChave)) {
        const pagamentosDoCNPJ = pagamentosFiltrados.filter(p => {
          const pCnpjOriginal = p.cnpj || '';
          const pCnpjLimpo = pCnpjOriginal.replace(/\D/g, '');
          const pCnpjChave = pCnpjLimpo.length === 14 ? pCnpjLimpo : (pCnpjOriginal || 'SEM_CNPJ');
          return pCnpjChave === cnpjChave;
        });
        const clienteEncontrado = pagamentosDoCNPJ.some(p => p.clienteEncontrado === true);
        const clienteNaoEncontrado = pagamentosDoCNPJ.some(p => p.clienteNaoEncontrado === true);

        clientesMap.set(cnpjChave, {
          cnpj: cnpjChave,
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

    const registrosPorDocumento = new Map<string, ReceitaPagamentoItem[]>();
    
    pagamentosFiltrados.forEach(item => {
      const numDoc = item.numeroDocumento;
      if (!registrosPorDocumento.has(numDoc)) {
        registrosPorDocumento.set(numDoc, []);
      }
      registrosPorDocumento.get(numDoc)!.push(item);
    });

    registrosPorDocumento.forEach((registros, numeroDocumento) => {
      const registrosSemSequencial = registros.filter(r => !r.sequencial);
      const registrosComSequencial = registros.filter(r => r.sequencial);

      let registroPai: ReceitaPagamentoItem;
      
      if (registrosSemSequencial.length > 0) {
        registroPai = registrosSemSequencial[0];
      } else if (registrosComSequencial.length > 0) {
        registroPai = { ...registrosComSequencial[0] };
        delete registroPai.sequencial;
        delete registroPai.codigoReceitaLinha;
        delete registroPai.descricaoReceitaLinha;
        delete registroPai.periodoApuracaoLinha;
        delete registroPai.dataVencimentoLinha;
        delete registroPai.valorLinha;
        delete registroPai.valorPrincipalLinha;
        delete registroPai.valorSaldoLinha;
      } else {
        registroPai = registros[0];
      }

      // Usar o primeiro ID disponível dos registros (pai ou primeiro filho)
      // Isso garante que sempre teremos um ID para exclusão, mesmo quando o pai é virtual
      const idPrincipal = registroPai.id || registrosComSequencial[0]?.id || registros[0]?.id;
      
      // Debug: verificar se temos ID
      if (!idPrincipal) {
        console.warn('[PagamentosTab] ⚠️ Documento sem ID:', numeroDocumento, 'Registros:', registros.map(r => ({ id: r.id, numeroDocumento: r.numeroDocumento, sequencial: r.sequencial })));
      }

      const docPai: DocumentoPai = {
        id: idPrincipal, // ID do pagamento principal (pode ser do pai ou do primeiro filho)
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

      docPai.filhos = registrosComSequencial;
      docPai.filhos.sort((a, b) => {
        const seqA = parseInt(a.sequencial || '0');
        const seqB = parseInt(b.sequencial || '0');
        return seqA - seqB;
      });

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
      }
    });

    clientesMap.forEach(cliente => {
      cliente.documentos.sort((a, b) => {
        const dataA = new Date(a.dataVencimento).getTime();
        const dataB = new Date(b.dataVencimento).getTime();
        return dataB - dataA;
      });
    });

    let clientesArray = Array.from(clientesMap.values());
    
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
      }).filter(cliente => cliente.totalDocumentos > 0);
    }
    
    return clientesArray;
  }, [pagamentos, filtroNumeroDocumento, filtroStatus]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroNumeroDocumento, filtroStatus, filtroCliente, pagamentos.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarPagamentosDoBanco();
    }, 500);
    return () => clearTimeout(timer);
  }, [filtroCliente]);

  const totalPaginas = Math.ceil(clientesAgrupados.length / itensPorPagina);
  const indiceInicio = (paginaAtual - 1) * itensPorPagina;
  const indiceFim = indiceInicio + itensPorPagina;
  const clientesPaginados = useMemo(() => {
    return clientesAgrupados.slice(indiceInicio, indiceFim);
  }, [clientesAgrupados, indiceInicio, indiceFim]);

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

  const temClientesExpandidos = useMemo(() => {
    return expandedClientes.size > 0;
  }, [expandedClientes]);

  const toggleExpandCliente = (cnpj: string) => {
    setExpandedClientes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cnpj)) {
        newSet.delete(cnpj);
      } else {
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
    const formatted = formatCNPJ(value);
    setCnpj(formatted);
  };

  const handleFiltroClienteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cnpjLimpo = value.replace(/\D/g, '');
    const pareceCNPJ = /^[\d.\s/-]*$/.test(value) && (cnpjLimpo.length > 0 || value.length > 0 && /[\d./-]/.test(value));
    
    if (pareceCNPJ) {
      const formatted = formatCNPJ(value);
      setFiltroCliente(formatted);
    } else {
      setFiltroCliente(value);
    }
  };

  const handleSelecionarCNPJNoFiltro = (cnpjLimpo: string) => {
    const masked = formatCNPJ(cnpjLimpo);
    setFiltroCliente(masked);
    setPaginaAtual(1);
    setExpandedClientes(new Set());
    setExpandedDocs(new Set());
    setTimeout(() => {
      filtroClienteInputRef.current?.focus();
      const input = filtroClienteInputRef.current;
      if (input) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }, 0);
  };

  const carregarPagamentosDoBanco = async () => {
    setLoading(true);
    setError(null);
    setShowError(false);

    try {
      const params = new URLSearchParams();
      
      if (filtroCliente.trim()) {
        const cnpjLimpoFiltro = filtroCliente.replace(/\D/g, '');
        const pareceCNPJ = cnpjLimpoFiltro.length === 14;
        
        if (pareceCNPJ) {
          params.append('cnpj', cnpjLimpoFiltro);
        } else {
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
        console.log('[PagamentosTab] Pagamentos retornados:', pagamentosRetornados.length);
        console.log('[PagamentosTab] Primeiro pagamento (com ID?):', pagamentosRetornados[0]?.id ? 'SIM' : 'NÃO', pagamentosRetornados[0]);
        setPagamentos(pagamentosRetornados);
        
        if (pagamentosRetornados.length === 0) {
          setError('Nenhum pagamento encontrado no banco de dados para os filtros informados.');
          setShowError(true);
        } else {
          setError(null);
          setShowError(false);
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

  useEffect(() => {
    carregarPagamentosDoBanco();
  }, []);

  // Limpar timer ao desmontar componente
  useEffect(() => {
    return () => {
      if (deleteTimer) {
        clearInterval(deleteTimer);
      }
    };
  }, [deleteTimer]);

  const handleDeleteClick = (pagamentoId: string | undefined, numeroDocumento: string) => {
    if (!pagamentoId) {
      setError('ID do pagamento não disponível para exclusão');
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
      }, 5000);
      return;
    }
    // Limpar timer anterior se existir
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    
    // Iniciar contagem regressiva de 3 segundos
    setPendingDelete({ pagamentoId, numeroDocumento, cnpj: null, countdown: 3, tipo: 'documento' });
    
    let countdown = 3;
    const timer = setInterval(() => {
      countdown -= 1;
      setPendingDelete(prev => ({ ...prev, countdown }));
      
      if (countdown <= 0) {
        clearInterval(timer);
        setDeleteTimer(null);
        // Executar exclusão automaticamente
        executeDelete(pagamentoId, numeroDocumento);
      }
    }, 1000);
    
    setDeleteTimer(timer);
  };

  const handleDeleteClienteClick = (cnpj: string, nomeCliente: string) => {
    // Limpar timer anterior se existir
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    
    // Iniciar contagem regressiva de 3 segundos
    setPendingDelete({ pagamentoId: null, numeroDocumento: null, cnpj, countdown: 3, tipo: 'cliente' });
    
    let countdown = 3;
    const timer = setInterval(() => {
      countdown -= 1;
      setPendingDelete(prev => ({ ...prev, countdown }));
      
      if (countdown <= 0) {
        clearInterval(timer);
        setDeleteTimer(null);
        // Executar exclusão automaticamente
        executeDeleteCliente(cnpj, nomeCliente);
      }
    }, 1000);
    
    setDeleteTimer(timer);
  };

  const cancelDelete = () => {
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    setPendingDelete({ pagamentoId: null, numeroDocumento: null, cnpj: null, countdown: 0, tipo: 'documento' });
  };

  const executeDelete = async (pagamentoId: string, numeroDocumento: string) => {
    // Limpar estado de exclusão pendente
    setPendingDelete({ pagamentoId: null, numeroDocumento: null, cnpj: null, countdown: 0, tipo: 'documento' });
    
    try {
      // Excluir todos os registros relacionados ao número de documento (pai + filhos)
      const response = await axios.delete(`/api/receita-pagamentos/${pagamentoId}`, {
        params: { numeroDocumento }
      });
      
      if (response.data.success) {
        const totalExcluidos = response.data.data?.totalExcluidos || 1;
        // Mostrar mensagem de sucesso
        setSuccessMessage(
          totalExcluidos > 1 
            ? `Pagamento "${numeroDocumento}" e ${totalExcluidos - 1} desmembramento(s) excluído(s) com sucesso!`
            : `Pagamento "${numeroDocumento}" excluído com sucesso!`
        );
        setShowSuccess(true);
        
        // Ocultar mensagem após 5 segundos
        setTimeout(() => {
          setShowSuccess(false);
        }, 5000);
        
        // Recarregar lista de pagamentos
        await carregarPagamentosDoBanco();
      } else {
        throw new Error(response.data.error || 'Erro ao excluir pagamento');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao excluir pagamento';
      setError(errorMessage);
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
      }, 5000);
    }
  };

  const executeDeleteCliente = async (cnpj: string, nomeCliente: string) => {
    // Limpar estado de exclusão pendente
    setPendingDelete({ pagamentoId: null, numeroDocumento: null, cnpj: null, countdown: 0, tipo: 'cliente' });
    
    try {
      // Excluir todos os pagamentos do cliente por CNPJ
      const response = await axios.delete(`/api/receita-pagamentos/cliente`, {
        params: { cnpj }
      });
      
      if (response.data.success) {
        const totalExcluidos = response.data.data?.totalExcluidos || 0;
        // Mostrar mensagem de sucesso
        setSuccessMessage(
          `${totalExcluidos} pagamento(s) do cliente "${nomeCliente}" excluído(s) com sucesso!`
        );
        setShowSuccess(true);
        
        // Ocultar mensagem após 5 segundos
        setTimeout(() => {
          setShowSuccess(false);
        }, 5000);
        
        // Recarregar lista de pagamentos
        await carregarPagamentosDoBanco();
      } else {
        throw new Error(response.data.error || 'Erro ao excluir pagamentos do cliente');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao excluir pagamentos do cliente';
      setError(errorMessage);
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
      }, 5000);
    }
  };

  const handleConsultarReceita = async () => {
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
      const validResp = await axios.get('/api/receita/validar-token', { params: { cnpj: cnpjLimpo } });
      if (!validResp.data?.success) {
        throw new Error(validResp.data?.error || validResp.data?.message || 'Falha ao validar token/acesso na Receita');
      }

      setSuccessMessage('Access Token válido. Iniciando consulta...');
      setShowSuccess(true);
      setConsultandoReceita(true);

      const dataInicialFormatada = new Date(dataInicial).toISOString().split('T')[0];
      const dataFinalFormatada = new Date(dataFinal).toISOString().split('T')[0];

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

      await carregarPagamentosDoBanco();

      setSuccessMessage('Consulta concluída com sucesso.');
      setShowSuccess(true);
      setCnpj('');
      setDataInicial('');
      setDataFinal('');
    } catch (err: any) {
      console.error('[Pagamentos] Erro ao consultar Receita Federal:', err);
      
      let errorMessage = 'Erro ao consultar pagamentos na Receita Federal';
      let errorDetails: string | undefined;

      const status = err.response?.status;
      if (status === 401) {
        errorMessage = 'Erro de autenticação: Token inválido ou expirado. Valide o acesso e tente novamente.';
      } else if (status === 403) {
        errorMessage = 'Erro de autorização: Acesso negado pela Receita Federal (verifique a procuração do CNPJ).';
      } else if (err.response?.data) {
        errorMessage = err.response.data.error || errorMessage;
        errorDetails = err.response.data.details;
        
        if (errorDetails) {
          errorMessage += `\n\nDetalhes: ${errorDetails}`;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setShowError(true);
      setCnpj('');
      setDataInicial('');
      setDataFinal('');
    } finally {
      setConsultandoReceita(false);
      setLoading(false);
    }
  };

  // Continua na próxima parte devido ao tamanho...
  // Vou criar o restante do componente em uma segunda parte
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Seção de Consulta à Receita Federal */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 w-full max-w-full">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCardIcon className="h-6 w-6 text-blue-600" />
          Consultar Receita Federal
        </h2>
        
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleConsultarReceita}
              disabled={loading || !cnpj || !dataInicial || !dataFinal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

        {showSuccess && successMessage && (
          <div className="mt-4">
            <Alert type="success" onClose={() => setShowSuccess(false)}>
              <div className="line-clamp-6 whitespace-pre-wrap">{successMessage}</div>
            </Alert>
          </div>
        )}

        {showError && error && (
          <div className="mt-4">
            <Alert type="error" onClose={() => setShowError(false)}>
              <div className="whitespace-pre-wrap break-words">{error}</div>
            </Alert>
          </div>
        )}
      </div>

      {/* Filtros */}
      {pagamentos.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 w-full max-w-full">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h2>
          <div className="flex items-center gap-4 flex-wrap">
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
                className="w-64 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-64 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            <div className="flex items-center gap-2">
              <label htmlFor="filtroStatus" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Status:
              </label>
              <select
                id="filtroStatus"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as 'todos' | 'pendente' | 'pago')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
              </select>
            </div>
          </div>
          
          {(filtroCliente || filtroNumeroDocumento || filtroStatus !== 'todos') && (
            <div className="mt-4">
              <button
                onClick={() => {
                  setFiltroCliente('');
                  setFiltroNumeroDocumento('');
                  setFiltroStatus('todos');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 focus:outline-none border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Totais */}
      {pagamentos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 gap-4 w-full max-w-full">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Clientes</div>
            <div className="text-lg font-bold text-purple-600 mt-1 truncate">{totais.totalClientes}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Documentos Únicos</div>
            <div className="text-lg font-bold text-gray-900 mt-1 truncate">{totais.totalDocumentos}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Total de Linhas</div>
            <div className="text-lg font-bold text-blue-600 mt-1 truncate">{totais.totalLinhas}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Valor Total</div>
            <div className="text-base font-bold text-gray-900 mt-1 whitespace-nowrap">{formatCurrency(totais.valorTotalDocumentos)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Valor Pago</div>
            <div className="text-base font-bold text-green-600 mt-1 whitespace-nowrap">{formatCurrency(totais.valorTotalPago)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Saldo Pendente</div>
            <div className="text-base font-bold text-red-600 mt-1 whitespace-nowrap">{formatCurrency(totais.valorTotalSaldo)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Documentos Pagos</div>
            <div className="text-lg font-bold text-green-600 mt-1 truncate">{totais.documentosPagos}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0">
            <div className="text-sm font-medium text-gray-500 truncate">Documentos Pendentes</div>
            <div className="text-lg font-bold text-red-600 mt-1 truncate">{totais.documentosPendentes}</div>
          </div>
        </div>
      )}

      {/* Lista de Pagamentos */}
      {pagamentos.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden w-full max-w-full">
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente / Nº Documento</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo / Descrição</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Competência</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arrecadação</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status / Ações</th>
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
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-700"></td>
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
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClienteClick(cliente.cnpj, cliente.nome);
                            }}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                            title="Excluir todos os pagamentos deste cliente"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>

                      {clienteExpandido && cliente.documentos.map((docPai) => {
                        const estaPago = docPai.valorSaldoDocumento === 0;
                        const temFilhos = docPai.filhos.length > 0;
                        const estaExpandido = expandedDocs.has(docPai.numeroDocumento);
                        
                        return (
                          <React.Fragment key={docPai.numeroDocumento}>
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
                                <div className="flex items-center justify-center gap-2">
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                      estaPago
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {estaPago ? 'Pago' : 'Pendente'}
                                  </span>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        setLoading(true);
                                        const cnpjCliente = cliente.cnpj;
                                        const response = await axios.get('/api/receita-pagamentos/comprovante', {
                                          params: {
                                            cnpj: cnpjCliente,
                                            numeroDocumento: docPai.numeroDocumento
                                          }
                                        });
                                        
                                        if (response.data.success) {
                                          const comprovanteData = response.data.data;
                                          
                                          // Verificar se tem PDF base64
                                          if (comprovanteData.pdfBase64) {
                                            // Converter base64 para blob e fazer download
                                            try {
                                              // Remover prefixo data:application/pdf;base64, se existir
                                              const base64Data = comprovanteData.pdfBase64.replace(/^data:application\/pdf;base64,/, '');
                                              
                                              // Converter base64 para blob
                                              const byteCharacters = atob(base64Data);
                                              const byteNumbers = new Array(byteCharacters.length);
                                              for (let i = 0; i < byteCharacters.length; i++) {
                                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                                              }
                                              const byteArray = new Uint8Array(byteNumbers);
                                              const blob = new Blob([byteArray], { type: 'application/pdf' });
                                              
                                              // Criar URL temporária e abrir em nova aba para visualização
                                              const url = window.URL.createObjectURL(blob);
                                              window.open(url, '_blank');
                                              
                                              // Limpar URL após um tempo (o navegador manterá a referência enquanto a aba estiver aberta)
                                              setTimeout(() => {
                                                window.URL.revokeObjectURL(url);
                                              }, 1000);
                                              
                                              setSuccessMessage('Comprovante aberto para visualização!');
                                              setShowSuccess(true);
                                              setTimeout(() => {
                                                setShowSuccess(false);
                                              }, 5000);
                                            } catch (viewError: any) {
                                              console.error('Erro ao processar o PDF:', viewError);
                                              setError('Erro ao processar o PDF do comprovante');
                                              setShowError(true);
                                              setTimeout(() => {
                                                setShowError(false);
                                              }, 5000);
                                            }
                                          } else {
                                            // Se não tem PDF, mostrar mensagem
                                            setSuccessMessage('Comprovante encontrado, mas formato não reconhecido.');
                                            setShowSuccess(true);
                                            setTimeout(() => {
                                              setShowSuccess(false);
                                            }, 5000);
                                            console.log('Comprovante (sem PDF):', comprovanteData);
                                          }
                                        } else {
                                          throw new Error(response.data.error || 'Erro ao buscar comprovante');
                                        }
                                      } catch (err: any) {
                                        const errorMessage = err.response?.data?.error || err.message || 'Erro ao buscar comprovante';
                                        setError(errorMessage);
                                        setShowError(true);
                                        setTimeout(() => {
                                          setShowError(false);
                                        }, 5000);
                                      } finally {
                                        setLoading(false);
                                      }
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                                    title="Buscar comprovante na Receita Federal"
                                  >
                                    Comprovante
                                  </button>
                                </div>
                              </td>
                            </tr>

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
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">—</td>
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

      {!loading && pagamentos.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
          <p className="text-gray-500">
            Nenhum pagamento encontrado no banco de dados. Use a seção "Consultar Receita Federal" acima para buscar novos pagamentos.
          </p>
        </div>
      )}

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

      {/* Notificação de exclusão pendente com contagem regressiva */}
      {((pendingDelete.pagamentoId || pendingDelete.cnpj) && pendingDelete.countdown > 0) && (
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
                  {pendingDelete.tipo === 'cliente' 
                    ? `Cliente: ${pendingDelete.cnpj ? formatCNPJ(pendingDelete.cnpj) : 'N/A'}`
                    : `Pagamento: ${pendingDelete.numeroDocumento || 'N/A'}`
                  }
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

export default PagamentosTab;

