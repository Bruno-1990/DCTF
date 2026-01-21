import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientesService } from '../services';
import type { Cliente } from '../types';
import {
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  ArrowLeftIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

/**
 * Função para aplicar máscara de CNAE (XXXX-X/XX)
 */
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

/**
 * Função para limpar máscara do CNAE
 */
const limparCNAE = (valor: string): string => {
  return valor.replace(/\D/g, '');
};

interface GrupoCNAE {
  nome: string;
  palavrasChave: string[];
  cnaes: Array<{ codigo: string; descricao: string }>;
}

const ClientesCNAE: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  // Estados
  const [cnaeInput, setCnaeInput] = useState(''); // Input temporário para digitar CNAE
  const [cnaesSelecionados, setCnaesSelecionados] = useState<string[]>([]); // Tags de CNAEs
  const [grupos, setGrupos] = useState<GrupoCNAE[]>([]);
  const [gruposSelecionados, setGruposSelecionados] = useState<string[]>([]); // Grupos selecionados
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [buscou, setBuscou] = useState(false);

  // Carregar grupos ao montar componente
  useEffect(() => {
    carregarGrupos();
  }, []);

  const carregarGrupos = async () => {
    setLoadingGrupos(true);
    try {
      const response = await clientesService.buscarGruposCNAE();
      console.log('[ClientesCNAE] Resposta da API de grupos:', response);
      if (response.success && response.data) {
        const gruposArray = Array.isArray(response.data) ? response.data : [];
        console.log('[ClientesCNAE] Grupos carregados:', gruposArray.length, gruposArray);
        setGrupos(gruposArray);
      } else {
        console.warn('[ClientesCNAE] Resposta sem sucesso ou sem dados:', response);
        setGrupos([]);
      }
    } catch (error) {
      console.error('[ClientesCNAE] Erro ao carregar grupos CNAE:', error);
      showToast('Erro ao carregar grupos CNAE', 'error');
      setGrupos([]);
    } finally {
      setLoadingGrupos(false);
    }
  };

  const handleCnaeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    const cnaeFormatado = aplicarMascaraCNAE(valor);
    setCnaeInput(cnaeFormatado);
  };

  const handleCnaeInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      adicionarCNAE();
    } else if (e.key === 'Backspace' && cnaeInput === '' && cnaesSelecionados.length > 0) {
      // Remover último CNAE se input estiver vazio e pressionar backspace
      removerCNAE(cnaesSelecionados.length - 1);
    }
  };

  const adicionarCNAE = () => {
    const cnaeLimpo = limparCNAE(cnaeInput);
    if (cnaeLimpo.length < 2) {
      showToast('O código CNAE deve ter pelo menos 2 dígitos', 'warning');
      return;
    }

    // Formatar CNAE para exibição
    const cnaeFormatado = aplicarMascaraCNAE(cnaeLimpo);
    
    // Verificar se já não está na lista
    if (!cnaesSelecionados.includes(cnaeFormatado)) {
      setCnaesSelecionados([...cnaesSelecionados, cnaeFormatado]);
      setCnaeInput('');
    } else {
      showToast('Este CNAE já foi adicionado', 'warning');
    }
  };

  const removerCNAE = (index: number) => {
    setCnaesSelecionados(cnaesSelecionados.filter((_, i) => i !== index));
  };

  const toggleGrupo = (grupoNome: string) => {
    setGruposSelecionados(prev => {
      if (prev.includes(grupoNome)) {
        return prev.filter(g => g !== grupoNome);
      } else {
        return [...prev, grupoNome];
      }
    });
  };

  const handleBuscar = async () => {
    // Validar que há pelo menos um critério
    if (cnaesSelecionados.length === 0 && gruposSelecionados.length === 0) {
      showToast('Selecione pelo menos um grupo ou adicione um CNAE', 'warning');
      return;
    }

    setLoading(true);
    setBuscou(true);

    try {
      // Converter CNAEs formatados para limpos (apenas números)
      const cnaesLimpos = cnaesSelecionados.map(cnae => limparCNAE(cnae));
      
      const criterios = {
        cnaes: cnaesLimpos,
        grupos: gruposSelecionados,
      };
      
      console.log('[ClientesCNAE] Buscando com critérios:', {
        cnaesFormatados: cnaesSelecionados,
        cnaesLimpos: cnaesLimpos,
        grupos: gruposSelecionados,
        criteriosEnviados: criterios
      });
      
      const response = await clientesService.buscarPorMultiplosCNAEsEGrupos(criterios);
      
      console.log('[ClientesCNAE] Resposta da busca:', {
        success: response.success,
        total: response.total,
        criteriosRetornados: response.criterios,
        clientesEncontrados: response.data?.length || 0
      });
      
      if (response.success && response.data) {
        setClientes(Array.isArray(response.data) ? response.data : []);
        if (response.total === 0) {
          showToast('Nenhum cliente encontrado com os critérios selecionados', 'info');
        } else {
          const mensagem = gruposSelecionados.length > 0 && cnaesLimpos.length > 0
            ? `${response.total} cliente(s) encontrado(s) (${gruposSelecionados.length} grupo(s) + ${cnaesLimpos.length} CNAE(s))`
            : gruposSelecionados.length > 0
            ? `${response.total} cliente(s) encontrado(s) (${gruposSelecionados.length} grupo(s))`
            : `${response.total} cliente(s) encontrado(s) (${cnaesLimpos.length} CNAE(s))`;
          showToast(mensagem, 'success');
        }
      } else {
        setClientes([]);
        showToast(response.error || 'Erro ao buscar clientes', 'error');
      }
    } catch (error: any) {
      console.error('[ClientesCNAE] Erro ao buscar por CNAE:', error);
      setClientes([]);
      showToast('Erro ao buscar clientes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const limparFiltros = () => {
    setCnaesSelecionados([]);
    setGruposSelecionados([]);
    setCnaeInput('');
    setClientes([]);
    setBuscou(false);
  };

  const formatarCNPJ = (cnpj: string | undefined): string => {
    if (!cnpj) return '';
    const limpo = String(cnpj).replace(/\D/g, '');
    if (limpo.length !== 14) return cnpj;
    return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const formatarCNAE = (cnae: string | undefined): string => {
    if (!cnae) return '';
    const limpo = String(cnae).replace(/\D/g, '');
    if (limpo.length < 5) return cnae;
    return limpo.replace(/^(\d{4})(\d{1})(\d{2})$/, '$1-$2/$3');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/clientes')}
            className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Voltar para Clientes
          </button>
          <div className="flex items-center gap-3">
            <DocumentTextIcon className="h-8 w-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Busca por CNAE</h1>
              <p className="text-gray-600 mt-1">
                Encontre clientes por grupos de atividades ou CNAEs específicos
              </p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="space-y-6">
            {/* Grupos CNAE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Grupos de Atividades (Selecione múltiplos)
              </label>
              {loadingGrupos ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-6 w-6 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="ml-3 text-gray-600">Carregando grupos...</span>
                </div>
              ) : grupos.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum grupo disponível</p>
              ) : (
                <>
                  <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                    {grupos.map((grupo) => {
                      const isSelected = gruposSelecionados.includes(grupo.nome);
                      return (
                        <div
                          key={grupo.nome}
                          className={`flex items-center space-x-3 px-4 py-3 border-b border-gray-100 last:border-b-0 ${
                            isSelected
                              ? 'bg-purple-50'
                              : 'bg-white hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleGrupo(grupo.nome);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded border-2 border-gray-400 bg-white text-purple-600 focus:ring-purple-500 focus:ring-2 focus:ring-offset-1 cursor-pointer flex-shrink-0"
                            style={{
                              accentColor: '#9333ea',
                              minWidth: '20px',
                              minHeight: '20px'
                            }}
                            aria-label={`Selecionar grupo ${grupo.nome}`}
                          />
                          <span className={`text-sm font-medium flex-1 cursor-pointer ${
                            isSelected ? 'text-purple-900' : 'text-gray-700'
                          }`}
                          onClick={() => toggleGrupo(grupo.nome)}
                          >
                            {grupo.nome}
                            <span className="text-xs text-gray-500 ml-2 font-normal">
                              ({grupo.cnaes.length} CNAEs)
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {gruposSelecionados.length > 0 && (
                    <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="text-sm text-purple-700 font-medium">
                        {gruposSelecionados.length} grupo(s) selecionado(s): {gruposSelecionados.join(', ')}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* CNAEs Individuais */}
            <div>
              <label htmlFor="cnae" className="block text-sm font-medium text-gray-700 mb-2">
                CNAEs Específicos
              </label>
              {/* Campo de input com tags integradas */}
              <div className="relative">
                <div className={`flex flex-wrap items-center gap-2 min-h-[3rem] py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-purple-500 bg-white ${
                  cnaesSelecionados.length === 0 ? 'px-4' : 'px-2'
                }`}>
                  {/* Ícone dentro do campo (apenas quando não há tags) */}
                  {cnaesSelecionados.length === 0 && (
                    <DocumentTextIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  )}
                  
                  {/* Tags dentro do campo */}
                  {cnaesSelecionados.map((cnae, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                    >
                      {cnae}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removerCNAE(index);
                        }}
                        className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                        aria-label={`Remover ${cnae}`}
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                  
                  {/* Input dentro do campo */}
                  <input
                    id="cnae"
                    type="text"
                    value={cnaeInput}
                    onChange={handleCnaeInputChange}
                    onKeyDown={handleCnaeInputKeyPress}
                    placeholder={cnaesSelecionados.length === 0 ? "Digite um CNAE e pressione Enter (ex: 6201-5/00)" : "Adicione outro CNAE..."}
                    maxLength={9}
                    className="flex-1 min-w-[200px] outline-none text-lg py-1"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Digite um CNAE e pressione Enter ou vírgula para adicionar como tag. Formato: XXXX-X/XX
              </p>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                onClick={limparFiltros}
                disabled={cnaesSelecionados.length === 0 && gruposSelecionados.length === 0}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Limpar Filtros
              </button>
              <button
                onClick={handleBuscar}
                disabled={loading || (cnaesSelecionados.length === 0 && gruposSelecionados.length === 0)}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
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
        </div>

        {/* Resultados */}
        {buscou && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Resultados ({clientes.length})
              </h2>
              {(gruposSelecionados.length > 0 || cnaesSelecionados.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {gruposSelecionados.map((grupo) => (
                    <span key={grupo} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      Grupo: {grupo}
                    </span>
                  ))}
                  {cnaesSelecionados.map((cnae, idx) => (
                    <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                      CNAE: {cnae}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {clientes.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <BuildingOfficeIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum cliente encontrado com os critérios selecionados</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Razão Social
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        CNPJ
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        CNAE Principal
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Atividades Secundárias
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {clientes.map((cliente) => {
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

                      return (
                        <tr
                          key={cliente.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/clientes?clienteId=${cliente.id}`)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {cliente.razao_social || cliente.nome || 'N/A'}
                            </div>
                            {(cliente as any).fantasia && (
                              <div className="text-sm text-gray-500">
                                {(cliente as any).fantasia}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatarCNPJ(cliente.cnpj_limpo || (cliente as any).cnpj)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatarCNAE((cliente as any).atividade_principal_code)}
                            </div>
                            {(cliente as any).atividade_principal_text && (
                              <div className="text-xs text-gray-500 mt-1">
                                {(cliente as any).atividade_principal_text}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {atividadesSecundarias.length > 0 ? (
                                <div className="space-y-1">
                                  {atividadesSecundarias.slice(0, 3).map((atividade: any, idx: number) => (
                                    <div key={idx} className="text-xs">
                                      <span className="font-medium">
                                        {formatarCNAE(atividade.code)}
                                      </span>
                                      {atividade.text && (
                                        <span className="text-gray-500 ml-2">
                                          - {atividade.text}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                  {atividadesSecundarias.length > 3 && (
                                    <div className="text-xs text-gray-500">
                                      +{atividadesSecundarias.length - 3} mais
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientesCNAE;
