import React, { useState } from 'react';
import {
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';

interface Campo {
  key: string;
  label: string;
  description?: string;
}

interface CategoriaCampos {
  id: string;
  nome: string;
  icon: string;
  campos: Campo[];
}

interface ExportClientesModalProps {
  onClose: () => void;
  onExport: (campos: string[]) => Promise<void>;
}

const ExportClientesModal: React.FC<ExportClientesModalProps> = ({ onClose, onExport }) => {
  const [camposSelecionados, setCamposSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  // Definição das categorias e campos
  const categorias: CategoriaCampos[] = [
    {
      id: 'basicos',
      nome: 'Dados Básicos',
      icon: '📋',
      campos: [
        { key: 'razao_social', label: 'Razão Social', description: 'Nome empresarial' },
        { key: 'fantasia', label: 'Nome Fantasia' },
        { key: 'cnpj', label: 'CNPJ' },
        { key: 'tipo_empresa', label: 'Tipo (Matriz/Filial)' },
      ],
    },
    {
      id: 'contato',
      nome: 'Contato',
      icon: '📞',
      campos: [
        { key: 'email', label: 'E-mail' },
        { key: 'telefone', label: 'Telefone' },
        { key: 'receita_email', label: 'E-mail (Receita)' },
        { key: 'receita_telefone', label: 'Telefone (Receita)' },
      ],
    },
    {
      id: 'endereco',
      nome: 'Endereço',
      icon: '📍',
      campos: [
        { key: 'logradouro', label: 'Logradouro' },
        { key: 'numero', label: 'Número' },
        { key: 'complemento', label: 'Complemento' },
        { key: 'bairro', label: 'Bairro' },
        { key: 'municipio', label: 'Município' },
        { key: 'uf', label: 'UF' },
        { key: 'cep', label: 'CEP' },
        { key: 'endereco', label: 'Endereço Completo' },
      ],
    },
    {
      id: 'financeiro',
      nome: 'Informações Financeiras',
      icon: '💰',
      campos: [
        { key: 'capital_social', label: 'Capital Social' },
        { key: 'regime_tributario', label: 'Regime Tributário' },
        { key: 'simples_optante', label: 'Optante Simples Nacional' },
        { key: 'simples_data_opcao', label: 'Data Opção Simples' },
        { key: 'simples_data_exclusao', label: 'Data Exclusão Simples' },
        { key: 'simei_optante', label: 'Optante SIMEI' },
      ],
    },
    {
      id: 'cadastral',
      nome: 'Dados Cadastrais',
      icon: '📄',
      campos: [
        { key: 'situacao_cadastral', label: 'Situação Cadastral' },
        { key: 'data_situacao', label: 'Data da Situação' },
        { key: 'abertura', label: 'Data de Abertura' },
        { key: 'porte', label: 'Porte' },
        { key: 'natureza_juridica', label: 'Natureza Jurídica' },
      ],
    },
    {
      id: 'atividades',
      nome: 'Atividades',
      icon: '🏢',
      campos: [
        { key: 'atividade_principal_code', label: 'CNAE Principal' },
        { key: 'atividade_principal_text', label: 'Atividade Principal' },
        { key: 'atividades_secundarias', label: 'Atividades Secundárias' },
      ],
    },
    {
      id: 'participacao',
      nome: 'Participação',
      icon: '👥',
      campos: [
        { key: 'socios', label: 'Sócios', description: 'Nome, qualificação e participação percentual' },
      ],
    },
    {
      id: 'receita',
      nome: 'Dados ReceitaWS',
      icon: '🔍',
      campos: [
        { key: 'receita_ws_status', label: 'Status ReceitaWS' },
        { key: 'receita_ws_consulta_em', label: 'Última Consulta' },
        { key: 'receita_ws_ultima_atualizacao', label: 'Última Atualização' },
      ],
    },
  ];

  const handleToggleCategoria = (categoria: CategoriaCampos, selecionar: boolean) => {
    const novosSelecionados = new Set(camposSelecionados);
    categoria.campos.forEach(campo => {
      if (selecionar) {
        novosSelecionados.add(campo.key);
      } else {
        novosSelecionados.delete(campo.key);
      }
    });
    setCamposSelecionados(novosSelecionados);
  };

  const handleToggleCampo = (key: string) => {
    const novos = new Set(camposSelecionados);
    if (novos.has(key)) {
      novos.delete(key);
    } else {
      novos.add(key);
    }
    setCamposSelecionados(novos);
  };

  const handleExportar = async () => {
    if (camposSelecionados.size === 0) {
      alert('Selecione ao menos um campo para exportar');
      return;
    }
    setLoading(true);
    try {
      await onExport(Array.from(camposSelecionados));
    } catch (error) {
      console.error('Erro ao exportar:', error);
    } finally {
      setLoading(false);
    }
  };

  const categoriasFiltradas = categorias.map(cat => ({
    ...cat,
    campos: cat.campos.filter(campo =>
      campo.label.toLowerCase().includes(busca.toLowerCase()) ||
      campo.description?.toLowerCase().includes(busca.toLowerCase()) ||
      campo.key.toLowerCase().includes(busca.toLowerCase())
    ),
  })).filter(cat => cat.campos.length > 0);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
          
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <DocumentArrowDownIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Exportar Clientes</h3>
                  <p className="text-sm text-white/90">Selecione os campos que deseja exportar</p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="text-white hover:bg-white/10 p-2 rounded-lg transition"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Controles */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0 bg-gray-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar campos..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-sm"
                />
              </div>
              <button
                onClick={() => setCamposSelecionados(new Set(categorias.flatMap(c => c.campos.map(f => f.key))))}
                className="px-4 py-2.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-semibold transition whitespace-nowrap text-sm"
              >
                Selecionar Todos
              </button>
              <button
                onClick={() => setCamposSelecionados(new Set())}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-semibold transition text-sm"
              >
                Limpar
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-blue-600">{camposSelecionados.size}</span>
              <span className="text-gray-600">campo(s) selecionado(s)</span>
            </div>
          </div>

          {/* Conteúdo - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {categoriasFiltradas.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">Nenhum campo encontrado com "{busca}"</p>
                </div>
              ) : (
                categoriasFiltradas.map(categoria => {
                  const todosSelecionados = categoria.campos.every(c => camposSelecionados.has(c.key));
                  const algunsSelecionados = categoria.campos.some(c => camposSelecionados.has(c.key));

                  return (
                    <div key={categoria.id} className="border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      {/* Header da Categoria */}
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{categoria.icon}</span>
                          <h4 className="font-bold text-gray-800">{categoria.nome}</h4>
                          <span className="text-sm text-gray-500">
                            ({categoria.campos.filter(c => camposSelecionados.has(c.key)).length}/{categoria.campos.length})
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleCategoria(categoria, !todosSelecionados)}
                          className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition ${
                            todosSelecionados
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : algunsSelecionados
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {todosSelecionados ? 'Desmarcar Todos' : 'Marcar Todos'}
                        </button>
                      </div>

                      {/* Campos */}
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {categoria.campos.map(campo => (
                          <label
                            key={campo.key}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition border-2 ${
                              camposSelecionados.has(campo.key)
                                ? 'bg-blue-50 border-blue-300 hover:bg-blue-100'
                                : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={camposSelecionados.has(campo.key)}
                              onChange={() => handleToggleCampo(campo.key)}
                              className="mt-0.5 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-800 text-sm">{campo.label}</div>
                              {campo.description && (
                                <div className="text-xs text-gray-500 mt-0.5">{campo.description}</div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0 bg-gray-50">
            <div className="text-sm text-gray-600">
              {camposSelecionados.size > 0 ? (
                <span>
                  Pronto para exportar <strong className="text-blue-600">{camposSelecionados.size}</strong> campos
                </span>
              ) : (
                <span className="text-orange-600 font-semibold">⚠️ Selecione ao menos um campo</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleExportar}
                disabled={camposSelecionados.size === 0 || loading}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Exportando...
                  </>
                ) : (
                  <>
                    <DocumentArrowDownIcon className="w-5 h-5" />
                    Exportar XLSX
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ExportClientesModal;








