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
  ArrowRightIcon,
  FunnelIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ShareIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { api } from '../services/api';
import type { AxiosError } from 'axios';
import PagamentosTab from '../components/Clientes/PagamentosTab';
import EProcessosTab from '../components/Clientes/EProcessosTab';
import ExportClientesModal from '../components/Clientes/ExportClientesModal';
import { clientesService } from '../services';
import { useToast } from '../hooks/useToast';
import { irpfService, type FaturamentoAnual } from '../services/irpf';
import { CurrencyDollarIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';

// Componente moderno de seleção de Mês/Ano
const MonthYearPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const [anoAtual, setAnoAtual] = React.useState(() => {
    if (value) {
      const [ano] = value.split('-');
      return parseInt(ano);
    }
    return new Date().getFullYear();
  });

  // Sincronizar anoAtual quando value mudar externamente
  React.useEffect(() => {
    if (value) {
      const [ano] = value.split('-');
      const anoValue = parseInt(ano);
      setAnoAtual(prev => prev !== anoValue ? anoValue : prev);
    }
  }, [value]);

  const meses = [
    { num: 1, nome: 'Janeiro', abrev: 'jan' },
    { num: 2, nome: 'Fevereiro', abrev: 'fev' },
    { num: 3, nome: 'Março', abrev: 'mar' },
    { num: 4, nome: 'Abril', abrev: 'abr' },
    { num: 5, nome: 'Maio', abrev: 'mai' },
    { num: 6, nome: 'Junho', abrev: 'jun' },
    { num: 7, nome: 'Julho', abrev: 'jul' },
    { num: 8, nome: 'Agosto', abrev: 'ago' },
    { num: 9, nome: 'Setembro', abrev: 'set' },
    { num: 10, nome: 'Outubro', abrev: 'out' },
    { num: 11, nome: 'Novembro', abrev: 'nov' },
    { num: 12, nome: 'Dezembro', abrev: 'dez' },
  ];

  const mesSelecionado = value ? parseInt(value.split('-')[1]) : null;
  const anoSelecionado = value ? parseInt(value.split('-')[0]) : null;

  const textoExibido = value
    ? `${meses.find(m => m.num === mesSelecionado)?.nome || ''} de ${anoSelecionado}`
    : 'Selecione o mês e ano...';

  const handleSelecionarMes = (mes: number) => {
    const novoValor = `${anoAtual}-${String(mes).padStart(2, '0')}`;
    onChange(novoValor);
  };

  const anosDisponiveis = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <Menu as="div" className="relative">
      {({ open, close }) => (
        <>
          <Menu.Button className="w-full px-4 py-2.5 text-left border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white hover:bg-gray-50 transition-colors flex items-center justify-between">
            <span className={value ? 'text-gray-900' : 'text-gray-500'}>
              {textoExibido}
            </span>
            <CalendarIcon className="h-5 w-5 text-gray-400" />
          </Menu.Button>

          <Transition
            show={open}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items static className="absolute z-50 mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 p-4 focus:outline-none">
              {/* Header com botão X */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnoAtual(prev => prev - 1);
                    }}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
                  </button>
                  <span className="text-lg font-semibold text-gray-900 flex-1 text-center">{anoAtual}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnoAtual(prev => prev + 1);
                    }}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                  }}
                  className="ml-2 p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Fechar"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Grid de Meses */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {meses.map((mes) => {
                  const isSelected = value === `${anoAtual}-${String(mes.num).padStart(2, '0')}`;
                  return (
                    <button
                      key={mes.num}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelecionarMes(mes.num);
                        // Fechar automaticamente após selecionar
                        setTimeout(() => close(), 150);
                      }}
                      className={`
                        px-3 py-2 text-sm font-medium rounded-lg transition-all
                        ${isSelected
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-gray-50 text-gray-700 hover:bg-purple-50 hover:text-purple-700'
                        }
                      `}
                    >
                      {mes.abrev}
                    </button>
                  );
                })}
              </div>

              {/* Seleção Rápida de Ano */}
              <div className="border-t border-gray-200 pt-3">
                <p className="text-xs font-medium text-gray-500 mb-2">Anos Recentes</p>
                <div className="flex flex-wrap gap-2">
                  {anosDisponiveis.map((ano) => (
                    <button
                      key={ano}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnoAtual(ano);
                      }}
                      className={`
                        px-3 py-1.5 text-sm rounded-md transition-colors
                        ${anoAtual === ano
                          ? 'bg-purple-100 text-purple-700 font-medium'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                        }
                      `}
                    >
                      {ano}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-200">
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange('');
                      close();
                    }}
                    className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const hoje = new Date();
                      const mesAtual = hoje.getMonth() + 1;
                      const anoAtualHoje = hoje.getFullYear();
                      handleSelecionarMes(mesAtual);
                      setAnoAtual(anoAtualHoje);
                      setTimeout(() => close(), 150);
                    }}
                    className="px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-50 rounded-md transition-colors font-medium"
                  >
                    Mês Atual
                  </button>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                  }}
                  className="px-4 py-1.5 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-md transition-colors font-medium"
                >
                  OK
                </button>
              </div>
            </Menu.Items>
          </Transition>
        </>
      )}
    </Menu>
  );
};

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
  // Aba Faturamento SCI
  const [clientesFaturamento, setClientesFaturamento] = useState<Cliente[]>([]);
  const [faturamentoData, setFaturamentoData] = useState<Map<string, { faturamento: FaturamentoAnual[]; loading: boolean; carregado: boolean; error?: string; ultimaAtualizacao?: string | null }>>(new Map());
  const [loadingFaturamento, setLoadingFaturamento] = useState(false);
  const [searchFaturamento, setSearchFaturamento] = useState('');
  const carregandoFaturamentoRef = useRef(false);
  const activeTabFaturamentoAnteriorRef = useRef<string>('');
  const anoAtualFaturamento = new Date().getFullYear();
  const anosParaBuscarFaturamento = [anoAtualFaturamento - 2, anoAtualFaturamento - 1];
  
  // Aba CNAE
  const [cnae, setCnae] = useState('');
  const [clientesCNAE, setClientesCNAE] = useState<Cliente[]>([]);
  const [loadingCNAE, setLoadingCNAE] = useState(false);
  const [buscouCNAE, setBuscouCNAE] = useState(false);
  const [gruposCNAE, setGruposCNAE] = useState<Array<{ nome: string; palavrasChave: string[]; cnaes: Array<{ codigo: string; descricao: string }> }>>([]);
  const [gruposSelecionados, setGruposSelecionados] = useState<string[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [cnaesExpandidos, setCnaesExpandidos] = useState(false);
  const [clienteModalCNAE, setClienteModalCNAE] = useState<Cliente | null>(null);
  const [exportandoCNAE, setExportandoCNAE] = useState(false);
  const [grupoDropdownAberto, setGrupoDropdownAberto] = useState(false);

  // Modal de CNAEs e Atividades
  const [showModalCNAEAtividades, setShowModalCNAEAtividades] = useState(false);
  const [clienteModalCNAEAtividades, setClienteModalCNAEAtividades] = useState<Cliente | null>(null);
  const [filtroCNAEModal, setFiltroCNAEModal] = useState<string>('');

  // Modal Consulta Personalizada
  const [showModalConsultaPersonalizada, setShowModalConsultaPersonalizada] = useState(false);
  const [tipoConsulta, setTipoConsulta] = useState<'anual' | 'mensal' | 'personalizado'>('anual');
  const [consultaPersonalizada, setConsultaPersonalizada] = useState({
    busca: '',
    dataInicial: '',
    dataFinal: '',
    tipoFaturamento: 'detalhado' as 'detalhado' | 'consolidado',
    somarMatrizFilial: false,
    // Campos específicos para consulta anual e mensal
    anoSelecionado: '',
    mesSelecionado: '',
    anoMesSelecionado: '',
  });

  // Modal Detalhes Faturamento
  const [showModalDetalhesFaturamento, setShowModalDetalhesFaturamento] = useState(false);
  const [detalhesFaturamento, setDetalhesFaturamento] = useState<{
    cliente: Cliente | null;
    ano: number;
    dados: any[];
    loading: boolean;
  }>({
    cliente: null,
    ano: 0,
    dados: [],
    loading: false,
  });
  const [loadingConsultaPersonalizada, setLoadingConsultaPersonalizada] = useState(false);
  const [resultadoConsultaPersonalizada, setResultadoConsultaPersonalizada] = useState<any>(null);
  const [showModalResultado, setShowModalResultado] = useState(false);
  const [loadingParticipacao, setLoadingParticipacao] = useState(false);
  const [searchParticipacao, setSearchParticipacao] = useState('');
  const [ordenacaoParticipacao, setOrdenacaoParticipacao] = useState<'a-z' | 'z-a' | 'cnpj' | 'codigo-sci' | 'faltantes' | 'sem-registro' | 'capital-zerado' | 'divergente'>('a-z');
  const [ordenacaoClientes, setOrdenacaoClientes] = useState<'a-z' | 'z-a' | 'cnpj' | 'codigo-sci'>('a-z');
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
  const [activeTab, setActiveTab] = useState<'clientes' | 'participacao' | 'faturamento-sci' | 'lancamentos' | 'pagamentos' | 'e-processos' | 'cnae'>(() => {
    // Inicializar pela URL/localStorage para evitar 1º render na aba errada (que dispara várias requisições/toasts)
    const params = new URLSearchParams(window.location.search);
    const tabFromQuery = params.get('tab');
    const tabFromStorage = window.localStorage.getItem('clientes_active_tab');
    const tab = (tabFromQuery as any) || tabFromStorage || 'clientes';

    if (tab === 'pagamentos') return 'pagamentos';
    if (tab === 'lancamentos') return 'lancamentos';
    if (tab === 'e-processos') return 'e-processos';
    if (tab === 'participacao') return 'participacao';
    if (tab === 'cnae') return 'cnae';
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
  const [sociosRefreshKey, setSociosRefreshKey] = useState(0);
  const [atualizandoSocios, setAtualizandoSocios] = useState<string | null>(null); // ID do cliente sendo atualizado
  const [atualizandoCodigoSCI, setAtualizandoCodigoSCI] = useState(false);
 // ID do cliente sendo recalculado
  const [uploadingPdf, setUploadingPdf] = useState(false); // Estado para upload de PDF
  // Estados para modal de regime tributário
  const [showRegimeModal, setShowRegimeModal] = useState(false);
  const [regimeSelecionado, setRegimeSelecionado] = useState<string>('');
  const [clienteParaRegime, setClienteParaRegime] = useState<Cliente | null>(null);
  const [salvandoRegime, setSalvandoRegime] = useState(false);
  // Estados para modal de exportação
  const [showExportModal, setShowExportModal] = useState(false);
  // Estados para modal de edição manual de participação
  const [showModalEdicaoParticipacao, setShowModalEdicaoParticipacao] = useState(false);
  const [clienteEditandoParticipacao, setClienteEditandoParticipacao] = useState<Cliente | null>(null);
  const [editandoParticipacao, setEditandoParticipacao] = useState(false);
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

  // Funções para CNAE
  const aplicarMascaraCNAE = (valor: string): string => {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length <= 4) {
      return numeros;
    } else if (numeros.length <= 5) {
      return `${numeros.slice(0, 4)}-${numeros.slice(4)}`;
    } else {
      return `${numeros.slice(0, 4)}-${numeros.slice(4, 5)}/${numeros.slice(5, 7)}`;
    }
  };

  const limparCNAE = (valor: string): string => {
    return valor.replace(/\D/g, '');
  };

  const formatarCNAE = (cnae: string | undefined): string => {
    if (!cnae) return '';
    const limpo = String(cnae).replace(/\D/g, '');
    if (limpo.length < 5) return cnae;
    return limpo.replace(/^(\d{4})(\d{1})(\d{2})$/, '$1-$2/$3');
  };

  const handleBuscarCNAE = async () => {
    if (!cnae.trim()) {
      toast.error('Por favor, informe um código CNAE');
      return;
    }

    const cnaeLimpo = limparCNAE(cnae);
    if (cnaeLimpo.length < 2) {
      toast.error('O código CNAE deve ter pelo menos 2 dígitos');
      return;
    }

    setLoadingCNAE(true);
    setBuscouCNAE(true);

    try {
      const response = await clientesService.buscarPorCNAE(cnae);
      
      if (response.success && response.data) {
        setClientesCNAE(Array.isArray(response.data) ? response.data : []);
        if (response.total === 0) {
          toast.info('Nenhum cliente encontrado com este CNAE');
        } else {
          toast.success(`${response.total} cliente(s) encontrado(s)`);
        }
      } else {
        setClientesCNAE([]);
        toast.error(response.error || 'Erro ao buscar clientes');
      }
    } catch (error: any) {
      console.error('Erro ao buscar por CNAE:', error);
      setClientesCNAE([]);
      toast.error('Erro ao buscar clientes por CNAE');
    } finally {
      setLoadingCNAE(false);
    }
  };

  const handleCnaeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    const cnaeFormatado = aplicarMascaraCNAE(valor);
    setCnae(cnaeFormatado);
    setGruposSelecionados([]); // Limpar grupos quando digitar CNAE
  };

  const handleBuscarPorGrupo = async () => {
    if (gruposSelecionados.length === 0) {
      toast.error('Por favor, selecione pelo menos um grupo');
      return;
    }

    setLoadingCNAE(true);
    setBuscouCNAE(true);
    setCnae(''); // Limpar campo CNAE quando buscar por grupo

    try {
      const response = await clientesService.buscarPorMultiplosCNAEsEGrupos({
        cnaes: [],
        grupos: gruposSelecionados
      });
      
      if (response.success && response.data) {
        setClientesCNAE(Array.isArray(response.data) ? response.data : []);
        if (response.total === 0) {
          toast.info('Nenhum cliente encontrado nos grupos selecionados');
        } else {
          const gruposText = gruposSelecionados.length > 1 
            ? `${gruposSelecionados.length} grupos` 
            : `grupo "${gruposSelecionados[0]}"`;
          toast.success(`${response.total} cliente(s) encontrado(s) em ${gruposText}`);
        }
      } else {
        setClientesCNAE([]);
        toast.error(response.error || 'Erro ao buscar clientes');
      }
    } catch (error: any) {
      console.error('Erro ao buscar por grupos CNAE:', error);
      setClientesCNAE([]);
      toast.error('Erro ao buscar clientes por grupos CNAE');
    } finally {
      setLoadingCNAE(false);
    }
  };

  const handleGrupoChange = (grupo: string) => {
    setGruposSelecionados(prev => {
      if (prev.includes(grupo)) {
        return prev.filter(g => g !== grupo);
      } else {
        return [...prev, grupo];
      }
    });
    setCnae(''); // Limpar campo CNAE quando selecionar grupo
    setClientesCNAE([]);
    setBuscouCNAE(false);
    setGrupoDropdownAberto(false);
  };

  // Carregar grupos quando abrir a aba CNAE
  useEffect(() => {
    if (activeTab === 'cnae' && gruposCNAE.length === 0 && !loadingGrupos) {
      const carregarGrupos = async () => {
        setLoadingGrupos(true);
        try {
          const response = await clientesService.buscarGruposCNAE();
          if (response.success && response.data) {
            setGruposCNAE(Array.isArray(response.data) ? response.data : []);
          }
        } catch (error) {
          console.error('Erro ao carregar grupos CNAE:', error);
          toast.error('Erro ao carregar grupos de CNAE');
        } finally {
          setLoadingGrupos(false);
        }
      };
      carregarGrupos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (grupoDropdownAberto && !target.closest('.grupo-dropdown-container')) {
        setGrupoDropdownAberto(false);
      }
    };

    if (grupoDropdownAberto) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [grupoDropdownAberto]);

  // Função para exportar resultados da busca CNAE
  const handleExportarCNAE = async () => {
    if (exportandoCNAE || clientesCNAE.length === 0) return;
    
    setExportandoCNAE(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Clientes CNAE', {
        views: [{ 
          state: 'frozen', 
          ySplit: 1,
          showGridLines: false
        }],
      });

      // Calcular número máximo de atividades secundárias
      let maxAtividadesSecundarias = 0;
      clientesCNAE.forEach((cliente) => {
        let atividadesSecundarias: any[] = [];
        try {
          const valor = (cliente as any).atividades_secundarias;
          if (typeof valor === 'string') {
            atividadesSecundarias = JSON.parse(valor);
          } else if (Array.isArray(valor)) {
            atividadesSecundarias = valor;
          }
        } catch {
          // Ignorar erros de parsing
        }
        if (atividadesSecundarias.length > maxAtividadesSecundarias) {
          maxAtividadesSecundarias = atividadesSecundarias.length;
        }
      });

      // Cabeçalhos - CÓDIGO SCI como primeira coluna
      const headers = [
        'CÓDIGO SCI',
        'CNPJ',
        'RAZÃO SOCIAL',
        'NOME FANTASIA',
        'E-MAIL',
        'TELEFONE',
        'ENDEREÇO',
        'REGIME TRIBUTÁRIO',
        'CNAE PRINCIPAL',
        'DESCRIÇÃO CNAE PRINCIPAL',
        'QUANTIDADE ATIVIDADES SECUNDÁRIAS',
      ];

      // Adicionar colunas dinâmicas para cada atividade secundária
      for (let i = 1; i <= maxAtividadesSecundarias; i++) {
        headers.push(`ATIVIDADE SECUNDÁRIA ${i}`);
      }

      // Adicionar cabeçalhos na linha 1
      const headerRow = sheet.addRow(headers);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF9333EA' }, // Roxo
        };
        cell.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
          size: 12,
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: false,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });

      // Processar dados
      const dataRows: any[][] = [];
      
      clientesCNAE.forEach((cliente) => {
        // Processar atividades secundárias
        let atividadesSecundarias: any[] = [];
        try {
          const valor = (cliente as any).atividades_secundarias;
          if (typeof valor === 'string') {
            atividadesSecundarias = JSON.parse(valor);
          } else if (Array.isArray(valor)) {
            atividadesSecundarias = valor;
          }
        } catch {
          // Ignorar erros de parsing
        }

        // Formatar cada atividade secundária individualmente
        const atividadesFormatadas: string[] = [];
        atividadesSecundarias.forEach((atividade: any) => {
          const codigo = formatarCNAE(atividade.code || atividade.codigo || '');
          const descricao = atividade.text || atividade.descricao || atividade.texto || '';
          atividadesFormatadas.push(`${codigo} - ${descricao}`);
        });

        const cnaePrincipal = formatarCNAE((cliente as any).atividade_principal_code);
        const cnaePrincipalText = (cliente as any).atividade_principal_text || '';

        // Construir linha: CÓDIGO SCI como primeira coluna
        const row: any[] = [
          (cliente as any).codigo_sci || '-',
          formatarCpfCnpj(cliente.cnpj_limpo || (cliente as any).cnpj),
          cliente.razao_social || cliente.nome || 'N/A',
          (cliente as any).fantasia || '-',
          (cliente as any).email || '-',
          (cliente as any).telefone || '-',
          (cliente as any).endereco || '-',
          (cliente as any).regime_tributario || '-',
          cnaePrincipal || '-',
          cnaePrincipalText || '-',
          atividadesSecundarias.length || 0,
        ];

        // Adicionar cada atividade secundária em uma coluna separada
        for (let i = 0; i < maxAtividadesSecundarias; i++) {
          row.push(atividadesFormatadas[i] || '-');
        }

        dataRows.push(row);
      });

      // Adicionar dados
      dataRows.forEach((row) => {
        const dataRow = sheet.addRow(row);
        dataRow.height = 20;
        dataRow.eachCell((cell, colNumber) => {
          // Colunas centralizadas:
          // - CÓDIGO SCI = coluna 1
          // - REGIME TRIBUTÁRIO = coluna 8
          // - QUANTIDADE ATIVIDADES SECUNDÁRIAS = coluna 11
          const isCentralizado = colNumber === 1 || colNumber === 8 || colNumber === 11;
          // Colunas de atividades secundárias começam após QUANTIDADE ATIVIDADES SECUNDÁRIAS (coluna 12)
          const isAtividadeSecundaria = colNumber > 11;
          
          cell.alignment = {
            vertical: 'middle',
            horizontal: isCentralizado ? 'center' : 'left',
            wrapText: false,
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        });
      });

      // Ajustar largura das colunas
      const columnWidths: { width: number }[] = [
        { width: 15 }, // CÓDIGO SCI (primeira coluna, centralizado)
        { width: 18 }, // CNPJ
        { width: 40 }, // RAZÃO SOCIAL
        { width: 30 }, // NOME FANTASIA
        { width: 30 }, // E-MAIL
        { width: 18 }, // TELEFONE
        { width: 50 }, // ENDEREÇO
        { width: 20 }, // REGIME TRIBUTÁRIO (centralizado)
        { width: 15 }, // CNAE PRINCIPAL
        { width: 50 }, // DESCRIÇÃO CNAE PRINCIPAL
        { width: 20 }, // QUANTIDADE ATIVIDADES SECUNDÁRIAS (centralizado)
      ];

      // Adicionar largura para cada coluna de atividade secundária
      for (let i = 0; i < maxAtividadesSecundarias; i++) {
        columnWidths.push({ width: 50 }); // ATIVIDADE SECUNDÁRIA N
      }

      sheet.columns = columnWidths;

      // Gerar arquivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dataExportacao = new Date().toISOString().split('T')[0];
      const nomeArquivo = grupoSelecionado
        ? `cnae_${grupoSelecionado.replace(/\s+/g, '_').toLowerCase()}_${dataExportacao}.xlsx`
        : cnae
          ? `cnae_${cnae.replace(/\D/g, '')}_${dataExportacao}.xlsx`
          : `cnae_busca_${dataExportacao}.xlsx`;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      // Aguardar um pouco antes de remover para garantir que o download iniciou
      setTimeout(() => {
        if (link && link.parentNode) {
          link.parentNode.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
      }, 100);
      
      toast.success(`Planilha exportada com sucesso! ${clientesCNAE.length} cliente(s) exportado(s).`);
    } catch (error: any) {
      console.error('Erro ao exportar CNAE:', error);
      toast.error('Erro ao exportar dados: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setExportandoCNAE(false);
    }
  };

  // Função para mudar de aba e atualizar URL
  const handleTabChange = (tab: 'clientes' | 'participacao' | 'faturamento-sci' | 'lancamentos' | 'pagamentos' | 'e-processos' | 'cnae') => {
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
      | 'faturamento-sci'
      | 'lancamentos'
      | 'pagamentos'
      | 'e-processos'
      | 'cnae'
      | null;

    const tab = (tabFromQuery as any) || tabFromStorage || 'clientes';
    if (tab === 'pagamentos') setActiveTab('pagamentos');
    else if (tab === 'lancamentos') setActiveTab('lancamentos');
    else if (tab === 'e-processos') setActiveTab('e-processos');
    else if (tab === 'participacao') setActiveTab('participacao');
    else if (tab === 'faturamento-sci') setActiveTab('faturamento-sci');
    else if (tab === 'cnae') setActiveTab('cnae');
    else setActiveTab('clientes');
    
    // Detectar CNPJ na query string para pagamentos, e-processos, lançamentos, clientes e faturamento-sci
    const cnpjFromQuery = params.get('cnpj');
    if (cnpjFromQuery) {
      const cnpjLimpo = cnpjFromQuery.replace(/\D/g, '');
      if (cnpjLimpo.length === 14) {
        if (tab === 'pagamentos' || tab === 'e-processos') {
          setCnpjParaPagamentos(cnpjLimpo);
        } else if (tab === 'lancamentos' || tab === 'clientes' || tab === 'faturamento-sci') {
          // Preencher o campo de busca com o CNPJ formatado
          const cnpjFormatado = cnpjLimpo
            .replace(/(\d{2})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
          setSearch(cnpjFormatado);
          // Se for faturamento-sci, também preencher o campo de busca específico
          if (tab === 'faturamento-sci') {
            setSearchFaturamento(cnpjFormatado);
          }
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
        // Verificar se o elemento ainda existe antes de remover
        if (textArea && textArea.parentNode) {
          textArea.parentNode.removeChild(textArea);
        }
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
          // Exceção: CONSORCIO CONSERVA-VITORIA (CNPJ: 48.401.933/0001-17) - é esperado que seja zerado
          const cnpjLimpo = c.cnpj_limpo || (c.cnpj ? c.cnpj.replace(/\D/g, '') : '');
          if (cnpjLimpo === '48401933000117') {
            return false; // Não é divergente, é esperado que seja zerado
          }
          
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
          // Tolerância de R$ 0.10 para arredondamentos em múltiplos cálculos
          const valoresOk = capitalSocialNum > 0 && Math.abs(somaValores - capitalSocialNum) < 0.10;
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
    
    // Não aplicar filtro de sócio fora da aba participação
    loadClientes({ page, limit, search: debouncedSearch, socio: undefined }).then(({ pagination }) => {
      setTotal(pagination?.total ?? null);
      setTotalPages(pagination?.totalPages ?? null);
    }).catch(() => {});
  }, [page, limit, debouncedSearch, activeTab]);

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

  // Carregar todos os clientes para a aba Faturamento SCI
  useEffect(() => {
    const abaMudouParaFaturamento = activeTab === 'faturamento-sci' && activeTabFaturamentoAnteriorRef.current !== 'faturamento-sci';
    
    if (activeTab === 'faturamento-sci') {
      activeTabFaturamentoAnteriorRef.current = activeTab;
      
      if (!abaMudouParaFaturamento) {
        if (carregandoFaturamentoRef.current) {
          return;
        }
        if (clientesFaturamento.length > 0) {
          return;
        }
      }
      
      if (carregandoFaturamentoRef.current) {
        return;
      }
      
      carregandoFaturamentoRef.current = true;
      setLoadingFaturamento(true);
      
      const carregarTodosClientes = async () => {
        try {
          toast.info('Carregando empresas para Faturamento SCI...', 3000);
          const todosClientes: Cliente[] = [];
          let pagina = 1;
          let temMais = true;
          
          while (temMais) {
            const resultado = await loadClientes({ 
              page: pagina, 
              limit: 100,
              search: '', 
              socio: undefined 
            });
            
            todosClientes.push(...resultado.items);
            
            if (resultado.pagination) {
              temMais = pagina < resultado.pagination.totalPages;
              pagina++;
            } else {
              temMais = resultado.items.length === 100;
              pagina++;
            }
            
            if (temMais) {
              await new Promise((resolve) => setTimeout(resolve, 30));
            }
          }
          
          // Filtrar apenas matrizes com código SCI
          const apenasMatrizesComSCI = todosClientes.filter(cliente => {
            return cliente.tipo_empresa === 'Matriz' && 
                   cliente.codigo_sci && 
                   !isNaN(Number(cliente.codigo_sci));
          });
          
          setClientesFaturamento(apenasMatrizesComSCI);
          
          // Carregar dados do cache automaticamente para todos os clientes
          try {
            const promises = apenasMatrizesComSCI.map(async (cliente) => {
              try {
                const resultado = await irpfService.buscarApenasCache(cliente.id, anosParaBuscarFaturamento);
                const faturamento = resultado.data;
                
                // Garantir que sempre temos os 2 anos, preenchendo com zeros se necessário
                const faturamentoCompleto = anosParaBuscarFaturamento.map((ano) => {
                  const encontrado = faturamento.find((f) => f.ano === ano);
                  return encontrado || {
                    ano,
                    valorTotal: 0,
                    mediaMensal: 0,
                    meses: [],
                  };
                });
                
                setFaturamentoData((prev) => {
                  const novo = new Map(prev);
                  novo.set(cliente.id, {
                    faturamento: faturamentoCompleto,
                    loading: false,
                    carregado: true,
                    ultimaAtualizacao: resultado.ultimaAtualizacao || null,
                  });
                  return novo;
                });
              } catch (error: any) {
                // Se não encontrar no cache, não é erro - apenas não marca como carregado
                console.log(`[Faturamento SCI] Cache não encontrado para cliente ${cliente.id}:`, error.message);
                // Deixar como não carregado para o usuário poder atualizar manualmente
              }
            });
            
            // Aguardar todas as requisições, mas não bloquear se algumas falharem
            await Promise.allSettled(promises);
          } catch (error: any) {
            console.error('[Faturamento SCI] Erro ao carregar cache inicial:', error);
          }
          
          setLoadingFaturamento(false);
          carregandoFaturamentoRef.current = false;
        } catch (error: any) {
          console.error('[Clientes] Erro ao carregar clientes para Faturamento SCI:', error);
          toast.error(`Erro ao carregar clientes: ${error?.message || 'Erro desconhecido'}`);
          setLoadingFaturamento(false);
          carregandoFaturamentoRef.current = false;
        }
      };
      
      void carregarTodosClientes();
    } else {
      activeTabFaturamentoAnteriorRef.current = activeTab;
      if (activeTabFaturamentoAnteriorRef.current === 'faturamento-sci') {
        setClientesFaturamento([]);
        setSearchFaturamento('');
        setFaturamentoData(new Map());
        carregandoFaturamentoRef.current = false;
      }
    }
  }, [activeTab]);

  // Função para atualizar faturamento de um cliente
  const atualizarFaturamentoCliente = async (clienteId: string) => {
    const cliente = clientesFaturamento.find(c => c.id === clienteId);
    if (!cliente) return;
    
    setFaturamentoData((prev) => {
      const novo = new Map(prev);
      const atual = novo.get(clienteId) || { faturamento: [], loading: false, carregado: false };
      // Manter os dados antigos durante o loading para não zerar os campos
      novo.set(clienteId, { 
        faturamento: atual.faturamento || [], // Manter dados antigos
        loading: true,
        carregado: atual.carregado // Manter estado de carregado
      });
      return novo;
    });
    
    try {
      const faturamento = await irpfService.atualizarCache(clienteId, anosParaBuscarFaturamento);
      const faturamentoCompleto = anosParaBuscarFaturamento.map((ano) => {
        const encontrado = faturamento.find((f) => f.ano === ano);
        return encontrado || { ano, valorTotal: 0, mediaMensal: 0, meses: [] };
      });
      
      // Buscar a última atualização após atualizar
      try {
        const resultadoCache = await irpfService.buscarApenasCache(clienteId, anosParaBuscarFaturamento);
        setFaturamentoData((prev) => {
          const novo = new Map(prev);
          novo.set(clienteId, { 
            faturamento: faturamentoCompleto, 
            loading: false, 
            carregado: true,
            ultimaAtualizacao: resultadoCache.ultimaAtualizacao || new Date().toISOString(),
          });
          return novo;
        });
      } catch {
        // Se falhar ao buscar última atualização, usar data atual
        setFaturamentoData((prev) => {
          const novo = new Map(prev);
          novo.set(clienteId, { 
            faturamento: faturamentoCompleto, 
            loading: false, 
            carregado: true,
            ultimaAtualizacao: new Date().toISOString(),
          });
          return novo;
        });
      }
      
      toast.success(`Faturamento atualizado para ${cliente.razao_social || cliente.nome}`, 3000);
    } catch (error: any) {
      console.error(`Erro ao atualizar faturamento para ${clienteId}:`, error);
      setFaturamentoData((prev) => {
        const novo = new Map(prev);
        const atual = novo.get(clienteId) || { faturamento: [], loading: false, carregado: false };
        // Manter os dados antigos mesmo em caso de erro para não zerar os campos
        novo.set(clienteId, { 
          faturamento: atual.faturamento || [], // Manter dados antigos
          loading: false, 
          carregado: atual.carregado, // Manter estado anterior
          error: error.message || 'Erro ao atualizar faturamento'
        });
        return novo;
      });
      toast.error(`Erro ao atualizar faturamento: ${error?.message || 'Erro desconhecido'}`);
    }
  };

  // Função para exibir detalhes do faturamento
  const exibirDetalhesFaturamento = async (clienteId: string, ano: number) => {
    console.log(`[Faturamento] === INÍCIO exibirDetalhesFaturamento ===`);
    console.log(`[Faturamento] clienteId: ${clienteId}, ano: ${ano}`);
    console.log(`[Faturamento] clientesFaturamento.length: ${clientesFaturamento.length}`);
    
    const cliente = clientesFaturamento.find(c => c.id === clienteId);
    if (!cliente) {
      console.error(`[Faturamento] Cliente não encontrado: ${clienteId}`);
      toast.error('Cliente não encontrado');
      return;
    }

    console.log(`[Faturamento] Cliente encontrado: ${cliente.razao_social || cliente.nome}`);
    console.log(`[Faturamento] Abrindo modal...`);
    
    // Abrir modal imediatamente
    setShowModalDetalhesFaturamento(true);
    setDetalhesFaturamento({
      cliente,
      ano,
      dados: [],
      loading: true,
    });

    try {
      console.log(`[Faturamento] Buscando dados detalhados do cache...`);
      const dados = await irpfService.buscarFaturamentoPorTipo(clienteId, 'detalhado', [ano]);
      console.log(`[Faturamento] Dados recebidos do serviço:`, dados);
      console.log(`[Faturamento] Tipo dos dados:`, typeof dados, Array.isArray(dados));
      
      let dadosAno = null;
      if (Array.isArray(dados)) {
        dadosAno = dados.find((d: any) => d.ano === ano);
        console.log(`[Faturamento] Dados do ano ${ano}:`, dadosAno);
      } else if (dados && typeof dados === 'object') {
        // Se não for array, pode ser um objeto direto
        dadosAno = dados;
        console.log(`[Faturamento] Dados recebidos como objeto:`, dadosAno);
      }
      
      if (dadosAno && dadosAno.meses && Array.isArray(dadosAno.meses) && dadosAno.meses.length > 0) {
        console.log(`[Faturamento] ✅ Encontrados ${dadosAno.meses.length} meses de dados`);
        console.log(`[Faturamento] Primeiro mês:`, dadosAno.meses[0]);
        setDetalhesFaturamento({
          cliente,
          ano,
          dados: dadosAno.meses,
          loading: false,
        });
      } else {
        console.warn(`[Faturamento] ⚠️ Nenhum dado encontrado para o ano ${ano}`);
        console.warn(`[Faturamento] dadosAno:`, dadosAno);
        setDetalhesFaturamento({
          cliente,
          ano,
          dados: [],
          loading: false,
        });
        toast.warning('Nenhum dado detalhado encontrado para este período. Os dados podem ainda não ter sido atualizados pelo scheduler. Tente clicar em "Atualizar" primeiro.', 5000);
      }
    } catch (error: any) {
      console.error(`[Faturamento] ❌ Erro ao buscar detalhes:`, error);
      console.error(`[Faturamento] Stack:`, error.stack);
      setDetalhesFaturamento({
        cliente,
        ano,
        dados: [],
        loading: false,
      });
      toast.error(`Erro ao buscar detalhes: ${error?.message || 'Erro desconhecido'}`);
    }
    
    console.log(`[Faturamento] === FIM exibirDetalhesFaturamento ===`);
  };

  // Função para atualizar todos os faturamentos
  const atualizarTodosFaturamentos = async () => {
    const clientesParaAtualizar = clientesFaturamento.filter(c => {
      const data = faturamentoData.get(c.id);
      return !data?.loading;
    });
    
    if (clientesParaAtualizar.length === 0) return;
    
    setLoadingFaturamento(true);
    toast.info(`Atualizando faturamento de ${clientesParaAtualizar.length} clientes...`, 5000);
    
    const batchSize = 3;
    for (let i = 0; i < clientesParaAtualizar.length; i += batchSize) {
      const batch = clientesParaAtualizar.slice(i, i + batchSize);
      await Promise.all(batch.map(c => atualizarFaturamentoCliente(c.id)));
      if (i + batchSize < clientesParaAtualizar.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    
    setLoadingFaturamento(false);
    toast.success('Atualização concluída!', 3000);
  };

  // Função para formatar moeda
  const formatarMoedaFaturamento = (valor: number | string | null | undefined) => {
    if (valor === null || valor === undefined || valor === '') return 'R$ 0,00';
    const num = typeof valor === 'string' ? parseFloat(valor.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) : valor;
    if (isNaN(num) || num === 0) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Função para gerar PDF do faturamento
  const gerarPDFFaturamento = () => {
    if (!detalhesFaturamento.cliente || detalhesFaturamento.dados.length === 0) {
      toast.error('Não há dados para gerar o PDF');
      return;
    }

    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      let yPos = margin;

      // Paleta de cores moderna e harmoniosa
      const corPrimaria: [number, number, number] = [139, 92, 246]; // Roxo moderno
      const corSecundaria: [number, number, number] = [59, 130, 246]; // Azul moderno
      const corFundoClaro: [number, number, number] = [249, 250, 251]; // Cinza muito claro
      const corFundoCard: [number, number, number] = [255, 255, 255]; // Branco
      const corTextoEscuro: [number, number, number] = [17, 24, 39]; // Cinza escuro
      const corTextoMedio: [number, number, number] = [107, 114, 128]; // Cinza médio
      const corBorda: [number, number, number] = [229, 231, 235]; // Cinza claro para bordas

      // Header sem gradiente
      doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.rect(0, 0, pageWidth, 32, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Faturamento Detalhado', margin, 18);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Ano ${detalhesFaturamento.ano}`, pageWidth - margin, 18, { align: 'right' });
      
      // Linha decorativa abaixo do header
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(margin, 24, pageWidth - margin, 24);

      yPos = 42;

      // Card de Informações do Cliente com background suave
      const cardInfoY = yPos;
      doc.setFillColor(corFundoCard[0], corFundoCard[1], corFundoCard[2]);
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.rect(margin, cardInfoY - 2, pageWidth - (margin * 2), 30, 'FD');
      
      // Título do card
      doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Informações do Cliente', margin + 3, cardInfoY + 4);
      
      // Linha separadora abaixo do título
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.2);
      doc.line(margin + 3, cardInfoY + 6.5, pageWidth - margin - 3, cardInfoY + 6.5);
      
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);
      
      const cliente = detalhesFaturamento.cliente;
      const infoYStart = cardInfoY + 11;
      let infoY = infoYStart;
      
      // Razão Social - linha completa
      doc.text(`Razão Social:`, margin + 3, infoY);
      doc.setFont('helvetica', 'bold');
      const razaoSocial = cliente.razao_social || cliente.nome || '-';
      doc.text(razaoSocial, margin + 30, infoY, { maxWidth: pageWidth - margin - 33 });
      doc.setFont('helvetica', 'normal');
      infoY += 7;
      
      // CNPJ e Código SCI - mesma linha
      doc.text(`CNPJ:`, margin + 3, infoY);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCNPJ(cliente.cnpj_limpo || cliente.cnpj || ''), margin + 20, infoY);
      doc.setFont('helvetica', 'normal');
      
      doc.text(`Código SCI:`, pageWidth / 2 + 5, infoY);
      doc.setFont('helvetica', 'bold');
      doc.text(String(cliente.codigo_sci || '-'), pageWidth / 2 + 30, infoY);
      doc.setFont('helvetica', 'normal');
      infoY += 7;
      
      // Período - linha completa
      doc.text(`Período:`, margin + 3, infoY);
      doc.setFont('helvetica', 'bold');
      doc.text(`01/01/${detalhesFaturamento.ano} a 31/12/${detalhesFaturamento.ano}`, margin + 22, infoY);
      doc.setFont('helvetica', 'normal');

      yPos = cardInfoY + 30 + 6;

      // Card de Total do Período com destaque
      const totalPeriodo = detalhesFaturamento.dados.reduce((sum, d) => sum + (Number(d.faturamento_total) || 0), 0);
      const totalCardY = yPos;
      
      // Background sólido sem gradiente - aumentado para 22mm de altura
      doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.rect(margin, totalCardY, pageWidth - (margin * 2), 22, 'FD');
      
      // Label "Total do Período" - alinhado à esquerda com mais espaço
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Total do Período', margin + 4, totalCardY + 7);
      
      // Valor do total - alinhado à esquerda, abaixo do label com mais espaço
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(formatarMoedaFaturamento(totalPeriodo), margin + 4, totalCardY + 16.5);
      
      yPos = totalCardY + 25;

      // Tabela com design moderno
      const tableY = yPos + 2;
      
      // Cabeçalho da tabela com estilo moderno
      doc.setFillColor(corFundoClaro[0], corFundoClaro[1], corFundoClaro[2]);
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.rect(margin, tableY - 5, pageWidth - (margin * 2), 9, 'FD');
      
      doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      
      const colWidths = [28, 24, 24, 24, 24, 24, 24, 32];
      const headers = ['Período', 'Vendas Brutas', 'Devoluções', 'Vendas Liquidadas', 'Serviços', 'Outras Receitas', 'Oper. Imob.', 'Faturamento Total'];
      let xPos = margin + 2;
      
      headers.forEach((header, index) => {
        // Usar maxWidth para permitir quebra de linha automática nos cabeçalhos
        doc.text(header, xPos, tableY + 1, { maxWidth: colWidths[index] - 2 });
        xPos += colWidths[index];
      });

      yPos = tableY + 9;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);

      // Linha separadora
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.2);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 4;

      // Dados da tabela com linhas alternadas
      let rowIndex = 0;
      detalhesFaturamento.dados.forEach((mes: any) => {
        if (yPos > pageHeight - 25) {
          doc.addPage();
          yPos = margin + 10;
          rowIndex = 0;
        }

        // Background alternado para linhas
        if (rowIndex % 2 === 0) {
          doc.setFillColor(corFundoCard[0], corFundoCard[1], corFundoCard[2]);
        } else {
          doc.setFillColor(corFundoClaro[0], corFundoClaro[1], corFundoClaro[2]);
        }
        doc.rect(margin, yPos - 3.5, pageWidth - (margin * 2), 5.5, 'F');

        xPos = margin + 2;
        const rowData = [
          mes.mes_ano || `${mes.mes}/${detalhesFaturamento.ano}`,
          formatarMoedaFaturamento(Number(mes.vendas_brutas) || 0),
          formatarMoedaFaturamento(Number(mes.devolucoes_deducoes) || 0),
          formatarMoedaFaturamento(Number(mes.vendas_liquidadas) || 0),
          formatarMoedaFaturamento(Number(mes.servicos) || 0),
          formatarMoedaFaturamento(Number(mes.outras_receitas) || 0),
          formatarMoedaFaturamento(Number(mes.operacoes_imobiliarias) || 0),
          formatarMoedaFaturamento(Number(mes.faturamento_total) || 0),
        ];

        rowData.forEach((data, index) => {
          if (index === 0) {
            // Primeira coluna (Período) em negrito
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);
          } else if (index === rowData.length - 1) {
            // Última coluna (Faturamento Total) em negrito e cor destacada
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(corTextoMedio[0], corTextoMedio[1], corTextoMedio[2]);
          }
          
          doc.text(data, xPos, yPos, { maxWidth: colWidths[index] - 2 });
          xPos += colWidths[index];
        });

        // Linha separadora entre linhas
        doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
        doc.setLineWidth(0.1);
        doc.line(margin, yPos + 1.5, pageWidth - margin, yPos + 1.5);

        yPos += 6;
        rowIndex++;
      });

      // Rodapé elegante
      const footerY = pageHeight - 8;
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(corTextoMedio[0], corTextoMedio[1], corTextoMedio[2]);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, footerY);
      
      doc.setFont('helvetica', 'bold');
      doc.text(`Página 1`, pageWidth - margin, footerY, { align: 'right' });

      // Nome do arquivo
      const nomeArquivo = `Faturamento_${cliente.razao_social?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cliente'}_${detalhesFaturamento.ano}.pdf`;
      doc.save(nomeArquivo);
      
      toast.success('PDF gerado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao gerar PDF:', error);
      toast.error(`Erro ao gerar PDF: ${error?.message || 'Erro desconhecido'}`);
    }
  };

  // Função para gerar PDF da consulta personalizada
  const gerarPDFConsultaPersonalizada = () => {
    if (!resultadoConsultaPersonalizada || !resultadoConsultaPersonalizada.cliente || resultadoConsultaPersonalizada.detalhes.length === 0) {
      toast.error('Não há dados para gerar o PDF');
      return;
    }

    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      let yPos = margin;

      // Paleta de cores moderna e harmoniosa
      const corPrimaria: [number, number, number] = [139, 92, 246]; // Roxo moderno
      const corSecundaria: [number, number, number] = [59, 130, 246]; // Azul moderno
      const corFundoClaro: [number, number, number] = [249, 250, 251]; // Cinza muito claro
      const corFundoCard: [number, number, number] = [255, 255, 255]; // Branco
      const corTextoEscuro: [number, number, number] = [17, 24, 39]; // Cinza escuro
      const corTextoMedio: [number, number, number] = [107, 114, 128]; // Cinza médio
      const corBorda: [number, number, number] = [229, 231, 235]; // Cinza claro para bordas

      // Header sem gradiente
      doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.rect(0, 0, pageWidth, 32, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Faturamento Detalhado', margin, 18);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const tipoTexto = resultadoConsultaPersonalizada.tipoFaturamento === 'detalhado' ? 'Detalhado' : 'Consolidado';
      doc.text(`Tipo: ${tipoTexto}`, pageWidth - margin, 18, { align: 'right' });
      
      // Linha decorativa abaixo do header
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(margin, 24, pageWidth - margin, 24);

      yPos = 42;

      // Card de Informações do Cliente com background suave
      const cardInfoY = yPos;
      doc.setFillColor(corFundoCard[0], corFundoCard[1], corFundoCard[2]);
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.rect(margin, cardInfoY - 2, pageWidth - (margin * 2), 30, 'FD');
      
      // Título do card
      doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Informações do Cliente', margin + 3, cardInfoY + 4);
      
      // Linha separadora abaixo do título
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.2);
      doc.line(margin + 3, cardInfoY + 6.5, pageWidth - margin - 3, cardInfoY + 6.5);
      
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);
      
      const cliente = resultadoConsultaPersonalizada.cliente;
      const infoYStart = cardInfoY + 11;
      let infoY = infoYStart;
      
      // Razão Social - linha completa
      doc.text(`Razão Social:`, margin + 3, infoY);
      doc.setFont('helvetica', 'bold');
      const razaoSocial = cliente.razao_social || cliente.nome || '-';
      doc.text(razaoSocial, margin + 30, infoY, { maxWidth: pageWidth - margin - 33 });
      doc.setFont('helvetica', 'normal');
      infoY += 7;
      
      // CNPJ e Código SCI - mesma linha
      doc.text(`CNPJ:`, margin + 3, infoY);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCNPJ(cliente.cnpj_limpo || cliente.cnpj || ''), margin + 20, infoY);
      doc.setFont('helvetica', 'normal');
      
      doc.text(`Código SCI:`, pageWidth / 2 + 5, infoY);
      doc.setFont('helvetica', 'bold');
      doc.text(String(cliente.codigo_sci || '-'), pageWidth / 2 + 30, infoY);
      doc.setFont('helvetica', 'normal');
      infoY += 7;
      
      // Período - linha completa
      doc.text(`Período:`, margin + 3, infoY);
      doc.setFont('helvetica', 'bold');
      doc.text(
        formatPeriodoComOffset(
          resultadoConsultaPersonalizada.periodo.dataInicial,
          resultadoConsultaPersonalizada.periodo.dataFinal
        ),
        margin + 22,
        infoY
      );
      doc.setFont('helvetica', 'normal');

      yPos = cardInfoY + 30 + 6;

      // Card de Total do Período com destaque
      const totalPeriodo = resultadoConsultaPersonalizada.total;
      const totalCardY = yPos;
      
      // Background sólido sem gradiente - aumentado para 22mm de altura
      doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.rect(margin, totalCardY, pageWidth - (margin * 2), 22, 'FD');
      
      // Label "Total do Período" - alinhado à esquerda com mais espaço
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Total do Período', margin + 4, totalCardY + 7);
      
      // Valor do total - alinhado à esquerda, abaixo do label com mais espaço
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(formatarMoedaFaturamento(totalPeriodo), margin + 4, totalCardY + 16.5);
      
      yPos = totalCardY + 25;

      // Tabela com design moderno
      const tableY = yPos + 2;
      
      // Cabeçalho da tabela com estilo moderno
      doc.setFillColor(corFundoClaro[0], corFundoClaro[1], corFundoClaro[2]);
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.rect(margin, tableY - 5, pageWidth - (margin * 2), 9, 'FD');
      
      doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      
      const isDetalhado = resultadoConsultaPersonalizada.tipoFaturamento === 'detalhado';
      const colWidths = isDetalhado 
        ? [28, 24, 24, 24, 24, 24, 24, 32]
        : [120, 153]; // Para modo consolidado, usar melhor o espaço disponível
      const headers = isDetalhado
        ? ['Período', 'Vendas Brutas', 'Devoluções', 'Vendas Liquidadas', 'Serviços', 'Outras Receitas', 'Oper. Imob.', 'Faturamento Total']
        : ['Período', 'Faturamento Total'];
      let xPos = margin + 2;
      
      headers.forEach((header, index) => {
        doc.text(header, xPos, tableY + 1, { maxWidth: colWidths[index] - 2 });
        xPos += colWidths[index];
      });

      yPos = tableY + 9;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);

      // Linha separadora
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.2);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 4;

      // Dados da tabela com linhas alternadas
      let rowIndex = 0;
      resultadoConsultaPersonalizada.detalhes.forEach((detalhe: any) => {
        if (yPos > pageHeight - 25) {
          doc.addPage();
          yPos = margin + 10;
          rowIndex = 0;
        }

        // Background alternado para linhas
        if (rowIndex % 2 === 0) {
          doc.setFillColor(corFundoCard[0], corFundoCard[1], corFundoCard[2]);
        } else {
          doc.setFillColor(corFundoClaro[0], corFundoClaro[1], corFundoClaro[2]);
        }
        doc.rect(margin, yPos - 3.5, pageWidth - (margin * 2), 5.5, 'F');

        xPos = margin + 2;
        const rowData = isDetalhado
          ? [
              detalhe.descricao || '-',
              formatarMoedaFaturamento(Number(detalhe.vendasBrutas) || 0),
              formatarMoedaFaturamento(Number(detalhe.devolucoesDeducoes) || 0),
              formatarMoedaFaturamento(Number(detalhe.vendasLiquidadas) || 0),
              formatarMoedaFaturamento(Number(detalhe.servicos) || 0),
              formatarMoedaFaturamento(Number(detalhe.outrasReceitas) || 0),
              formatarMoedaFaturamento(Number(detalhe.operacoesImobiliarias) || 0),
              formatarMoedaFaturamento(Number(detalhe.faturamentoTotal) || 0),
            ]
          : [
              detalhe.descricao || '-',
              formatarMoedaFaturamento(Number(detalhe.faturamentoTotal) || 0),
            ];

        rowData.forEach((data, index) => {
          if (index === 0) {
            // Primeira coluna (Período) em negrito
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(corTextoEscuro[0], corTextoEscuro[1], corTextoEscuro[2]);
          } else if (index === rowData.length - 1) {
            // Última coluna (Faturamento Total) em negrito e cor destacada
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(corTextoMedio[0], corTextoMedio[1], corTextoMedio[2]);
          }
          
          doc.text(data, xPos, yPos, { maxWidth: colWidths[index] - 2 });
          xPos += colWidths[index];
        });

        // Linha separadora entre linhas
        doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
        doc.setLineWidth(0.1);
        doc.line(margin, yPos + 1.5, pageWidth - margin, yPos + 1.5);

        yPos += 6;
        rowIndex++;
      });

      // Rodapé elegante
      const footerY = pageHeight - 8;
      doc.setDrawColor(corBorda[0], corBorda[1], corBorda[2]);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(corTextoMedio[0], corTextoMedio[1], corTextoMedio[2]);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, footerY);
      
      doc.setFont('helvetica', 'bold');
      doc.text(`Página 1`, pageWidth - margin, footerY, { align: 'right' });

      // Nome do arquivo
      const nomeArquivo = `Faturamento_${cliente.razao_social?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cliente'}_${resultadoConsultaPersonalizada.periodo.dataInicial}_${resultadoConsultaPersonalizada.periodo.dataFinal}.pdf`;
      doc.save(nomeArquivo);
      
      toast.success('PDF gerado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao gerar PDF:', error);
      toast.error(`Erro ao gerar PDF: ${error?.message || 'Erro desconhecido'}`);
    }
  };

  // Função para executar consulta personalizada
  const handleConsultarPersonalizada = async () => {
    // Validações
    if (!consultaPersonalizada.busca.trim()) {
      toast.error('Por favor, preencha o campo de busca (CNPJ ou Razão Social)');
      return;
    }

    if (!consultaPersonalizada.dataInicial || !consultaPersonalizada.dataFinal) {
      toast.error('Por favor, preencha as datas inicial e final');
      return;
    }

    const dataIni = new Date(consultaPersonalizada.dataInicial);
    const dataFim = new Date(consultaPersonalizada.dataFinal);

    if (dataFim < dataIni) {
      toast.error('A data final deve ser maior ou igual à data inicial');
      return;
    }

    setLoadingConsultaPersonalizada(true);

    try {
      console.log('[Frontend] Enviando consulta personalizada:', {
        busca: consultaPersonalizada.busca,
        dataInicial: consultaPersonalizada.dataInicial,
        dataFinal: consultaPersonalizada.dataFinal,
        tipoFaturamento: consultaPersonalizada.tipoFaturamento,
        somarMatrizFilial: consultaPersonalizada.somarMatrizFilial,
      });

      const resultado = await irpfService.consultaPersonalizada({
        busca: consultaPersonalizada.busca,
        dataInicial: consultaPersonalizada.dataInicial,
        dataFinal: consultaPersonalizada.dataFinal,
        tipoFaturamento: consultaPersonalizada.tipoFaturamento,
        somarMatrizFilial: consultaPersonalizada.somarMatrizFilial,
      });

      console.log('[Frontend] Resultado recebido:', resultado);
      console.log('[Frontend] Total:', resultado?.total);
      console.log('[Frontend] Detalhes:', resultado?.detalhes?.length || 0);

      if (!resultado) {
        throw new Error('Nenhum resultado retornado');
      }

      // O resultado já vem no formato correto do serviço
      setResultadoConsultaPersonalizada(resultado);

      setShowModalConsultaPersonalizada(false);
      // Não usar modal, exibir diretamente na página
      toast.success('Consulta realizada com sucesso!', 3000);
    } catch (error: any) {
      console.error('[Frontend] Erro na consulta personalizada:', error);
      console.error('[Frontend] Erro completo:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      });
      toast.error(error?.response?.data?.error || error?.message || 'Erro ao executar consulta personalizada');
    } finally {
      setLoadingConsultaPersonalizada(false);
    }
  };

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

  const handleViewCliente = async (cliente: Cliente, termoBusca?: string) => {
    try {
      console.log('[Clientes] handleViewCliente chamado para:', cliente.id, cliente.razao_social || cliente.nome);
      
      // Buscar dados completos do cliente com sócios
      const resp = await clientesService.obterCliente(cliente.id!);
      let clienteCompleto: Cliente;
      
      // O backend retorna { success, data: Cliente } ou diretamente Cliente
      if (resp && typeof resp === 'object') {
        if ((resp as any).success && (resp as any).data) {
          clienteCompleto = (resp as any).data;
        } else if ((resp as any).id) {
          // Se retornar diretamente o Cliente (sem wrapper)
          clienteCompleto = resp as Cliente;
        } else {
          // Fallback: usar os dados já carregados
          clienteCompleto = cliente;
        }
      } else {
        // Fallback: usar os dados já carregados
        clienteCompleto = cliente;
      }
      
      console.log('[Clientes] Cliente completo obtido:', clienteCompleto);
      console.log('[Clientes] Abrindo modal de CNAEs e Atividades');
      
      // Abrir modal de CNAEs e Atividades primeiro
      // Atualizar ambos os estados juntos
      setClienteModalCNAEAtividades(clienteCompleto);
      setShowModalCNAEAtividades(true);
      
      // Sempre deixar o campo de filtro vazio ao abrir o modal
      setFiltroCNAEModal('');
      
      console.log('[Clientes] Estados atualizados:', {
        showModalCNAEAtividades: true,
        clienteModalCNAEAtividades: clienteCompleto
      });
    } catch (error) {
      console.error('[Clientes] Erro ao buscar cliente completo:', error);
      // Fallback: usar os dados já carregados
      setClienteModalCNAEAtividades(cliente);
      setShowModalCNAEAtividades(true);
    }
  };

  const handleVerMaisCliente = async () => {
    if (!clienteModalCNAEAtividades?.id) return;
    
    try {
      // Salvar referência do cliente antes de limpar estados
      const clienteParaEditar = clienteModalCNAEAtividades;
      
      // Fechar modal de CNAEs primeiro
      setShowModalCNAEAtividades(false);
      setClienteModalCNAEAtividades(null);
      setFiltroCNAEModal('');
      
      // Mudar para a aba Cadastro se não estiver nela
      if (activeTab !== 'clientes') {
        setActiveTab('clientes');
        // Atualizar URL sem recarregar
        const params = new URLSearchParams(location.search);
        params.delete('tab');
        navigate({ search: params.toString() }, { replace: true });
        localStorage.setItem('clientes_active_tab', 'clientes');
        // Aguardar a mudança de aba antes de abrir o formulário
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Buscar cliente completo do banco
      const clienteCompleto = await clientesService.getById(clienteParaEditar.id);
      
      // Abrir o formulário de edição do cliente
      setEditingCliente(clienteCompleto);
      const cnpjLimpo = clienteCompleto.cnpj_limpo || (clienteCompleto.cnpj ? clienteCompleto.cnpj.replace(/\D/g, '') : '');
      setFormData({
        ...clienteCompleto,
        razao_social: clienteCompleto.razao_social || clienteCompleto.nome,
        cnpj_limpo: cnpjLimpo,
        cnpj: formatCNPJ(cnpjLimpo),
      });
      
      // Exibir dados cadastrais automaticamente se o cliente tiver dados da ReceitaWS
      const hasReceitaWSData = !!(clienteCompleto as any).fantasia || !!(clienteCompleto as any).situacao_cadastral || !!(clienteCompleto as any).receita_ws_status;
      setMostrarCadastroCompleto(hasReceitaWSData);
      setShowForm(true);
      
      // Scroll suave para o topo do formulário
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('[Clientes] Erro ao abrir cadastro do cliente:', error);
      toast.error('Erro ao abrir cadastro do cliente');
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
    
    // Validação de CNPJ
    if (!cnpjLimpo || cnpjLimpo.trim() === '') {
      toast.error('Por favor, informe um CNPJ válido');
      return;
    }
    
    if (cnpjLimpo.length !== 14) {
      toast.error(`CNPJ inválido. Deve conter 14 dígitos. Você digitou ${cnpjLimpo.length} dígitos.`);
      return;
    }
    
    // Validação básica de CNPJ (apenas dígitos numéricos)
    if (!/^\d{14}$/.test(cnpjLimpo)) {
      toast.error('CNPJ inválido. Deve conter apenas números.');
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

      // Verificar se regime_tributario está vazio ou nulo
      const regimeTributario = (imported as any).regime_tributario;
      if (!regimeTributario || regimeTributario.trim() === '' || regimeTributario === 'A Definir') {
        // Abrir modal para selecionar regime tributário
        setClienteParaRegime(imported);
        setRegimeSelecionado('');
        setShowRegimeModal(true);
      } else {
        setSuccessMessage(resp?.message || '✅ Import concluído.');
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 4000);
      }
    } catch (e: any) {
      console.error('[Clientes] Erro ao importar ReceitaWS:', e);
      setShowSuccess(false);
      
      // Mensagens de erro mais específicas
      let errorMessage = 'Erro ao importar dados da ReceitaWS';
      
      if (e?.message?.toLowerCase().includes('cnpj')) {
        errorMessage = 'CNPJ inválido ou não encontrado na Receita Federal';
      } else if (e?.message?.toLowerCase().includes('não encontrado')) {
        errorMessage = 'Empresa não encontrada na base da Receita Federal';
      } else if (e?.message?.toLowerCase().includes('timeout') || e?.message?.toLowerCase().includes('network')) {
        errorMessage = 'Erro de conexão com a Receita Federal. Tente novamente.';
      } else if (e?.response?.status === 400) {
        errorMessage = e?.response?.data?.error || 'CNPJ inválido ou dados incorretos';
      } else if (e?.response?.status === 404) {
        errorMessage = 'Empresa não encontrada na Receita Federal';
      } else if (e?.response?.status === 500) {
        errorMessage = 'Erro no servidor. Verifique o CNPJ e tente novamente.';
      } else if (e?.message) {
        errorMessage = e.message;
      }
      
      // Exibir apenas o alerta visual (sem toast duplicado)
      setCustomErrorMessage(errorMessage);
      setShowError(true);
      setTimeout(() => setShowError(false), 6000);
    } finally {
      setImportandoReceita(false);
    }
  };



  const handleSalvarRegimeTributario = async () => {
    if (!regimeSelecionado || !clienteParaRegime?.id) {
      toast.error('Por favor, selecione um regime tributário');
      return;
    }

    try {
      setSalvandoRegime(true);
      
      // Criar payload limpo, removendo campos undefined
      const payload: Partial<Cliente> = {
        regime_tributario: regimeSelecionado,
      };
      
      // Remover qualquer campo undefined do payload
      Object.keys(payload).forEach(key => {
        if (payload[key as keyof Cliente] === undefined) {
          delete payload[key as keyof Cliente];
        }
      });
      
      await updateClienteById(clienteParaRegime.id, payload);
      
      // Atualizar o formData se estiver editando
      if (editingCliente?.id === clienteParaRegime.id) {
        setFormData(prev => ({ ...prev, regime_tributario: regimeSelecionado } as any));
      }
      
      // Atualizar visualizandoCliente se estiver visualizando
      if (visualizandoCliente?.id === clienteParaRegime.id) {
        setVisualizandoCliente(prev => prev ? { ...prev, regime_tributario: regimeSelecionado } as Cliente : null);
      }

      // Fechar modal e mostrar sucesso
      setShowRegimeModal(false);
      setClienteParaRegime(null);
      setRegimeSelecionado('');
      
      // Mostrar alert moderno de sucesso
      toast.success('Regime tributário salvo com sucesso!', 3000);
      
      // Atualizar listagem
      await loadClientes({ page, limit, search: debouncedSearch }).catch(() => {});
    } catch (error: any) {
      console.error('[Clientes] Erro ao salvar regime tributário:', error);
      toast.error(error?.message || 'Erro ao salvar regime tributário');
    } finally {
      setSalvandoRegime(false);
    }
  };

  const handleExportarClientes = async (campos: string[]) => {
    try {
      // Só aplicar filtro de sócio se estiver na aba participação
      const socioFiltroParaExport = activeTab === 'participacao' ? (socioFiltro || undefined) : undefined;
      const response = await api.post(
        '/clientes/exportar-personalizado',
        { 
          campos,
          filtros: {
            search: debouncedSearch || undefined,
            socio: socioFiltroParaExport,
          }
        },
        { responseType: 'blob' }
      );

      // Download do arquivo
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      // Aguardar um pouco antes de remover para garantir que o download iniciou
      setTimeout(() => {
        if (link && link.parentNode) {
          link.parentNode.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
      }, 100);

      toast.success('Relatório exportado com sucesso!', 3000);
      setShowExportModal(false);
    } catch (error: any) {
      console.error('[Clientes] Erro ao exportar:', error);
      toast.error(error?.response?.data?.error || error?.message || 'Erro ao exportar relatório');
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
        // Verificar se o elemento ainda existe antes de remover
        if (textArea && textArea.parentNode) {
          textArea.parentNode.removeChild(textArea);
        }
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

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) return '—';
    try {
      let date: Date;
      const valueStr = typeof value === 'string' ? value : '';
      
      if (value instanceof Date) {
        date = value;
      } else if (typeof value === 'string') {
        // Verificar se já tem timezone
        const hasTimezone = valueStr.includes('Z') || valueStr.includes('+') || (valueStr.includes('-') && valueStr.length > 19);
        
        if (!hasTimezone) {
          // MySQL TIMESTAMP sem timezone
          // Assumir que o servidor retorna no horário local (Brasil GMT-3)
          // Formato: 'YYYY-MM-DD HH:MM:SS' ou 'YYYY-MM-DDTHH:MM:SS'
          // Não adicionar 'Z' - tratar como horário local do servidor
          const normalizedValue = valueStr.includes('T') ? valueStr : valueStr.replace(' ', 'T');
          date = new Date(normalizedValue);
        } else {
          // Já tem timezone - se for UTC (Z), precisamos converter
          date = new Date(valueStr);
        }
      } else {
        date = new Date(value);
      }
      
      if (Number.isNaN(date.getTime())) return '—';
      
      // Se a string original tinha 'Z' (UTC), converter para Brasília
      // Caso contrário, assumir que já está no horário correto e apenas formatar
      if (valueStr.includes('Z')) {
        // Converter UTC para horário de Brasília
        return date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });
      } else {
        // Já está no horário local do servidor (Brasil) - apenas formatar
        return date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch {
      return '—';
    }
  };

  // Função para adicionar +1 dia à data e formatar período
  const formatPeriodoComOffset = (dataInicial: string, dataFinal: string) => {
    if (!dataInicial || !dataFinal) return '—';
    try {
      const dataIni = new Date(dataInicial);
      const dataFim = new Date(dataFinal);
      
      // Adicionar +1 dia a cada data
      dataIni.setDate(dataIni.getDate() + 1);
      dataFim.setDate(dataFim.getDate() + 1);
      
      return `${dataIni.toLocaleDateString('pt-BR')} a ${dataFim.toLocaleDateString('pt-BR')}`;
    } catch {
      return `${dataInicial} a ${dataFinal}`;
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
              onClick={() => handleTabChange('faturamento-sci')}
              className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                activeTab === 'faturamento-sci'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-500/30 transform scale-105'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              Faturamento SCI
              {activeTab === 'faturamento-sci' && (
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
            <button
              type="button"
              onClick={() => handleTabChange('cnae')}
              className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                activeTab === 'cnae'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30 transform scale-105'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              CNAE
              {activeTab === 'cnae' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"></span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de CNAEs e Atividades - Apenas na aba CNAE */}
      {activeTab === 'cnae' && showModalCNAEAtividades && clienteModalCNAEAtividades && (
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4" 
          style={{ zIndex: 9999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowModalCNAEAtividades(false);
              setClienteModalCNAEAtividades(null);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {clienteModalCNAEAtividades.razao_social || clienteModalCNAEAtividades.nome || 'Cliente'}
                  </h2>
                  <p className="text-sm text-blue-100 mt-1">
                    CNPJ: {clienteModalCNAEAtividades.cnpj_limpo || clienteModalCNAEAtividades.cnpj || '—'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowModalCNAEAtividades(false);
                    setClienteModalCNAEAtividades(null);
                    setFiltroCNAEModal('');
                  }}
                  className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div 
              className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100" 
              style={{ 
                maxHeight: 'calc(90vh - 240px)',
                scrollbarWidth: 'thin',
                scrollbarColor: '#9CA3AF #F3F4F6'
              }}
            >
              {(() => {
                // Função para verificar se uma atividade corresponde ao filtro
                const correspondeAoFiltro = (codigo: string, descricao: string): boolean => {
                  if (!filtroCNAEModal.trim()) return true;
                  
                  let filtro = filtroCNAEModal.trim().toLowerCase();
                  
                  // Se o filtro contém espaços (nome composto), usar apenas a primeira palavra
                  if (filtro.includes(' ')) {
                    filtro = filtro.split(' ')[0];
                  }
                  
                  const codigoStr = String(codigo || '').replace(/[.\-\/]/g, '');
                  const descricaoStr = String(descricao || '').toLowerCase();
                  
                  // Verificar se o filtro corresponde aos 2 primeiros dígitos do código
                  if (filtro.length >= 2 && /^\d+$/.test(filtro)) {
                    const doisPrimeirosDigitos = codigoStr.substring(0, 2);
                    if (doisPrimeirosDigitos === filtro) {
                      return true;
                    }
                  }
                  
                  // Verificar se o filtro (primeira palavra) está na descrição
                  if (descricaoStr.includes(filtro)) {
                    return true;
                  }
                  
                  return false;
                };

                // Atividade principal sempre é exibida (não precisa de filtro)
                const atividadePrincipalFiltrada = clienteModalCNAEAtividades.atividade_principal_code;

                // Filtrar atividades secundárias
                let atividadesSecundariasFiltradas: any[] = [];
                if (clienteModalCNAEAtividades.atividades_secundarias) {
                  let atividadesSecundarias: any[] = [];
                  try {
                    const valor = clienteModalCNAEAtividades.atividades_secundarias;
                    if (typeof valor === 'string') {
                      atividadesSecundarias = JSON.parse(valor);
                    } else if (Array.isArray(valor)) {
                      atividadesSecundarias = valor;
                    }
                  } catch {
                    // Ignorar erros de parsing
                  }

                  atividadesSecundariasFiltradas = atividadesSecundarias.filter((atividade: any) => {
                    const codigo = atividade.code || atividade.codigo || '';
                    const descricao = atividade.text || atividade.descricao || atividade.texto || '';
                    return correspondeAoFiltro(codigo, descricao);
                  });
                }

                const temResultados = atividadePrincipalFiltrada || atividadesSecundariasFiltradas.length > 0;

                return (
                  <>
                    {/* Atividade Principal */}
                    {atividadePrincipalFiltrada && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BuildingOfficeIcon className="h-5 w-5 text-blue-600" />
                    Atividade Principal
                  </h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-600 text-white">
                          {clienteModalCNAEAtividades.atividade_principal_code}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">
                          {clienteModalCNAEAtividades.atividade_principal_text || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                    )}

                    {/* Atividades Secundárias */}
                    {clienteModalCNAEAtividades.atividades_secundarias && (
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <BuildingOfficeIcon className="h-5 w-5 text-purple-600" />
                            Atividades Secundárias
                            <span className="text-sm font-normal text-gray-500">
                              ({atividadesSecundariasFiltradas.length}
                              {filtroCNAEModal && clienteModalCNAEAtividades.atividades_secundarias && 
                               Array.isArray(clienteModalCNAEAtividades.atividades_secundarias) &&
                               ` de ${clienteModalCNAEAtividades.atividades_secundarias.length}`}
                              )
                            </span>
                          </h3>
                        </div>
                        
                        {/* Campo de busca dentro da seção de Atividades Secundárias */}
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white">
                            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <input
                              type="text"
                              value={filtroCNAEModal}
                              onChange={(e) => setFiltroCNAEModal(e.target.value)}
                              placeholder="Buscar por nome ou 2 primeiros dígitos (ex: 77 ou Aluguel)"
                              className="flex-1 text-sm focus:outline-none"
                            />
                            {filtroCNAEModal && (
                              <button
                                onClick={() => setFiltroCNAEModal('')}
                                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Limpar filtro"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {atividadesSecundariasFiltradas.length > 0 ? (
                          <div 
                            className="space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-purple-100" 
                            style={{ 
                              maxHeight: '400px',
                              scrollbarWidth: 'thin',
                              scrollbarColor: '#9333EA #F3F4F6'
                            }}
                          >
                            {atividadesSecundariasFiltradas.map((atividade: any, index: number) => (
                              <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0">
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-purple-600 text-white">
                                      {atividade.code || atividade.codigo || '—'}
                                    </span>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-700">
                                      {atividade.text || atividade.descricao || atividade.texto || '—'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : filtroCNAEModal ? (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                            <p className="text-sm text-gray-600">
                              Nenhuma atividade secundária encontrada com o filtro "{filtroCNAEModal}"
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Mensagem se não houver atividades */}
                    {!clienteModalCNAEAtividades.atividade_principal_code && 
                     !clienteModalCNAEAtividades.atividades_secundarias && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                        <BuildingOfficeIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">Nenhuma atividade cadastrada para este cliente</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowModalCNAEAtividades(false);
                  setClienteModalCNAEAtividades(null);
                  setFiltroCNAEModal('');
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handleVerMaisCliente}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg font-semibold"
              >
                Ver Mais
              </button>
            </div>
          </div>
        </div>
      )}

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
                    
                    // Validação detalhada de CNPJ
                    if (!cnpj || cnpj.trim() === '') {
                      toast.error('CNPJ não disponível para atualização');
                      return;
                    }
                    
                    if (cnpj.length !== 14) {
                      toast.error(`CNPJ inválido. Deve conter 14 dígitos. Encontrado: ${cnpj.length} dígitos.`);
                      return;
                    }
                    
                    if (!/^\d{14}$/.test(cnpj)) {
                      toast.error('CNPJ inválido. Deve conter apenas números.');
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
                        
                        // Verificar se regime_tributario está vazio ou nulo
                        const regimeTributario = (clienteAtualizado as any)?.regime_tributario;
                        if (!regimeTributario || regimeTributario.trim() === '' || regimeTributario === 'A Definir') {
                          // Abrir modal para selecionar regime tributário
                          setClienteParaRegime(clienteAtualizado as Cliente);
                          setRegimeSelecionado('');
                          setShowRegimeModal(true);
                        } else {
                          toast.success('Dados atualizados com sucesso!');
                        }
                      } else {
                        toast.error(resp.error || 'Erro ao atualizar dados da Receita');
                      }
                    } catch (error: any) {
                      console.error('Erro ao atualizar cliente:', error);
                      
                      // Mensagens de erro mais específicas
                      let errorMessage = 'Erro ao atualizar dados';
                      
                      if (error?.response?.data?.error) {
                        errorMessage = error.response.data.error;
                      } else if (error?.message?.toLowerCase().includes('cnpj')) {
                        errorMessage = 'CNPJ inválido ou não encontrado na Receita Federal';
                      } else if (error?.message?.toLowerCase().includes('timeout')) {
                        errorMessage = 'Erro de conexão com a Receita Federal. Tente novamente.';
                      } else if (error?.response?.status === 404) {
                        errorMessage = 'Empresa não encontrada na Receita Federal';
                      } else if (error?.message) {
                        errorMessage = error.message;
                      }
                      
                      toast.error(errorMessage, 6000);
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
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Código SCI</label>
                  <div className="flex gap-2">
                    <div className={`flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white ${
                      visualizandoCliente.codigo_sci 
                        ? 'text-gray-900 font-semibold text-blue-600' 
                        : 'text-gray-400 italic'
                    }`}>
                      {visualizandoCliente.codigo_sci || 'Não cadastrado'}
                    </div>
                    {visualizandoCliente?.id && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!visualizandoCliente?.id) return;
                          
                            setAtualizandoCodigoSCI(true);
                            try {
                              const result = await clientesService.atualizarCodigoSCI(visualizandoCliente.id);
                              if (result.success && result.data) {
                                // Atualizar apenas o codigo_sci no estado atual, preservando todos os outros campos
                                setVisualizandoCliente({
                                  ...visualizandoCliente,
                                  codigo_sci: result.data.codigo_sci || result.data.cliente?.codigo_sci
                                });
                                // Recarregar a lista de clientes em background
                                loadClientes().catch(err => console.error('[Clientes] Erro ao recarregar lista:', err));
                                toast.success(result.message || 'Código SCI atualizado com sucesso');
                              } else {
                                toast.error(result.error || 'Erro ao atualizar código SCI');
                              }
                            } catch (error: any) {
                              console.error('[Clientes] Erro ao atualizar código SCI:', error);
                              toast.error(error.response?.data?.error || error.message || 'Erro ao atualizar código SCI');
                            } finally {
                              setAtualizandoCodigoSCI(false);
                            }
                        }}
                        disabled={atualizandoCodigoSCI}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-semibold text-sm"
                      >
                        <ArrowPathIcon className={`h-4 w-4 ${atualizandoCodigoSCI ? 'animate-spin' : ''}`} />
                        Atualizar
                      </button>
                    )}
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
              </div>
              {Array.isArray((visualizandoCliente as any).socios) && (visualizandoCliente as any).socios.length > 0 ? (
                <div 
                  className="border-2 border-blue-200 rounded-lg overflow-hidden bg-white shadow-sm"
                  key={`socios-${visualizandoCliente.id}-${sociosRefreshKey}`}
                >
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
                          // Mostrar R$ 0,00 mesmo quando o valor for zero
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

      {/* Barra de Busca e Ações - Não exibir nas abas de Pagamentos, E-Processos e CNAE, nem quando o formulário estiver aberto, nem quando estiver visualizando cliente */}
      {activeTab !== 'pagamentos' && activeTab !== 'e-processos' && activeTab !== 'cnae' && !showForm && !visualizandoCliente && (
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-6 backdrop-blur-sm bg-opacity-95">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className={`flex-1 ${activeTab === 'faturamento-sci' ? 'max-w-2xl' : 'max-w-md'} w-full`}>
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
                    : activeTab === 'faturamento-sci'
                    ? 'Buscar por CNPJ ou Razão Social...'
                    : 'Digite o CNPJ (14 dígitos)'
                }
                value={
                  activeTab === 'participacao' 
                    ? searchParticipacao 
                    : activeTab === 'faturamento-sci'
                    ? searchFaturamento
                    : search
                }
                onChange={(e) => {
                  if (activeTab === 'participacao') {
                    setSearchParticipacao(e.target.value);
                  } else if (activeTab === 'faturamento-sci') {
                    setSearchFaturamento(e.target.value);
                  } else {
                    setSearch(e.target.value);
                  }
                }}
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white focus:bg-white shadow-sm hover:shadow-md"
              />
              {((activeTab === 'participacao' ? searchParticipacao : activeTab === 'faturamento-sci' ? searchFaturamento : search)) && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'participacao') {
                      setSearchParticipacao('');
                    } else if (activeTab === 'faturamento-sci') {
                      setSearchFaturamento('');
                    } else {
                      setSearch('');
                    }
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                  title="Limpar busca"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          {activeTab === 'faturamento-sci' && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  // Preencher o campo de busca do modal com o valor do campo de busca principal
                  setTipoConsulta('anual');
                  setConsultaPersonalizada(prev => ({
                    ...prev,
                    busca: searchFaturamento,
                    dataInicial: '',
                    dataFinal: '',
                    anoSelecionado: '',
                    mesSelecionado: '',
                    anoMesSelecionado: '',
                  }));
                  setShowModalConsultaPersonalizada(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium whitespace-nowrap shadow-sm hover:shadow-md transition-all"
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
                Consulta Personalizada
              </button>
            </div>
          )}
          {activeTab === 'clientes' && (
            <div className="w-full md:w-64">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <FunnelIcon className="h-4 w-4 text-blue-600" />
                Ordenar
              </label>
              <div className="relative">
                <select
                  value={ordenacaoClientes}
                  onChange={(e) => setOrdenacaoClientes(e.target.value as 'a-z' | 'z-a' | 'cnpj' | 'codigo-sci')}
                  className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md appearance-none cursor-pointer font-medium text-gray-700 hover:border-blue-300"
                >
                  <option value="a-z">A → Z</option>
                  <option value="z-a">Z → A</option>
                  <option value="cnpj">CNPJ ↑</option>
                  <option value="codigo-sci">Código SCI ↑</option>
                </select>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FunnelIcon className="h-5 w-5 text-blue-500" />
                </div>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'participacao' && (
            <>
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
                    <option value="codigo-sci">Código SCI ↑</option>
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
            </>
          )}
          {activeTab === 'clientes' && (
            <div className="flex gap-3 items-end">
              <div className="flex flex-col">
                <label className="block text-sm font-semibold text-gray-700 mb-2 opacity-0 pointer-events-none">Ações</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowForm(true)}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-semibold transition-all duration-300 flex items-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transform"
                  >
                    <PlusIcon className="h-5 w-5" />
                    Novo Cliente
                  </button>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 font-semibold transition-all duration-300 flex items-center gap-2 shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 transform"
                  >
                    <DocumentArrowDownIcon className="h-5 w-5" />
                    Exportar Personalizado
                  </button>
                </div>
              </div>
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Código SCI</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={(formData as any).codigo_sci || ''}
                          onChange={(e) => setFormData({ ...formData, codigo_sci: e.target.value } as any)}
                          placeholder="Código do sistema SCI"
                          className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          readOnly={atualizandoCodigoSCI}
                        />
                        {editingCliente?.id && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!editingCliente?.id) return;
                              
                              setAtualizandoCodigoSCI(true);
                              try {
                                const result = await clientesService.atualizarCodigoSCI(editingCliente.id);
                                if (result.success && result.data) {
                                  // Atualizar apenas o codigo_sci no formData, preservando todos os outros campos
                                  setFormData({ 
                                    ...formData, 
                                    codigo_sci: result.data.codigo_sci || result.data.cliente?.codigo_sci 
                                  } as any);
                                  toast.success(result.message || 'Código SCI atualizado com sucesso');
                                } else {
                                  toast.error(result.error || 'Erro ao atualizar código SCI');
                                }
                              } catch (error: any) {
                                console.error('[Clientes] Erro ao atualizar código SCI:', error);
                                toast.error(error.response?.data?.error || error.message || 'Erro ao atualizar código SCI');
                              } finally {
                                setAtualizandoCodigoSCI(false);
                              }
                            }}
                            disabled={atualizandoCodigoSCI}
                            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-semibold text-sm"
                          >
                            <ArrowPathIcon className={`h-4 w-4 ${atualizandoCodigoSCI ? 'animate-spin' : ''}`} />
                            Atualizar
                          </button>
                        )}
                      </div>
                    </div>
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Código SCI</th>
                {socioFiltro && (
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Participação</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Inf. Financeiras</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(() => {
                // Aplicar ordenação aos clientes
                // Sempre ordenar no frontend para garantir consistência
                const clientesOrdenados = [...clientes].sort((a, b) => {
                  if (ordenacaoClientes === 'a-z') {
                    const nomeA = (a.razao_social || a.nome || '').toLowerCase().trim();
                    const nomeB = (b.razao_social || b.nome || '').toLowerCase().trim();
                    return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
                  } else if (ordenacaoClientes === 'z-a') {
                    const nomeA = (a.razao_social || a.nome || '').toLowerCase().trim();
                    const nomeB = (b.razao_social || b.nome || '').toLowerCase().trim();
                    return nomeB.localeCompare(nomeA, 'pt-BR', { sensitivity: 'base' });
                  } else if (ordenacaoClientes === 'cnpj') {
                    const cnpjA = (a.cnpj_limpo || a.cnpj || '').replace(/\D/g, '');
                    const cnpjB = (b.cnpj_limpo || b.cnpj || '').replace(/\D/g, '');
                    return cnpjA.localeCompare(cnpjB);
                  }
                  return 0;
                });

                return clientesOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={socioFiltro ? 6 : 5} className="px-6 py-12 text-center">
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
                  clientesOrdenados.map((cliente) => {
                  const cnpjDisplay = displayCNPJ(cliente.cnpj_limpo || cliente.cnpj);
                  const cnpjValue = cliente.cnpj_limpo || cliente.cnpj || '';
                  const cnpjKey = `${cliente.id}-${cnpjValue}`;
                  return (
                    <tr key={cliente.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 border-b border-gray-100">
                      <td className="px-6 py-4 max-w-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <BuildingOfficeIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Comportamento padrão: abrir detalhes do cliente
                              const params = new URLSearchParams(location.search);
                              params.set('clienteId', cliente.id!);
                              navigate({ search: params.toString() }, { replace: true });
                              setVisualizandoCliente(cliente);
                            }}
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
                      <td className="px-6 py-4">
                        {cliente.codigo_sci ? (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-semibold">
                            {cliente.codigo_sci}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
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
                            className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-all duration-300 border-2 border-blue-300 hover:border-blue-600"
                            title="Consultar Situação Fiscal"
                          >
                            Sit. Fis
                          </button>
                          <button
                            onClick={() => {
                              navigate(`/clientes?tab=faturamento-sci&cnpj=${cnpjValue}`);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-purple-600 hover:text-white hover:bg-purple-600 rounded-lg transition-all duration-300 border-2 border-purple-300 hover:border-purple-600"
                            title="Ver Faturamento SCI"
                          >
                            Fat
                          </button>
                          <button
                            onClick={() => {
                              navigate(`/dctf?search=${cnpjValue}`);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-lg transition-all duration-300 border-2 border-indigo-300 hover:border-indigo-600"
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
                            className="px-3 py-1.5 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-all duration-300 border-2 border-blue-300 hover:border-blue-600 flex items-center justify-center"
                            title="Editar cliente"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(cliente)}
                            className="px-3 py-1.5 text-red-600 hover:text-white hover:bg-red-600 rounded-lg transition-all duration-300 border-2 border-red-300 hover:border-red-600 flex items-center justify-center"
                            title="Excluir cliente"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })
                );
              })()}
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

      {/* Aba de CNAE */}
      {activeTab === 'cnae' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <DocumentTextIcon className="h-5 w-5 text-purple-600" />
                  Busca por CNAE
                </h2>
                <p className="text-xs text-gray-600 mt-1">
                  Encontre clientes pela atividade principal ou secundária
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Busca por Grupo */}
            <div className="mb-6">
              <label htmlFor="grupoCNAE" className="block text-sm font-medium text-gray-700 mb-2">
                Buscar por Grupo de Atividades
              </label>
              <div className="flex gap-4">
                <div className="flex-1 relative grupo-dropdown-container">
                  <button
                    type="button"
                    onClick={() => setGrupoDropdownAberto(!grupoDropdownAberto)}
                    disabled={loadingGrupos}
                    className="w-full px-4 py-3 pl-12 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg text-left bg-white disabled:bg-gray-100 disabled:cursor-not-allowed hover:border-gray-400 transition-colors"
                  >
                    <span className={gruposSelecionados.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
                      {loadingGrupos 
                        ? 'Carregando grupos...' 
                        : gruposSelecionados.length > 0
                          ? `${gruposSelecionados.length} grupo${gruposSelecionados.length > 1 ? 's' : ''} selecionado${gruposSelecionados.length > 1 ? 's' : ''}`
                          : 'Selecione um ou mais grupos de atividades'}
                    </span>
                  </button>
                  <FunnelIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  <ChevronDownIcon className={`absolute right-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none transition-transform ${grupoDropdownAberto ? 'rotate-180' : ''}`} />
                  
                  {grupoDropdownAberto && (
                    <>
                      <style>{`
                        .grupo-dropdown-scroll::-webkit-scrollbar {
                          width: 8px;
                        }
                        .grupo-dropdown-scroll::-webkit-scrollbar-track {
                          background: #f3f4f6;
                          border-radius: 4px;
                        }
                        .grupo-dropdown-scroll::-webkit-scrollbar-thumb {
                          background: #9333ea;
                          border-radius: 4px;
                        }
                        .grupo-dropdown-scroll::-webkit-scrollbar-thumb:hover {
                          background: #7e22ce;
                        }
                      `}</style>
                      <div 
                        className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto grupo-dropdown-scroll" 
                        style={{
                          scrollbarWidth: 'thin',
                          scrollbarColor: '#9333ea #f3f4f6'
                        }}
                      >
                        <div className="py-2 px-3">
                          <div className="text-xs text-gray-500 mb-2 font-medium uppercase">
                            Selecione múltiplos grupos
                          </div>
                          {gruposCNAE.map((grupo) => {
                            const isSelected = gruposSelecionados.includes(grupo.nome);
                            return (
                              <div
                                key={grupo.nome}
                                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md mb-1 cursor-pointer transition-colors ${
                                  isSelected ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-50'
                                }`}
                                onClick={() => handleGrupoChange(grupo.nome)}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-5 h-5 rounded border-2 border-gray-400 bg-white text-purple-600 focus:ring-purple-500 focus:ring-2 cursor-pointer flex-shrink-0"
                                  style={{
                                    accentColor: '#9333ea',
                                    minWidth: '20px',
                                    minHeight: '20px'
                                  }}
                                  aria-label={`Selecionar grupo ${grupo.nome}`}
                                />
                                <span
                                  className={`text-sm font-medium flex-1 ${
                                    isSelected ? 'text-purple-900' : 'text-gray-700'
                                  }`}
                                >
                                  {grupo.nome}
                                  <span className="text-xs text-gray-500 ml-2 font-normal">
                                    ({grupo.cnaes.length} CNAE{grupo.cnaes.length !== 1 ? 's' : ''})
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleBuscarPorGrupo}
                    disabled={loadingCNAE || gruposSelecionados.length === 0}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {loadingCNAE ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Buscando...
                      </>
                    ) : (
                      <>
                        <MagnifyingGlassIcon className="h-5 w-5" />
                        Buscar
                      </>
                    )}
                  </button>
                </div>
              </div>
              {gruposSelecionados.length > 0 && (() => {
                const todosOsCnaes = gruposSelecionados.flatMap(nomeGrupo => {
                  const grupo = gruposCNAE.find(g => g.nome === nomeGrupo);
                  return grupo ? grupo.cnaes : [];
                });
                
                // Ordenar CNAEs por código em ordem crescente
                const cnaesOrdenados = [...todosOsCnaes].sort((a, b) => {
                  // Remover formatação e comparar numericamente
                  const codigoA = String(a.codigo).replace(/\D/g, '');
                  const codigoB = String(b.codigo).replace(/\D/g, '');
                  return codigoA.localeCompare(codigoB, undefined, { numeric: true, sensitivity: 'base' });
                });
                
                return (
                  <div className="mt-2 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold">Grupos selecionados ({gruposSelecionados.length}):</span> {gruposSelecionados.join(', ')}
                      </p>
                      <button
                        type="button"
                        onClick={() => setCnaesExpandidos(!cnaesExpandidos)}
                        className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium transition-colors"
                      >
                        {cnaesExpandidos ? (
                          <>
                            <ChevronUpIcon className="h-4 w-4" />
                            Ocultar CNAEs
                          </>
                        ) : (
                          <>
                            <ChevronDownIcon className="h-4 w-4" />
                            Ver CNAEs ({cnaesOrdenados.length})
                          </>
                        )}
                      </button>
                    </div>
                    {cnaesExpandidos && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-3">
                          CNAEs incluídos nesta busca ({cnaesOrdenados.length}):
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                          {cnaesOrdenados.map((cnaeItem, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 px-3 py-2 bg-white border border-purple-300 rounded-md shadow-sm hover:shadow-md transition-shadow"
                            >
                              <span className="text-xs font-bold text-purple-700 flex-shrink-0 min-w-[70px]">
                                {formatarCNAE(cnaeItem.codigo)}
                              </span>
                              <span className="text-xs text-gray-600 flex-1" title={cnaeItem.descricao}>
                                {cnaeItem.descricao}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="text-sm text-gray-500 font-medium">OU</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>

            {/* Campo de Busca por Código */}
            <div className="mb-6">
              <label htmlFor="cnae" className="block text-sm font-medium text-gray-700 mb-2">
                Buscar por Código CNAE
              </label>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <input
                    id="cnae"
                    type="text"
                    value={cnae}
                    onChange={handleCnaeChange}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleBuscarCNAE();
                      }
                    }}
                    placeholder="Ex: 6201-5/00"
                    maxLength={9}
                    className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                  />
                  <DocumentTextIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleBuscarCNAE}
                    disabled={loadingCNAE || !cnae.trim()}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {loadingCNAE ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Buscando...
                      </>
                    ) : (
                      <>
                        <MagnifyingGlassIcon className="h-5 w-5" />
                        Buscar
                      </>
                    )}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Digite pelo menos 2 dígitos para buscar. Formato: XXXX-X/XX (ex: 6201-5/00)
              </p>
            </div>

            {/* Resultados */}
            {buscouCNAE && (
              <div className="border-t border-gray-200 pt-6">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <BuildingOfficeIcon className="h-6 w-6 text-purple-600" />
                      Resultados
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {clientesCNAE.length} {clientesCNAE.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {clientesCNAE.length > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 rounded-lg">
                        <span className="text-sm font-semibold text-purple-700">
                          {clientesCNAE.length}
                        </span>
                      </div>
                    )}
                    {clientesCNAE.length > 0 && (
                      <button
                        onClick={handleExportarCNAE}
                        disabled={exportandoCNAE}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-medium"
                        title="Exportar resultados para Excel"
                      >
                        {exportandoCNAE ? (
                          <>
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Exportando...
                          </>
                        ) : (
                          <>
                            <DocumentArrowDownIcon className="h-5 w-5" />
                            Exportar Excel
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {clientesCNAE.length === 0 ? (
                  <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border-2 border-dashed border-gray-300">
                    <BuildingOfficeIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-600 mb-2">Nenhum cliente encontrado</p>
                    <p className="text-sm text-gray-500">
                      {grupoSelecionado 
                        ? `Nenhum cliente possui CNAE do grupo "${grupoSelecionado}"`
                        : 'Nenhum cliente encontrado com este CNAE'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clientesCNAE.map((cliente, index) => {
                      let atividadesSecundarias: any[] = [];
                      try {
                        const valor = (cliente as any).atividades_secundarias;
                        if (typeof valor === 'string') {
                          atividadesSecundarias = JSON.parse(valor);
                        } else if (Array.isArray(valor)) {
                          atividadesSecundarias = valor;
                        }
                      } catch {
                        // Ignorar erros de parsing
                      }

                      const cnaePrincipal = formatarCNAE((cliente as any).atividade_principal_code);
                      const cnaePrincipalText = (cliente as any).atividade_principal_text;

                      return (
                        <div
                          key={cliente.id}
                          className="group bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-purple-300 transition-all duration-300 cursor-pointer overflow-hidden"
                          style={{
                            animation: `fadeInUp 0.4s ease-out ${index * 0.03}s both`
                          }}
                          onClick={() => {
                            // Passar o termo de busca (CNAE ou grupo) para o modal
                            // Se foi busca por CNAE, passar o código (apenas números)
                            // Se foi busca por grupo, passar o nome do grupo
                            let termoBusca = '';
                            if (cnae.trim()) {
                              // Busca por CNAE - passar apenas os dígitos (2 primeiros)
                              const cnaeLimpo = cnae.replace(/[.\-\/]/g, '');
                              termoBusca = cnaeLimpo.substring(0, 2);
                            } else if (grupoSelecionado) {
                              // Busca por grupo - passar o nome do grupo
                              termoBusca = grupoSelecionado;
                            }
                            handleViewCliente(cliente, termoBusca);
                          }}
                        >
                          <div className="flex items-center gap-4 p-5">
                            {/* Ícone/Logo */}
                            <div className="flex-shrink-0">
                              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                                <BuildingOfficeIcon className="h-7 w-7 text-white" />
                              </div>
                            </div>

                            {/* Informações Principais */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-lg font-bold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
                                    {cliente.razao_social || cliente.nome || 'N/A'}
                                  </h4>
                                  {(cliente as any).fantasia && (
                                    <p className="text-sm text-gray-500 truncate mt-0.5">
                                      {(cliente as any).fantasia}
                                    </p>
                                  )}
                                </div>
                                <ArrowRightIcon className="h-5 w-5 text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
                              </div>

                              {/* Informações em Linha */}
                              <div className="flex flex-wrap items-center gap-4 mt-3">
                                {/* CNPJ */}
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-lg">
                                    <DocumentTextIcon className="h-4 w-4 text-gray-600" />
                                    <span className="text-sm font-semibold text-gray-700">
                                      {formatarCpfCnpj(cliente.cnpj_limpo || (cliente as any).cnpj)}
                                    </span>
                                  </div>
                                </div>

                                {/* CNAE Principal */}
                                {cnaePrincipal && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 font-medium">CNAE Principal:</span>
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-lg">
                                      <span className="text-sm font-bold text-purple-700">
                                        {cnaePrincipal}
                                      </span>
                                    </div>
                                    {cnaePrincipalText && (
                                      <span className="text-xs text-gray-600 max-w-xs truncate" title={cnaePrincipalText}>
                                        {cnaePrincipalText}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Atividades Secundárias */}
                                {atividadesSecundarias.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 font-medium">Secundárias:</span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {atividadesSecundarias.slice(0, 2).map((atividade: any, idx: number) => (
                                        <div
                                          key={idx}
                                          className="inline-flex items-center px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-md"
                                        >
                                          <span className="text-xs font-semibold text-indigo-700">
                                            {formatarCNAE(atividade.code)}
                                          </span>
                                        </div>
                                      ))}
                                      {atividadesSecundarias.length > 2 && (
                                        <div className="inline-flex items-center px-2 py-0.5 bg-gray-100 border border-gray-300 rounded-md">
                                          <span className="text-xs font-medium text-gray-600">
                                            +{atividadesSecundarias.length - 2}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Barra de Progresso no Hover */}
                          <div className="h-1 bg-gray-100 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 w-0 group-hover:w-full transition-all duration-500"></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aba de Faturamento SCI */}
      {activeTab === 'faturamento-sci' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Resultado da Consulta Personalizada - Exibido na própria página */}
          {resultadoConsultaPersonalizada ? (
            <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 rounded-lg">
              {/* Header com botão voltar e download */}
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-t-lg shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setResultadoConsultaPersonalizada(null);
                      }}
                      className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </button>
                    <div className="flex items-center gap-4">
                      <div>
                        <h2 className="text-base font-bold">Resultado da Consulta</h2>
                        <p className="text-purple-100 text-xs mt-0.5">Faturamento {resultadoConsultaPersonalizada.tipoFaturamento === 'detalhado' ? 'Detalhado' : 'Consolidado'}</p>
                      </div>
                      <div className="h-6 w-px bg-white/30"></div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-100 text-xs">Tipo:</span>
                        <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-xs font-semibold">
                          {resultadoConsultaPersonalizada.tipoFaturamento === 'detalhado' ? 'Detalhado' : 'Consolidado'}
                        </span>
                        {resultadoConsultaPersonalizada.somarMatrizFilial && (
                          <>
                            <span className="text-purple-100 text-xs">•</span>
                            <span className="text-purple-100 text-xs">Somar Matriz e Filial: Sim</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={gerarPDFConsultaPersonalizada}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg transition-colors text-sm font-medium"
                    title="Baixar PDF"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Baixar PDF</span>
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Card de Informações do Cliente */}
                  <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Informações do Cliente
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-1">Razão Social</p>
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{resultadoConsultaPersonalizada.cliente.razao_social}</p>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">CNPJ</p>
                        <p className="text-sm font-semibold text-gray-900">{formatCNPJ(resultadoConsultaPersonalizada.cliente.cnpj)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Código SCI</p>
                        <p className="text-sm font-semibold text-gray-900">{resultadoConsultaPersonalizada.cliente.codigo_sci}</p>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">Período</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPeriodoComOffset(
                            resultadoConsultaPersonalizada.periodo.dataInicial,
                            resultadoConsultaPersonalizada.periodo.dataFinal
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                {/* Card de Total */}
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg shadow-lg p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100 text-xs font-medium mb-1">Total do Período</p>
                      <h3 className="text-2xl font-bold">{formatarMoedaFaturamento(resultadoConsultaPersonalizada.total)}</h3>
                    </div>
                    <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Tabela de Detalhes */}
                <div className="bg-white rounded-lg shadow-md border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Detalhes do Faturamento
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Período</th>
                          {resultadoConsultaPersonalizada.tipoFaturamento === 'detalhado' && (
                            <>
                              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Vendas Brutas</th>
                              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Devoluções</th>
                              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Vendas Liquidadas</th>
                              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Serviços</th>
                              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Outras Receitas</th>
                              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Operações Imobiliárias</th>
                            </>
                          )}
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Faturamento Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {resultadoConsultaPersonalizada.detalhes.length > 0 ? (
                          resultadoConsultaPersonalizada.detalhes.map((detalhe: any, index: number) => (
                            <tr 
                              key={index} 
                              className={`transition-colors hover:bg-gray-50 ${
                                detalhe.descricao === 'Total do Período' 
                                  ? 'bg-gradient-to-r from-purple-50 to-blue-50 font-semibold border-t-2 border-purple-300' 
                                  : 'bg-white'
                              }`}
                            >
                              <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-gray-900">
                                {detalhe.descricao || '-'}
                              </td>
                              {resultadoConsultaPersonalizada.tipoFaturamento === 'detalhado' && (
                                <>
                                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                    {formatarMoedaFaturamento(detalhe.vendasBrutas || 0)}
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                    {formatarMoedaFaturamento(detalhe.devolucoesDeducoes || 0)}
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                    {formatarMoedaFaturamento(detalhe.vendasLiquidadas || 0)}
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                    {formatarMoedaFaturamento(detalhe.servicos || 0)}
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                    {formatarMoedaFaturamento(detalhe.outrasReceitas || 0)}
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                    {formatarMoedaFaturamento(detalhe.operacoesImobiliarias || 0)}
                                  </td>
                                </>
                              )}
                              <td className={`px-4 py-2.5 whitespace-nowrap text-sm text-right ${
                                detalhe.descricao === 'Total do Período' 
                                  ? 'font-bold text-purple-700 text-base' 
                                  : 'font-semibold text-gray-900'
                              }`}>
                                {formatarMoedaFaturamento(detalhe.faturamentoTotal || detalhe.valor || 0)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={resultadoConsultaPersonalizada.tipoFaturamento === 'detalhado' ? 8 : 2} className="px-4 py-8 text-center">
                              <div className="flex flex-col items-center justify-center text-gray-400">
                                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-xs">Nenhum detalhe encontrado</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <CurrencyDollarIcon className="h-5 w-5 text-blue-600" />
                      Faturamento SCI
                    </h2>
                    <p className="text-xs text-gray-600 mt-1">
                      Gerencie o faturamento dos últimos 2 anos ({anosParaBuscarFaturamento.join(' e ')}) para declaração IRPF
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!loadingFaturamento && clientesFaturamento.length > 0 && (
                      <button
                        onClick={atualizarTodosFaturamentos}
                        disabled={loadingFaturamento}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        <ArrowPathIcon className={`h-4 w-4 ${loadingFaturamento ? 'animate-spin' : ''}`} />
                        Atualizar Todos
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6">
            {loadingFaturamento && clientesFaturamento.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="animate-spin h-8 w-8 text-blue-600" />
                <span className="ml-3 text-gray-600">Carregando empresas...</span>
              </div>
            ) : clientesFaturamento.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>Nenhuma matriz com código SCI encontrada.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Lista de Clientes */}
                <div className="space-y-4">
                  {clientesFaturamento
                    .filter((c) => {
                      if (!searchFaturamento) return true;
                      // Remove formatação do termo de busca para comparar apenas números
                      const termLimpo = searchFaturamento.replace(/\D/g, '').toLowerCase();
                      const termOriginal = searchFaturamento.toLowerCase();
                      // CNPJ do cliente sem formatação
                      const cnpjLimpo = (c.cnpj_limpo || (c.cnpj ? c.cnpj.replace(/\D/g, '') : '')).toLowerCase();
                      // Razão social para busca por nome
                      const razao = (c.razao_social || c.nome || '').toLowerCase();
                      // Busca por CNPJ (sem formatação) ou por razão social
                      return (termLimpo && cnpjLimpo.includes(termLimpo)) || razao.includes(termOriginal);
                    })
                    .map((cliente) => {
                      const data = faturamentoData.get(cliente.id);
                      const faturamento = data?.faturamento || [];
                      
                      return (
                        <div key={cliente.id} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">
                                {cliente.razao_social || cliente.nome || 'Sem nome'}
                              </h3>
                              <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                  <span>CNPJ: {(() => {
                                    const cnpjValue = cliente.cnpj_limpo || cliente.cnpj || '';
                                    const cnpjKey = cnpjValue.replace(/\D/g, '');
                                    const cnpjFormatado = cnpjValue ? formatCNPJ(cnpjKey) : '-';
                                    return cnpjFormatado;
                                  })()}</span>
                                  {(() => {
                                    const cnpjValue = cliente.cnpj_limpo || cliente.cnpj || '';
                                    const cnpjKey = cnpjValue.replace(/\D/g, '');
                                    if (!cnpjKey) return null;
                                    return (
                                      <button
                                        onClick={() => copyToClipboard(cnpjKey, cnpjKey)}
                                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                                        title="Copiar CNPJ"
                                      >
                                        {copiedCnpj === cnpjKey ? (
                                          <ClipboardDocumentCheckIcon className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <ClipboardDocumentIcon className="h-4 w-4 text-gray-500" />
                                        )}
                                      </button>
                                    );
                                  })()}
                                </div>
                                <span>Código SCI: {cliente.codigo_sci || '-'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {data?.ultimaAtualizacao && (
                                <div className="text-xs text-gray-500">
                                  <span className="text-gray-400">Última atualização:</span>{' '}
                                  <span className="font-medium">{formatDateTime(data.ultimaAtualizacao)}</span>
                                </div>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  atualizarFaturamentoCliente(cliente.id);
                                }}
                                disabled={data?.loading || loadingFaturamento}
                                className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Atualizar faturamento"
                              >
                                <ArrowPathIcon className={`h-5 w-5 ${data?.loading ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {data?.error && (
                            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                              <strong>Erro:</strong> {data.error}
                            </div>
                          )}

                          {faturamento.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {faturamento.map((fat) => (
                                <div 
                                  key={fat.ano} 
                                  onClick={() => exibirDetalhesFaturamento(cliente.id, fat.ano)}
                                  className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-purple-400 hover:shadow-md transition-all duration-200"
                                >
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-base font-semibold text-gray-900">
                                      Faturamento {fat.ano}
                                    </h4>
                                    <span className="text-lg font-bold text-green-700">
                                      {formatarMoedaFaturamento(fat.valorTotal)}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-600 mb-2">
                                    Período: 02/01/{fat.ano} a 01/01/{fat.ano + 1}
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Média Mensal:</span>
                                    <span className="font-semibold text-blue-700">
                                      {formatarMoedaFaturamento(fat.mediaMensal || 0)}
                                    </span>
                                  </div>
                                  <div className="mt-3 pt-3 border-t border-gray-100">
                                    <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
                                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      Clique para ver detalhes
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {!data?.carregado && !data?.loading && (
                            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg text-sm">
                              Clique em "Atualizar" para buscar o faturamento do SCI
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Barra de Carregamento Global */}
      {loadingConsultaPersonalizada && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Consultando Faturamento</h3>
              <p className="text-sm text-gray-600 mb-6">Aguarde enquanto buscamos os dados...</p>
              
              {/* Barra de Progresso Animada */}
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 via-purple-600 to-purple-500 rounded-full animate-progress"></div>
              </div>
              
              <style>{`
                @keyframes progress {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
                .animate-progress {
                  animation: progress 1.5s ease-in-out infinite;
                }
              `}</style>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhes Faturamento */}
      {showModalDetalhesFaturamento && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]" 
          onClick={() => {
            console.log('[Faturamento] Fechando modal');
            setShowModalDetalhesFaturamento(false);
          }}
        >
          <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 rounded-lg max-w-7xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            {detalhesFaturamento.loading ? (
              <div className="p-6">
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
                  <span className="ml-4 text-gray-600">Carregando detalhes...</span>
                </div>
              </div>
            ) : detalhesFaturamento.dados.length === 0 ? (
              <div className="p-6">
                <div className="text-center py-12">
                  <p className="text-gray-500">Nenhum dado detalhado disponível para este período.</p>
                </div>
              </div>
            ) : detalhesFaturamento.cliente ? (
              <div>
                {/* Header com botão voltar */}
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-t-lg shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowModalDetalhesFaturamento(false)}
                        className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                      </button>
                      <div className="flex items-center gap-4">
                        <div>
                          <h2 className="text-base font-bold">Resultado da Consulta</h2>
                          <p className="text-purple-100 text-xs mt-0.5">Faturamento Detalhado - {detalhesFaturamento.ano}</p>
                        </div>
                        <div className="h-6 w-px bg-white/30"></div>
                        <div className="flex items-center gap-2">
                          <span className="text-purple-100 text-xs">Tipo:</span>
                          <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-xs font-semibold">
                            Detalhado
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={gerarPDFFaturamento}
                      className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg transition-all duration-200 text-sm font-medium"
                      title="Baixar PDF do faturamento"
                    >
                      <DocumentArrowDownIcon className="h-4 w-4" />
                      Baixar PDF
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* Card de Informações do Cliente */}
                  <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Informações do Cliente
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-1">Razão Social</p>
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{detalhesFaturamento.cliente.razao_social || detalhesFaturamento.cliente.nome}</p>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">CNPJ</p>
                        <p className="text-sm font-semibold text-gray-900">{formatCNPJ(detalhesFaturamento.cliente.cnpj_limpo || detalhesFaturamento.cliente.cnpj || '')}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Código SCI</p>
                        <p className="text-sm font-semibold text-gray-900">{detalhesFaturamento.cliente.codigo_sci || '-'}</p>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">Período</p>
                        <p className="text-sm font-semibold text-gray-900">
                          01/01/{detalhesFaturamento.ano} a 31/12/{detalhesFaturamento.ano}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card de Total */}
                  <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg shadow-lg p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-purple-100 text-xs font-medium mb-1">Total do Período</p>
                        <h3 className="text-2xl font-bold">{formatarMoedaFaturamento(
                          detalhesFaturamento.dados.reduce((sum, d) => sum + (Number(d.faturamento_total) || 0), 0)
                        )}</h3>
                      </div>
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Tabela de Detalhes */}
                  <div className="bg-white rounded-lg shadow-md border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Detalhes do Faturamento
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Período</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Vendas Brutas</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Devoluções</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Vendas Liquidadas</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Serviços</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Outras Receitas</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Operações Imobiliárias</th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Faturamento Total</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {detalhesFaturamento.dados.map((mes: any, index: number) => (
                            <tr 
                              key={index} 
                              className="transition-colors hover:bg-gray-50 bg-white"
                            >
                              <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-gray-900">
                                {mes.mes_ano || `${mes.mes}/${detalhesFaturamento.ano}`}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                {formatarMoedaFaturamento(Number(mes.vendas_brutas) || 0)}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                {formatarMoedaFaturamento(Number(mes.devolucoes_deducoes) || 0)}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                {formatarMoedaFaturamento(Number(mes.vendas_liquidadas) || 0)}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                {formatarMoedaFaturamento(Number(mes.servicos) || 0)}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                {formatarMoedaFaturamento(Number(mes.outras_receitas) || 0)}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700 text-right">
                                {formatarMoedaFaturamento(Number(mes.operacoes_imobiliarias) || 0)}
                              </td>
                              <td className={`px-4 py-2.5 whitespace-nowrap text-sm text-right font-semibold text-gray-900`}>
                                {formatarMoedaFaturamento(Number(mes.faturamento_total) || 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal Consulta Personalizada */}
      {showModalConsultaPersonalizada && !loadingConsultaPersonalizada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowModalConsultaPersonalizada(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <MagnifyingGlassIcon className="h-5 w-5 text-purple-600" />
                Consulta Personalizada
              </h3>
              <button
                onClick={() => setShowModalConsultaPersonalizada(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Busca por CNPJ ou Razão Social */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Busca por CNPJ ou Razão Social
                </label>
                <input
                  type="text"
                  placeholder="Digite o CNPJ ou Razão Social..."
                  value={consultaPersonalizada.busca}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Aplicar máscara de CNPJ se o valor contém apenas números
                    const apenasNumeros = value.replace(/\D/g, '');
                    // Se tiver mais de 2 dígitos e parecer ser um CNPJ (não contém letras), aplicar máscara
                    if (apenasNumeros.length > 0 && apenasNumeros.length <= 14 && /^\d+$/.test(value.replace(/[.\-\/]/g, ''))) {
                      const formatted = formatCNPJ(value);
                      setConsultaPersonalizada(prev => ({ ...prev, busca: formatted }));
                    } else {
                      // Caso contrário, permitir texto livre (Razão Social)
                      setConsultaPersonalizada(prev => ({ ...prev, busca: value }));
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Tipo de Consulta */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Tipo de Consulta
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipoConsulta"
                      value="anual"
                      checked={tipoConsulta === 'anual'}
                      onChange={() => {
                        setTipoConsulta('anual');
                        // Limpar datas ao mudar de tipo
                        setConsultaPersonalizada(prev => ({
                          ...prev,
                          dataInicial: '',
                          dataFinal: '',
                          anoSelecionado: '',
                        }));
                      }}
                      className="mr-2 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Consulta Anual</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipoConsulta"
                      value="mensal"
                      checked={tipoConsulta === 'mensal'}
                      onChange={() => {
                        setTipoConsulta('mensal');
                        // Limpar datas ao mudar de tipo
                        setConsultaPersonalizada(prev => ({
                          ...prev,
                          dataInicial: '',
                          dataFinal: '',
                          mesSelecionado: '',
                          anoMesSelecionado: '',
                        }));
                      }}
                      className="mr-2 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Consulta Mensal</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipoConsulta"
                      value="personalizado"
                      checked={tipoConsulta === 'personalizado'}
                      onChange={() => {
                        setTipoConsulta('personalizado');
                        // Limpar datas ao mudar de tipo
                        setConsultaPersonalizada(prev => ({
                          ...prev,
                          dataInicial: '',
                          dataFinal: '',
                        }));
                      }}
                      className="mr-2 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Personalizado</span>
                  </label>
                </div>
              </div>

              {/* Consulta Anual */}
              {tipoConsulta === 'anual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecionar Ano
                  </label>
                  <select
                    value={consultaPersonalizada.anoSelecionado}
                    onChange={(e) => {
                      const ano = e.target.value;
                      if (ano) {
                        setConsultaPersonalizada(prev => ({
                          ...prev,
                          anoSelecionado: ano,
                          dataInicial: `${ano}-01-01`,
                          dataFinal: `${ano}-12-31`
                        }));
                      } else {
                        setConsultaPersonalizada(prev => ({
                          ...prev,
                          anoSelecionado: '',
                          dataInicial: '',
                          dataFinal: ''
                        }));
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">Selecione um ano...</option>
                    {Array.from({ length: 10 }, (_, i) => {
                      const ano = new Date().getFullYear() - i;
                      return (
                        <option key={ano} value={ano}>
                          {ano}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Consulta Mensal */}
              {tipoConsulta === 'mensal' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecionar Mês/Ano
                  </label>
                  <MonthYearPicker
                    value={consultaPersonalizada.anoMesSelecionado}
                    onChange={(anoMes) => {
                      if (anoMes) {
                        const [ano, mes] = anoMes.split('-');
                        const mesNum = parseInt(mes); // mesNum será 1-12 (janeiro=1, dezembro=12)
                        const anoNum = parseInt(ano);
                        
                        // Calcular o último dia do mês selecionado
                        // JavaScript Date usa meses 0-11 (janeiro=0, dezembro=11)
                        // new Date(ano, mes, 0) retorna o último dia do mês anterior
                        // Para obter o último dia do mês atual, usamos o próximo mês
                        // Exemplo: janeiro (mesNum=1) -> new Date(2026, 2, 0) = 31 (último dia de janeiro)
                        // Como mesNum é 1-12, usamos mesNum + 1 para obter o próximo mês no formato JS
                        // mesNum=1 (janeiro) -> mesNum+1=2 -> new Date(2026, 2, 0) = 31 de janeiro ✅
                        const ultimoDia = new Date(anoNum, mesNum + 1, 0).getDate();
                        
                        // Sempre começar no dia 01 do mês selecionado (garantir formato correto)
                        const dataInicial = `${String(anoNum).padStart(4, '0')}-${String(mesNum).padStart(2, '0')}-01`;
                        // Último dia do mês selecionado (28, 29, 30 ou 31 dependendo do mês)
                        const dataFinal = `${String(anoNum).padStart(4, '0')}-${String(mesNum).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
                        
                        console.log('[Consulta Mensal] Datas calculadas:', {
                          anoMes,
                          anoNum,
                          mesNum,
                          mes,
                          ultimoDia,
                          dataInicial,
                          dataFinal
                        });
                        
                        setConsultaPersonalizada(prev => ({
                          ...prev,
                          anoMesSelecionado: anoMes,
                          mesSelecionado: mes,
                          dataInicial,
                          dataFinal
                        }));
                      } else {
                        setConsultaPersonalizada(prev => ({
                          ...prev,
                          anoMesSelecionado: '',
                          mesSelecionado: '',
                          dataInicial: '',
                          dataFinal: ''
                        }));
                      }
                    }}
                  />
                  {consultaPersonalizada.anoMesSelecionado && (
                    <p className="mt-2 text-sm text-gray-600">
                      Período: {formatPeriodoComOffset(
                        consultaPersonalizada.dataInicial,
                        consultaPersonalizada.dataFinal
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Consulta Personalizada */}
              {tipoConsulta === 'personalizado' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data Inicial
                    </label>
                    <input
                      type="date"
                      value={consultaPersonalizada.dataInicial}
                      onChange={(e) => setConsultaPersonalizada(prev => ({ ...prev, dataInicial: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data Final
                    </label>
                    <input
                      type="date"
                      value={consultaPersonalizada.dataFinal}
                      onChange={(e) => setConsultaPersonalizada(prev => ({ ...prev, dataFinal: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                </div>
              )}

              {/* Tipo de Faturamento */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Faturamento
                </label>
                <select
                  value={consultaPersonalizada.tipoFaturamento}
                  onChange={(e) => setConsultaPersonalizada(prev => ({ ...prev, tipoFaturamento: e.target.value as 'detalhado' | 'consolidado' }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="detalhado">Faturamento Detalhado</option>
                  <option value="consolidado">Faturamento Consolidado</option>
                </select>
              </div>

              {/* Checkbox Somar Matriz e Filial */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="somarMatrizFilial"
                  checked={consultaPersonalizada.somarMatrizFilial}
                  onChange={(e) => setConsultaPersonalizada(prev => ({ ...prev, somarMatrizFilial: e.target.checked }))}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                />
                <label htmlFor="somarMatrizFilial" className="ml-2 block text-sm text-gray-700">
                  Somar matriz e filial
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowModalConsultaPersonalizada(false);
                  setTipoConsulta('anual');
                  setConsultaPersonalizada({
                    busca: '',
                    dataInicial: '',
                    dataFinal: '',
                    tipoFaturamento: 'detalhado',
                    somarMatrizFilial: false,
                    anoSelecionado: '',
                    mesSelecionado: '',
                    anoMesSelecionado: '',
                  });
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConsultarPersonalizada}
                disabled={loadingConsultaPersonalizada}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingConsultaPersonalizada ? 'Consultando...' : 'Consultar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal removido - resultado agora é exibido diretamente na página dentro da aba Faturamento SCI */}

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
              .map(c => {
                // Debug: verificar se capital_social está presente
                if (c.cnpj_limpo === '31332375000182' || c.cnpj_limpo === '41697567000146' || c.cnpj_limpo === '03597050000196') {
                  console.log('[DEBUG] Cliente:', c.razao_social, 'CNPJ:', c.cnpj_limpo, 'Capital Social:', c.capital_social, 'Tipo:', typeof c.capital_social);
                }
                return c;
              })
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
              // 2. Aplicar filtro de sócio (se selecionado)
              .filter(c => {
                if (!socioFiltro || !socioFiltro.trim()) return true;
                
                // Verificar se algum sócio do cliente corresponde ao filtro
                const socios = c.socios || [];
                return socios.some((socio: any) => {
                  const nomeSocio = (socio.nome || socio.Nome || socio.name || '').toLowerCase().trim();
                  const filtroLower = socioFiltro.toLowerCase().trim();
                  return nomeSocio === filtroLower || nomeSocio.includes(filtroLower);
                });
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
                  // Exceção: CONSORCIO CONSERVA-VITORIA (CNPJ: 48.401.933/0001-17) - é esperado que seja zerado
                  const cnpjLimpo = c.cnpj_limpo || (c.cnpj ? c.cnpj.replace(/\D/g, '') : '');
                  if (cnpjLimpo === '48401933000117') {
                    return false; // Não é divergente, é esperado que seja zerado
                  }
                  
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
                  
                  // Verificar divergências (com tolerância de 0.01% e R$ 0.10 para arredondamentos)
                  const percentuaisOk = Math.abs(somaPercentuais - 100) < 0.01;
                  const valoresOk = capitalSocialNum > 0 && Math.abs(somaValores - capitalSocialNum) < 0.10;
                  
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
                const codigoSciA = String(a.codigo_sci || '').trim();
                const codigoSciB = String(b.codigo_sci || '').trim();
                
                if (ordenacaoParticipacao === 'a-z') {
                  return nomeA.localeCompare(nomeB);
                } else if (ordenacaoParticipacao === 'z-a') {
                  return nomeB.localeCompare(nomeA);
                } else if (ordenacaoParticipacao === 'cnpj') {
                  return cnpjA.localeCompare(cnpjB);
                } else if (ordenacaoParticipacao === 'codigo-sci') {
                  return codigoSciA.localeCompare(codigoSciB);
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
                
                // Verificar se os valores batem com o Capital Social (com tolerância de R$ 0.10 para arredondamentos)
                // Aumentamos a tolerância para R$ 0,10 devido a arredondamentos em múltiplos cálculos
                const valoresOk = capitalSocialNum > 0 && Math.abs(somaValores - capitalSocialNum) < 0.10;
                
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
                          {(cliente.capital_social !== null && cliente.capital_social !== undefined) && (
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
                                      : 'R$ 0,00';
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setClienteEditandoParticipacao(cliente);
                            setShowModalEdicaoParticipacao(true);
                          }}
                          className="p-2 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-all duration-300 flex items-center justify-center border border-blue-200 hover:border-blue-600"
                          title="Editar Capital Social e Participações dos Sócios"
                        >
                          <PencilIcon className="h-4 w-4" />
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
                              // Agora vamos recalcular os valores para garantir formatação correta
                              if (consultaConcluida) {
                                console.log('[Clientes] Consulta concluída! Os sócios foram atualizados automaticamente durante a extração.');
                                toast.info('Recalculando valores de participação...', 2000);
                                
                                // Aguardar o backend salvar completamente (a extração já atualizou os sócios)
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                try {
                                  // Recalcular valores de participação (incorporando a lógica do segundo botão)
                                  console.log('[Clientes] Recalculando valores de participação para cliente:', cliente.id);
                                  const recalculoResult = await clientesService.recalcularValoresParticipacao(cliente.id!);
                                  
                                  if (recalculoResult.success) {
                                    const atualizados = recalculoResult.data?.atualizados || 0;
                                    console.log('[Clientes] Valores recalculados com sucesso. Sócios atualizados:', atualizados);
                                    
                                    // Aguardar um pouco para garantir que o backend salvou
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                  } else {
                                    console.warn('[Clientes] Recalculo retornou erro, mas continuando:', recalculoResult.error);
                                    // Continuar mesmo se o recálculo falhar (os dados da Situação Fiscal já foram salvos)
                                  }
                                  
                                  // Buscar cliente atualizado (com valores recalculados)
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
                                    
                                    toast.success('Sócios atualizados e valores recalculados com sucesso!');
                                  } else {
                                    console.error('[Clientes] Formato de resposta inválido:', clienteAtualizado);
                                    toast.error('Erro ao obter dados atualizados do cliente');
                                  }
                                } catch (updateError: any) {
                                  console.error('[Clientes] Erro ao buscar cliente atualizado:', updateError);
                                  const errorMsg = updateError?.response?.data?.error || updateError?.message || 'Erro ao buscar dados atualizados';
                                  
                                  // Verificar se é erro de Capital Social Zerado
                                  const errorMsgLower = errorMsg.toLowerCase();
                                  if (errorMsgLower.includes('capital social zerado') || 
                                      errorMsgLower.includes('capital zerado') ||
                                      errorMsgLower.includes('capital social zero')) {
                                    toast.warning('Capital Social Zerado: Valores não podem ser recalculados, mas os sócios foram atualizados.');
                                  } else {
                                    toast.error(errorMsg);
                                  }
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
                                      ? `${socio.participacao_percentual.toFixed(2).replace('.', ',')}%`
                                      : '0,00%'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-right text-sm font-semibold text-green-700">
                                  {socio.participacao_valor !== null && socio.participacao_valor !== undefined
                                    ? socio.participacao_valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : 'R$ 0,00'}
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

      {/* Modal de Regime Tributário */}
      {showRegimeModal && (
        <>
          {/* Overlay com backdrop blur */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] animate-fade-in"
            onClick={() => {
              setShowRegimeModal(false);
              setClienteParaRegime(null);
              setRegimeSelecionado('');
            }}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Modal */}
              <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <BuildingOfficeIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Regime Tributário</h3>
                      <p className="text-sm text-white/90">
                        {clienteParaRegime?.razao_social || clienteParaRegime?.nome || 'Cliente'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowRegimeModal(false);
                      setClienteParaRegime(null);
                      setRegimeSelecionado('');
                    }}
                    className="text-white hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-white/10"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Body do Modal */}
              <div className="p-6">
                <p className="text-gray-700 mb-4 text-sm">
                  A Receita Federal não forneceu informações sobre o regime tributário. Por favor, selecione o regime adequado:
                </p>
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Selecione o Regime Tributário
                  </label>
                  <select
                    value={regimeSelecionado}
                    onChange={(e) => setRegimeSelecionado(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:border-gray-400"
                  >
                    <option value="">Selecione uma opção...</option>
                    <option value="Lucro Presumido">Lucro Presumido</option>
                    <option value="Lucro Real">Lucro Real</option>
                  </select>
                </div>

                {/* Botões */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSalvarRegimeTributario}
                    disabled={!regimeSelecionado || salvandoRegime}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-semibold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transform disabled:hover:scale-100"
                  >
                    {salvandoRegime ? (
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
                        Salvar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowRegimeModal(false);
                      setClienteParaRegime(null);
                      setRegimeSelecionado('');
                    }}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold transition-all duration-300 flex items-center gap-2 shadow-sm hover:shadow-md border border-gray-200 hover:scale-105 transform"
                  >
                    <XMarkIcon className="h-5 w-5" />
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de Exportação Personalizada */}
      {showExportModal && (
        <ExportClientesModal
          onClose={() => setShowExportModal(false)}
          onExport={handleExportarClientes}
        />
      )}

      {/* Modal de Edição Manual de Participação */}
      {showModalEdicaoParticipacao && clienteEditandoParticipacao && (
        <>
          {/* Overlay com backdrop blur */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] animate-fade-in"
            onClick={() => {
              setShowModalEdicaoParticipacao(false);
              setClienteEditandoParticipacao(null);
            }}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 overflow-y-auto">
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full transform transition-all animate-slide-up my-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Modal */}
              <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <PencilIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Editar Participação</h3>
                      <p className="text-sm text-white/90">
                        {clienteEditandoParticipacao.razao_social || clienteEditandoParticipacao.nome || 'Cliente'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowModalEdicaoParticipacao(false);
                      setClienteEditandoParticipacao(null);
                    }}
                    className="text-white hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-white/10"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Body do Modal */}
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {/* Capital Social */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Capital Social (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={clienteEditandoParticipacao.capital_social || 0}
                    id="capital-social-input"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:border-gray-400"
                    placeholder="0.00"
                  />
                </div>

                {/* Sócios */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Participações dos Sócios
                  </label>
                  <div className="space-y-4">
                    {((clienteEditandoParticipacao as any).socios || []).map((socio: any, idx: number) => (
                      <div key={socio.id || idx} className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50">
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold text-gray-800">{socio.nome || 'Sem nome'}</h4>
                          {socio.cpf && (
                            <p className="text-xs text-gray-500">CPF/CNPJ: {formatarCpfCnpj(socio.cpf)}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Participação (%)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              defaultValue={socio.participacao_percentual !== null && socio.participacao_percentual !== undefined 
                                ? parseFloat(String(socio.participacao_percentual)) 
                                : 0}
                              data-socio-id={socio.id}
                              data-field="participacao_percentual"
                              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Valor (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={socio.participacao_valor !== null && socio.participacao_valor !== undefined 
                                ? parseFloat(String(socio.participacao_valor)) 
                                : 0}
                              data-socio-id={socio.id}
                              data-field="participacao_valor"
                              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!(clienteEditandoParticipacao as any).socios || (clienteEditandoParticipacao as any).socios.length === 0) && (
                      <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <p className="text-sm text-gray-500">Nenhum sócio cadastrado</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botões */}
                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={async () => {
                      if (!clienteEditandoParticipacao?.id) return;
                      
                      setEditandoParticipacao(true);
                      try {
                        // Coletar dados do formulário
                        const capitalSocialInput = document.getElementById('capital-social-input') as HTMLInputElement;
                        const capitalSocial = capitalSocialInput ? parseFloat(capitalSocialInput.value) || 0 : 0;
                        
                        const sociosAtualizados = ((clienteEditandoParticipacao as any).socios || []).map((socio: any) => {
                          const percentualInput = document.querySelector(`[data-socio-id="${socio.id}"][data-field="participacao_percentual"]`) as HTMLInputElement;
                          const valorInput = document.querySelector(`[data-socio-id="${socio.id}"][data-field="participacao_valor"]`) as HTMLInputElement;
                          
                          return {
                            id: socio.id,
                            participacao_percentual: percentualInput ? parseFloat(percentualInput.value) || 0 : 0,
                            participacao_valor: valorInput ? parseFloat(valorInput.value) || 0 : 0,
                          };
                        });
                        
                        // Chamar API para salvar
                        const result = await clientesService.editarParticipacaoManual(
                          clienteEditandoParticipacao.id,
                          capitalSocial,
                          sociosAtualizados
                        );
                        
                        if (result.success) {
                          toast.success('Participação atualizada com sucesso!');
                          
                          // Atualizar cliente na lista
                          if (activeTab === 'participacao') {
                            const clienteAtualizado = await clientesService.obterCliente(clienteEditandoParticipacao.id);
                            if (clienteAtualizado && typeof clienteAtualizado === 'object') {
                              let clienteComSocios: Cliente;
                              if ((clienteAtualizado as any).success && (clienteAtualizado as any).data) {
                                clienteComSocios = (clienteAtualizado as any).data as Cliente;
                              } else if ((clienteAtualizado as any).id) {
                                clienteComSocios = clienteAtualizado as Cliente;
                              } else {
                                throw new Error('Formato de resposta inválido');
                              }
                              
                              setClientesParticipacao(prevClientes => 
                                prevClientes.map(c => c.id === clienteEditandoParticipacao.id ? clienteComSocios : c)
                              );
                            }
                          }
                          
                          // Fechar modal
                          setShowModalEdicaoParticipacao(false);
                          setClienteEditandoParticipacao(null);
                        } else {
                          throw new Error(result.error || 'Erro ao atualizar participação');
                        }
                      } catch (error: any) {
                        console.error('[Clientes] Erro ao editar participação:', error);
                        toast.error(error?.response?.data?.error || error?.message || 'Erro ao atualizar participação');
                      } finally {
                        setEditandoParticipacao(false);
                      }
                    }}
                    disabled={editandoParticipacao || !clienteEditandoParticipacao?.id}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-semibold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transform disabled:hover:scale-100"
                  >
                    {editandoParticipacao ? (
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
                        Concluir
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowModalEdicaoParticipacao(false);
                      setClienteEditandoParticipacao(null);
                    }}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold transition-all duration-300 flex items-center gap-2 shadow-sm hover:shadow-md border border-gray-200 hover:scale-105 transform"
                  >
                    <XMarkIcon className="h-5 w-5" />
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
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
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out;
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
