import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ConferenceIssue } from '../services/conferences';
import { fetchConferenceSummary } from '../services/conferences';
import { dctfService, type DCTFListItem } from '../services/dctf';
import { clientesService } from '../services/clientes';
import { format } from 'date-fns';
import { api } from '../services/api';
import type { AxiosError } from 'axios';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  BuildingOfficeIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  ClockIcon,
  BookOpenIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../components/Pagination';

function formatDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'dd/MM/yyyy');
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

type SeverityTagProps = {
  severity: ConferenceIssue['severity'];
};

function SeverityTag({ severity }: SeverityTagProps) {
  const styles: Record<ConferenceIssue['severity'], string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const labels: Record<ConferenceIssue['severity'], string> = {
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

export default function Conferencias() {

  const [issues, setIssues] = useState<ConferenceIssue[]>([]);
  const [transmissionObligationIssues, setTransmissionObligationIssues] = useState<ConferenceIssue[]>([]);
  const [allSemMovimentoIssues, setAllSemMovimentoIssues] = useState<ConferenceIssue[]>([]);  // ✅ Nova lista simples
  const [missingPeriodIssues, setMissingPeriodIssues] = useState<ConferenceIssue[]>([]);
  const [duplicateDeclarationIssues, setDuplicateDeclarationIssues] = useState<ConferenceIssue[]>([]);
  const [futurePeriodIssues, setFuturePeriodIssues] = useState<ConferenceIssue[]>([]);
  const [retificadoraSequenceIssues, setRetificadoraSequenceIssues] = useState<ConferenceIssue[]>([]);
  const [clientesSemDCTFIssues, setClientesSemDCTFIssues] = useState<ConferenceIssue[]>([]);  // ✅ Clientes sem DCTF na competência vigente
  const [hostDadosObrigacoes, setHostDadosObrigacoes] = useState<any[]>([]);  // ✅ Obrigações baseadas no Banco SCI (movimento)
  const [hostDadosLoading, setHostDadosLoading] = useState(false);
  const [hostDadosError, setHostDadosError] = useState<string | null>(null);
  const [clientesSemDCTFComMovimento, setClientesSemDCTFComMovimento] = useState<any[]>([]);  // ✅ Clientes sem DCTF mas COM movimento no SCI
  const [clientesSemDCTFComMovimentoLoading, setClientesSemDCTFComMovimentoLoading] = useState(false);
  const [clientesSemDCTFComMovimentoError, setClientesSemDCTFComMovimentoError] = useState<string | null>(null);
  const [competenciaSelecionada, setCompetenciaSelecionada] = useState<{ ano: number; mes: number } | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedRegistros, setExpandedRegistros] = useState<Set<string>>(new Set());
  const [ultimosRegistros, setUltimosRegistros] = useState<Map<string, DCTFListItem[]>>(new Map());
  const [totalRegistros, setTotalRegistros] = useState<Map<string, number>>(new Map());
  const [loadingRegistros, setLoadingRegistros] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [paginaAtualMissingPeriod, setPaginaAtualMissingPeriod] = useState(1);
  const [paginaAtualDuplicate, setPaginaAtualDuplicate] = useState(1);
  const [paginaAtualFuture, setPaginaAtualFuture] = useState(1);
  const [paginaAtualSequence, setPaginaAtualSequence] = useState(1);
  const [paginaAtualClientesSemDCTF, setPaginaAtualClientesSemDCTF] = useState(1);
  const [paginaAtualClientesSemDCTFComMovimento, setPaginaAtualClientesSemDCTFComMovimento] = useState(1);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set()); // Seções fechadas por padrão
  const [mostrarTodasEmpresasSemMovimento, setMostrarTodasEmpresasSemMovimento] = useState(false); // Controla se mostra todas as empresas ou apenas 6
  const [paginaAtualHostDados, setPaginaAtualHostDados] = useState(1);
  const itensPorPagina = 10;

  // Calcular competência vigente (mês anterior ao atual)
  const competenciaVigente = useMemo(() => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();
    const mes = mesAtual === 1 ? 12 : mesAtual - 1;
    const ano = mesAtual === 1 ? anoAtual - 1 : anoAtual;
    return { ano, mes };
  }, []);

  // Inicializar competência selecionada com a vigente
  useEffect(() => {
    if (!competenciaSelecionada) {
      setCompetenciaSelecionada(competenciaVigente);
    }
  }, [competenciaVigente, competenciaSelecionada]);

  // Buscar obrigações do Banco SCI
  useEffect(() => {
    if (!competenciaSelecionada) return;

    let mounted = true;
    (async () => {
      try {
        setHostDadosLoading(true);
        setHostDadosError(null);

        const response = await api.get('/host-dados/obrigacoes', {
          params: {
            ano: competenciaSelecionada.ano,
            mes: competenciaSelecionada.mes,
          },
        });

        if (!mounted) return;

        if (response.data?.success) {
          // Se sucesso, mesmo que array vazio, não é erro
          setHostDadosObrigacoes(response.data.data || []);
          setHostDadosError(null); // Limpar erro se houver sucesso
          console.log(`[Conferencias] Obrigações carregadas: ${response.data.data?.length || 0} registros`);
        } else {
          // Se não teve sucesso, mas não é erro de conexão, pode ser que não há dados
          const errorMsg = response.data?.error || 'Não foi possível carregar obrigações.';
          setHostDadosError(errorMsg);
          setHostDadosObrigacoes([]);
        }
      } catch (err) {
        if (!mounted) return;
        const error = err as AxiosError<any>;
        console.error('[Conferencias] Erro ao carregar obrigações do Banco SCI:', error);
        console.error('[Conferencias] Response:', error.response?.data);
        console.error('[Conferencias] Competência:', competenciaSelecionada);
        
        let errorMessage = 'Erro ao carregar obrigações baseadas em movimentação SCI.';
        
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error.message) {
          errorMessage = `${errorMessage} Detalhes: ${error.message}`;
        }
        
        if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
          errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando.';
        }
        
        setHostDadosError(errorMessage);
        setHostDadosObrigacoes([]);
      } finally {
        if (mounted) {
          setHostDadosLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [competenciaSelecionada]);

  // Buscar clientes sem DCTF mas com movimento no SCI
  useEffect(() => {
    if (!competenciaSelecionada) return;

    let mounted = true;
    (async () => {
      try {
        setClientesSemDCTFComMovimentoLoading(true);
        setClientesSemDCTFComMovimentoError(null);

        console.log(`[Conferencias] Buscando clientes sem DCTF mas com movimento para ${competenciaSelecionada.mes}/${competenciaSelecionada.ano}`);

        const response = await api.get('/host-dados/clientes-sem-dctf-com-movimento', {
          params: {
            ano: competenciaSelecionada.ano,
            mes: competenciaSelecionada.mes,
          },
        });

        if (!mounted) return;

        if (response.data?.success) {
          setClientesSemDCTFComMovimento(response.data.data || []);
          setClientesSemDCTFComMovimentoError(null);
          console.log(`[Conferencias] Clientes sem DCTF com movimento carregados: ${response.data.data?.length || 0} registros`);
        } else {
          const errorMsg = response.data?.error || 'Erro ao carregar clientes sem DCTF com movimento.';
          setClientesSemDCTFComMovimentoError(errorMsg);
          setClientesSemDCTFComMovimento([]);
        }
      } catch (err) {
        if (!mounted) return;
        const error = err as AxiosError<any>;
        console.error('[Conferencias] Erro ao carregar clientes sem DCTF com movimento:', error);
        
        let errorMessage = 'Erro ao carregar clientes sem DCTF com movimento no SCI.';
        
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error.message) {
          errorMessage = `${errorMessage} Detalhes: ${error.message}`;
        }
        
        if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
          errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando.';
        }
        
        setClientesSemDCTFComMovimentoError(errorMessage);
        setClientesSemDCTFComMovimento([]);
      } finally {
        if (mounted) {
          setClientesSemDCTFComMovimentoLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [competenciaSelecionada]);

  // Filtrar por CNPJ se vier da URL
  const cnpjFiltro = searchParams.get('cnpj');
  const hostDadosFiltrados = useMemo(() => {
    if (!cnpjFiltro) return hostDadosObrigacoes;
    const cnpjLimpo = cnpjFiltro.replace(/\D/g, '');
    return hostDadosObrigacoes.filter((o) => o.cnpj === cnpjLimpo);
  }, [hostDadosObrigacoes, cnpjFiltro]);

  // Paginação para Banco SCI
  const totalPaginasHostDados = Math.ceil(hostDadosFiltrados.length / itensPorPagina);
  const indiceInicioHostDados = (paginaAtualHostDados - 1) * itensPorPagina;
  const indiceFimHostDados = indiceInicioHostDados + itensPorPagina;
  const hostDadosPaginados = useMemo(() => {
    return hostDadosFiltrados.slice(indiceInicioHostDados, indiceFimHostDados);
  }, [hostDadosFiltrados, indiceInicioHostDados, indiceFimHostDados]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const summary = await fetchConferenceSummary();
        if (!mounted) return;
        
        // Validar estrutura da resposta
        if (!summary || !summary.rules) {
          throw new Error('Resposta inválida do servidor. Estrutura de dados incorreta.');
        }
        
        setIssues(summary.rules.dueDate || []);
        setTransmissionObligationIssues(summary.rules.transmissionObligation || []);
        setAllSemMovimentoIssues(summary.rules.allSemMovimento || []);  // ✅ Nova lista simples
        setMissingPeriodIssues(summary.rules.missingPeriod || []);
        setDuplicateDeclarationIssues(summary.rules.duplicateDeclaration || []);
        setFuturePeriodIssues(summary.rules.futurePeriod || []);
        setRetificadoraSequenceIssues(summary.rules.retificadoraSequence || []);
        setClientesSemDCTFIssues(summary.rules.clientesSemDCTF || []);  // ✅ Clientes sem DCTF na competência vigente
        setGeneratedAt(summary.generatedAt || new Date().toISOString());
      } catch (err) {
        console.error('Erro ao carregar conferências:', err);
        if (!mounted) return;
        const errorMessage = err instanceof Error ? err.message : 'Não foi possível carregar as conferências.';
        setError(errorMessage);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const orderedIssues = useMemo(() => {
    // Filtrar competências vencidas - não listar porque pode ser retificadora
    // e a original foi enviada dentro do prazo. Só conta como atrasada se for original,
    // mas isso não precisa checar agora.
    const filteredIssues = issues.filter(issue => {
      // Remover issues vencidas (severity 'high' com mensagem de vencida)
      if (issue.severity === 'high' && issue.message?.toLowerCase().includes('vencida')) {
        return false;
      }
      return true;
    });
    
    const severityOrder: Record<ConferenceIssue['severity'], number> = { high: 0, medium: 1, low: 2 };
    return filteredIssues.sort((a, b) => {
      if (a.severity === b.severity) {
        return (new Date(a.dueDate).getTime() || 0) - (new Date(b.dueDate).getTime() || 0);
      }
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [issues]);

  // Resetar para página 1 quando issues mudarem
  useEffect(() => {
    setPaginaAtual(1);
  }, [issues.length]);

  useEffect(() => {
  }, [transmissionObligationIssues.length]);

  // Calcular paginação para issues de prazo
  const totalPaginas = Math.ceil(orderedIssues.length / itensPorPagina);
  const indiceInicio = (paginaAtual - 1) * itensPorPagina;
  const indiceFim = indiceInicio + itensPorPagina;
  const issuesPaginadas = useMemo(() => {
    return orderedIssues.slice(indiceInicio, indiceFim);
  }, [orderedIssues, indiceInicio, indiceFim]);

  // Ordenar e paginar issues de obrigatoriedade
  const orderedObligationIssues = useMemo(() => {
    const severityOrder: Record<ConferenceIssue['severity'], number> = { high: 0, medium: 1, low: 2 };
    return [...transmissionObligationIssues].sort((a, b) => {
      if (a.severity === b.severity) {
        return (new Date(a.dueDate).getTime() || 0) - (new Date(b.dueDate).getTime() || 0);
      }
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [transmissionObligationIssues]);


  // Calcular estatísticas para os cards de resumo
  const stats = useMemo(() => {
    // Filtrar competências vencidas das estatísticas também
    const filteredIssues = issues.filter(issue => {
      // Remover issues vencidas (severity 'high' com mensagem de vencida)
      if (issue.severity === 'high' && issue.message?.toLowerCase().includes('vencida')) {
        return false;
      }
      return true;
    });
    
    const allIssues = [
      ...filteredIssues,
      ...transmissionObligationIssues,
      ...missingPeriodIssues,
      ...duplicateDeclarationIssues,
      ...futurePeriodIssues,
      ...retificadoraSequenceIssues,
    ];

    // Contar obrigações do Banco SCI por severidade
    const hostDadosAlta = hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM' && o.severidade === 'alta').length;
    const hostDadosMedia = hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM' && o.severidade === 'media').length;
    const hostDadosBaixa = hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM' && o.severidade === 'baixa').length;

    // Contar clientes sem DCTF com movimento por severidade (baseado em dias até vencimento)
    const clientesSemDCTFComMovimentoAlta = clientesSemDCTFComMovimento.filter((c) => {
      const dias = c.diasAteVencimento || 0;
      return dias < 0 || dias <= 5;
    }).length;
    const clientesSemDCTFComMovimentoMedia = clientesSemDCTFComMovimento.filter((c) => {
      const dias = c.diasAteVencimento || 0;
      return dias > 5 && dias > 0;
    }).length;

    return {
      criticas: allIssues.filter(i => i.severity === 'high').length + hostDadosAlta + clientesSemDCTFComMovimentoAlta,
      medias: allIssues.filter(i => i.severity === 'medium').length + hostDadosMedia + clientesSemDCTFComMovimentoMedia,
      baixas: allIssues.filter(i => i.severity === 'low').length + hostDadosBaixa,
      clientesSemDCTF: clientesSemDCTFIssues.length,
      clientesSemDCTFComMovimento: clientesSemDCTFComMovimento.length,
      pendenciasPrazo: filteredIssues.length, // Usar filteredIssues ao invés de issues
      duplicatas: duplicateDeclarationIssues.length,
      hostDadosObrigacoes: hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM').length,
      hostDadosAlta,
      hostDadosMedia,
      hostDadosBaixa,
      total: allIssues.length + clientesSemDCTFIssues.length + hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM').length + clientesSemDCTFComMovimento.length,
    };
  }, [issues, transmissionObligationIssues, missingPeriodIssues, duplicateDeclarationIssues, futurePeriodIssues, retificadoraSequenceIssues, clientesSemDCTFIssues, hostDadosFiltrados, clientesSemDCTFComMovimento]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const scrollToSection = (sectionId: string) => {
    // Mapear ID da seção para a chave do estado (remover prefixo 'secao-')
    const sectionKey = sectionId.replace('secao-', '');
    
    const element = document.getElementById(sectionId);
    if (element) {
      // Expandir a seção se estiver colapsada
      if (!expandedSections.has(sectionKey)) {
        setExpandedSections((prev) => new Set(prev).add(sectionKey));
      }
      // Aguardar um pouco para a animação de expansão antes de fazer scroll
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const toggleActionPlan = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleRegistros = async (issueId: string, cnpj: string) => {
    setExpandedRegistros((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
        return next;
      } else {
        next.add(issueId);
        
        // Se ainda não carregou os registros, buscar
        if (!ultimosRegistros.has(cnpj)) {
          loadUltimosRegistros(issueId, cnpj);
        }
        
        return next;
      }
    });
  };

  const loadUltimosRegistros = async (issueId: string, cnpj: string) => {
    setLoadingRegistros((prev) => new Set(prev).add(issueId));
    try {
      // Limpar CNPJ para busca (remover formatação)
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      
      // Primeiro, buscar o cliente pelo CNPJ
      const clientesResponse = await clientesService.getAll({ 
        cnpj: cnpjLimpo,
        limit: 1 
      });
      
      let registros: DCTFListItem[] = [];
      
      // Se encontrou o cliente, buscar DCTF por clienteId
      if (clientesResponse.items && clientesResponse.items.length > 0) {
        const cliente = clientesResponse.items[0];
        try {
          const dctfResponse = await dctfService.getAll({
            limit: 100,
            page: 1,
            clienteId: cliente.id,
          });
          registros = dctfResponse.items || [];
        } catch (err) {
          console.error('Erro ao buscar DCTF por cliente:', err);
          registros = [];
        }
      } else {
        // Se não encontrou cliente, buscar por search e filtrar
        const dctfResponse = await dctfService.getAll({
          limit: 100,
          page: 1,
        });
        
        // Filtrar apenas os registros que correspondem ao CNPJ
        registros = dctfResponse.items.filter(item => {
          const itemCnpj = item.cliente?.cnpj_limpo || item.numeroIdentificacao?.replace(/\D/g, '') || '';
          return itemCnpj === cnpjLimpo;
        });
      }
      
      // Ordenar por data de transmissão (mais recentes primeiro)
      const registrosOrdenados = [...registros].sort((a, b) => {
        const dateA = a.dataTransmissao ? new Date(a.dataTransmissao).getTime() : 0;
        const dateB = b.dataTransmissao ? new Date(b.dataTransmissao).getTime() : 0;
        return dateB - dateA;
      });
      
      // Armazenar o total de registros encontrados
      const totalEncontrado = registrosOrdenados.length;
      setTotalRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, totalEncontrado);
        return next;
      });
      
      // Limitar a exibição aos 6 primeiros (ou menos se não houver 6)
      const registrosLimitados = registrosOrdenados.slice(0, 6);
      
      setUltimosRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, registrosLimitados);
        return next;
      });
    } catch (error) {
      console.error('Erro ao carregar últimos registros:', error);
      setUltimosRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, []);
        return next;
      });
      setTotalRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, 0);
        return next;
      });
    } finally {
      setLoadingRegistros((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error('Erro ao copiar para área de transferência:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm text-gray-600">Carregando conferências...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-xl">
          <p className="text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-3 flex items-center gap-3">
              <ClipboardDocumentCheckIcon className="h-7 w-7 text-blue-600" />
              Conferências e Alertas Legais
            </h1>
            <p className="text-base text-gray-600 mb-2">
              Monitoramos automaticamente o cumprimento dos prazos legais estabelecidos pelas Instruções Normativas da RFB.
            </p>
            {/* Normas Aplicáveis */}
            <div className="mt-4">
              <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpenIcon className="h-4 w-4 text-gray-500" />
                    <span className="text-xs font-medium text-gray-700">Normas Aplicáveis:</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href="https://barroscarvalho.com.br"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-600 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                    >
                      IN RFB 2.237/2024
                      <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                    </a>
                    <span className="text-gray-300">•</span>
                    <a
                      href="https://legisweb.com.br"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-600 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                    >
                      IN RFB 2.267/2025
                      <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                    </a>
                    <span className="text-gray-300">•</span>
                    <a
                      href="https://legisweb.com.br"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-600 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                    >
                      IN RFB 2.248/2025
                      <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {generatedAt && (
            <div className="flex-shrink-0">
              <p className="text-sm text-gray-500 flex items-center gap-1 whitespace-nowrap">
                <ClockIcon className="h-4 w-4" />
                Atualizado em {formatDate(generatedAt)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cards de Resumo - Estatísticas Principais */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
          {/* Card: Críticas */}
          <button
            onClick={() => scrollToSection('secao-prazos')}
            className="bg-white rounded-lg border-2 border-red-200 shadow-sm hover:shadow-md hover:border-red-300 transition-all p-4 text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircleIcon className="h-5 w-5 text-red-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Alta</span>
            </div>
            <p className="text-2xl font-bold text-red-600 mb-1">{stats.criticas}</p>
            <p className="text-xs text-gray-600">Críticas</p>
          </button>

          {/* Card: Médias */}
          <button
            onClick={() => scrollToSection('secao-prazos')}
            className="bg-white rounded-lg border-2 border-amber-200 shadow-sm hover:shadow-md hover:border-amber-300 transition-all p-4 text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <ExclamationCircleIcon className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Média</span>
            </div>
            <p className="text-2xl font-bold text-amber-600 mb-1">{stats.medias}</p>
            <p className="text-xs text-gray-600">Médias</p>
          </button>

          {/* Card: Baixas */}
          <button
            onClick={() => scrollToSection('secao-prazos')}
            className="bg-white rounded-lg border-2 border-blue-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all p-4 text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <InformationCircleIcon className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Baixa</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 mb-1">{stats.baixas}</p>
            <p className="text-xs text-gray-600">Baixas</p>
          </button>

          {/* Card: Clientes sem DCTF */}
          <button
            onClick={() => scrollToSection('secao-clientes-sem-dctf')}
            className="bg-white rounded-lg border-2 border-purple-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all p-4 text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BuildingOfficeIcon className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Vigente</span>
            </div>
            <p className="text-2xl font-bold text-purple-600 mb-1">{stats.clientesSemDCTF}</p>
            <p className="text-xs text-gray-600">Sem DCTF</p>
          </button>

          {/* Card: Pendências de Prazo */}
          <button
            onClick={() => scrollToSection('secao-prazos')}
            className="bg-white rounded-lg border-2 border-orange-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all p-4 text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <ClockIcon className="h-5 w-5 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Prazo</span>
            </div>
            <p className="text-2xl font-bold text-orange-600 mb-1">{stats.pendenciasPrazo}</p>
            <p className="text-xs text-gray-600">Pendências</p>
          </button>

          {/* Card: Duplicatas */}
          <button
            onClick={() => scrollToSection('secao-duplicatas')}
            className="bg-white rounded-lg border-2 border-yellow-200 shadow-sm hover:shadow-md hover:border-yellow-300 transition-all p-4 text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Duplicatas</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600 mb-1">{stats.duplicatas}</p>
            <p className="text-xs text-gray-600">Encontradas</p>
          </button>

          {/* Card: Obrigações Banco SCI */}
          <button
            onClick={() => scrollToSection('secao-host-dados')}
            className="bg-white rounded-lg border-2 border-indigo-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all p-4 text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <BuildingOfficeIcon className="h-5 w-5 text-indigo-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">SCI</span>
            </div>
            <p className="text-2xl font-bold text-indigo-600 mb-1">{stats.hostDadosObrigacoes || 0}</p>
            <p className="text-xs text-gray-600">Com Movimento</p>
          </button>
        </div>
      </div>

      {/* Seção de Obrigatoriedade de Transmissão - Accordion */}
      <div id="secao-obrigatoriedade" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => toggleSection('obrigatoriedade')}
          className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1">
            {expandedSections.has('obrigatoriedade') ? (
              <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            )}
            <div className="flex-1 text-left">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <DocumentTextIcon className="h-5 w-5 text-blue-600" />
                Obrigatoriedade de Transmissão
              </h2>
              <p className="text-sm text-gray-600">
                Análise de obrigatoriedade conforme IN RFB 2.237/2024 e 2.248/2025. Verifica "Original sem movimento".
              </p>
            {(() => {
              const semMovimentoCount = orderedObligationIssues.filter(issue => issue.details?.isSemMovimento).length;
              if (semMovimentoCount > 0) {
                return (
                  <p className="text-xs text-gray-500 mt-1">
                    <span>📋 {semMovimentoCount} "sem movimento"</span>
                  </p>
                );
              }
              return null;
            })()}
            </div>
          </div>
          <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
            Total: <span className="text-gray-900">{orderedObligationIssues.length}</span> {orderedObligationIssues.length === 1 ? 'registro' : 'registros'}
          </div>
        </button>
        
        {expandedSections.has('obrigatoriedade') && (
          <>
            {/* Card de Alerta - Empresas Sem Movimento da Competência Vigente */}
            {(() => {
              // Calcular competência vigente (mês anterior ao atual)
              const hoje = new Date();
              const mesAtual = hoje.getMonth() + 1; // getMonth() retorna 0-11
              const anoAtual = hoje.getFullYear();
              
              // Competência vigente: mês anterior
              const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
              const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
              const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
              
              // ✅ FILTRO SIMPLES: tipo LIKE "sem movimento" E período = competência vigente
              const semMovimentoCompetenciaVigente = allSemMovimentoIssues.filter(issue => 
                issue.period === competenciaVigente
              );
              
              return semMovimentoCompetenciaVigente.length > 0;
            })() && (
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-blue-600 text-white">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-lg">
                        <DocumentTextIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">📋 Empresas "Sem Movimento" - Competência Vigente</h3>
                        <p className="text-sm text-blue-100 mt-0.5">
                          {(() => {
                            const hoje = new Date();
                            const mesAtual = hoje.getMonth() + 1;
                            const anoAtual = hoje.getFullYear();
                            const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                            const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                            const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                            return allSemMovimentoIssues.filter(i => i.period === competenciaVigente).length;
                          })()} empresas declararam "sem movimento" em {(() => {
                            const hoje = new Date();
                            const mesAtual = hoje.getMonth() + 1;
                            const anoAtual = hoje.getFullYear();
                            const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                            const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                            return `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <div className="bg-green-50 border-2 border-green-300 rounded-lg px-4 py-3 mb-4">
                      <p className="text-sm text-green-900 font-bold flex items-center gap-2 mb-2">
                        <CheckIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
                        ✅ Importante: Próximos meses NÃO precisam ser enviados!
                      </p>
                      <p className="text-xs text-green-800 ml-7">
                        Enquanto a empresa continuar sem movimento, não há obrigação de transmitir DCTFs dos meses seguintes. 
                        <span className="font-semibold"> Só precisa enviar novamente quando houver movimento.</span>
                      </p>
                      <p className="text-xs text-green-700 ml-7 mt-1 italic">
                        📖 Base legal: IN RFB 2.237/2024, Art. 3º
                      </p>
                    </div>
                    
                    {/* Lista de empresas - 6 primeiras em ordem alfabética ou todas */}
                    {(() => {
                      const hoje = new Date();
                      const mesAtual = hoje.getMonth() + 1;
                      const anoAtual = hoje.getFullYear();
                      const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                      const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                      const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                      
                      // Filtrar e ordenar alfabeticamente
                      const empresasFiltradas = allSemMovimentoIssues
                        .filter(i => i.period === competenciaVigente)
                        .sort((a, b) => {
                          const nameA = (a.businessName ?? '').toLowerCase();
                          const nameB = (b.businessName ?? '').toLowerCase();
                          return nameA.localeCompare(nameB, 'pt-BR');
                        });
                      
                      // Pegar 6 primeiras ou todas, dependendo do estado
                      const empresasParaExibir = mostrarTodasEmpresasSemMovimento 
                        ? empresasFiltradas 
                        : empresasFiltradas.slice(0, 6);
                      
                      const totalEmpresas = empresasFiltradas.length;
                      const temMaisEmpresas = totalEmpresas > 6;
                      
                      return (
                        <div className="mt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {empresasParaExibir.map((issue) => (
                              <button
                                key={issue.id}
                                onClick={() => navigate(`/dctf?search=${issue.identification}`)}
                                className="bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400 hover:shadow-md transition-all text-left group"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                      {issue.businessName ?? 'Empresa não identificada'}
                                    </p>
                                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                                      {formatCNPJ(issue.identification)}
                                    </p>
                                  </div>
                                  <SeverityTag severity={issue.severity} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">
                                    Competência: <span className="font-medium">{issue.period}</span>
                                  </span>
                                  <span className="text-xs text-blue-600 group-hover:underline flex items-center gap-1">
                                    Ver DCTFs
                                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                          
                          {/* Botão Mostrar mais / Ocultar */}
                          {temMaisEmpresas && (
                            <div className="mt-4 text-center">
                              <button
                                onClick={() => setMostrarTodasEmpresasSemMovimento(!mostrarTodasEmpresasSemMovimento)}
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-2 mx-auto"
                              >
                                {mostrarTodasEmpresasSemMovimento ? (
                                  <>
                                    <ChevronDownIcon className="h-4 w-4" />
                                    Ocultar ({totalEmpresas - 6} empresas)
                                  </>
                                ) : (
                                  <>
                                    Mostrar mais ({totalEmpresas - 6} empresas)
                                    <ChevronRightIcon className="h-4 w-4" />
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

          </>
        )}
      </div>

      {/* Seção de Obrigações baseadas em Movimentação do Banco SCI */}
      <div id="secao-host-dados" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => toggleSection('host-dados')}
          className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1">
            {expandedSections.has('host-dados') ? (
              <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            )}
            <div className="flex-1 text-left">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <BuildingOfficeIcon className="h-5 w-5 text-indigo-600" />
                Obrigações por Movimentação do Banco SCI
              </h2>
              <p className="text-sm text-gray-600">
                Empresas com movimento no SCI (FPG, CTB, FISE, FISS) que ainda não enviaram DCTF para a competência.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Seletor de competência */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Competência:</label>
              <select
                value={competenciaSelecionada ? `${competenciaSelecionada.ano}-${competenciaSelecionada.mes}` : ''}
                onChange={(e) => {
                  const [ano, mes] = e.target.value.split('-').map(Number);
                  setCompetenciaSelecionada({ ano, mes });
                  setPaginaAtualHostDados(1);
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const hoje = new Date();
                  const options = [];
                  for (let i = 0; i < 12; i++) {
                    const date = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
                    const ano = date.getFullYear();
                    const mes = date.getMonth() + 1;
                    const competencia = `${String(mes).padStart(2, '0')}/${ano}`;
                    options.push(
                      <option key={`${ano}-${mes}`} value={`${ano}-${mes}`}>
                        {competencia}
                      </option>
                    );
                  }
                  return options;
                })()}
              </select>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM').length}</span> obrigações
            </div>
          </div>
        </button>

        {expandedSections.has('host-dados') && (
          <div className="p-6">
            {hostDadosLoading ? (
              <div className="text-center py-8">
                <svg className="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-600">Carregando obrigações...</p>
              </div>
            ) : hostDadosError ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-800">{hostDadosError}</p>
              </div>
            ) : hostDadosPaginados.filter((o) => o.obrigacao === 'SIM').length === 0 ? (
              <div className="text-center py-8">
                <BuildingOfficeIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Nenhuma obrigação encontrada</p>
                <p className="text-sm text-gray-500 mt-1">
                  {competenciaSelecionada
                    ? `Para ${String(competenciaSelecionada.mes).padStart(2, '0')}/${competenciaSelecionada.ano}`
                    : 'Selecione uma competência'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Empresa</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">CNPJ</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Competência</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Movimentos</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status DCTF</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Obrigação</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Prazo</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {hostDadosPaginados
                        .filter((o) => o.obrigacao === 'SIM')
                        .map((obrigacao) => {
                          const diasAteVencimento = obrigacao.diasAteVencimento;
                          const isVencido = diasAteVencimento < 0;
                          const isProximoVencimento = diasAteVencimento >= 0 && diasAteVencimento <= 5;

                          return (
                            <tr key={`${obrigacao.cnpj}-${obrigacao.ano}-${obrigacao.mes}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{obrigacao.razao_social}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-600 font-mono">{formatCNPJ(obrigacao.cnpj)}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{obrigacao.competencia}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex flex-col gap-1">
                                  <div className="text-xs text-gray-600">
                                    {obrigacao.tipos_movimento.join(', ')}
                                  </div>
                                  <div className="text-xs font-medium text-gray-900">
                                    Total: {obrigacao.total_movimentacoes}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {obrigacao.tem_dctf ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <CheckIcon className="h-3 w-3 mr-1" />
                                    Enviada
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    <XCircleIcon className="h-3 w-3 mr-1" />
                                    Não enviada
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                    obrigacao.severidade === 'alta'
                                      ? 'bg-red-100 text-red-800 border-red-200'
                                      : obrigacao.severidade === 'media'
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : 'bg-blue-100 text-blue-800 border-blue-200'
                                  }`}
                                >
                                  {obrigacao.obrigacao === 'SIM' ? 'SIM' : obrigacao.obrigacao === 'NAO' ? 'NÃO' : 'VERIFICAR'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm">
                                  {isVencido ? (
                                    <span className="text-red-600 font-semibold">Vencido ({Math.abs(diasAteVencimento)} dias)</span>
                                  ) : isProximoVencimento ? (
                                    <span className="text-amber-600 font-semibold">Vence em {diasAteVencimento} dias</span>
                                  ) : (
                                    <span className="text-gray-600">{diasAteVencimento} dias</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM').length > itensPorPagina && (
                  <div className="mt-4">
                    <Pagination
                      currentPage={paginaAtualHostDados}
                      onPageChange={setPaginaAtualHostDados}
                      totalPages={totalPaginasHostDados}
                      totalItems={hostDadosFiltrados.filter((o) => o.obrigacao === 'SIM').length}
                      itemsPerPage={itensPorPagina}
                      itemLabel="obrigação"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Seção de Conferências - Accordion */}
      <div id="secao-prazos" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => toggleSection('prazos')}
          className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1">
            {expandedSections.has('prazos') ? (
              <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            )}
            <div className="flex-1 text-left">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
                Entrega dentro do prazo legal
              </h2>
              <p className="text-sm text-gray-600">
                Classificamos o risco considerando atrasos e proximidade do vencimento conforme as normas aplicáveis.
              </p>
            </div>
          </div>
          <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
            Total: <span className="text-gray-900">{orderedIssues.length}</span> pendências
          </div>
        </button>
        
        {expandedSections.has('prazos') && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento Legal</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Data de Envio</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Situação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orderedIssues.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-gray-500">
                    Nenhuma pendência encontrada. Todas as declarações analisadas estão dentro do prazo.
                  </td>
                </tr>
              ) : (
                issuesPaginadas.map(issue => {
                  const isExpanded = expanded.has(issue.id);
                  const isRegistrosExpanded = expandedRegistros.has(issue.id);
                  const isLoadingRegistros = loadingRegistros.has(issue.id);
                  const registros = ultimosRegistros.get(issue.identification) || [];
                  const totalRegistrosCnpj = totalRegistros.get(issue.identification) || 0;
                  const temMaisRegistros = totalRegistrosCnpj > 6;
                  
                  return (
                    <Fragment key={issue.id}>
                      <tr 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleRegistros(issue.id, issue.identification)}
                      >
                        <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                          <div className="flex items-center gap-2">
                            {isRegistrosExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            )}
                            {issue.businessName ?? '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(issue.identification, issue.id);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                              title="Copiar CNPJ"
                            >
                              {copiedId === issue.id ? (
                                <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.dueDate)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.transmissionDate)}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize text-xs">{issue.status ?? '—'}</td>
                        <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {issue.actionPlan ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActionPlan(issue.id);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                            </button>
                          ) : (
                            <span className="text-gray-400">Sem plano cadastrado</span>
                          )}
                        </td>
                      </tr>
                      {issue.actionPlan && isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={9} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                            <strong>Plano de ação:</strong> {issue.actionPlan}
                          </td>
                        </tr>
                      )}
                      {isRegistrosExpanded && (
                        <tr className="bg-blue-50">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-800 mb-2">Últimos Registros DCTF</h4>
                              {isLoadingRegistros ? (
                                <div className="text-xs text-gray-500 text-center py-2">Carregando registros...</div>
                              ) : registros.length === 0 ? (
                                <div className="text-xs text-gray-500 text-center py-2">Nenhum registro encontrado.</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Competência</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Data Transmissão</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Situação</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Tipo</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Débito Apurado</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Saldo a Pagar</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {registros.map((registro) => (
                                        <tr key={registro.id} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 text-gray-600">{registro.periodo}</td>
                                          <td className="px-3 py-2 text-gray-600">
                                            {formatDate(registro.dataTransmissao?.toString())}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                              registro.status === 'concluido' 
                                                ? 'bg-green-100 text-green-800' 
                                                : registro.status === 'processando'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-gray-100 text-gray-800'
                                            }`}>
                                              {registro.status || '—'}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 text-xs">{registro.situacao || '—'}</td>
                                          <td className="px-3 py-2 text-gray-600 text-xs">{registro.tipoDeclaracao || '—'}</td>
                                          <td className="px-3 py-2 text-gray-600 text-right text-xs">
                                            {registro.debitoApurado !== null && registro.debitoApurado !== undefined
                                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(registro.debitoApurado)
                                              : '—'}
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 text-right text-xs">
                                            {registro.saldoAPagar !== null && registro.saldoAPagar !== undefined
                                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(registro.saldoAPagar)
                                              : '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {temMaisRegistros && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const cnpjLimpo = issue.identification.replace(/\D/g, '');
                                      navigate(`/dctf?search=${cnpjLimpo}`);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    Ver Mais ({totalRegistrosCnpj - 6} registro{totalRegistrosCnpj - 6 > 1 ? 's' : ''})
                                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {!isLoading && orderedIssues.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <Pagination
                  currentPage={paginaAtual}
                  totalPages={totalPaginas}
                  totalItems={orderedIssues.length}
                  itemsPerPage={itensPorPagina}
                  onPageChange={setPaginaAtual}
                  itemLabel="pendência"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Seção de Lacunas de Períodos - Accordion */}
      {duplicateDeclarationIssues.length > 0 && (
        <div id="secao-duplicatas" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <button
            onClick={() => toggleSection('duplicatas')}
            className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              {expandedSections.has('duplicatas') ? (
                <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              )}
              <div className="flex-1 text-left">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                  Declarações Duplicadas
                </h2>
                <p className="text-sm text-gray-600">
                  Detecta múltiplas declarações originais para o mesmo período. Conforme legislação, não deve haver múltiplas declarações originais para o mesmo período (exceto SERO).
                </p>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{duplicateDeclarationIssues.length}</span> duplicatas
            </div>
          </button>
          
          {expandedSections.has('duplicatas') && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Período</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                {duplicateDeclarationIssues
                  .slice((paginaAtualDuplicate - 1) * itensPorPagina, paginaAtualDuplicate * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  </tbody>
                </table>
              </div>
              {duplicateDeclarationIssues.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtualDuplicate}
                    totalPages={Math.ceil(duplicateDeclarationIssues.length / itensPorPagina)}
                    totalItems={duplicateDeclarationIssues.length}
                    itemsPerPage={itensPorPagina}
                    onPageChange={setPaginaAtualDuplicate}
                    itemLabel="duplicata"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Seção de Períodos Futuros - Accordion */}
      {futurePeriodIssues.length > 0 && (
        <div id="secao-futuros" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <button
            onClick={() => toggleSection('futuros')}
            className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              {expandedSections.has('futuros') ? (
                <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              )}
              <div className="flex-1 text-left">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                  Períodos Futuros
                </h2>
                <p className="text-sm text-gray-600">
                  Detecta declarações com períodos futuros, indicando possível erro de digitação ou cadastro incorreto.
                </p>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{futurePeriodIssues.length}</span> erros
            </div>
          </button>
          
          {expandedSections.has('futuros') && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Período</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                {futurePeriodIssues
                  .slice((paginaAtualFuture - 1) * itensPorPagina, paginaAtualFuture * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  </tbody>
                </table>
              </div>
              {futurePeriodIssues.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtualFuture}
                    totalPages={Math.ceil(futurePeriodIssues.length / itensPorPagina)}
                    totalItems={futurePeriodIssues.length}
                    itemsPerPage={itensPorPagina}
                    onPageChange={setPaginaAtualFuture}
                    itemLabel="erro"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Seção de Sequência de Retificadoras - Accordion */}
      {retificadoraSequenceIssues.length > 0 && (
        <div id="secao-retificadoras" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <button
            onClick={() => toggleSection('retificadoras')}
            className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              {expandedSections.has('retificadoras') ? (
                <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              )}
              <div className="flex-1 text-left">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                  Sequência de Retificadoras
                </h2>
                <p className="text-sm text-gray-600">
                  Detecta múltiplas retificadoras para o mesmo período, indicando possível problema na sequência ou necessidade de revisão.
                </p>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{retificadoraSequenceIssues.length}</span> alertas
            </div>
          </button>
          
          {expandedSections.has('retificadoras') && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Período</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                {retificadoraSequenceIssues
                  .slice((paginaAtualSequence - 1) * itensPorPagina, paginaAtualSequence * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  </tbody>
                </table>
              </div>
              {retificadoraSequenceIssues.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtualSequence}
                    totalPages={Math.ceil(retificadoraSequenceIssues.length / itensPorPagina)}
                    totalItems={retificadoraSequenceIssues.length}
                    itemsPerPage={itensPorPagina}
                    onPageChange={setPaginaAtualSequence}
                    itemLabel="alerta"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Seção de Clientes sem DCTF mas COM Movimento no SCI - Accordion */}
      <div id="secao-clientes-sem-dctf-com-movimento" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => toggleSection('clientes-sem-dctf-com-movimento')}
          className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1">
            {expandedSections.has('clientes-sem-dctf-com-movimento') ? (
              <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            )}
            <div className="flex-1 text-left">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                Clientes sem DCTF mas COM Movimento no SCI
              </h2>
              <p className="text-sm text-gray-600">
                Clientes que <strong>NÃO têm DCTF</strong> na competência vigente, mas <strong>TÊM movimento</strong> no Banco SCI no mês anterior.
                Estes clientes têm <strong>obrigação de enviar DCTF</strong> conforme IN RFB 2.237/2024.
              </p>
            </div>
          </div>
          <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
            {clientesSemDCTFComMovimentoLoading ? (
              <span className="text-gray-500">Carregando...</span>
            ) : (
              <>
                Total: <span className="text-gray-900">{clientesSemDCTFComMovimento.length}</span> clientes
              </>
            )}
          </div>
        </button>
        
        {expandedSections.has('clientes-sem-dctf-com-movimento') && (
          <>
            {clientesSemDCTFComMovimentoLoading ? (
              <div className="px-6 py-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-gray-600">Carregando clientes sem DCTF com movimento...</p>
              </div>
            ) : clientesSemDCTFComMovimentoError ? (
              <div className="px-6 py-4">
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                  <strong>Erro:</strong> {clientesSemDCTFComMovimentoError}
                </div>
              </div>
            ) : clientesSemDCTFComMovimento.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <InformationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">
                  Nenhum cliente encontrado sem DCTF mas com movimento no SCI para a competência {competenciaSelecionada ? `${String(competenciaSelecionada.mes).padStart(2, '0')}/${competenciaSelecionada.ano}` : 'selecionada'}.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Isso pode indicar que todos os clientes com movimento já têm DCTF enviada, ou que não há dados sincronizados no Banco SCI.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Competência Obrigação</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Movimento em</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Tipos Movimento</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Total Movimentações</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Dias até Vencimento</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Possível Obrigação de Envio</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {clientesSemDCTFComMovimento
                        .slice((paginaAtualClientesSemDCTFComMovimento - 1) * itensPorPagina, paginaAtualClientesSemDCTFComMovimento * itensPorPagina)
                        .map((cliente, index) => {
                          const diasAteVencimento = cliente.diasAteVencimento || 0;
                          const severidade = diasAteVencimento < 0 ? 'high' : diasAteVencimento <= 5 ? 'high' : 'medium';
                          
                          return (
                            <tr key={`${cliente.cnpj}-${index}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-800 font-medium text-xs">{cliente.razao_social || '—'}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span>
                                  <button
                                    onClick={() => copyToClipboard(cliente.cnpj, `movimento-${cliente.cnpj}`)}
                                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                    title="Copiar CNPJ"
                                  >
                                    {copiedId === `movimento-${cliente.cnpj}` ? (
                                      <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                    ) : (
                                      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs">
                                <span className="font-semibold text-red-600">{cliente.competencia_obrigacao}</span>
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs">{cliente.competencia_movimento}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs">
                                <div className="flex flex-wrap gap-1">
                                  {cliente.tipos_movimento && cliente.tipos_movimento.length > 0 ? (
                                    cliente.tipos_movimento.map((tipo: string, idx: number) => (
                                      <span key={idx} className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                                        {tipo}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs font-semibold">
                                {cliente.total_movimentacoes?.toLocaleString('pt-BR') || '0'}
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cliente.prazoVencimento)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                  diasAteVencimento < 0 
                                    ? 'bg-red-100 text-red-800 border-red-200' 
                                    : diasAteVencimento <= 5 
                                    ? 'bg-red-100 text-red-800 border-red-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}>
                                  {diasAteVencimento < 0 
                                    ? `Vencido há ${Math.abs(diasAteVencimento)} dia${Math.abs(diasAteVencimento) !== 1 ? 's' : ''}`
                                    : `${diasAteVencimento} dia${diasAteVencimento !== 1 ? 's' : ''}`
                                  }
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {cliente.possivelObrigacaoEnvio ? (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-200 px-2.5 py-0.5 text-xs font-medium">
                                      <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                      Sim
                                    </span>
                                    {cliente.motivoObrigacao && (
                                      <span className="text-xs text-gray-600" title={cliente.motivoObrigacao}>
                                        {cliente.motivoObrigacao.length > 50 
                                          ? `${cliente.motivoObrigacao.substring(0, 50)}...` 
                                          : cliente.motivoObrigacao}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-800 border border-gray-200 px-2.5 py-0.5 text-xs font-medium">
                                      <InformationCircleIcon className="w-3 h-3 mr-1" />
                                      Verificar
                                    </span>
                                    {cliente.motivoObrigacao && (
                                      <span className="text-xs text-gray-600" title={cliente.motivoObrigacao}>
                                        {cliente.motivoObrigacao.length > 50 
                                          ? `${cliente.motivoObrigacao.substring(0, 50)}...` 
                                          : cliente.motivoObrigacao}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => {
                                    const cnpjLimpo = cliente.cnpj.replace(/\D/g, '');
                                    navigate(`/clientes?search=${cnpjLimpo}&tab=lancamentos`);
                                  }}
                                  className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                                  title="Ver lançamentos deste cliente"
                                >
                                  Ver Lançamentos
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {clientesSemDCTFComMovimento.length > itensPorPagina && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <Pagination
                      currentPage={paginaAtualClientesSemDCTFComMovimento}
                      totalPages={Math.ceil(clientesSemDCTFComMovimento.length / itensPorPagina)}
                      totalItems={clientesSemDCTFComMovimento.length}
                      itemsPerPage={itensPorPagina}
                      onPageChange={setPaginaAtualClientesSemDCTFComMovimento}
                      itemLabel="cliente"
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Seção de Clientes sem DCTF na Competência Vigente - Accordion */}
      {clientesSemDCTFIssues.length > 0 && (
        <div id="secao-clientes-sem-dctf" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <button
            onClick={() => toggleSection('clientes-sem-dctf')}
            className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              {expandedSections.has('clientes-sem-dctf') ? (
                <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              )}
              <div className="flex-1 text-left">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                  <BuildingOfficeIcon className="h-5 w-5 text-red-600" />
                  Clientes sem DCTF na Competência Vigente
                </h2>
                <p className="text-sm text-gray-600">
                  Lista de clientes cadastrados que não apresentaram DCTF enviada no mês vigente. Conforme IN RFB 2.237/2024, 2.267/2025 e 2.248/2025.
                </p>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{clientesSemDCTFIssues.length}</span> clientes
            </div>
          </button>
          
          {expandedSections.has('clientes-sem-dctf') && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                {clientesSemDCTFIssues
                  .slice((paginaAtualClientesSemDCTF - 1) * itensPorPagina, paginaAtualClientesSemDCTF * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.dueDate)}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={7} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  </tbody>
                </table>
              </div>
              {clientesSemDCTFIssues.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtualClientesSemDCTF}
                    totalPages={Math.ceil(clientesSemDCTFIssues.length / itensPorPagina)}
                    totalItems={clientesSemDCTFIssues.length}
                    itemsPerPage={itensPorPagina}
                    onPageChange={setPaginaAtualClientesSemDCTF}
                    itemLabel="cliente"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
