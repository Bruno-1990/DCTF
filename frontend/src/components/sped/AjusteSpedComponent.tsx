import React, { useState, useEffect } from 'react';
import { 
  WrenchScrewdriverIcon, 
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';
import { spedService } from '../../services/sped';

interface Ajuste {
  chave_nf: string;
  cfop: string;
  cst: string;
  campo: string;
  valor_xml: number;
  valor_sped: number;
  valor_ajuste: number;
  severidade: 'alta' | 'media' | 'baixa';
  pode_ajustar: boolean;
  motivo: string;
  regra?: string;
  selecionado: boolean;
}

interface AjusteSpedComponentProps {
  validationId: string;
  resultado: any;
}

const AjusteSpedComponent: React.FC<AjusteSpedComponentProps> = ({
  validationId,
  resultado
}) => {
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [loading, setLoading] = useState(false);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    carregarAjustes();
  }, [validationId]);

  const carregarAjustes = async () => {
    setLoading(true);
    try {
      const data = await spedService.obterAjustes(validationId);
      setAjustes(data.map((a: any) => ({ 
        ...a, 
        selecionado: a.pode_ajustar // Selecionar apenas os que podem ser ajustados
      })));
    } catch (error: any) {
      console.error('Erro ao carregar ajustes:', error);
      alert('Erro ao carregar ajustes: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const toggleSelecao = (index: number) => {
    const novosAjustes = [...ajustes];
    novosAjustes[index].selecionado = !novosAjustes[index].selecionado;
    setAjustes(novosAjustes);
  };

  const toggleSelecionarTodos = () => {
    const todosSelecionados = ajustes.filter(a => a.pode_ajustar).every(a => a.selecionado);
    setAjustes(ajustes.map(a => ({
      ...a,
      selecionado: a.pode_ajustar ? !todosSelecionados : a.selecionado
    })));
  };

  const aplicarAjustes = async () => {
    const ajustesSelecionados = ajustes.filter(a => a.selecionado && a.pode_ajustar);
    if (ajustesSelecionados.length === 0) {
      alert('Selecione pelo menos um ajuste para aplicar');
      return;
    }

    if (!confirm(`Deseja aplicar ${ajustesSelecionados.length} ajuste(s) no SPED?`)) {
      return;
    }

    setProcessando(true);
    try {
      const arquivoAjustado = await spedService.aplicarAjustes(
        validationId,
        ajustesSelecionados
      );
      
      // Download automático
      const url = window.URL.createObjectURL(arquivoAjustado);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SPED_AJUSTADO_${validationId}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      alert('SPED ajustado gerado com sucesso!');
    } catch (error: any) {
      alert('Erro ao aplicar ajustes: ' + (error.response?.data?.message || error.message));
    } finally {
      setProcessando(false);
    }
  };

  const formatarValor = (valor: number | null | undefined): string => {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  const ajustesSelecionados = ajustes.filter(a => a.selecionado && a.pode_ajustar).length;
  const ajustesAplicaveis = ajustes.filter(a => a.pode_ajustar).length;
  const ajustesAltaSeveridade = ajustes.filter(a => a.severidade === 'alta' && a.pode_ajustar).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <WrenchScrewdriverIcon className="h-6 w-6 text-blue-600" />
              Ajuste Inteligente SPED
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              Cruzamento inteligente baseado em regras CFOP x CST da EFD-ICMS/IPI
            </p>
          </div>
          <button
            onClick={aplicarAjustes}
            disabled={processando || ajustesSelecionados === 0}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            {processando ? 'Processando...' : `Aplicar ${ajustesSelecionados} Ajuste(s)`}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Total de Ajustes</p>
            <p className="text-2xl font-bold text-blue-600">{ajustes.length}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Aplicáveis</p>
            <p className="text-2xl font-bold text-green-600">{ajustesAplicaveis}</p>
          </div>
          <div className="bg-amber-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Selecionados</p>
            <p className="text-2xl font-bold text-amber-600">{ajustesSelecionados}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Alta Severidade</p>
            <p className="text-2xl font-bold text-red-600">{ajustesAltaSeveridade}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analisando divergências com regras fiscais...</p>
        </div>
      ) : ajustes.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <p className="text-green-800 font-semibold">Nenhum ajuste necessário</p>
          <p className="text-sm text-green-700 mt-2">
            Todos os valores estão corretos conforme regras fiscais CFOP x CST
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={ajustes.filter(a => a.pode_ajustar).every(a => a.selecionado) && ajustes.filter(a => a.pode_ajustar).length > 0}
                      onChange={toggleSelecionarTodos}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Chave NF
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CFOP / CST
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    XML
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SPED
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ajuste
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Severidade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ajustes.map((ajuste, index) => (
                  <tr 
                    key={index} 
                    className={ajuste.selecionado ? 'bg-blue-50' : ''}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={ajuste.selecionado}
                        onChange={() => toggleSelecao(index)}
                        disabled={!ajuste.pode_ajustar}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {ajuste.chave_nf || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {ajuste.cfop && ajuste.cst ? `${ajuste.cfop} / ${ajuste.cst}` : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {ajuste.campo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {formatarValor(ajuste.valor_xml)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {formatarValor(ajuste.valor_sped)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                      <span className={ajuste.valor_ajuste > 0 ? 'text-green-600' : ajuste.valor_ajuste < 0 ? 'text-red-600' : 'text-gray-600'}>
                        {ajuste.valor_ajuste > 0 ? '+' : ''}{formatarValor(ajuste.valor_ajuste)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        ajuste.severidade === 'alta' ? 'bg-red-100 text-red-800' :
                        ajuste.severidade === 'media' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {ajuste.severidade.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-md">
                      <div className="truncate" title={ajuste.motivo}>
                        {ajuste.motivo}
                      </div>
                      {ajuste.regra && (
                        <div className="text-xs text-gray-500 mt-1 truncate" title={ajuste.regra}>
                          Regra: {ajuste.regra}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AjusteSpedComponent;












