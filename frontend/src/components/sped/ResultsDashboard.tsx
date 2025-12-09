import React, { useEffect, useState } from 'react';
import { ChartBarIcon, ArrowDownTrayIcon, ArrowPathIcon, DocumentCheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { spedService } from '../../services/sped';
import DivergenciasTable from './DivergenciasTable';
import DivergenciasValoresConferencia from './DivergenciasValoresConferencia';

interface ResultsDashboardProps {
  validationId: string;
  onNewValidation: () => void;
}

interface ValidationResult {
  empresa?: {
    cnpj?: string;
    razao?: string;
    dt_ini?: string;
    dt_fin?: string;
  };
  validacoes?: Record<string, any[]>;
  reports?: Record<string, any[]>;
}

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ 
  validationId, 
  onNewValidation 
}) => {
  const [resultado, setResultado] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumo' | 'divergencias' | 'conferencia'>('resumo');

  useEffect(() => {
    carregarResultado();
  }, [validationId]);

  const carregarResultado = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Primeiro verificar o status para garantir que está completo
      const status = await spedService.obterStatus(validationId);
      
      if (!status) {
        setError('Validação não encontrada');
        setLoading(false);
        return;
      }
      
      if (status.status !== 'completed') {
        setError(`Validação ainda não concluída. Status: ${status.status}`);
        setLoading(false);
        return;
      }
      
      // Aguardar um pouco para garantir que o resultado está disponível
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const data = await spedService.obterResultado(validationId);
      
      console.log('Resultado carregado:', data);
      console.log('Tipo do resultado:', typeof data);
      console.log('Chaves do resultado:', data ? Object.keys(data) : 'null');
      
      if (!data) {
        setError('Resultado não disponível. A validação pode não ter sido concluída com sucesso.');
        setLoading(false);
        return;
      }
      
      if (typeof data !== 'object' || Object.keys(data).length === 0) {
        setError('Resultado vazio ou em formato inválido');
        setLoading(false);
        return;
      }
      
      setResultado(data);
      setError(null);
    } catch (err: any) {
      console.error('Erro ao carregar resultado:', err);
      setError(err.message || 'Erro ao carregar resultados');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await spedService.exportarExcel(validationId);
    } catch (err: any) {
      alert('Erro ao exportar Excel: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando resultados...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        <strong>Erro:</strong> {error}
      </div>
    );
  }

  if (!resultado) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg">
        <p className="font-semibold">Nenhum resultado disponível</p>
        <p className="text-sm mt-2">A validação pode não ter gerado resultados ou os dados ainda não estão disponíveis.</p>
        <button
          onClick={carregarResultado}
          className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Extrair dados do resultado - pode vir em diferentes formatos
  const validacoes = resultado.validacoes || resultado.Validacoes || {};
  const reports = resultado.reports || resultado.Reports || {};
  
  const divergencias = validacoes['Divergencias (todas)'] || validacoes['divergencias'] || [];
  const checklist = reports['Checklist'] || reports['checklist'] || [];
  
  // Buscar notes_df para divergências de valores (contém colunas Delta)
  const notesDf = reports['Notas (+Natureza)'] || reports['Notas Saídas'] || reports['Notas Entradas'] || [];
  
  // Debug: mostrar estrutura do resultado
  console.log('Estrutura do resultado:', {
    hasEmpresa: !!resultado.empresa,
    validacoesKeys: Object.keys(validacoes),
    reportsKeys: Object.keys(reports),
    divergenciasCount: divergencias.length,
    checklistCount: checklist.length
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho com ações */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Resultados da Validação</h2>
            {resultado.empresa && (
              <div className="mt-2 text-sm text-gray-600">
                <p><strong>Empresa:</strong> {resultado.empresa.razao || 'N/D'}</p>
                <p><strong>CNPJ:</strong> {resultado.empresa.cnpj || 'N/D'}</p>
                {resultado.empresa.dt_ini && resultado.empresa.dt_fin && (
                  <p><strong>Período:</strong> {resultado.empresa.dt_ini} até {resultado.empresa.dt_fin}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
              Exportar Excel
            </button>
            <button
              onClick={onNewValidation}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <ArrowPathIcon className="h-5 w-5 mr-2" />
              Nova Validação
            </button>
          </div>
        </div>
      </div>

      {/* Abas de navegação */}
      <div className="bg-white rounded-lg shadow-md border-b border-gray-200">
        <nav className="flex space-x-1 px-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('resumo')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'resumo'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ChartBarIcon className="h-5 w-5 inline-block mr-2" />
            Resumo
          </button>
          <button
            onClick={() => setActiveTab('divergencias')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'divergencias'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ArrowPathIcon className="h-5 w-5 inline-block mr-2" />
            Divergências
            {divergencias.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                {divergencias.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('conferencia')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'conferencia'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <DocumentCheckIcon className="h-5 w-5 inline-block mr-2" />
            Conferência de Valores
            {divergencias.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                {new Set(divergencias.map((d: any) => d['Chave NF-e'] || d.CHAVE || d.chaveNf).filter(Boolean)).size}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Conteúdo das abas */}
      <div className="mt-6">
        {activeTab === 'resumo' && (
          <>
            {checklist.length > 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center">
                  <ChartBarIcon className="h-6 w-6 mr-2 text-blue-600" />
                  Resumo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {checklist.map((item: any, index: number) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">{item.Item || item[0]}</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {item.Valor || item[1] || 'N/D'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg">
                <p className="font-semibold">Nenhum resumo disponível</p>
                <p className="text-sm mt-1">O checklist não foi gerado ou está vazio.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'divergencias' && (
          <>
            {divergencias.length > 0 ? (
              <DivergenciasTable divergencias={divergencias} />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center">
                  <ExclamationTriangleIcon className="h-6 w-6 mr-2 text-blue-600" />
                  Exemplos de Divergências Averiguadas
                </h3>
                <p className="text-gray-600 mb-4">
                  O sistema verifica os seguintes tipos de confrontos entre XML e SPED:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">📋 Cadastro (0150) x XML</h4>
                    <p className="text-sm text-gray-600">
                      Confronta dados cadastrais de empresas/fornecedores entre o registro 0150 do SPED e as informações dos XMLs.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">📦 Unidades (0190) Faltantes</h4>
                    <p className="text-sm text-gray-600">
                      Identifica unidades de medida referenciadas nos XMLs que não estão cadastradas no registro 0190 do SPED.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">💰 FCP (Indícios)</h4>
                    <p className="text-sm text-gray-600">
                      Detecta possíveis valores de Fundo de Combate à Pobreza que podem estar faltando ou incorretos.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">📊 Apuração (E110)</h4>
                    <p className="text-sm text-gray-600">
                      Verifica a consistência dos valores de apuração do ICMS entre os registros E110 e os totais das notas fiscais.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">💳 Recolhimentos (E116)</h4>
                    <p className="text-sm text-gray-600">
                      Confronta valores de recolhimentos informados no registro E116 com os valores calculados.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">🔍 Notas Não Escrituradas</h4>
                    <p className="text-sm text-gray-600">
                      Identifica notas fiscais presentes nos XMLs que não foram encontradas no SPED Fiscal.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">📝 Valores Divergentes</h4>
                    <p className="text-sm text-gray-600">
                      Compara valores de ICMS, IPI, ST e bases de cálculo entre XML e SPED, identificando diferenças significativas.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">✅ Regras: CFOP x CST</h4>
                    <p className="text-sm text-gray-600">
                      Valida a combinação de CFOP e CST/CSOSN conforme regras de negócio definidas no arquivo rules.yml.
                    </p>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-semibold">✓ Nenhuma divergência encontrada</p>
                  <p className="text-sm text-green-700 mt-1">
                    Todos os confrontos foram realizados e não foram identificadas divergências nos dados analisados.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'conferencia' && (
          <DivergenciasValoresConferencia divergencias={divergencias} notesDf={notesDf} />
        )}
      </div>

      {/* Outras abas de relatórios - apenas para aba Resumo */}
      {activeTab === 'resumo' && resultado.reports && Object.keys(resultado.reports).length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold mb-4">Relatórios Disponíveis</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.keys(resultado.reports).map((key) => (
              <div key={key} className="bg-gray-50 p-3 rounded-lg hover:bg-gray-100 cursor-pointer">
                <p className="text-sm font-medium text-gray-900">{key}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {Array.isArray(resultado.reports![key]) 
                    ? `${resultado.reports![key].length} registro(s)`
                    : 'N/A'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsDashboard;

