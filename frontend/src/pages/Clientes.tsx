import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useClientes } from '../hooks/useClientes';
import type { Cliente } from '../types';
import { Pagination } from '../components/Pagination';
import {
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  CheckIcon,
  PlusIcon,
  BuildingOfficeIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  FunnelIcon,
  ChevronDownIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';
import { api } from '../services/api';
import type { AxiosError } from 'axios';
import PagamentosTab from '../components/Clientes/PagamentosTab';
import EProcessosTab from '../components/Clientes/EProcessosTab';
import { clientesService } from '../services';
import { useToast } from '../hooks/useToast';

const Clientes: React.FC = () => {
  const { clientes, loadClientes, createCliente, updateClienteById, deleteClienteById, loading, error, clearError } = useClientes();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<Partial<Cliente>>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [socioFiltro, setSocioFiltro] = useState<string>('');
  const [sociosOptions, setSociosOptions] = useState<string[]>([]);
  const [socioSearchInput, setSocioSearchInput] = useState<string>('');
  const [showSocioDropdown, setShowSocioDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  // Aba Participação
  const [clientesParticipacao, setClientesParticipacao] = useState<Cliente[]>([]);
  const [loadingParticipacao, setLoadingParticipacao] = useState(false);
  const [searchParticipacao, setSearchParticipacao] = useState('');
  const [ordenacaoParticipacao, setOrdenacaoParticipacao] = useState<'a-z' | 'z-a' | 'cnpj' | 'faltantes' | 'sem-registro' | 'capital-zerado' | 'divergente'>('a-z');
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  // const [clienteParticipacao, setClienteParticipacao] = useState<Cliente | null>(null); // Removido - usando clientesParticipacao
  // const [paymentsFilter, setPaymentsFilter] = useState<'all' | 'with' | 'without'>('all'); // Não utilizado no momento
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [customErrorMessage, setCustomErrorMessage] = useState<string>('');
  const [copiedCnpj, setCopiedCnpj] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ cliente: Cliente | null; countdown: number }>({ cliente: null, countdown: 0 });
  const [deleteTimer, setDeleteTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<'clientes' | 'participacao' | 'lancamentos' | 'pagamentos' | 'e-processos'>(() => {
    // Inicializar pela URL/localStorage para evitar 1º render na aba errada (que dispara várias requisições/toasts)
    const params = new URLSearchParams(window.location.search);
    const tabFromQuery = params.get('tab');
    const tabFromStorage = window.localStorage.getItem('clientes_active_tab');
    const tab = (tabFromQuery as any) || tabFromStorage || 'clientes';

    if (tab === 'pagamentos') return 'pagamentos';
    if (tab === 'lancamentos') return 'lancamentos';
    if (tab === 'e-processos') return 'e-processos';
    if (tab === 'participacao') return 'participacao';
    return 'clientes';
  });
  const [cnpjParaPagamentos, setCnpjParaPagamentos] = useState<string | undefined>(undefined);
  const [hostLancamentos, setHostLancamentos] = useState<any[]>([]);
  const [hostLoading, setHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [showManualFilters, setShowManualFilters] = useState(false);
  const [manualDataIni, setManualDataIni] = useState<string>('');
  const [manualDataFim, setManualDataFim] = useState<string>('');
  const [importandoReceita, setImportandoReceita] = useState(false);
  const [mostrarCadastroCompleto, setMostrarCadastroCompleto] = useState(false);
  const [mostrarAtividadesSecundarias, setMostrarAtividadesSecundarias] = useState(false);
  // const [ultimaImportacaoMeta, setUltimaImportacaoMeta] = useState<any>(null); // Não utilizado no momento
  const [visualizandoCliente, setVisualizandoCliente] = useState<Cliente | null>(null);
  const [atualizandoCliente, setAtualizandoCliente] = useState(false);
  const [atualizandoSocios, setAtualizandoSocios] = useState<string | null>(null); // ID do cliente sendo atualizado
  const [recalculandoValores, setRecalculandoValores] = useState<string | null>(null); // ID do cliente sendo recalculado
  const [uploadingPdf, setUploadingPdf] = useState(false); // Estado para upload de PDF
  const navigate = useNavigate();
  const location = useLocation();
  
  // Refs para evitar múltiplas execuções simultâneas
  const carregandoParticipacaoRef = useRef(false);
  const toastInfoRef = useRef<string | null>(null);
  const toastRateLimitParticipacaoRef = useRef(false);
  const cancelarCarregamentoRef = useRef(false);
  const jaTentouCarregarRef = useRef(false); // Rastrear se já tentou carregar nesta sessão
  const activeTabAnteriorRef = useRef<string>(''); // Rastrear aba anterior
  const atualizandoSociosIdRef = useRef<string | null>(null); // Ref para rastrear qual cliente está sendo atualizado
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref para input de arquivo

  // Função para formatar CPF ou CNPJ
  const formatarCpfCnpj = (valor: string | null | undefined): string => {
    if (!valor) return '-';
    
    // Remover formatação existente (pontos, traços, barras)
    const limpo = valor.replace(/\D/g, '');
    
    // CPF: 11 dígitos → 000.000.000-00
    if (limpo.length === 11) {
      return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    
    // CNPJ: 14 dígitos → 00.000.000/0000-00
    if (limpo.length === 14) {
      return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    
    // Se não for CPF nem CNPJ, retornar o valor original
    return valor;
  };

  // Função para mudar de aba e atualizar URL
  const handleTabChange = (tab: 'clientes' | 'participacao' | 'lancamentos' | 'pagamentos' | 'e-processos') => {
    setActiveTab(tab);
    // Atualizar URL sem recarregar a página
    const params = new URLSearchParams(location.search);
    if (tab === 'clientes') {
      params.delete('tab'); // 'clientes' é o padrão, não precisa na URL
    } else {
      params.set('tab', tab);
    }
    navigate({ search: params.toString() }, { replace: true });
    // Salvar no localStorage também
    localStorage.setItem('clientes_active_tab', tab);
  };

  const limparForm = () => {
    setShowForm(false);
    setEditingCliente(null);
    setFormData({});
    setMostrarCadastroCompleto(false);
    // setUltimaImportacaoMeta(null); // Não utilizado no momento
  };

  // Funções para upload de PDF da Situação Fiscal
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (file.type !== 'application/pdf') {
      toast.error('Apenas arquivos PDF são permitidos');
      return;
    }

    // Validar tamanho (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('O arquivo deve ter no máximo 10MB');
      return;
    }

    setUploadingPdf(true);

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      // CNPJ será extraído automaticamente do PDF

      toast.info('Enviando PDF e processando com Python...', 5000);

      const res = await fetch('/api/situacao-fiscal/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || `Erro HTTP ${res.status}`);
      }

      toast.success(body.message || `PDF processado com sucesso. ${body.data?.sociosExtraidos || 0} sócio(s) extraído(s).`, 5000);

      // Recarregar lista de clientes para Participação após sucesso
      if (activeTab === 'participacao') {
        setTimeout(() => {
          loadClientes();
        }, 1000);
      }

      // Limpar campos
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('[Upload PDF] Erro:', error);
      toast.error(error.message || 'Erro ao processar PDF. Verifique se Python e pdfplumber estão instalados.');
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Detectar tab na query string (ou localStorage) ao entrar/alterar URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabFromQuery = params.get('tab');
    const tabFromStorage = window.localStorage.getItem('clientes_active_tab') as
      | 'clientes'
      | 'participacao'
      | 'lancamentos'
      | 'pagamentos'
      | 'e-processos'
      | null;

    const tab = (tabFromQuery as any) || tabFromStorage || 'clientes';
    if (tab === 'pagamentos') setActiveTab('pagamentos');
    else if (tab === 'lancamentos') setActiveTab('lancamentos');
    else if (tab === 'e-processos') setActiveTab('e-processos');
    else if (tab === 'participacao') setActiveTab('participacao');
    else setActiveTab('clientes');
    
    // Detectar CNPJ na query string para pagamentos, e-processos, lançamentos e clientes
    const cnpjFromQuery = params.get('cnpj');
    if (cnpjFromQuery) {
      const cnpjLimpo = cnpjFromQuery.replace(/\D/g, '');
      if (cnpjLimpo.length === 14) {
        if (tab === 'pagamentos' || tab === 'e-processos') {
          setCnpjParaPagamentos(cnpjLimpo);
        } else if (tab === 'lancamentos' || tab === 'clientes') {
          // Preencher o campo de busca com o CNPJ formatado
          const cnpjFormatado = cnpjLimpo
            .replace(/(\d{2})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
          setSearch(cnpjFormatado);
        }
      }
    }
  }, [location.search]);

  // Detectar scroll para mostrar botão "voltar ao topo" na aba Participação
  useEffect(() => {
    if (activeTab !== 'participacao') {
      setShowScrollToTop(false);
      // Notificar Layout para mostrar o menu novamente
      window.dispatchEvent(new CustomEvent('hideScrollToTopButton'));
      return;
    }

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
  }, [activeTab]);

  // Função para voltar ao topo
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Função para compartilhar link com âncora
  const compartilharCliente = async (clienteId: string) => {
    try {
      const baseUrl = window.location.origin;
      const linkCompleto = `${baseUrl}/clientes?tab=participacao&anchor=${clienteId}`;
      
      // Copiar para área de transferência
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(linkCompleto);
      } else {
        // Fallback para contextos não-seguros
        const textArea = document.createElement('textarea');
        textArea.value = linkCompleto;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      setCopiedLink(clienteId);
      toast.success('Link copiado para a área de transferência!', 3000);
      
      setTimeout(() => {
        setCopiedLink(null);
      }, 3000);
    } catch (err) {
      console.error('Erro ao copiar link:', err);
      toast.error('Erro ao copiar link');
    }
  };

  // Calcular total de registros filtrados na aba Participação
  const totalRegistrosFiltrados = React.useMemo(() => {
    if (activeTab !== 'participacao' || loadingParticipacao || clientesParticipacao.length === 0) {
      return 0;
    }
    
    return clientesParticipacao
      // 1. Aplicar busca por texto
      .filter(c => {
        if (!searchParticipacao || !searchParticipacao.trim()) return true;
        
        const search = searchParticipacao.toLowerCase().trim();
        if (!search) return true;
        
        const normalize = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const cnpjLimpo = search.replace(/\D/g, '');
        const cnpjMatch = cnpjLimpo.length > 0 && (
          c.cnpj?.includes(searchParticipacao) ||
          c.cnpj_limpo?.includes(cnpjLimpo) ||
          c.cnpj?.replace(/\D/g, '').includes(cnpjLimpo)
        );
        const razaoSocial = c.razao_social || c.nome || '';
        const razaoSocialNormalizada = normalize(razaoSocial);
        const searchNormalizada = normalize(search);
        const palavrasBusca = searchNormalizada.split(/\s+/).filter(p => p.length > 0);
        const nomeMatch = razaoSocialNormalizada.includes(searchNormalizada);
        const palavrasMatch = palavrasBusca.length > 0 && palavrasBusca.every(palavra => 
          razaoSocialNormalizada.includes(palavra)
        );
        const inicioPalavraMatch = palavrasBusca.some(palavra => 
          razaoSocialNormalizada.split(/\s+/).some(palavraRazao => palavraRazao.startsWith(palavra))
        );
        return cnpjMatch || nomeMatch || palavrasMatch || inicioPalavraMatch;
      })
      // 2. Aplicar filtros especiais
      .filter(c => {
        if (ordenacaoParticipacao === 'faltantes') {
          return c.socios && c.socios.length > 0 && c.socios.some(s => 
            !s.participacao_percentual || !s.participacao_valor
          );
        } else if (ordenacaoParticipacao === 'sem-registro') {
          return !c.socios || c.socios.length === 0;
        } else if (ordenacaoParticipacao === 'capital-zerado') {
          const capital = c.capital_social;
          if (capital === null || capital === undefined || capital === '') return true;
          const capitalNum = typeof capital === 'number'
            ? capital
            : parseFloat(String(capital).replace(/[^\d,.-]/g, '').replace(',', '.'));
          return isNaN(capitalNum) || capitalNum === 0;
        } else if (ordenacaoParticipacao === 'divergente') {
          const sociosComQualificacao = c.socios?.filter(s => s.qual && s.qual.trim() !== '') || [];
          if (sociosComQualificacao.length === 0) return false;
          const somaPercentuais = sociosComQualificacao.reduce((acc, s) => {
            const percentual = s.participacao_percentual !== null && s.participacao_percentual !== undefined
              ? parseFloat(String(s.participacao_percentual))
              : 0;
            return acc + (isNaN(percentual) ? 0 : percentual);
          }, 0);
          const somaValores = sociosComQualificacao.reduce((acc, s) => {
            const valor = s.participacao_valor !== null && s.participacao_valor !== undefined
              ? parseFloat(String(s.participacao_valor))
              : 0;
            return acc + (isNaN(valor) ? 0 : valor);
          }, 0);
          const capitalSocial = c.capital_social 
            ? (typeof c.capital_social === 'number' 
                ? c.capital_social 
                : parseFloat(String(c.capital_social).replace(/[^\d,.-]/g, '').replace(',', '.')))
            : 0;
          const capitalSocialNum = isNaN(capitalSocial) ? 0 : capitalSocial;
          const percentuaisOk = Math.abs(somaPercentuais - 100) < 0.01;
          const valoresOk = capitalSocialNum > 0 && Math.abs(somaValores - capitalSocialNum) < 0.01;
          return !percentuaisOk || !valoresOk;
        }
        return true;
      }).length;
  }, [activeTab, loadingParticipacao, clientesParticipacao, searchParticipacao, ordenacaoParticipacao]);

  // Scroll até a âncora quando a página carregar
  useEffect(() => {
    if (activeTab === 'participacao') {
      const params = new URLSearchParams(location.search);
      const anchor = params.get('anchor');
      
      if (anchor) {
        // Aguardar um pouco para garantir que os elementos foram renderizados
        setTimeout(() => {
          const element = document.getElementById(`cliente-${anchor}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Destacar o elemento brevemente
            element.classList.add('ring-4', 'ring-amber-400', 'ring-opacity-75', 'rounded-lg');
            setTimeout(() => {
              element.classList.remove('ring-4', 'ring-amber-400', 'ring-opacity-75');
            }, 2000);
          }
        }, 500);
      }
    }
  }, [activeTab, location.search, clientesParticipacao.length]);

  // Detectar clienteId na query string para visualizar cliente (separado para garantir execução)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const clienteIdFromQuery = params.get('clienteId');
    
    if (clienteIdFromQuery) {
      // Verificar se já está visualizando este cliente para evitar chamadas desnecessárias
      const clienteIdAtual = visualizandoCliente?.id ? String(visualizandoCliente.id) : null;
      if (clienteIdAtual === clienteIdFromQuery) {
        return; // Já está visualizando este cliente
      }
      
      // Buscar e visualizar o cliente
      const buscarEVisualizarCliente = async () => {
        try {
          console.log('[Clientes] Buscando cliente por ID:', clienteIdFromQuery);
          const resp = await clientesService.obterCliente(clienteIdFromQuery);
          console.log('[Clientes] Resposta do obterCliente:', resp);
          
          // O backend retorna { success, data: Cliente }
          if (resp && typeof resp === 'object') {
            if ((resp as any).success && (resp as any).data) {
              setVisualizandoCliente((resp as any).data);
              // Scroll para o topo
              setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
            } else if ((resp as any).id) {
              // Se retornar diretamente o Cliente (sem wrapper)
              setVisualizandoCliente(resp as Cliente);
              setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
            }
          }
        } catch (error) {
          console.error('[Clientes] Erro ao buscar cliente:', error);
        }
      };
      void buscarEVisualizarCliente();
    } else {
      // Se não há clienteId na URL e está visualizando um cliente, limpar a visualização
      if (visualizandoCliente) {
        setVisualizandoCliente(null);
      }
    }
  }, [location.search]);

  // Debounce do search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page when searching
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Carregar lista de sócios (para select box) ao entrar na aba Clientes
  useEffect(() => {
    if (activeTab !== 'clientes') return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await clientesService.listarSociosDistinct();
        if (cancelled) return;
        const nomes = Array.isArray(resp?.data) ? resp.data.map((x: any) => String(x?.nome || '').trim()).filter(Boolean) : [];
        setSociosOptions(nomes);
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Load clientes when filters/pagination change (server-side for payments filter)
  // Não carregar se estiver na aba Participação (ela tem seu próprio carregamento)
  useEffect(() => {
    if (activeTab === 'participacao') {
      return; // Não fazer requisições na aba principal quando estiver em Participação
    }
    
    loadClientes({ page, limit, search: debouncedSearch, socio: socioFiltro || undefined }).then(({ pagination }) => {
      setTotal(pagination?.total ?? null);
      setTotalPages(pagination?.totalPages ?? null);
    }).catch(() => {});
  }, [page, limit, debouncedSearch, socioFiltro, activeTab]);

  // Carregar todos os clientes para a aba Participação
  useEffect(() => {
    // Só executar se a aba mudou para 'participacao' (não se já estava nela)
    const abaMudouParaParticipacao = activeTab === 'participacao' && activeTabAnteriorRef.current !== 'participacao';
    
    if (activeTab === 'participacao') {
      // Atualizar ref da aba anterior
      activeTabAnteriorRef.current = activeTab;
      
      // Se não mudou para participacao agora, não fazer nada (já estava nela)
      if (!abaMudouParaParticipacao) {
        // Se já está carregando, NÃO fazer nada (evitar múltiplas execuções)
        if (carregandoParticipacaoRef.current) {
          console.log('[Clientes] Já está carregando. Ignorando nova execução do useEffect.');
          return;
        }
        // Se já tem dados, não fazer nada
        if (clientesParticipacao.length > 0) {
          return;
        }
        // Se não está carregando e não tem dados, pode ser que houve erro - permitir nova tentativa
        if (!jaTentouCarregarRef.current) {
          // Primeira vez nesta sessão, permitir carregar
        } else {
          // Já tentou antes, não tentar novamente automaticamente
          return;
        }
      }
      
      // Evitar múltiplas execuções simultâneas
      if (carregandoParticipacaoRef.current) {
        console.log('[Clientes] Já está carregando clientes para Participação. Ignorando nova execução.');
        return;
      }
      
      jaTentouCarregarRef.current = true;
      carregandoParticipacaoRef.current = true;
      cancelarCarregamentoRef.current = false;
      setLoadingParticipacao(true);
      
      // Carregar todos os clientes fazendo múltiplas requisições (backend limita a 100 por página)
      const carregarTodosClientes = async () => {
        try {
          const aguardarComCancelamento = async (ms: number) => {
            const inicio = Date.now();
            while (!cancelarCarregamentoRef.current && Date.now() - inicio < ms) {
              // checar a cada 1s para permitir cancelamento ao trocar de aba
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          };

          // Mostrar toast apenas uma vez por sessão de carregamento
          if (!toastInfoRef.current) {
            toastInfoRef.current = 'loading';
            toast.info('Carregando empresas... Isso pode levar alguns segundos.', 5000);
          }
          const todosClientes: Cliente[] = [];
          let pagina = 1;
          let temMais = true;
          
          while (temMais && !cancelarCarregamentoRef.current) {
            console.log(`[Clientes Participação] 🔄 Iniciando iteração do loop. pagina=${pagina}, temMais=${temMais}, cancelarCarregamento=${cancelarCarregamentoRef.current}`);
            
            let tentativas = 0;
            let sucesso = false;
            let items: Cliente[] = [];
            let pagination: any = null;
            
            // Retry com backoff exponencial em caso de 429
            while (!sucesso && tentativas < 5 && !cancelarCarregamentoRef.current) {
              try {
                const resultado = await loadClientes({ 
                  page: pagina, 
                  limit: 100, // Máximo permitido pelo backend
                  search: '', 
                  socio: undefined 
                });
                
                items = resultado.items;
                pagination = resultado.pagination;
                sucesso = true;
                toastRateLimitParticipacaoRef.current = false; // resetar ao voltar a funcionar
              } catch (error: any) {
                tentativas++;
                if (cancelarCarregamentoRef.current) {
                  break;
                }
                const status = (error as any)?.status
                  ?? error?.response?.status
                  ?? (String(error?.message || '').includes('429') ? 429 : undefined);
                if (status === 429 && tentativas < 5) {
                  // Para evitar "spam" e respeitar o rate limit do backend, aguardar ~30s entre tentativas (com jitter)
                  const jitter = Math.floor(Math.random() * 5000); // 0-5s
                  const delay = 30000 + jitter;
                  console.warn(`[Clientes] Rate limit (429) na página ${pagina}. Aguardando ${delay}ms antes de tentar novamente... (tentativa ${tentativas}/5)`);
                  if (!toastRateLimitParticipacaoRef.current) {
                    toastRateLimitParticipacaoRef.current = true;
                    toast.warning(`Muitas requisições ao servidor. Aguardando ~${Math.round(delay / 1000)}s e tentando novamente...`, 8000);
                  }
                  await aguardarComCancelamento(delay);
                } else {
                  throw error; // Re-lançar se não for 429 ou se esgotou tentativas
                }
              }
            }
            
            if (!sucesso) {
              throw new Error(`Falha ao carregar página ${pagina} após ${tentativas} tentativas`);
            }
            
            todosClientes.push(...items);
            
            console.log(`[Clientes Participação] Página ${pagina}:`, {
              itemsRecebidos: items.length,
              totalAcumulado: todosClientes.length,
              pagination: pagination ? {
                page: pagination.page,
                limit: pagination.limit,
                total: pagination.total,
                totalPages: pagination.totalPages
              } : null
            });
            
            // Verificar se há mais páginas ANTES de incrementar
            // IMPORTANTE: O backend retorna pagination.totalPages baseado no total de clientes após filtros
            // Precisamos continuar carregando até que não haja mais páginas
            let temMaisProxima = false;
            if (pagination && pagination.totalPages) {
              // Verificar se ainda há páginas para carregar
              // Se pagina = 1 e totalPages = 3, ainda precisa carregar páginas 2 e 3
              // Se pagina = 2 e totalPages = 3, ainda precisa carregar página 3
              // Se pagina = 3 e totalPages = 3, não precisa mais (já carregou todas)
              // Verificar a PRÓXIMA página (pagina + 1) para saber se deve continuar
              temMaisProxima = (pagina + 1) <= pagination.totalPages;
              console.log(`[Clientes Participação] Verificando paginação: página atual ${pagina}, próxima será ${pagina + 1}, total de páginas ${pagination.totalPages}, temMaisProxima: ${temMaisProxima}`);
            } else {
              // Se não retornou paginação, verificar se retornou menos que o limite
              // Se retornou exatamente 100 itens, provavelmente há mais páginas
              temMaisProxima = items.length === 100;
              console.log(`[Clientes Participação] Sem paginação do backend: items.length=${items.length}, temMaisProxima: ${temMaisProxima}`);
            }
            
            // Atualizar temMais para a próxima iteração
            temMais = temMaisProxima;
            
            // Incrementar página DEPOIS de verificar, para que na próxima iteração já esteja correto
            pagina++;
            
            // Aguardar 1 segundo entre cada requisição para evitar rate limit (429)
            // Delay maior para garantir que o backend não bloqueie
            if (temMais) {
              console.log(`[Clientes Participação] ⏳ Aguardando 1s antes de carregar página ${pagina}...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              console.log(`[Clientes Participação] ✅ Aguardamento concluído. Verificando se deve continuar: temMais=${temMais}, cancelarCarregamento=${cancelarCarregamentoRef.current}`);
            } else {
              console.log(`[Clientes Participação] ✅ Todas as páginas foram carregadas. Total acumulado: ${todosClientes.length}`);
            }
            
            // Verificar novamente se deve continuar (pode ter sido cancelado durante o await)
            if (cancelarCarregamentoRef.current) {
              console.log(`[Clientes Participação] ⚠️ Carregamento cancelado durante o loop. Parando.`);
              break;
            }
            
            // Verificar novamente temMais antes de continuar o loop
            if (!temMais) {
              console.log(`[Clientes Participação] ✅ Não há mais páginas. Finalizando loop.`);
              break;
            }
          }
          
          console.log(`[Clientes Participação] 🏁 Loop finalizado. Motivo: temMais=${temMais}, cancelarCarregamento=${cancelarCarregamentoRef.current}, totalClientes=${todosClientes.length}`);
          
          // Filtrar apenas matrizes usando o campo tipo_empresa do cadastro
          // Filiais não têm sócios, então não devem aparecer na aba Participação
          // IMPORTANTE: Usar o campo tipo_empresa, não o sufixo do CNPJ, pois existem matrizes com 0002, 0003, etc.
          const apenasMatrizes = todosClientes.filter(cliente => {
            const tipoEmpresa = cliente.tipo_empresa;
            // Considerar como matriz se tipo_empresa === 'Matriz'
            // Também considerar null/undefined como potencial matriz (para compatibilidade com dados antigos)
            return tipoEmpresa === 'Matriz';
          });
          
          console.log(`[Clientes] ✅ Carregamento concluído:`);
          console.log(`   - Total de clientes carregados: ${todosClientes.length}`);
          console.log(`   - Total de matrizes encontradas: ${apenasMatrizes.length}`);
          console.log(`   - Páginas processadas: ${pagina - 1}`);
          
          // Verificar se há clientes duplicados
          const idsUnicos = new Set(todosClientes.map(c => c.id));
          if (idsUnicos.size !== todosClientes.length) {
            console.warn(`[Clientes] ⚠️ ATENÇÃO: ${todosClientes.length - idsUnicos.size} clientes duplicados detectados!`);
          }
          
          // Verificar distribuição de tipos de empresa
          const tiposEmpresa = todosClientes.reduce((acc, c) => {
            const tipo = c.tipo_empresa || 'NULL';
            acc[tipo] = (acc[tipo] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log(`[Clientes] Distribuição de tipos de empresa:`, tiposEmpresa);
          
          // Verificar se há clientes sem CNPJ válido
          const clientesSemCnpjValido = todosClientes.filter(cliente => {
            const cnpj = cliente.cnpj_limpo || cliente.cnpj?.replace(/\D/g, '') || '';
            return cnpj.length !== 14;
          });
          if (clientesSemCnpjValido.length > 0) {
            console.warn(`[Clientes] ⚠️  ${clientesSemCnpjValido.length} cliente(s) sem CNPJ válido (14 dígitos) foram ignorados`);
          }
          
          setClientesParticipacao(apenasMatrizes);
          setLoadingParticipacao(false);
          carregandoParticipacaoRef.current = false;
          toastInfoRef.current = null;
          toastRateLimitParticipacaoRef.current = false;
        } catch (error: any) {
          console.error('[Clientes] Erro ao carregar todos os clientes para Participação:', error);
          const status = (error as any)?.status
            ?? error?.response?.status
            ?? (String(error?.message || '').includes('429') ? 429 : undefined);
          if (status === 429) {
            toast.error('Muitas requisições ao servidor. Aguarde 30 segundos e recarregue a página (F5).', 5000);
          } else {
            toast.error(`Erro ao carregar clientes: ${error?.message || 'Erro desconhecido'}`);
          }
          setLoadingParticipacao(false);
          carregandoParticipacaoRef.current = false;
          toastInfoRef.current = null;
          toastRateLimitParticipacaoRef.current = false;
        }
      };
      
      void carregarTodosClientes().catch(() => {
        if (!cancelarCarregamentoRef.current) {
          carregandoParticipacaoRef.current = false;
          toastInfoRef.current = null;
        }
      });
      
      // Cleanup: NÃO cancelar automaticamente no cleanup
      // O cancelamento só deve acontecer quando realmente sairmos da aba Participação
      // Isso é feito no bloco else abaixo, não no cleanup
      // O cleanup aqui não faz nada para evitar cancelar durante re-renders
      return () => {
        // Não fazer nada no cleanup - deixar o carregamento continuar
        // O cancelamento será feito no else abaixo quando realmente sairmos da aba
        console.log('[Clientes] Cleanup do useEffect executado, mas não cancelando (pode ser apenas re-render)');
      };
    } else {
      // Atualizar ref da aba anterior
      activeTabAnteriorRef.current = activeTab;
      
      // Limpar clientes da participação quando sair da aba
      // IMPORTANTE: Só cancelar se realmente saiu da aba Participação
      if (activeTabAnteriorRef.current === 'participacao') {
        cancelarCarregamentoRef.current = true;
        setClientesParticipacao([]);
        setSearchParticipacao(''); // Limpar busca ao sair da aba
        carregandoParticipacaoRef.current = false;
        toastInfoRef.current = null;
        toastRateLimitParticipacaoRef.current = false;
        jaTentouCarregarRef.current = false; // Resetar para permitir recarregar quando voltar
      }
    }
  }, [activeTab]); // Apenas activeTab como dependência

  // Fechar dropdown de sócios ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.socio-filter-container')) {
        setShowSocioDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show error toast when error occurs
  useEffect(() => {
    if (error) {
      setCustomErrorMessage('');
      setShowSuccess(false); // Close success toast if error occurs
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
        clearError();
      }, 5000);
    }
  }, [error, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Sempre garantir que cnpj_limpo seja fornecido (sem formatação)
    const cnpjLimpo = formData.cnpj_limpo || (formData.cnpj ? formData.cnpj.replace(/\D/g, '') : '');
    const razaoSocial = formData.razao_social || formData.nome;
    if (!editingCliente && (!razaoSocial || String(razaoSocial).trim().length === 0)) {
      setCustomErrorMessage('Para criar um novo cliente, importe os dados da Receita (Razão Social é obrigatória).');
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
      return;
    }
    // Enviar também campos adicionais do cadastro quando existirem
    // (sem enviar `cnpj` formatado e nem `socios`, que são gerenciados no backend).
    const payload = { 
      ...formData,
      razao_social: razaoSocial, 
      cnpj_limpo: cnpjLimpo,
    } as any as Partial<Cliente>;
    delete (payload as any).cnpj;
    delete (payload as any).socios;
    try {
      if (editingCliente) {
        await updateClienteById(editingCliente.id!, payload);
        setSuccessMessage('Cliente atualizado com sucesso!');
      } else {
        await createCliente(payload);
        setSuccessMessage('Cliente cadastrado com sucesso!');
      }
      limparForm();
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (err) {
      // Error is already handled by useClientes hook
    }
  };

  const handleViewCliente = async (cliente: Cliente) => {
    try {
      // Buscar dados completos do cliente com sócios
      const resp = await clientesService.obterCliente(cliente.id!);
      // O backend retorna { success, data: Cliente } ou diretamente Cliente
      if (resp && typeof resp === 'object') {
        if ((resp as any).success && (resp as any).data) {
          setVisualizandoCliente((resp as any).data);
        } else if ((resp as any).id) {
          // Se retornar diretamente o Cliente (sem wrapper)
          setVisualizandoCliente(resp as Cliente);
        } else {
          // Fallback: usar os dados já carregados
          setVisualizandoCliente(cliente);
        }
      } else {
        // Fallback: usar os dados já carregados
        setVisualizandoCliente(cliente);
      }
    } catch {
      // Fallback: usar os dados já carregados
      setVisualizandoCliente(cliente);
    }
  };

  const handleEdit = async (cliente: Cliente) => {
    try {
      const full = await clientesService.getById(cliente.id);
      setEditingCliente(full);
      const cnpjLimpo = full.cnpj_limpo || (full.cnpj ? full.cnpj.replace(/\D/g, '') : '');
      setFormData({
        ...full,
        razao_social: full.razao_social || full.nome,
        cnpj_limpo: cnpjLimpo,
        cnpj: formatCNPJ(cnpjLimpo),
      });
      setMostrarCadastroCompleto(true);
      setShowForm(true);
    } catch {
      // Fallback: usar os dados já carregados na listagem
    setEditingCliente(cliente);
    const cnpjLimpo = cliente.cnpj_limpo || (cliente.cnpj ? cliente.cnpj.replace(/\D/g, '') : '');
    setFormData({ 
      razao_social: cliente.razao_social || cliente.nome, 
      cnpj_limpo: cnpjLimpo,
        cnpj: formatCNPJ(cnpjLimpo),
        ...cliente, // Incluir todos os dados do cliente (incluindo dados ReceitaWS)
    });
      // Exibir dados cadastrais automaticamente se o cliente tiver dados da ReceitaWS
      const hasReceitaWSData = !!(cliente as any).fantasia || !!(cliente as any).situacao_cadastral || !!(cliente as any).receita_ws_status;
      setMostrarCadastroCompleto(hasReceitaWSData);
    setShowForm(true);
    }
  };

  const handleImportarReceitaWS = async () => {
    const cnpjLimpo = (formData.cnpj_limpo || (formData.cnpj ? formData.cnpj.replace(/\D/g, '') : '') || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      setCustomErrorMessage('CNPJ inválido. Deve conter 14 dígitos.');
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
      return;
    }
    try {
      setImportandoReceita(true);
      setCustomErrorMessage('');
      const resp = await clientesService.importarReceitaWS(cnpjLimpo, true);
      if (!resp?.success) {
        throw new Error(resp?.error || 'Falha ao importar dados da ReceitaWS');
      }
      const imported: Cliente = resp.data;
      // setUltimaImportacaoMeta(resp?.meta || null); // Não utilizado no momento
      setEditingCliente(imported);
      setFormData({
        ...imported,
        cnpj: formatCNPJ(imported.cnpj_limpo || cnpjLimpo),
      });
      // Exibir automaticamente os dados cadastrais quando houver dados importados
      setMostrarCadastroCompleto(true);
      setShowForm(true);

      // Atualizar listagem visível (mantendo pagina/filtro)
      await loadClientes({ page, limit, search: debouncedSearch }).catch(() => {});

      setSuccessMessage(resp?.message || '✅ Import concluído.');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    } catch (e: any) {
      console.error('[Clientes] Erro ao importar ReceitaWS:', e);
      setShowSuccess(false);
      setCustomErrorMessage(e?.message || 'Erro ao importar dados da ReceitaWS');
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
      // mensagem detalhada vai no console; manter toast simples para UX
    } finally {
      setImportandoReceita(false);
    }
  };

  const handleDeleteClick = (cliente: Cliente) => {
    if (!cliente.id) return;
    
    // Limpar timer anterior se existir
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    
    // Iniciar contagem regressiva de 3 segundos
    setPendingDelete({ cliente, countdown: 3 });
    
    let countdown = 3;
    const timer = setInterval(() => {
      countdown -= 1;
      setPendingDelete(prev => ({ ...prev, countdown }));
      
      if (countdown <= 0) {
        clearInterval(timer);
        setDeleteTimer(null);
        // Executar exclusão automaticamente
        executeDelete(cliente);
      }
    }, 1000);
    
    setDeleteTimer(timer);
  };

  const cancelDelete = () => {
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    setPendingDelete({ cliente: null, countdown: 0 });
  };

  const executeDelete = async (cliente: Cliente) => {
    if (!cliente.id) return;
    
    const clienteNome = cliente.razao_social || cliente.nome || 'Cliente';
    
    // Limpar estado de exclusão pendente
    setPendingDelete({ cliente: null, countdown: 0 });
    
    try {
      await deleteClienteById(cliente.id);
      
      // Mostrar mensagem de sucesso
      setSuccessMessage(`Cliente "${clienteNome}" excluído com sucesso!`);
      setShowSuccess(true);
      
      // Ocultar mensagem após 5 segundos
      setTimeout(() => {
        setShowSuccess(false);
      }, 5000);
      
      // Recarregar lista de clientes
      loadClientes();
    } catch (error) {
      // Erro já é tratado pelo hook useClientes
      setShowError(true);
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

  const copyToClipboard = async (text: string, cnpj: string) => {
    try {
      // Tenta usar a API moderna de clipboard
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback para contextos não-seguros (HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedCnpj(cnpj);
      setTimeout(() => {
        setCopiedCnpj(null);
      }, 2000);
    } catch (err) {
      console.error('Erro ao copiar para área de transferência:', err);
    }
  };

  const formatCNPJ = (value: string) => {
    const v = (value || '').replace(/\D/g, '').slice(0, 14);
    return v
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  const formatDateABNT = (value: any) => {
    if (!value) return '';
    try {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('pt-BR');
    } catch {
      return String(value);
    }
  };

  const formatDateTimeABNT = (value: any) => {
    if (!value) return '';
    try {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      // dd/mm/aaaa HH:mm
      return d.toLocaleString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(value);
    }
  };

  const displayCNPJ = (cnpj: string | undefined) => {
    if (!cnpj) return '-';
    return formatCNPJ(cnpj);
  };

  // const canGoNext = totalPages != null ? page < totalPages : lastPageCount === limit; // Não utilizado no momento

  const [syncing, setSyncing] = useState(false);
  const [syncingAuto, setSyncingAuto] = useState(false);

  const sincronizarAutomatico = async (): Promise<boolean> => {
    try {
      setSyncingAuto(true);
      setHostError(null);
      setShowSuccess(false);
      
      const response = await api.post('/host-dados/sincronizar-automatico');
      
      if (response.data?.success) {
        const data = response.data.data;
        const periodo = data.periodo || 'última competência';
        console.log(`[Clientes] Sincronização automática concluída`);
        
        setSuccessMessage(`✅ Sincronização automática concluída com sucesso! Período: ${periodo}`);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
        }, 5000);
        
        return true;
      }
      
      const errorMsg = response.data?.error || 'Erro desconhecido ao sincronizar automaticamente.';
      setHostError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } catch (err) {
      const error = err as AxiosError<any>;
      console.error('[Clientes] Erro ao sincronizar automaticamente:', error);
      
      let errorMessage = 'Erro ao sincronizar automaticamente do Firebird para MySQL.';
      
      if (error.response?.data?.error) {
        const errorData = error.response.data.error;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object') {
          errorMessage = errorData.message || JSON.stringify(errorData);
        }
      } else if (error.message) {
        errorMessage = `${errorMessage} Detalhes: ${error.message}`;
      }
      
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
        errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000.';
      }
      
      setHostError(errorMessage);
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } finally {
      setSyncingAuto(false);
    }
  };

  const sincronizarPorDatas = async (dataIni: string, dataFim: string): Promise<boolean> => {
    try {
      setSyncing(true);
      setHostError(null);
      setShowSuccess(false);
      
      // Não enviar body, apenas query params
      const response = await api.post('/host-dados/sincronizar-datas', {}, {
        params: { data_ini: dataIni, data_fim: dataFim },
      });
      
      if (response.data?.success) {
        const data = response.data.data;
        const total = data.total || 0;
        const periodo = `${dataIni} a ${dataFim}`;
        console.log(`[Clientes] Sincronização por datas concluída: ${total} registros processados`);
        
        setSuccessMessage(`✅ Sincronização manual concluída com sucesso! Período: ${periodo}. Total de registros: ${total}`);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
        }, 5000);
        
        return true;
      }
      
      const errorMsg = response.data?.error || 'Erro desconhecido ao sincronizar por datas.';
      setHostError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } catch (err) {
      const error = err as AxiosError<any>;
      console.error('[Clientes] Erro ao sincronizar por datas:', error);
      
      let errorMessage = 'Erro ao sincronizar período por datas do Firebird para MySQL.';
      
      if (error.response?.data?.error) {
        const errorData = error.response.data.error;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object') {
          errorMessage = errorData.message || JSON.stringify(errorData);
        }
      } else if (error.message) {
        errorMessage = `${errorMessage} Detalhes: ${error.message}`;
      }
      
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
        errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000.';
      }
      
      setHostError(errorMessage);
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } finally {
      setSyncing(false);
    }
  };

  // Função não utilizada no momento - mantida para referência futura
  // const sincronizarPeriodo = async (ano: number, mes: number): Promise<boolean> => {
  //   try {
  //     setSyncing(true);
  //     setHostError(null);
  //     
  //     // Não enviar body, apenas query params
  //     const response = await api.post('/host-dados/sincronizar', {}, {
  //       params: { ano, mes },
  //     });
  //     
  //     if (response.data?.success) {
  //       const data = response.data.data;
  //       console.log(`[Clientes] Sincronização concluída: ${data.total || 0} registros processados`);
  //       return true;
  //     }
  //     
  //     // Se não teve sucesso, extrair mensagem de erro
  //     const errorMsg = response.data?.error || 'Erro desconhecido ao sincronizar período.';
  //     setHostError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
  //     return false;
  //   } catch (err) {
  //     const error = err as AxiosError<any>;
  //     console.error('[Clientes] Erro ao sincronizar período:', error);
  //     
  //     let errorMessage = 'Erro ao sincronizar período do Firebird para MySQL.';
  //     
  //     // Extrair mensagem de erro do response
  //     if (error.response?.data?.error) {
  //       const errorData = error.response.data.error;
  //       if (typeof errorData === 'string') {
  //         errorMessage = errorData;
  //       } else if (typeof errorData === 'object') {
  //         errorMessage = errorData.message || JSON.stringify(errorData);
  //       }
  //     } else if (error.message) {
  //       errorMessage = `${errorMessage} Detalhes: ${error.message}`;
  //     }
  //     
  //     if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
  //       errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000.';
  //     }
  //     
  //     setHostError(errorMessage);
  //     return false;
  //   } finally {
  //     setSyncing(false);
  //   }
  // };

  const handleAplicarPeriodo = async () => {
    if (!manualDataIni || !manualDataFim) {
      setHostError('Informe data inicial e data final para aplicar o período.');
      return;
    }

    // Validar formato das datas (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(manualDataIni) || !dateRegex.test(manualDataFim)) {
      setHostError('Datas devem estar no formato YYYY-MM-DD (ex: 2025-01-01)');
      return;
    }

    // Validar que data inicial não é maior que data final
    const dataIni = new Date(manualDataIni);
    const dataFim = new Date(manualDataFim);
    if (dataIni > dataFim) {
      setHostError('Data inicial não pode ser maior que data final.');
      return;
    }

    // 1. Sincronizar período do Firebird para MySQL usando datas
    const sincronizado = await sincronizarPorDatas(manualDataIni, manualDataFim);
    
    if (!sincronizado) {
      // Erro já foi setado em sincronizarPorDatas
      return;
    }

    // 2. Depois de sincronizar, buscar os lançamentos
    await loadHostLancamentos();
  };

  const loadHostLancamentos = async () => {
    try {
      setHostError(null);
      setHostLoading(true);
      // Usar o termo de busca atual (limpo) para CNPJ
      const cnpjSearch = debouncedSearch.replace(/\D/g, '');
      if (!cnpjSearch || cnpjSearch.length !== 14) {
        setHostLancamentos([]);
        setHostLoading(false);
        return;
      }
      // NÃO filtrar por ano/mês - mostrar TODOS os meses disponíveis para o CNPJ
      // Isso permite ver todos os períodos que existem na tabela MySQL para aquele CNPJ
      const response = await api.get(`/host-dados/cliente/${cnpjSearch}`);
      setHostLancamentos(response.data?.data || []);
    } catch (err) {
      const error = err as AxiosError<any>;
      setHostError(
        error.response?.data?.error ||
          'Erro ao carregar lançamentos do Banco SCI para este CNPJ.',
      );
    } finally {
      setHostLoading(false);
    }
  };

  const handleAtualizar = async () => {
    // Sincronização automática: busca mês anterior de TODOS os CNPJs
    const sincronizado = await sincronizarAutomatico();
    
    if (sincronizado) {
      // Depois de sincronizar, recarregar os lançamentos se houver CNPJ na busca
      await loadHostLancamentos();
    }
  };


  // Recarregar lançamentos quando aba "Lançamentos" estiver ativa e search mudar
  useEffect(() => {
    if (activeTab === 'lancamentos') {
      void loadHostLancamentos();
    }
  }, [activeTab, debouncedSearch]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black opacity-10"></div>
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-3">Clientes</h1>
            <p className="text-blue-100 text-lg">Gerencie o cadastro de clientes e suas informações de forma eficiente</p>
          </div>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-48 h-48 bg-white opacity-5 rounded-full blur-3xl"></div>
        </div>
      </div>

      {/* Tabs de categoria */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 mb-6 overflow-hidden">
        <div className="px-6 pt-4 pb-2">
          <div className="flex space-x-1">
            <button
              type="button"
              onClick={() => handleTabChange('clientes')}
              className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                activeTab === 'clientes'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 transform scale-105'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              Cadastro
              {activeTab === 'clientes' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('participacao')}
              className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                activeTab === 'participacao'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/30 transform scale-105'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              Participação
              {activeTab === 'participacao' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('lancamentos')}
              className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                activeTab === 'lancamentos'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 transform scale-105'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              Lançamentos (SCI)
              {activeTab === 'lancamentos' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('pagamentos')}
              className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                activeTab === 'pagamentos'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30 transform scale-105'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              Pagamentos
              {activeTab === 'pagamentos' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('e-processos')}
              className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                activeTab === 'e-processos'
                  ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/30 transform scale-105'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              E-Processos
              {activeTab === 'e-processos' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"></span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Visualização Detalhada do Cliente */}
      {visualizandoCliente && (
        <>
          {/* Overlay transparente para detectar cliques fora do card */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setVisualizandoCliente(null);
              // Limpar clienteId da URL
              const params = new URLSearchParams(location.search);
              params.delete('clienteId');
              navigate({ search: params.toString() }, { replace: true });
            }}
          />
          {/* Card do cliente */}
          <div 
            className="relative z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="px-8 py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {visualizandoCliente.razao_social || visualizandoCliente.nome || 'Cliente'}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    if (!visualizandoCliente?.cnpj_limpo && !visualizandoCliente?.cnpj) {
                      toast.error('CNPJ não disponível para atualização');
                      return;
                    }
                    const cnpj = visualizandoCliente.cnpj_limpo || visualizandoCliente.cnpj?.replace(/\D/g, '') || '';
                    if (!cnpj || cnpj.length !== 14) {
                      toast.error('CNPJ inválido');
                      return;
                    }
                    
                    // Mostrar aviso informativo (sem confirmação)
                    toast.info('Atualizando dados do cliente com informações da Receita Federal...', 3000);
                    
                    try {
                      setAtualizandoCliente(true);
                      
                      // Importar dados da ReceitaWS
                      const resp = await clientesService.importarReceitaWS(cnpj, true);
                      
                      if (resp.success && resp.data) {
                        // Recarregar os dados do cliente atualizado
                        const clienteResp = await clientesService.obterCliente(visualizandoCliente.id!);
                        const clienteAtualizado = (clienteResp as any)?.data || clienteResp;
                        setVisualizandoCliente(clienteAtualizado as Cliente);
                        toast.success('Dados atualizados com sucesso!');
                      } else {
                        toast.error(resp.error || 'Erro ao atualizar dados da Receita');
                      }
                    } catch (error: any) {
                      console.error('Erro ao atualizar cliente:', error);
                      toast.error(error?.response?.data?.error || error?.message || 'Erro ao atualizar dados');
                    } finally {
                      setAtualizandoCliente(false);
                    }
                  }}
                  disabled={atualizandoCliente}
                  className="px-5 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all duration-300 flex items-center gap-2 shadow-md hover:shadow-lg border-2 border-green-400 hover:border-green-500"
                >
                  <ArrowPathIcon className={`h-5 w-5 ${atualizandoCliente ? 'animate-spin' : ''}`} />
                  {atualizandoCliente ? 'Atualizando...' : 'Atualizar'}
                </button>
                <button
                  onClick={() => {
                    setVisualizandoCliente(null);
                    // Limpar clienteId da URL
                    const params = new URLSearchParams(location.search);
                    params.delete('clienteId');
                    navigate({ search: params.toString() }, { replace: true });
                  }}
                  className="px-6 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg font-semibold transition-all duration-300 flex items-center gap-2 shadow-md hover:shadow-lg border-2 border-white hover:border-blue-200"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                  Voltar
                </button>
              </div>
            </div>
          </div>
          <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
            {/* Informações Básicas */}
            <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Informações Básicas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Razão Social</label>
                  <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                    {visualizandoCliente.razao_social || visualizandoCliente.nome || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">CNPJ</label>
                  <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900 font-mono">
                    {displayCNPJ(visualizandoCliente.cnpj_limpo || visualizandoCliente.cnpj || '')}
                  </div>
                </div>
                {(visualizandoCliente as any).fantasia && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fantasia</label>
                    <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                      {(visualizandoCliente as any).fantasia}
                    </div>
                  </div>
                )}
                {(visualizandoCliente as any).tipo_empresa && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Empresa</label>
                    <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                      {(visualizandoCliente as any).tipo_empresa}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Dados Cadastrais */}
            {((visualizandoCliente as any).situacao_cadastral || (visualizandoCliente as any).porte || (visualizandoCliente as any).natureza_juridica) && (
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Dados Cadastrais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(visualizandoCliente as any).situacao_cadastral && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Situação</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).situacao_cadastral}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).porte && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Porte</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).porte}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).natureza_juridica && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Natureza Jurídica</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).natureza_juridica}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).atividade_principal_text && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Atividade Principal</label>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                          {(visualizandoCliente as any).atividade_principal_text}
                        </div>
                        {(visualizandoCliente as any).atividade_principal_code && (
                          <span className="px-3 py-2.5 text-xs font-mono text-gray-600 bg-gray-100 rounded-lg border-2 border-gray-200 whitespace-nowrap">
                            {(visualizandoCliente as any).atividade_principal_code}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Datas e Situação */}
            {((visualizandoCliente as any).abertura || (visualizandoCliente as any).data_situacao || (visualizandoCliente as any).receita_ws_consulta_em) && (
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Datas e Situação</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(visualizandoCliente as any).abertura && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Abertura</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {formatDateABNT((visualizandoCliente as any).abertura)}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).data_situacao && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Data Situação</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {formatDateABNT((visualizandoCliente as any).data_situacao)}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).receita_ws_consulta_em && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Última consulta (Receita)</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {formatDateTimeABNT((visualizandoCliente as any).receita_ws_consulta_em)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Endereço */}
            {((visualizandoCliente as any).logradouro || (visualizandoCliente as any).municipio || (visualizandoCliente as any).cep) && (
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Endereço</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(visualizandoCliente as any).logradouro && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Logradouro</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).logradouro}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).numero && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Número</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).numero}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).complemento && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Complemento</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).complemento}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).bairro && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Bairro</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).bairro}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).municipio && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Município</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).municipio}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).uf && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">UF</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).uf}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).cep && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">CEP</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).cep}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Contato */}
            {((visualizandoCliente as any).receita_email || (visualizandoCliente as any).receita_telefone) && (
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Contato</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(visualizandoCliente as any).receita_email && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">E-mail (Receita)</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).receita_email}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).receita_telefone && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Telefone (Receita)</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).receita_telefone}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Informações Financeiras e Tributárias */}
            {((visualizandoCliente as any).capital_social || (visualizandoCliente as any).regime_tributario) && (
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Informações Financeiras e Tributárias</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(visualizandoCliente as any).capital_social && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Capital Social</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).capital_social}
                      </div>
                    </div>
                  )}
                  {(visualizandoCliente as any).regime_tributario && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Regime Tributário</label>
                      <div className="px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white text-gray-900">
                        {(visualizandoCliente as any).regime_tributario}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sócios / QSA */}
            <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-blue-300">
                <h3 className="text-sm font-bold text-gray-800">Participação</h3>
                <button
                  onClick={async () => {
                    if (!visualizandoCliente?.id) return;
                    setAtualizandoCliente(true);
                    try {
                      const result = await clientesService.atualizarSociosPorSituacaoFiscal(visualizandoCliente.id);
                      if (result.success) {
                        toast.success(result.data?.message || 'Sócios atualizados com sucesso');
                        // Recarregar dados do cliente
                        const clienteAtualizado = await clientesService.obterCliente(visualizandoCliente.id);
                        if (clienteAtualizado && (clienteAtualizado as any).success && (clienteAtualizado as any).data) {
                          setVisualizandoCliente((clienteAtualizado as any).data as Cliente);
                        } else if (clienteAtualizado && (clienteAtualizado as any).id) {
                          // Fallback: se vier direto como Cliente
                          setVisualizandoCliente(clienteAtualizado as Cliente);
                        }
                      } else {
                        const errorMsg = (result as any).error || 'Erro ao atualizar sócios';
                        const errorMsgLower = errorMsg.toLowerCase();
                        
                        // Verificar se é erro de Capital Social Zerado
                        if (errorMsgLower.includes('capital social zerado') || 
                            errorMsgLower.includes('capital zerado') ||
                            errorMsgLower.includes('capital social zero')) {
                          toast.error('Capital Social Zerado: Não é possível atualizar os sócios quando o capital social está zerado.');
                        }
                        // Se não houver situação fiscal, redirecionar para página de Situação Fiscal
                        else if (errorMsg.includes('Nenhuma situação fiscal encontrada') || errorMsg.includes('404')) {
                          const cnpjCliente = visualizandoCliente?.cnpj_limpo || visualizandoCliente?.cnpj?.replace(/\D/g, '') || '';
                          if (cnpjCliente && cnpjCliente.length === 14) {
                            toast.info('Redirecionando para consultar a Situação Fiscal...');
                            navigate(`/situacao-fiscal?cnpj=${cnpjCliente}`);
                            // Scroll para o topo após navegação
                            setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
                            // Scroll para o topo após navegação
                            setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
                          } else {
                            toast.error('Nenhuma situação fiscal encontrada para este CNPJ. Por favor, consulte a Situação Fiscal primeiro.');
                          }
                        } else {
                          toast.error(errorMsg);
                        }
                      }
                    } catch (error: any) {
                      console.error('Erro ao atualizar sócios:', error);
                      const errorMsg = error.response?.data?.error || error.message || 'Erro ao atualizar sócios';
                      const errorMsgLower = errorMsg.toLowerCase();
                      
                      // Verificar se é erro de Capital Social Zerado
                      if (errorMsgLower.includes('capital social zerado') || 
                          errorMsgLower.includes('capital zerado') ||
                          errorMsgLower.includes('capital social zero')) {
                        toast.error('Capital Social Zerado: Não é possível atualizar os sócios quando o capital social está zerado.');
                      }
                      // Se não houver situação fiscal, redirecionar para página de Situação Fiscal
                      else if (error.response?.status === 404 || errorMsg.includes('Nenhuma situação fiscal encontrada')) {
                        const cnpjCliente = visualizandoCliente?.cnpj_limpo || visualizandoCliente?.cnpj?.replace(/\D/g, '') || '';
                        if (cnpjCliente && cnpjCliente.length === 14) {
                          toast.info('Redirecionando para consultar a Situação Fiscal...');
                          navigate(`/situacao-fiscal?cnpj=${cnpjCliente}`);
                          // Scroll para o topo após navegação
                          setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
                        } else {
                          toast.error('Nenhuma situação fiscal encontrada para este CNPJ. Por favor, consulte a Situação Fiscal primeiro.');
                        }
                      } else {
                        toast.error(errorMsg);
                      }
                    } finally {
                      setAtualizandoCliente(false);
                    }
                  }}
                  disabled={atualizandoCliente || !visualizandoCliente?.id}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {atualizandoCliente ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      <span>Atualizando...</span>
                    </>
                  ) : (
                    <>
                      <ArrowPathIcon className="w-4 h-4" />
                      <span>Atualizar Sócios</span>
                    </>
                  )}
                </button>
              </div>
              {Array.isArray((visualizandoCliente as any).socios) && (visualizandoCliente as any).socios.length > 0 ? (
                <div className="border-2 border-blue-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-blue-100 to-indigo-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Nome</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Porcentagem (%)</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {((visualizandoCliente as any).socios || []).map((s: any, idx: number) => {
                        const participacaoPercentual = s.participacao_percentual !== null && s.participacao_percentual !== undefined 
                          ? parseFloat(String(s.participacao_percentual)) 
                          : null;
                        const participacaoValor = s.participacao_valor !== null && s.participacao_valor !== undefined 
                          ? parseFloat(String(s.participacao_valor)) 
                          : null;
                        
                        const formatCurrency = (value: number | null) => {
                          if (value === null || isNaN(value)) return '—';
                          return new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(value);
                        };

                        const formatPercent = (value: number | null) => {
                          if (value === null || isNaN(value)) return '—';
                          return `${value.toFixed(2).replace('.', ',')}%`;
                        };

                        return (
                          <tr key={s.id || idx} className="hover:bg-blue-50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.nome || s.Nome || s.name || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatPercent(participacaoPercentual)}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(participacaoValor)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500 text-center bg-white border-2 border-blue-200 rounded-lg">
                  Nenhum sócio cadastrado
                </div>
              )}
            </div>
          </div>
        </div>
        </>
      )}

      {/* Barra de Busca e Ações - Não exibir nas abas de Pagamentos e E-Processos, nem quando o formulário estiver aberto, nem quando estiver visualizando cliente */}
      {activeTab !== 'pagamentos' && activeTab !== 'e-processos' && !showForm && !visualizandoCliente && (
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-6 backdrop-blur-sm bg-opacity-95">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex-1 max-w-md w-full">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Buscar Cliente</label>
            <div className="relative group">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder={
                  activeTab === 'clientes' 
                    ? 'Buscar por Razão Social ou CNPJ' 
                    : activeTab === 'participacao'
                    ? 'Digite o CNPJ ou Razão Social para filtrar...'
                    : 'Digite o CNPJ (14 dígitos)'
                }
                value={activeTab === 'participacao' ? searchParticipacao : search}
                onChange={(e) => {
                  if (activeTab === 'participacao') {
                    setSearchParticipacao(e.target.value);
                  } else {
                    setSearch(e.target.value);
                  }
                }}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white focus:bg-white shadow-sm hover:shadow-md"
              />
            </div>
          </div>
          {activeTab === 'participacao' && (
            <div className="w-full md:w-64">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <FunnelIcon className="h-4 w-4 text-amber-600" />
                Ordenar / Filtrar
              </label>
              <div className="relative">
                <select
                  value={ordenacaoParticipacao}
                  onChange={(e) => setOrdenacaoParticipacao(e.target.value as any)}
                  className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md appearance-none cursor-pointer font-medium text-gray-700 hover:border-amber-300"
                >
                  <option value="a-z">A → Z</option>
                  <option value="z-a">Z → A</option>
                  <option value="cnpj">CNPJ ↑</option>
                  <option value="faltantes">Informações Faltantes</option>
                  <option value="sem-registro">Sem Registro</option>
                  <option value="capital-zerado">Capital Social Zerado</option>
                  <option value="divergente">Divergente</option>
                </select>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FunnelIcon className="h-5 w-5 text-amber-500" />
                </div>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'clientes' && (
            <div className="w-full md:w-72 socio-filter-container">
              <label className="block text-sm font-medium text-gray-700 mb-2">Sócio (filtro)</label>
              <div className="relative">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={socioSearchInput}
                    onChange={(e) => {
                      setSocioSearchInput(e.target.value);
                      setShowSocioDropdown(true);
                    }}
                    onFocus={() => setShowSocioDropdown(true)}
                    placeholder="Buscar sócio..."
                    className="w-full pl-10 pr-10 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                  {socioFiltro && (
                    <button
                      type="button"
                      onClick={() => {
                        setSocioFiltro('');
                        setSocioSearchInput('');
                        setShowSocioDropdown(false);
                        setPage(1);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                      title="Limpar filtro"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {showSocioDropdown && sociosOptions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSocioFiltro('');
                        setSocioSearchInput('');
                        setShowSocioDropdown(false);
                        setPage(1);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-blue-50 transition-colors ${
                        !socioFiltro ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'
                      }`}
                    >
                      Todos
                    </button>
                    {sociosOptions
                      .filter((nome) =>
                        nome.toLowerCase().includes(socioSearchInput.toLowerCase())
                      )
                      .map((nome) => (
                        <button
                          key={nome}
                          type="button"
                          onClick={() => {
                            setSocioFiltro(nome);
                            setSocioSearchInput(nome);
                            setShowSocioDropdown(false);
                            setPage(1);
                          }}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-blue-50 transition-colors ${
                            socioFiltro === nome ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'
                          }`}
                        >
                          {nome}
                        </button>
                      ))}
                    {sociosOptions.filter((nome) =>
                      nome.toLowerCase().includes(socioSearchInput.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-2 text-sm text-gray-500 text-center">
                        Nenhum sócio encontrado
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'clientes' && (
            <div className="flex gap-3 items-end">
              <button
                onClick={() => setShowForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-semibold transition-all duration-300 flex items-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transform"
              >
                <PlusIcon className="h-5 w-5" />
                Novo Cliente
              </button>
            </div>
          )}
          {activeTab === 'lancamentos' && (
            <div className="flex gap-3 items-end">
              <button
                type="button"
                onClick={() => void handleAtualizar()}
                disabled={syncingAuto}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {syncingAuto ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M4 20v-5h.582m15.356-2a8.001 8.001 0 01-15.356 2"
                      />
                    </svg>
                    Atualizar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowManualFilters((prev) => !prev)}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow"
              >
                <ClipboardDocumentIcon className="h-5 w-5" />
                Manual
              </button>
              <button
                type="button"
                onClick={() => {
                  const cnpjSearch = debouncedSearch.replace(/\D/g, '');
                  if (cnpjSearch && cnpjSearch.length === 14) {
                    navigate(`/conferencias?cnpj=${cnpjSearch}`);
                  }
                }}
                className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={debouncedSearch.replace(/\D/g, '').length !== 14}
              >
                <ClipboardDocumentCheckIcon className="h-5 w-5" />
                Conferências
              </button>
            </div>
          )}
        </div>

        {activeTab === 'lancamentos' && showManualFilters && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-600 mb-3">
              Consulta manual por período de apuração. Informe a data inicial e data final do período que deseja sincronizar.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Inicial
                </label>
                <input
                  type="date"
                  value={manualDataIni}
                  onChange={(e) => setManualDataIni(e.target.value)}
                  className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  placeholder="2025-01-01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Final
                </label>
                <input
                  type="date"
                  value={manualDataFim}
                  onChange={(e) => setManualDataFim(e.target.value)}
                  min={manualDataIni || undefined}
                  className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  placeholder="2025-01-31"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleAplicarPeriodo()}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!manualDataIni || !manualDataFim || syncing}
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Aplicar período
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      )}


      {activeTab === 'clientes' && showForm && (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-8 py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 border-b border-gray-200">
            <h2 className="text-xl font-bold text-white">
              {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="p-8 bg-gradient-to-br from-gray-50 to-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {editingCliente ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Razão Social</label>
                <div className="relative">
                  <BuildingOfficeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.razao_social || formData.nome || ''}
                    onChange={(e) => setFormData({ ...formData, razao_social: e.target.value, nome: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white focus:bg-white shadow-sm hover:shadow-md"
                    required
                  />
                </div>
              </div>
              ) : (
                <div className="md:col-span-2">
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-sm">
                    Para criar um novo cliente, informe o CNPJ e clique em <span className="font-semibold">Importar Receita</span> para preencher automaticamente os dados (incluindo Razão Social).
                  </div>
                  {(formData.razao_social || formData.nome) && (
                    <div className="mt-3 text-sm text-gray-700">
                      <span className="font-semibold">Razão Social (importada):</span>{' '}
                      <span>{String(formData.razao_social || formData.nome)}</span>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ</label>
                <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={formData.cnpj || ''}
                  onChange={(e) => {
                    const formatted = formatCNPJ(e.target.value);
                    setFormData({ ...formData, cnpj_limpo: formatted.replace(/\D/g, ''), cnpj: formatted });
                  }}
                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white focus:bg-white shadow-sm hover:shadow-md"
                  required
                />
                  <button
                    type="button"
                    onClick={() => void handleImportarReceitaWS()}
                    disabled={importandoReceita || (formData.cnpj || '').replace(/\D/g, '').length !== 14}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-105 transform disabled:hover:scale-100"
                    title="Buscar dados cadastrais na ReceitaWS e salvar no banco"
                  >
                    {importandoReceita ? 'Importando...' : 'Importar Receita'}
                  </button>
              </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setMostrarCadastroCompleto((v) => !v)}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    {mostrarCadastroCompleto ? 'Ocultar cadastro completo' : 'Mostrar cadastro completo'}
                  </button>
            </div>
              </div>
            </div>
            {mostrarCadastroCompleto && (
              <div className="space-y-6 mt-6">
                {!((formData as any).receita_ws_status || (formData as any).razao_social || (formData as any).nome) && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-4 py-3 text-sm">
                    Clique em <span className="font-semibold">Importar Receita</span> para preencher automaticamente estes campos.
                  </div>
                )}

                {/* Seção: Dados Cadastrais */}
                <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Dados Cadastrais</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fantasia</label>
                      <input
                        type="text"
                        value={(formData as any).fantasia || ''}
                        onChange={(e) => setFormData({ ...formData, fantasia: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Situação</label>
                      <input
                        type="text"
                        value={(formData as any).situacao_cadastral || ''}
                        onChange={(e) => setFormData({ ...formData, situacao_cadastral: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Porte</label>
                      <input
                        type="text"
                        value={(formData as any).porte || ''}
                        onChange={(e) => setFormData({ ...formData, porte: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Empresa</label>
                      <select
                        value={(formData as any).tipo_empresa || ''}
                        onChange={(e) => setFormData({ ...formData, tipo_empresa: e.target.value || null } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      >
                        <option value="">Selecione...</option>
                        <option value="Matriz">Matriz</option>
                        <option value="Filial">Filial</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Natureza Jurídica</label>
                      <input
                        type="text"
                        value={(formData as any).natureza_juridica || ''}
                        onChange={(e) => setFormData({ ...formData, natureza_juridica: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Atividade Principal</label>
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          value={(formData as any).atividade_principal_text || ''}
                          readOnly
                          className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="Nenhuma atividade principal cadastrada"
                        />
                        {(formData as any).atividade_principal_code && (
                          <span className="px-3 py-2.5 text-xs font-mono text-gray-600 bg-gray-100 rounded-lg border-2 border-gray-200 whitespace-nowrap">
                            {(formData as any).atividade_principal_code}
                          </span>
                        )}
                      </div>
                    </div>
                    {(formData as any).atividades_secundarias && Array.isArray((formData as any).atividades_secundarias) && (formData as any).atividades_secundarias.length > 1 && (
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Atividades Secundárias</label>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setMostrarAtividadesSecundarias(!mostrarAtividadesSecundarias)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1.5 hover:underline transition-colors"
                          >
                            {mostrarAtividadesSecundarias ? 'Ocultar' : 'Ver mais'} ({((formData as any).atividades_secundarias || []).length} atividades)
                            <svg
                              className={`w-4 h-4 transition-transform duration-200 ${mostrarAtividadesSecundarias ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {mostrarAtividadesSecundarias && (
                            <textarea
                              readOnly
                              value={((formData as any).atividades_secundarias || [])
                                .map((atv: any) => {
                                  if (typeof atv === 'object' && atv !== null) {
                                    return `${atv.code || '—'} - ${atv.text || '—'}`;
                                  }
                                  return String(atv);
                                })
                                .join('\n')}
                              rows={Math.min(((formData as any).atividades_secundarias || []).length + 2, 10)}
                              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white font-mono text-xs resize-none"
                              placeholder="Nenhuma atividade secundária cadastrada"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção: Datas e Situação */}
                <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Datas e Situação</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Abertura</label>
                      <input
                        type="text"
                        value={(formData as any).abertura ? formatDateABNT((formData as any).abertura) : ''}
                        readOnly
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white"
                        placeholder="dd/mm/aaaa"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Data Situação</label>
                      <input
                        type="text"
                        value={(formData as any).data_situacao ? formatDateABNT((formData as any).data_situacao) : ''}
                        readOnly
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white"
                        placeholder="dd/mm/aaaa"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Última consulta (Receita)</label>
                      <input
                        type="text"
                        value={(formData as any).receita_ws_consulta_em ? formatDateTimeABNT((formData as any).receita_ws_consulta_em) : ''}
                        readOnly
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white"
                        placeholder="dd/mm/aaaa HH:mm"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção: Endereço */}
                <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Endereço</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Logradouro</label>
                      <input
                        type="text"
                        value={(formData as any).logradouro || ''}
                        onChange={(e) => setFormData({ ...formData, logradouro: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Número</label>
                      <input
                        type="text"
                        value={(formData as any).numero || ''}
                        onChange={(e) => setFormData({ ...formData, numero: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Complemento</label>
                      <input
                        type="text"
                        value={(formData as any).complemento || ''}
                        onChange={(e) => setFormData({ ...formData, complemento: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Bairro</label>
                      <input
                        type="text"
                        value={(formData as any).bairro || ''}
                        onChange={(e) => setFormData({ ...formData, bairro: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Município</label>
                      <input
                        type="text"
                        value={(formData as any).municipio || ''}
                        onChange={(e) => setFormData({ ...formData, municipio: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">UF</label>
                      <input
                        type="text"
                        value={(formData as any).uf || ''}
                        onChange={(e) => setFormData({ ...formData, uf: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">CEP</label>
                      <input
                        type="text"
                        value={(formData as any).cep || ''}
                        onChange={(e) => setFormData({ ...formData, cep: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção: Contato */}
                <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Contato</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">E-mail (Receita)</label>
                      <input
                        type="text"
                        value={(formData as any).receita_email || ''}
                        onChange={(e) => setFormData({ ...formData, receita_email: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Telefone (Receita)</label>
                      <input
                        type="text"
                        value={(formData as any).receita_telefone || ''}
                        onChange={(e) => setFormData({ ...formData, receita_telefone: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção: Informações Financeiras e Tributárias */}
                <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Informações Financeiras e Tributárias</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Capital Social</label>
                      <input
                        type="text"
                        value={(formData as any).capital_social ?? ''}
                        onChange={(e) => setFormData({ ...formData, capital_social: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Regime Tributário</label>
                      <select
                        value={(formData as any).regime_tributario || ((formData as any).simples_optante === true || (formData as any).simples_optante === 1 ? 'Simples Nacional' : 'A Definir')}
                        onChange={(e) => setFormData({ ...formData, regime_tributario: e.target.value } as any)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      >
                        <option value="A Definir">A Definir</option>
                        <option value="Simples Nacional">Simples Nacional</option>
                        <option value="Lucro Presumido">Lucro Presumido</option>
                        <option value="Lucro Real">Lucro Real</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Seção: Sócios / QSA */}
                {Array.isArray((formData as any).socios) && (formData as any).socios.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-5 border-2 border-blue-200 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-300">Sócios / QSA</h3>
                    <div className="border-2 border-blue-200 rounded-lg overflow-hidden bg-white shadow-sm">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-blue-100 to-indigo-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Nome</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Qualificação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {(formData as any).socios.map((s: any, idx: number) => (
                            <tr key={s.id || idx} className="hover:bg-blue-50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.nome}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{s.qual || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3 mt-8">
              <button
                type="submit"
                disabled={loading || (!editingCliente && !(formData.razao_social || formData.nome))}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-semibold transition-all duration-300 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transform disabled:hover:scale-100"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-5 w-5" />
                    {editingCliente ? 'Atualizar' : 'Criar'}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  limparForm();
                }}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold transition-all duration-300 flex items-center gap-2 shadow-sm hover:shadow-md border border-gray-200 hover:scale-105 transform"
              >
                <XMarkIcon className="h-5 w-5" />
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'clientes' && !showForm && !visualizandoCliente && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 bg-white border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">
            Lista de Clientes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-1/4">Razão Social</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">CNPJ</th>
                {socioFiltro && (
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Participação</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Inf. Financeiras</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={socioFiltro ? 5 : 4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <UserGroupIcon className="h-12 w-12 text-gray-400" />
                      <p className="text-gray-500 font-medium">Nenhum cliente encontrado</p>
                      <p className="text-sm text-gray-400">
                        {search ? 'Tente ajustar os termos de busca' : 'Cadastre um novo cliente para começar'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                clientes.map((cliente) => {
                  const cnpjDisplay = displayCNPJ(cliente.cnpj_limpo || cliente.cnpj);
                  const cnpjValue = cliente.cnpj_limpo || cliente.cnpj || '';
                  const cnpjKey = `${cliente.id}-${cnpjValue}`;
                  return (
                    <tr key={cliente.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 border-b border-gray-100">
                      <td className="px-6 py-4 max-w-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <BuildingOfficeIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <button
                            onClick={() => handleViewCliente(cliente)}
                            className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline transition-colors cursor-pointer text-left truncate min-w-0 flex-1"
                            title={cliente.razao_social || cliente.nome || '-'}
                          >
                            {cliente.razao_social || cliente.nome || '-'}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 font-mono">{cnpjDisplay}</span>
                          <button
                            onClick={() => copyToClipboard(cnpjValue, cnpjKey)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Copiar CNPJ"
                          >
                            {copiedCnpj === cnpjKey ? (
                              <CheckIcon className="w-4 h-4 text-green-600" />
                            ) : (
                              <ClipboardDocumentIcon className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                      {socioFiltro && (
                      <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {(cliente as any).socio_participacao_percentual !== null && (cliente as any).socio_participacao_percentual !== undefined ? (
                              <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold">
                                {parseFloat(String((cliente as any).socio_participacao_percentual)).toFixed(2).replace('.', ',')}%
                          </span>
                        ) : (
                              <span className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-sm font-medium">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigate(`/situacao-fiscal?cnpj=${cnpjValue}`);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-all duration-300 border border-blue-200 hover:border-blue-600"
                            title="Consultar Situação Fiscal"
                          >
                            Sit. Fis
                          </button>
                          <button
                            onClick={() => {
                              navigate(`/clientes?tab=pagamentos&cnpj=${cnpjValue}`);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-purple-600 hover:text-white hover:bg-purple-600 rounded-lg transition-all duration-300 border border-purple-200 hover:border-purple-600"
                            title="Ver Pagamentos"
                          >
                            Pag
                          </button>
                          <button
                            onClick={() => {
                              navigate(`/dctf?search=${cnpjValue}`);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-lg transition-all duration-300 border border-indigo-200 hover:border-indigo-600"
                            title="Ver DCTF"
                          >
                            DCTF
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(cliente)}
                            className="px-3 py-1.5 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-all duration-300 border border-blue-200 hover:border-blue-600 flex items-center justify-center"
                            title="Editar cliente"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(cliente)}
                            className="px-3 py-1.5 text-red-600 hover:text-white hover:bg-red-600 rounded-lg transition-all duration-300 border border-red-200 hover:border-red-600 flex items-center justify-center"
                            title="Excluir cliente"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {activeTab === 'clientes' && !showForm && !visualizandoCliente && clientes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
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
                <span className="font-medium">Total: <span className="text-gray-900">{total}</span> clientes</span>
              ) : (
                <span>Exibindo {clientes.length} clientes</span>
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
            </div>
          </div>
          {totalPages != null && total != null && (
            <div className="pt-4 border-t border-gray-200">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                itemsPerPage={limit}
                onPageChange={setPage}
                itemLabel="cliente"
              />
            </div>
          )}
        </div>
      )}

      {/* Botão Voltar ao Topo - Aba Participação */}
      {activeTab === 'participacao' && showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-300 animate-bounce hover:animate-none flex items-center justify-center group"
          title="Voltar ao topo"
          aria-label="Voltar ao topo"
        >
          <ArrowUpIcon className="h-6 w-6 group-hover:translate-y-[-2px] transition-transform duration-300" />
        </button>
      )}

      {/* Aba de Pagamentos */}
      {activeTab === 'pagamentos' && (
        <PagamentosTab cnpjPreenchido={cnpjParaPagamentos} />
      )}

      {/* Aba de E-Processos */}
      {activeTab === 'e-processos' && (
        <EProcessosTab cnpjPreenchido={cnpjParaPagamentos} />
      )}

      {/* Aba de Participação */}
      {activeTab === 'participacao' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserGroupIcon className="h-5 w-5 text-amber-600" />
              Participação Societária
            </h2>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-600">
                Busque por CNPJ ou Razão Social para visualizar os sócios
              </p>
              {!loadingParticipacao && totalRegistrosFiltrados > 0 && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded">
                  {totalRegistrosFiltrados} registro{totalRegistrosFiltrados !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="p-6">
            {/* Lista de Empresas */}
            {loadingParticipacao ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin h-8 w-8 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="ml-3 text-gray-600">Carregando empresas...</span>
              </div>
            ) : clientesParticipacao
              // 1. Aplicar busca por texto (CNPJ ou Razão Social) - busca em tempo real
              .filter(c => {
                if (!searchParticipacao || !searchParticipacao.trim()) return true;
                
                const search = searchParticipacao.toLowerCase().trim();
                if (!search) return true;
                
                // Normalizar texto removendo acentos para busca mais flexível
                const normalize = (str: string) => str
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase();
                
                // Buscar por CNPJ (com ou sem formatação)
                const cnpjLimpo = search.replace(/\D/g, '');
                const cnpjMatch = cnpjLimpo.length > 0 && (
                  c.cnpj?.includes(search) ||
                  c.cnpj_limpo?.includes(cnpjLimpo) ||
                  c.cnpj?.replace(/\D/g, '').includes(cnpjLimpo)
                );
                
                // Buscar por Razão Social ou Nome (tenta ambos os campos)
                const razaoSocial = c.razao_social || c.nome || '';
                const razaoSocialNormalizada = normalize(razaoSocial);
                const searchNormalizada = normalize(search);
                
                // Busca simples (contém o texto)
                const nomeMatch = razaoSocialNormalizada.includes(searchNormalizada);
                
                // Busca por palavras individuais (todas as palavras devem estar presentes)
                const palavrasBusca = searchNormalizada.split(/\s+/).filter(p => p.length > 0);
                const palavrasMatch = palavrasBusca.length > 0 && palavrasBusca.every(palavra => 
                  razaoSocialNormalizada.includes(palavra)
                );
                
                // Busca por início da palavra (mais flexível)
                const inicioPalavraMatch = palavrasBusca.some(palavra => 
                  razaoSocialNormalizada.split(/\s+/).some(palavraRazao => 
                    palavraRazao.startsWith(palavra)
                  )
                );
                
                return cnpjMatch || nomeMatch || palavrasMatch || inicioPalavraMatch;
              })
              // 2. Aplicar filtros especiais
              .filter(c => {
                if (ordenacaoParticipacao === 'faltantes') {
                  // Tem sócio mas falta valores ou percentual
                  return c.socios && c.socios.length > 0 && c.socios.some(s => 
                    !s.participacao_percentual || !s.participacao_valor
                  );
                } else if (ordenacaoParticipacao === 'sem-registro') {
                  // Sem sócios cadastrados
                  return !c.socios || c.socios.length === 0;
                } else if (ordenacaoParticipacao === 'capital-zerado') {
                  // Capital Social zerado ou nulo
                  const capital = c.capital_social;
                  if (capital === null || capital === undefined || capital === '') {
                    return true;
                  }
                  // Tentar converter para número
                  const capitalNum = typeof capital === 'number'
                    ? capital
                    : parseFloat(String(capital).replace(/[^\d,.-]/g, '').replace(',', '.'));
                  return isNaN(capitalNum) || capitalNum === 0;
                } else if (ordenacaoParticipacao === 'divergente') {
                  // Empresas com divergências na verificação de 2 fatores
                  // (percentuais não somam 100% OU valores não batem com Capital Social)
                  const sociosComQualificacao = c.socios?.filter(s => s.qual && s.qual.trim() !== '') || [];
                  
                  if (sociosComQualificacao.length === 0) {
                    return false; // Sem sócios, não é divergente
                  }
                  
                  // Calcular soma de percentuais
                  const somaPercentuais = sociosComQualificacao.reduce((acc, s) => {
                    const percentual = s.participacao_percentual !== null && s.participacao_percentual !== undefined
                      ? parseFloat(String(s.participacao_percentual))
                      : 0;
                    return acc + (isNaN(percentual) ? 0 : percentual);
                  }, 0);
                  
                  // Calcular soma de valores
                  const somaValores = sociosComQualificacao.reduce((acc, s) => {
                    const valor = s.participacao_valor !== null && s.participacao_valor !== undefined
                      ? parseFloat(String(s.participacao_valor))
                      : 0;
                    return acc + (isNaN(valor) ? 0 : valor);
                  }, 0);
                  
                  // Calcular Capital Social
                  const capitalSocial = c.capital_social 
                    ? (typeof c.capital_social === 'number' 
                        ? c.capital_social 
                        : parseFloat(String(c.capital_social).replace(/[^\d,.-]/g, '').replace(',', '.')))
                    : 0;
                  const capitalSocialNum = isNaN(capitalSocial) ? 0 : capitalSocial;
                  
                  // Verificar divergências (com tolerância de 0.01% e R$ 0.01)
                  const percentuaisOk = Math.abs(somaPercentuais - 100) < 0.01;
                  const valoresOk = capitalSocialNum > 0 && Math.abs(somaValores - capitalSocialNum) < 0.01;
                  
                  // Retornar true se houver divergência (percentuais OU valores não batem)
                  return !percentuaisOk || !valoresOk;
                }
                return true; // Outros casos: sem filtro especial
              })
              // 3. Aplicar ordenação
              .sort((a, b) => {
                const nomeA = (a.razao_social || a.nome || '').toLowerCase();
                const nomeB = (b.razao_social || b.nome || '').toLowerCase();
                const cnpjA = a.cnpj_limpo || a.cnpj || '';
                const cnpjB = b.cnpj_limpo || b.cnpj || '';
                
                if (ordenacaoParticipacao === 'a-z') {
                  return nomeA.localeCompare(nomeB);
                } else if (ordenacaoParticipacao === 'z-a') {
                  return nomeB.localeCompare(nomeA);
                } else if (ordenacaoParticipacao === 'cnpj') {
                  return cnpjA.localeCompare(cnpjB);
                }
                return 0; // Filtros especiais mantêm ordem original
              })
              .map((cliente) => {
                // Exibir TODOS os sócios do QSA (sem filtrar por qualificação)
                // A Situação Fiscal apenas atualiza CPF/CNPJ e porcentagens dos sócios existentes
                const todosSocios = cliente.socios || [];
                
                // Verificação de 2 fatores: porcentagens e valores (apenas para sócios com qualificação)
                const sociosComQualificacao = todosSocios.filter(s => s.qual && s.qual.trim() !== '');
                const somaPercentuais = sociosComQualificacao.reduce((acc, s) => {
                  const percentual = s.participacao_percentual !== null && s.participacao_percentual !== undefined
                    ? parseFloat(String(s.participacao_percentual))
                    : 0;
                  return acc + (isNaN(percentual) ? 0 : percentual);
                }, 0);
                
                const somaValores = sociosComQualificacao.reduce((acc, s) => {
                  const valor = s.participacao_valor !== null && s.participacao_valor !== undefined
                    ? parseFloat(String(s.participacao_valor))
                    : 0;
                  return acc + (isNaN(valor) ? 0 : valor);
                }, 0);
                
                const capitalSocial = cliente.capital_social 
                  ? (typeof cliente.capital_social === 'number' 
                      ? cliente.capital_social 
                      : parseFloat(String(cliente.capital_social).replace(/[^\d,.-]/g, '').replace(',', '.')))
                  : 0;
                const capitalSocialNum = isNaN(capitalSocial) ? 0 : capitalSocial;
                
                // Verificar se bate 100% (com tolerância de 0.01% para arredondamentos)
                const percentuaisOk = Math.abs(somaPercentuais - 100) < 0.01;
                
                // Verificar se os valores batem com o Capital Social (com tolerância de R$ 0.01 para arredondamentos)
                const valoresOk = capitalSocialNum > 0 && Math.abs(somaValores - capitalSocialNum) < 0.01;
                
                return (
              <div 
                id={`cliente-${cliente.id}`}
                key={cliente.id} 
                className="border border-gray-200 rounded-lg overflow-hidden shadow-md mb-4 transition-all duration-300 scroll-mt-20"
              >
                {/* Header da Empresa */}
                <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 bg-amber-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <BuildingOfficeIcon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 
                          className="font-bold text-base text-gray-900 truncate cursor-pointer hover:text-amber-700 transition-colors"
                          onClick={() => {
                            const cnpjParaBusca = cliente.cnpj_limpo || cliente.cnpj?.replace(/\D/g, '') || '';
                            if (cnpjParaBusca.length === 14) {
                              // Formatar CNPJ para o campo de busca
                              const cnpjFormatado = cnpjParaBusca
                                .replace(/(\d{2})(\d)/, '$1.$2')
                                .replace(/(\d{3})(\d)/, '$1.$2')
                                .replace(/(\d{3})(\d)/, '$1/$2')
                                .replace(/(\d{4})(\d)/, '$1-$2');
                              
                              // Mudar para aba clientes (Cadastro) primeiro
                              handleTabChange('clientes');
                              
                              // Preencher o campo de busca imediatamente
                              setSearch(cnpjFormatado);
                              
                              // Navegar para aba Cadastro (clientes) com CNPJ na query string
                              const params = new URLSearchParams();
                              params.set('cnpj', cnpjParaBusca);
                              // Remover 'tab' da URL para ir para a aba padrão (Cadastro)
                              navigate({ search: params.toString() }, { replace: true });
                            }
                          }}
                          title="Clique para ver detalhes na aba Cadastro"
                        >
                          {cliente.razao_social || cliente.nome || 'Sem nome'}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-gray-600">
                              CNPJ: {formatCNPJ(cliente.cnpj_limpo || cliente.cnpj?.replace(/\D/g, '') || '') || 'Não informado'}
                            </p>
                            {cliente.cnpj_limpo || cliente.cnpj?.replace(/\D/g, '') ? (
                              <button
                                onClick={() => {
                                  const cnpjLimpo = cliente.cnpj_limpo || cliente.cnpj?.replace(/\D/g, '') || '';
                                  const cnpjFormatado = formatCNPJ(cnpjLimpo);
                                  copyToClipboard(cnpjFormatado, cnpjLimpo);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="Copiar CNPJ"
                              >
                                {copiedCnpj === (cliente.cnpj_limpo || cliente.cnpj?.replace(/\D/g, '')) ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                          {cliente.capital_social && (
                            <>
                              <span className="text-gray-400">•</span>
                              <p className="text-sm text-gray-600">
                                Capital Social: <span className="font-semibold text-gray-900">
                                  {(() => {
                                    const capital = typeof cliente.capital_social === 'number'
                                      ? cliente.capital_social
                                      : parseFloat(String(cliente.capital_social).replace(/[^\d,.-]/g, '').replace(',', '.'));
                                    return !isNaN(capital) 
                                      ? capital.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                      : cliente.capital_social;
                                  })()}
                                </span>
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => compartilharCliente(cliente.id!)}
                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-300 flex items-center justify-center group"
                        title="Compartilhar link deste cliente"
                      >
                        {copiedLink === cliente.id ? (
                          <CheckIcon className="w-5 h-5 text-green-600" />
                        ) : (
                          <ShareIcon className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                        )}
                      </button>
                      {todosSocios.length > 0 && (
                        <span className="px-3 py-1 bg-amber-600 text-white text-sm font-semibold rounded-full">
                          {todosSocios.length} sócio{todosSocios.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conteúdo */}
                <div className="border-t border-gray-200 bg-gray-50">
                  {/* Verificação de 2 Fatores - Versão Simplificada */}
                  {sociosComQualificacao.length > 0 && todosSocios.length > 0 && (
                    <div className={`px-4 py-2.5 border-b transition-colors ${
                      percentuaisOk && valoresOk 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {percentuaisOk && valoresOk ? (
                          <>
                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                              <CheckIcon className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span className="text-sm font-medium text-green-700">Dados verificados</span>
                          </>
                        ) : (
                          <>
                            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                              <XMarkIcon className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {!percentuaisOk && (
                                <span className="text-sm font-medium text-red-700">
                                  Percentual: {somaPercentuais.toFixed(2)}% (esperado: 100%)
                                </span>
                              )}
                              {!percentuaisOk && !valoresOk && capitalSocialNum > 0 && (
                                <span className="text-red-400">•</span>
                              )}
                              {!valoresOk && capitalSocialNum > 0 && (
                                <span className="text-sm font-medium text-red-700">
                                  Soma de valores ≠ Capital Social
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Lista de Sócios - Tabela Compacta */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <UserGroupIcon className="h-4 w-4 text-amber-600" />
                        <h4 className="text-sm font-semibold text-gray-900">
                          Sócios ({todosSocios.length})
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleUploadClick}
                          disabled={uploadingPdf}
                          className="p-2 text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed rounded-lg transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md"
                          title="Fazer upload de PDF da Situação Fiscal"
                        >
                          {uploadingPdf ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <PlusIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={async (e) => {
                            console.log('[Clientes] Botão "Atualizar Sócios" clicado', { clienteId: cliente.id, cnpj: cliente.cnpj });
                            e.stopPropagation();
                            
                            if (!cliente.id) {
                              console.error('[Clientes] ID do cliente não disponível', cliente);
                              toast.error('ID do cliente não disponível');
                              return;
                            }
                            
                            const clienteIdLocal = cliente.id; // Guardar o ID localmente para evitar problemas com estado assíncrono
                            console.log('[Clientes] Iniciando atualização de sócios para cliente:', clienteIdLocal);
                            setAtualizandoSocios(clienteIdLocal);
                            atualizandoSociosIdRef.current = clienteIdLocal; // Usar ref para verificação imediata
                            
                            try {
                              const cnpjLimpo = cliente.cnpj_limpo || cliente.cnpj?.replace(/\D/g, '') || '';
                              console.log('[Clientes] CNPJ limpo:', cnpjLimpo);
                              
                              if (!cnpjLimpo || cnpjLimpo.length !== 14) {
                                console.error('[Clientes] CNPJ inválido:', cnpjLimpo);
                                toast.error('CNPJ inválido para consulta');
                                setAtualizandoSocios(null);
                                atualizandoSociosIdRef.current = null;
                                return;
                              }
                              
                              // Usar a estrutura já pronta de Situação Fiscal (3 passos: token, protocolo, base64)
                              // Chamar o endpoint que já faz todo o processo
                              console.log('[Clientes] Iniciando consulta de Situação Fiscal para CNPJ:', cnpjLimpo);
                              toast.info('Iniciando consulta de Situação Fiscal...');
                              
                              let consultaConcluida = false;
                              let tentativas = 0;
                              let errosConsecutivos = 0; // Contador de erros consecutivos (não 202/429)
                              const maxTentativas = 120; // ~4 minutos (120 * 2s) - tempo suficiente para os 3 passos
                              const maxErrosConsecutivos = 3; // Máximo de erros consecutivos antes de desistir
                              
                              console.log('[Clientes] Entrando no loop de consulta, maxTentativas:', maxTentativas);
                              
                              // Aguardar até que o endpoint retorne 200 (concluído) ou timeout
                              while (tentativas < maxTentativas && !consultaConcluida) {
                                console.log(`[Clientes] Loop iteração ${tentativas + 1}, consultaConcluida:`, consultaConcluida, 'errosConsecutivos:', errosConsecutivos);
                                
                                // Verificar se o usuário ainda está na mesma empresa (usando ref para verificação imediata)
                                if (atualizandoSociosIdRef.current !== clienteIdLocal) {
                                  console.log('[Clientes] Usuário mudou de empresa ou cancelou. atualizandoSociosIdRef.current:', atualizandoSociosIdRef.current, 'clienteIdLocal:', clienteIdLocal);
                                  return; // Usuário cancelou ou mudou de empresa
                                }
                                
                                try {
                                  // Chamar o endpoint que já faz todo o processo (token → protocolo → base64)
                                  console.log(`[Clientes] Tentativa ${tentativas + 1}/${maxTentativas} - Chamando /situacao-fiscal/${cnpjLimpo}/download`);
                                  const response = await api.post(`/situacao-fiscal/${cnpjLimpo}/download`);
                                  console.log('[Clientes] Resposta recebida:', { status: response.status, data: response.data });
                                  
                                  // Resetar contador de erros se a requisição foi bem-sucedida
                                  errosConsecutivos = 0;
                                  
                                  // Se retornou 200, a consulta está concluída (PDF base64 já foi extraído e salvo)
                                  if (response.status === 200 && response.data?.success && response.data?.step === 'concluido') {
                                    console.log('[Clientes] Consulta concluída!');
                                    consultaConcluida = true;
                                    toast.success('Consulta de Situação Fiscal concluída!', 2000);
                                    break;
                                  }
                                  
                                  // Se retornou 202, ainda está processando (aguardar e tentar novamente)
                                  if (response.status === 202) {
                                    const retryAfter = response.data?.retryAfter || 5;
                                    const step = response.data?.step || 'processando';
                                    const stepMsg = step === 'protocolo' 
                                      ? 'Solicitando protocolo...' 
                                      : step === 'emitir'
                                      ? 'Buscando PDF...'
                                      : 'Processando...';
                                    
                                    // Aguardar o tempo indicado pelo backend
                                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                                    
                                    // Feedback a cada 10 tentativas
                                    if (tentativas % 10 === 0) {
                                      toast.info(`${stepMsg} (${tentativas * 2}s)`);
                                    }
                                  } else {
                                    // Outro status - aguardar 2s antes de tentar novamente
                                    console.warn('[Clientes] Status inesperado:', response.status);
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                  }
                                } catch (error: any) {
                                  const statusCode = error?.response?.status;
                                  const errorMessage = error?.response?.data?.error || error?.message || 'Erro desconhecido';
                                  
                                  console.error(`[Clientes] Erro ao consultar situação fiscal (status ${statusCode}):`, errorMessage);
                                  
                                  // Erros fatais que não devem ser retentados (403, 400, 401, 404, 500, etc)
                                  const errosFatais = [400, 401, 403, 404, 500, 502, 503];
                                  if (statusCode && errosFatais.includes(statusCode)) {
                                    console.error(`[Clientes] Erro fatal (${statusCode}):`, errorMessage, '- Parando tentativas');
                                    toast.error(`Erro ao consultar Situação Fiscal: ${errorMessage} (${statusCode})`);
                                    break; // Parar o loop imediatamente
                                  }
                                  
                                  // Se for 202 ou 429, continuar tentando (ainda processando) e resetar contador de erros
                                  if (statusCode === 202 || statusCode === 429) {
                                    errosConsecutivos = 0; // Resetar contador de erros
                                    const retryAfter = error.response.data?.retryAfter || 5;
                                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                                  } else if (statusCode === 200) {
                                    // Às vezes o axios trata 200 como erro em certas condições
                                    errosConsecutivos = 0; // Resetar contador
                                    consultaConcluida = true;
                                    break;
                                  } else {
                                    // Outro erro - incrementar contador de erros consecutivos
                                    errosConsecutivos++;
                                    console.warn(`[Clientes] Erro consecutivo ${errosConsecutivos}/${maxErrosConsecutivos}`);
                                    
                                    // Se excedeu o limite de erros consecutivos, parar
                                    if (errosConsecutivos >= maxErrosConsecutivos) {
                                      console.error(`[Clientes] Muitos erros consecutivos (${errosConsecutivos}). Parando tentativas.`);
                                      toast.error(`Erro ao consultar Situação Fiscal após ${errosConsecutivos} tentativas. Tente novamente mais tarde.`);
                                      break;
                                    }
                                    
                                    // Aguardar 2s antes de tentar novamente
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                  }
                                }
                                
                                tentativas++;
                              }
                              
                              console.log('[Clientes] Loop terminou. consultaConcluida:', consultaConcluida, 'tentativas:', tentativas);
                              
                              // Se a consulta foi concluída, os sócios já foram atualizados automaticamente durante a extração
                              // Apenas aguardar um pouco para garantir que o backend salvou e buscar o cliente atualizado
                              if (consultaConcluida) {
                                console.log('[Clientes] Consulta concluída! Os sócios foram atualizados automaticamente durante a extração.');
                                toast.info('Buscando dados atualizados dos sócios...');
                                
                                // Aguardar o backend salvar completamente (a extração já atualizou os sócios)
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                try {
                                  // Buscar cliente atualizado (os sócios já foram atualizados pela extração)
                                  console.log('[Clientes] Buscando cliente atualizado...');
                                  const clienteAtualizado = await clientesService.obterCliente(cliente.id!);
                                  
                                  if (clienteAtualizado && typeof clienteAtualizado === 'object') {
                                    let clienteComSocios: Cliente;
                                    
                                    if ((clienteAtualizado as any).success && (clienteAtualizado as any).data) {
                                      clienteComSocios = (clienteAtualizado as any).data as Cliente;
                                    } else if ((clienteAtualizado as any).id) {
                                      clienteComSocios = clienteAtualizado as Cliente;
                                    } else {
                                      throw new Error('Formato de resposta inválido');
                                    }
                                    
                                    console.log('[Clientes] Cliente atualizado recebido. Total de sócios:', clienteComSocios.socios?.length || 0);
                                    
                                    // Atualizar apenas o cliente específico na lista (não recarregar toda a página)
                                    setClientesParticipacao(prevClientes => 
                                      prevClientes.map(c => c.id === cliente.id ? clienteComSocios : c)
                                    );
                                    
                                    toast.success('Sócios atualizados com sucesso!');
                                  } else {
                                    console.error('[Clientes] Formato de resposta inválido:', clienteAtualizado);
                                    toast.error('Erro ao obter dados atualizados do cliente');
                                  }
                                } catch (updateError: any) {
                                  console.error('[Clientes] Erro ao buscar cliente atualizado:', updateError);
                                  const errorMsg = updateError?.response?.data?.error || updateError?.message || 'Erro ao buscar dados atualizados';
                                  toast.error(errorMsg);
                                }
                              } else {
                                // Timeout - consulta ainda não concluída
                                console.log('[Clientes] Timeout - consulta não concluída após', tentativas, 'tentativas');
                                toast.warning('A consulta ainda está em processamento. Aguarde alguns minutos e tente novamente.');
                              }
                            } catch (error: any) {
                              console.error('[Clientes] Erro ao atualizar sócios:', error);
                              console.error('[Clientes] Stack do erro:', error?.stack);
                              console.error('[Clientes] Response do erro:', error?.response);
                              const errorMsg = error?.response?.data?.error || error?.message || 'Erro ao atualizar sócios';
                              
                              // Verificar se é erro de Capital Social Zerado
                              const errorMsgLower = errorMsg.toLowerCase();
                              if (errorMsgLower.includes('capital social zerado') || 
                                  errorMsgLower.includes('capital social zerado') ||
                                  errorMsgLower.includes('capital zerado') ||
                                  errorMsgLower.includes('capital social zero')) {
                                toast.error('Capital Social Zerado: Não é possível atualizar os sócios quando o capital social está zerado.');
                              } else {
                                toast.error(errorMsg);
                              }
                            } finally {
                              console.log('[Clientes] Finalizando atualização de sócios');
                              setAtualizandoSocios(null);
                              atualizandoSociosIdRef.current = null; // Limpar ref também
                            }
                          }}
                          disabled={atualizandoSocios === cliente.id}
                          className="p-2 text-indigo-600 hover:text-white hover:bg-indigo-600 disabled:bg-indigo-100 disabled:cursor-not-allowed rounded-lg transition-all duration-300 flex items-center justify-center border border-indigo-200 hover:border-indigo-600"
                          title="Atualizar sócios via Situação Fiscal"
                        >
                          <ArrowPathIcon className={`h-4 w-4 ${atualizandoSocios === cliente.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={async () => {
                            if (recalculandoValores === cliente.id) return;
                            
                            setRecalculandoValores(cliente.id);
                            
                            try {
                              console.log('[Clientes] Recalculando valores de participação para cliente:', cliente.id);
                              toast.info('Recalculando valores de participação...', 2000);
                              
                              const result = await clientesService.recalcularValoresParticipacao(cliente.id);
                              
                              if (result.success) {
                                const atualizados = result.data?.atualizados || 0;
                                toast.success(`${atualizados} valor(es) recalculado(s) com sucesso!`, 3000);
                                
                                // Aguardar um pouco e então buscar o cliente atualizado
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                const clienteAtualizado = await clientesService.obterCliente(cliente.id);
                                
                                if (clienteAtualizado) {
                                  let clienteComSocios: Cliente;
                                  if ((clienteAtualizado as any).success && (clienteAtualizado as any).data) {
                                    clienteComSocios = (clienteAtualizado as any).data as Cliente;
                                  } else if ((clienteAtualizado as any).id) {
                                    clienteComSocios = clienteAtualizado as Cliente;
                                  } else {
                                    throw new Error('Formato de resposta inválido');
                                  }
                                  
                                  // Atualizar apenas o cliente específico na lista
                                  setClientesParticipacao(prevClientes => 
                                    prevClientes.map(c => c.id === cliente.id ? clienteComSocios : c)
                                  );
                                }
                              } else {
                                const errorMsgResult = result.error || 'Erro ao recalcular valores';
                                const errorMsgLower = errorMsgResult.toLowerCase();
                                // Verificar se é erro de Capital Social Zerado
                                if (errorMsgLower.includes('capital social zerado') || 
                                    errorMsgLower.includes('capital zerado') ||
                                    errorMsgLower.includes('capital social zero')) {
                                  toast.error('Capital Social Zerado: Não é possível recalcular valores quando o capital social está zerado.');
                                } else {
                                  toast.error(errorMsgResult);
                                }
                              }
                            } catch (error: any) {
                              console.error('[Clientes] Erro ao recalcular valores:', error);
                              const errorMsg = error?.response?.data?.error || error?.message || 'Erro ao recalcular valores';
                              
                              // Verificar se é erro de Capital Social Zerado
                              const errorMsgLower = errorMsg.toLowerCase();
                              if (errorMsgLower.includes('capital social zerado') || 
                                  errorMsgLower.includes('capital zerado') ||
                                  errorMsgLower.includes('capital social zero')) {
                                toast.error('Capital Social Zerado: Não é possível recalcular valores quando o capital social está zerado.');
                              } else {
                                toast.error(errorMsg);
                              }
                            } finally {
                              setRecalculandoValores(null);
                            }
                          }}
                          disabled={recalculandoValores === cliente.id}
                          className="p-2 text-blue-600 hover:text-white hover:bg-blue-600 disabled:bg-blue-100 disabled:cursor-not-allowed rounded-lg transition-all duration-300 flex items-center justify-center border border-blue-200 hover:border-blue-600"
                          title="Recalcular valores de participação usando Capital Social do cliente"
                        >
                          {recalculandoValores === cliente.id ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <ArrowPathIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {todosSocios.length === 0 ? (
                      <div className="text-center py-6 bg-white rounded border border-dashed border-gray-200">
                        <UserGroupIcon className="h-8 w-8 text-gray-300 mx-auto mb-1" />
                        <p className="text-gray-500 text-xs">Nenhum sócio cadastrado</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPF / CNPJ</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qualificação</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Participação</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {todosSocios.map((socio, idx) => (
                              <tr key={socio.id || idx} className="hover:bg-amber-50 transition-colors">
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                                      <span className="text-amber-700 font-semibold text-xs">
                                        {socio.nome?.charAt(0).toUpperCase() || '?'}
                                      </span>
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">{socio.nome || 'Sem nome'}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-600">
                                  {formatarCpfCnpj(socio.cpf || null)}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-600">
                                  {socio.qual || '-'}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-right">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-amber-700 bg-amber-100">
                                    {socio.participacao_percentual !== null && socio.participacao_percentual !== undefined
                                      ? `${socio.participacao_percentual.toFixed(2)}%`
                                      : '-'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-right text-sm font-semibold text-green-700">
                                  {socio.participacao_valor
                                    ? socio.participacao_valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
          {/* Input de arquivo oculto para upload de PDF */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* Aba de Lançamentos (Banco SCI) */}
      {activeTab === 'lancamentos' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 bg-emerald-50 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <BuildingOfficeIcon className="h-5 w-5 text-emerald-600" />
                Lançamentos por CNPJ (Banco SCI)
              </h2>
              <p className="text-xs text-gray-600 mt-1">
                Digite um CNPJ na busca acima (14 dígitos) para visualizar os lançamentos FPG, CTB, FISE e FISS deste cliente.
              </p>
            </div>
          </div>
          <div className="px-6 py-4">
            {hostLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">
                Carregando lançamentos...
              </div>
            ) : hostError ? (
              <div className="py-8 text-center text-sm text-red-600">
                {hostError}
              </div>
            ) : hostLancamentos.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                Nenhum lançamento encontrado para o CNPJ informado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Competência
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Relatório
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Espécie
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Movimentação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {hostLancamentos.map((item) => (
                      <tr key={`${item.ano}-${item.mes}-${item.relatorio}-${item.tipo}-${item.especie || 'null'}`}>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.competencia}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.relatorio}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.tipo}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {item.especie || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-semibold">
                          {item.movimentacao}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notificação de exclusão pendente com contagem regressiva */}
      {pendingDelete.cliente && pendingDelete.countdown > 0 && (
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
                  Cliente: {pendingDelete.cliente.razao_social || pendingDelete.cliente.nome || 'Cliente'}
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

      {/* Toast de sucesso */}
      {showSuccess && successMessage && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3 min-w-[320px] animate-toast-fade-in">
            <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{successMessage}</p>
            </div>
            <button
              onClick={() => setShowSuccess(false)}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {/* Toast de erro */}
      {showError && (error || customErrorMessage) && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3 min-w-[320px] animate-toast-fade-in">
            <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{error || customErrorMessage}</p>
            </div>
            <button
              onClick={() => {
                setShowError(false);
                setCustomErrorMessage('');
                clearError();
              }}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideDown {
          from { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
        }
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

export default Clientes;
// Force recompile
// Trigger recompile

// Recompile after structure fix

// Recompile with list view

// Move search to top
// Clean layout
