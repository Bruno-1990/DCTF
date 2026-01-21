import React, { useState, useEffect } from 'react';
import {
  BuildingOfficeIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { clientesService } from '../../../services/clientes';
import type { Cliente } from '../../../types';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export interface ClientProfileData {
  cliente_id: string | null; // ID do cliente (string conforme tipo Cliente)
  razao_social?: string; // Razão social extraída do SPED (opcional, só para exibição)
  competencia: string; // YYYY-MM
  segmento: string | null; // Pode ser null se não for detectado automaticamente
  regime_tributario: string | null; // Pode ser null se não for detectado automaticamente
  opera_st: boolean;
  regime_especial: boolean;
  opera_difal: boolean;
  opera_fcp: boolean;
  opera_interestadual: boolean;
}

// Usando o tipo Cliente do sistema

interface Step1ClientProfileProps {
  onNext: (profile: ClientProfileData) => void;
  initialData?: Partial<ClientProfileData>;
}

// Função auxiliar para obter competência atual
const getCurrentCompetencia = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const Step1ClientProfile: React.FC<Step1ClientProfileProps> = ({
  onNext,
  initialData = {},
}) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscaCliente, setBuscaCliente] = useState<string>('');
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState<boolean>(false);
  const [loadingClientes, setLoadingClientes] = useState<boolean>(false);
  
  // Inicializar formData com initialData se disponível
  const getInitialFormData = (): ClientProfileData => {
    if (initialData && Object.keys(initialData).length > 0) {
      return {
        cliente_id: initialData.cliente_id ?? null,
        competencia: initialData.competencia || getCurrentCompetencia(),
        segmento: initialData.segmento || '',
        regime_tributario: initialData.regime_tributario || '',
        opera_st: initialData.opera_st ?? false,
        regime_especial: initialData.regime_especial ?? false,
        opera_difal: initialData.opera_difal ?? false,
        opera_fcp: initialData.opera_fcp ?? false,
        opera_interestadual: initialData.opera_interestadual ?? false,
      };
    }
    return {
      cliente_id: null,
      competencia: getCurrentCompetencia(),
      segmento: '',
      regime_tributario: '',
      opera_st: false,
      regime_especial: false,
      opera_difal: false,
      opera_fcp: false,
      opera_interestadual: false,
    };
  };

  const [formData, setFormData] = useState<ClientProfileData>(getInitialFormData());
  
  const [erros, setErros] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Buscar clientes quando buscaCliente muda
  useEffect(() => {
    if (buscaCliente.length >= 2) {
      buscarClientes(buscaCliente);
    } else {
      setClientes([]);
      setMostrarSugestoes(false);
    }
  }, [buscaCliente]);

  // Aplicar initialData quando componente for montado com dados já disponíveis
  useEffect(() => {
    console.log('[Step1ClientProfile] useEffect montagem executado');
    console.log('[Step1ClientProfile] initialData na montagem:', initialData);
    console.log('[Step1ClientProfile] initialData keys:', initialData ? Object.keys(initialData) : 'null');
    
    if (initialData && Object.keys(initialData).length > 0) {
      console.log('[Step1ClientProfile] Aplicando initialData na montagem:', initialData);
      console.log('[Step1ClientProfile] Valores do initialData:');
      console.log('  - cliente_id:', initialData.cliente_id);
      console.log('  - razao_social:', initialData.razao_social);
      console.log('  - competencia:', initialData.competencia);
      console.log('  - segmento:', initialData.segmento);
      console.log('  - regime_tributario:', initialData.regime_tributario);
      console.log('  - opera_st:', initialData.opera_st);
      console.log('  - opera_difal:', initialData.opera_difal);
      console.log('  - opera_fcp:', initialData.opera_fcp);
      console.log('  - opera_interestadual:', initialData.opera_interestadual);
      
      // Preencher campo de busca com razão social extraída do SPED se disponível (SEMPRE, mesmo se já tiver valor)
      if (initialData.razao_social) {
        console.log('[Step1ClientProfile] 📝 FORÇANDO preenchimento do campo de busca com razão social extraída:', initialData.razao_social);
        setBuscaCliente(initialData.razao_social);
      }
      
      setFormData((prev) => {
        const updated = {
          cliente_id: initialData.cliente_id !== undefined && initialData.cliente_id !== null ? initialData.cliente_id : prev.cliente_id,
          competencia: initialData.competencia || prev.competencia,
          segmento: initialData.segmento || prev.segmento,
          regime_tributario: initialData.regime_tributario || prev.regime_tributario,
          opera_st: initialData.opera_st !== undefined ? initialData.opera_st : prev.opera_st,
          regime_especial: initialData.regime_especial !== undefined ? initialData.regime_especial : prev.regime_especial,
          opera_difal: initialData.opera_difal !== undefined ? initialData.opera_difal : prev.opera_difal,
          opera_fcp: initialData.opera_fcp !== undefined ? initialData.opera_fcp : prev.opera_fcp,
          opera_interestadual: initialData.opera_interestadual !== undefined ? initialData.opera_interestadual : prev.opera_interestadual,
        };
        console.log('[Step1ClientProfile] formData atualizado na montagem:', updated);
        console.log('[Step1ClientProfile] Valores do formData atualizado:');
        console.log('  - cliente_id:', updated.cliente_id);
        console.log('  - competencia:', updated.competencia);
        console.log('  - segmento:', updated.segmento);
        console.log('  - regime_tributario:', updated.regime_tributario);
        console.log('  - opera_st:', updated.opera_st);
        console.log('  - opera_difal:', updated.opera_difal);
        console.log('  - opera_fcp:', updated.opera_fcp);
        console.log('  - opera_interestadual:', updated.opera_interestadual);
        return updated;
      });
    } else {
      console.log('[Step1ClientProfile] initialData vazio ou null na montagem');
    }
  }, []); // Executar apenas na montagem

  // Carregar perfil do cliente se cliente_id foi fornecido
  useEffect(() => {
    if (formData.cliente_id && !clienteSelecionado) {
      console.log('[Step1ClientProfile] 🔄 Detectado cliente_id sem cliente carregado. Carregando...');
      carregarCliente(formData.cliente_id);
    }
  }, [formData.cliente_id, clienteSelecionado]);

  // Atualizar campo de busca quando cliente é selecionado (garantir sincronização)
  useEffect(() => {
    if (clienteSelecionado) {
      const nomeCliente = clienteSelecionado.razao_social || clienteSelecionado.nome || '';
      // Sempre atualizar o campo quando o cliente mudar (forçar atualização)
      setBuscaCliente(nomeCliente);
      console.log('[Step1ClientProfile] 📝 useEffect: Campo buscaCliente atualizado para:', nomeCliente);
      console.log('[Step1ClientProfile] 👤 Cliente selecionado:', {
        id: clienteSelecionado.id,
        razao_social: nomeCliente,
        cnpj: clienteSelecionado.cnpj,
        cnae: clienteSelecionado.atividade_principal_code
      });
    }
  }, [clienteSelecionado?.id]);

  // Atualizar formData quando initialData mudar (dados extraídos do SPED)
  useEffect(() => {
    console.log('[Step1ClientProfile] useEffect de mudança de initialData executado');
    console.log('[Step1ClientProfile] initialData recebido:', initialData);
    console.log('[Step1ClientProfile] formData atual antes da atualização:', formData);
    
    // Verificar se initialData tem dados válidos para preencher
    if (!initialData || Object.keys(initialData).length === 0) {
      console.log('[Step1ClientProfile] initialData vazio, ignorando');
      return;
    }

    // Preencher campo de busca com razão social extraída do SPED se disponível (SEMPRE que mudar)
    if (initialData.razao_social) {
      console.log('[Step1ClientProfile] 📝 FORÇANDO preenchimento do campo de busca com razão social extraída:', initialData.razao_social);
      setBuscaCliente(initialData.razao_social);
    }

    // Sempre aplicar dados do initialData quando disponível
    console.log('[Step1ClientProfile] Aplicando dados do initialData ao formData');
    console.log('[Step1ClientProfile] Valores recebidos:');
    console.log('  - competencia:', initialData.competencia);
    console.log('  - segmento:', initialData.segmento);
    console.log('  - regime_tributario:', initialData.regime_tributario);
    console.log('  - opera_st:', initialData.opera_st);
    console.log('  - opera_difal:', initialData.opera_difal);
    console.log('  - opera_fcp:', initialData.opera_fcp);
    console.log('  - opera_interestadual:', initialData.opera_interestadual);
    
    setFormData((prev) => {
      const updated = {
        cliente_id: initialData.cliente_id !== undefined && initialData.cliente_id !== null ? initialData.cliente_id : prev.cliente_id,
        competencia: initialData.competencia ? initialData.competencia : prev.competencia,
        segmento: initialData.segmento ? initialData.segmento : prev.segmento,
        regime_tributario: initialData.regime_tributario ? initialData.regime_tributario : prev.regime_tributario,
        opera_st: initialData.opera_st !== undefined ? initialData.opera_st : prev.opera_st,
        regime_especial: initialData.regime_especial !== undefined ? initialData.regime_especial : prev.regime_especial,
        opera_difal: initialData.opera_difal !== undefined ? initialData.opera_difal : prev.opera_difal,
        opera_fcp: initialData.opera_fcp !== undefined ? initialData.opera_fcp : prev.opera_fcp,
        opera_interestadual: initialData.opera_interestadual !== undefined ? initialData.opera_interestadual : prev.opera_interestadual,
      };
      console.log('[Step1ClientProfile] formData APÓS atualização:', updated);
      console.log('[Step1ClientProfile] Verificação de cada campo:');
      console.log('  - competencia atualizada?', prev.competencia, '->', updated.competencia);
      console.log('  - segmento atualizado?', prev.segmento, '->', updated.segmento);
      console.log('  - regime_tributario atualizado?', prev.regime_tributario, '->', updated.regime_tributario);
      console.log('  - opera_st atualizada?', prev.opera_st, '->', updated.opera_st);
      return updated;
    });

    // Se cliente_id foi fornecido, carregar dados do cliente
    if (initialData.cliente_id && !clienteSelecionado) {
      console.log('[Step1ClientProfile] Carregando cliente do initialData:', initialData.cliente_id);
      carregarCliente(initialData.cliente_id);
    } else if (initialData.cliente_id && clienteSelecionado && clienteSelecionado.id !== initialData.cliente_id) {
      // Se o cliente mudou, recarregar
      console.log('[Step1ClientProfile] Cliente mudou, recarregando:', initialData.cliente_id);
      carregarCliente(initialData.cliente_id);
    }
  }, [
    initialData?.competencia, 
    initialData?.segmento, 
    initialData?.regime_tributario, 
    initialData?.cliente_id, 
    initialData?.razao_social,
    initialData?.opera_st, 
    initialData?.opera_difal, 
    initialData?.opera_fcp, 
    initialData?.opera_interestadual,
    clienteSelecionado,
    buscaCliente
  ]);

  const buscarClientes = async (termo: string) => {
    try {
      setLoadingClientes(true);
      // Usar o serviço de clientes com parâmetro search
      const response = await clientesService.getAll({
        search: termo,
        limit: 10,
      });
      
      if (response && response.items && Array.isArray(response.items)) {
        setClientes(response.items);
        setMostrarSugestoes(true);
      } else {
        setClientes([]);
      }
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      setClientes([]);
    } finally {
      setLoadingClientes(false);
    }
  };

  // Função para determinar segmento baseado no CNAE do cliente
  const determinarSegmentoPorCNAE = (cliente: Cliente): string | null => {
    const cnae = cliente.atividade_principal_code;
    if (!cnae) {
      console.log('[Step1ClientProfile] ⚠️ Cliente sem CNAE, retornando null');
      return null;
    }

    const cnaeNum = String(cnae).replace(/\D/g, '');
    console.log('[Step1ClientProfile] 🔍 Analisando CNAE:', cnaeNum, 'do cliente:', cliente.razao_social || cliente.nome);
    
    // CNAEs específicos de Bebidas (47.11-0 = Comércio varejista de bebidas)
    // IMPORTANTE: Verificar apenas CNAEs específicos de bebidas, não genéricos de comércio
    if (cnaeNum.startsWith('4711')) {
      console.log('[Step1ClientProfile] ✅ CNAE identificado como BEBIDAS:', cnaeNum);
      return 'BEBIDAS';
    }
    
    // CNAEs de Indústria (geralmente começam com 10-33)
    if (cnaeNum.match(/^(10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33)/)) {
      console.log('[Step1ClientProfile] ✅ CNAE identificado como INDUSTRIA:', cnaeNum);
      return 'INDUSTRIA';
    }
    
    // CNAEs de E-commerce (47.81-0, 47.89-9, etc.)
    if (cnaeNum.startsWith('4781') || cnaeNum.startsWith('4789')) {
      console.log('[Step1ClientProfile] ✅ CNAE identificado como ECOMMERCE:', cnaeNum);
      return 'ECOMMERCE';
    }
    
    // CNAEs de Comércio (45-47, exceto os específicos já tratados acima)
    // 46 = Comércio atacadista
    // 47 = Comércio varejista (exceto 4711 que é bebidas e 4781/4789 que são e-commerce)
    if (cnaeNum.match(/^(45|46|47)/) && !cnaeNum.startsWith('4711') && !cnaeNum.startsWith('4781') && !cnaeNum.startsWith('4789')) {
      console.log('[Step1ClientProfile] ✅ CNAE identificado como COMERCIO:', cnaeNum);
      return 'COMERCIO';
    }
    
    // Padrão: Comércio para outros casos (maioria dos casos)
    console.log('[Step1ClientProfile] ⚠️ CNAE não identificado, usando padrão COMERCIO:', cnaeNum);
    return 'COMERCIO';
  };

  const carregarCliente = async (clienteId: string) => {
    try {
      console.log('[Step1ClientProfile] 🔍 Carregando cliente por ID:', clienteId);
      const cliente = await clientesService.getById(clienteId);
      if (cliente) {
        console.log('[Step1ClientProfile] ✅ Cliente carregado:', {
          id: cliente.id,
          razao_social: cliente.razao_social,
          nome: cliente.nome,
          cnae: cliente.atividade_principal_code
        });
        
        // Preencher campo de busca com nome do cliente ANTES de setar o cliente selecionado
        const nomeCliente = cliente.razao_social || cliente.nome || '';
        console.log('[Step1ClientProfile] 📝 Preenchendo campo de busca com:', nomeCliente);
        setBuscaCliente(nomeCliente);
        
        // Setar cliente selecionado
        setClienteSelecionado(cliente);
        
        // Determinar segmento do cliente
        const segmentoCliente = determinarSegmentoPorCNAE(cliente);
        
        // Mapear regime tributário do cliente para o formato esperado
        let regimeCliente = null;
        if (cliente.regime_tributario) {
          const regimeLower = cliente.regime_tributario.toLowerCase();
          if (regimeLower.includes('simples')) {
            regimeCliente = 'SIMPLES_NACIONAL';
          } else if (regimeLower.includes('presumido')) {
            regimeCliente = 'LUCRO_PRESUMIDO';
          } else if (regimeLower.includes('real')) {
            regimeCliente = 'LUCRO_REAL';
          }
        }
        
        // Atualizar formData com dados do cliente
        setFormData((prev) => {
          const updated = {
            ...prev,
            cliente_id: cliente.id,
            // Só atualizar segmento se não foi preenchido pelo initialData ou se está vazio
            segmento: prev.segmento || segmentoCliente || '',
            // Só atualizar regime se não foi preenchido pelo initialData ou se está vazio
            regime_tributario: prev.regime_tributario || regimeCliente || '',
          };
          console.log('[Step1ClientProfile] 📊 formData atualizado:', {
            cliente_id: updated.cliente_id,
            segmento: updated.segmento,
            regime_tributario: updated.regime_tributario
          });
          return updated;
        });
        
        console.log('[Step1ClientProfile] ✅ Cliente carregado e campos atualizados');
      } else {
        console.warn('[Step1ClientProfile] ⚠️ Cliente não encontrado para ID:', clienteId);
      }
    } catch (error) {
      console.error('[Step1ClientProfile] ❌ Erro ao carregar cliente:', error);
    }
  };

  const handleSelectCliente = (cliente: Cliente) => {
    console.log('[Step1ClientProfile] 👤 Selecionando cliente:', {
      id: cliente.id,
      razao_social: cliente.razao_social,
      nome: cliente.nome,
      cnae: cliente.atividade_principal_code
    });
    
    // Preencher campo de busca com nome do cliente PRIMEIRO
    const nomeCliente = cliente.razao_social || cliente.nome || '';
    console.log('[Step1ClientProfile] 📝 Preenchendo campo de busca com:', nomeCliente);
    setBuscaCliente(nomeCliente);
    
    // Setar cliente selecionado
    setClienteSelecionado(cliente);
    
    // Determinar segmento do cliente
    const segmentoCliente = determinarSegmentoPorCNAE(cliente);
    
    // Mapear regime tributário do cliente para o formato esperado
    let regimeCliente = null;
    if (cliente.regime_tributario) {
      const regimeLower = cliente.regime_tributario.toLowerCase();
      if (regimeLower.includes('simples')) {
        regimeCliente = 'SIMPLES_NACIONAL';
      } else if (regimeLower.includes('presumido')) {
        regimeCliente = 'LUCRO_PRESUMIDO';
      } else if (regimeLower.includes('real')) {
        regimeCliente = 'LUCRO_REAL';
      }
    }
    
    // Atualizar formData com dados do cliente
    setFormData((prev) => {
      const updated = {
        ...prev,
        cliente_id: cliente.id,
        // Só atualizar segmento se não foi preenchido pelo initialData ou se está vazio
        segmento: prev.segmento || segmentoCliente || '',
        // Só atualizar regime se não foi preenchido pelo initialData ou se está vazio
        regime_tributario: prev.regime_tributario || regimeCliente || '',
      };
      console.log('[Step1ClientProfile] 📊 formData atualizado:', {
        cliente_id: updated.cliente_id,
        segmento: updated.segmento,
        regime_tributario: updated.regime_tributario
      });
      return updated;
    });
    
    setMostrarSugestoes(false);
    setClientes([]);
    
    console.log('[Step1ClientProfile] ✅ Cliente selecionado e campos atualizados');
  };

  const handleInputChange = (field: keyof ClientProfileData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Limpar erro do campo quando usuário começar a editar
    if (erros[field]) {
      setErros((prev) => {
        const novo = { ...prev };
        delete novo[field];
        return novo;
      });
    }
  };

  const validateForm = (): boolean => {
    const novosErros: Record<string, string> = {};

    // Validar razão social: aceitar se cliente_id OU razão social preenchida (manual ou extraída do SPED)
    const temRazaoSocial = buscaCliente && buscaCliente.trim().length > 0;
    const temClienteId = formData.cliente_id;
    const temRazaoSocialExtraida = initialData?.razao_social && initialData.razao_social.trim().length > 0;
    
    if (!temClienteId && !temRazaoSocial && !temRazaoSocialExtraida) {
      novosErros.cliente_id = 'Cliente é obrigatório';
    }

    if (!formData.competencia) {
      novosErros.competencia = 'Competência é obrigatória';
    } else {
      // Validar formato YYYY-MM
      const regex = /^\d{4}-\d{2}$/;
      if (!regex.test(formData.competencia)) {
        novosErros.competencia = 'Formato inválido. Use YYYY-MM';
      }
    }

    if (!formData.segmento) {
      novosErros.segmento = 'Segmento é obrigatório';
    }

    if (!formData.regime_tributario) {
      novosErros.regime_tributario = 'Regime tributário é obrigatório';
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      setIsSubmitting(true);
      try {
        // Se não tem cliente_id mas tem razão social, incluir razão social no formData
        const dadosParaEnviar: ClientProfileData = {
          ...formData,
          razao_social: buscaCliente || initialData?.razao_social || undefined
        };
        await onNext(dadosParaEnviar);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Removida navegação automática - usuário deve clicar no botão "Avançar"

  const segmentos = [
    { value: 'COMERCIO', label: 'Comércio' },
    { value: 'BEBIDAS', label: 'Bebidas' },
    { value: 'INDUSTRIA', label: 'Indústria' },
    { value: 'ECOMMERCE', label: 'E-commerce' },
  ];

  const regimes = [
    { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
    { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
    { value: 'LUCRO_REAL', label: 'Lucro Real' },
  ];

  // Log para debug do render
  console.log('[Step1ClientProfile] RENDER - formData atual:', formData);
  console.log('[Step1ClientProfile] RENDER - initialData:', initialData);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Seleção de Cliente e Perfil Fiscal
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Razão Social */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Razão Social <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={buscaCliente || ''}
                onChange={(e) => {
                  const novoValor = e.target.value;
                  setBuscaCliente(novoValor);
                  console.log('[Step1ClientProfile] 🔄 Campo de busca alterado para:', novoValor);
                  if (!novoValor) {
                    setClienteSelecionado(null);
                    handleInputChange('cliente_id', null);
                  }
                }}
                onFocus={() => {
                  if (buscaCliente.length >= 2) {
                    setMostrarSugestoes(true);
                  }
                }}
                placeholder="Buscar cliente por nome ou CNPJ..."
                disabled={loadingClientes}
                readOnly={false}
                className={classNames(
                  'block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
                  erros.cliente_id ? 'border-red-300' : 'border-gray-300',
                  loadingClientes ? 'opacity-50 cursor-not-allowed' : ''
                )}
              />
              
              {mostrarSugestoes && clientes.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  {clientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => handleSelectCliente(cliente)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                    >
                      <div className="font-medium text-gray-900">{cliente.razao_social || cliente.nome || ''}</div>
                      <div className="text-sm text-gray-500">{cliente.cnpj}</div>
                      {cliente.fantasia && (
                        <div className="text-xs text-gray-400">{cliente.fantasia}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {erros.cliente_id && (
              <p className="mt-1 text-sm text-red-600">{erros.cliente_id}</p>
            )}
            {initialData?.razao_social && !clienteSelecionado && (
              <p className="mt-1 text-xs text-blue-600">
                ℹ️ Razão social extraída do SPED: <strong>{initialData.razao_social}</strong> - Verifique se corresponde ao cliente selecionado
              </p>
            )}
          </div>

          {/* Competência */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Competência <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="month"
                value={formData.competencia}
                onChange={(e) => handleInputChange('competencia', e.target.value)}
                className={classNames(
                  'block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
                  erros.competencia ? 'border-red-300' : 'border-gray-300'
                )}
              />
            </div>
            {erros.competencia && (
              <p className="mt-1 text-sm text-red-600">{erros.competencia}</p>
            )}
          </div>

          {/* Segmento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Segmento <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.segmento || ''}
              onChange={(e) => handleInputChange('segmento', e.target.value)}
              className={classNames(
                'block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
                erros.segmento ? 'border-red-300' : 'border-gray-300'
              )}
            >
              <option value="">Selecione um segmento</option>
              {segmentos.map((seg) => (
                <option key={seg.value} value={seg.value}>
                  {seg.label}
                </option>
              ))}
            </select>
            {erros.segmento && (
              <p className="mt-1 text-sm text-red-600">{erros.segmento}</p>
            )}
          </div>

          {/* Regime Tributário */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Regime Tributário <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.regime_tributario || ''}
              onChange={(e) => handleInputChange('regime_tributario', e.target.value)}
              className={classNames(
                'block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
                erros.regime_tributario ? 'border-red-300' : 'border-gray-300'
              )}
            >
              <option value="">Selecione um regime</option>
              {regimes.map((reg) => (
                <option key={reg.value} value={reg.value}>
                  {reg.label}
                </option>
              ))}
            </select>
            {erros.regime_tributario && (
              <p className="mt-1 text-sm text-red-600">{erros.regime_tributario}</p>
            )}
          </div>

          {/* Flags Fiscais */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Configurações Fiscais</h3>
            
            <div className="space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.opera_st}
                  onChange={(e) => handleInputChange('opera_st', e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Opera com Substituição Tributária (ST)?</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.regime_especial}
                  onChange={(e) => handleInputChange('regime_especial', e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Está em regime especial?</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.opera_difal}
                  onChange={(e) => handleInputChange('opera_difal', e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Opera com DIFAL?</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.opera_fcp}
                  onChange={(e) => handleInputChange('opera_fcp', e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Opera com FCP?</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.opera_interestadual}
                  onChange={(e) => handleInputChange('opera_interestadual', e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Opera interestadual?</span>
              </label>
            </div>
          </div>

          {/* Botão Avançar */}
          <div className="pt-6 border-t border-gray-200">
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center px-6 py-3 text-base font-semibold rounded-lg shadow-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processando...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mr-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                    Avançar
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Step1ClientProfile;

