import React, { useState, useEffect } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { bancoHorasService } from '../services/bancoHoras';
import { useToast } from '../hooks/useToast';
import { ProgressModal } from '../components/BancoHoras/ProgressModal';

const BancoHorasPage: React.FC = () => {
  const { success, error: showError } = useToast();
  const [cnpj, setCnpj] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressRelatorioId, setProgressRelatorioId] = useState<string | null>(null);
  const [progressCnpj, setProgressCnpj] = useState<string>('');
  const [progressPeriodo, setProgressPeriodo] = useState<string>('');


  const formatarCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    
    if (numbers.length <= 2) {
      return numbers;
    } else if (numbers.length <= 5) {
      return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
    } else if (numbers.length <= 8) {
      return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5)}`;
    } else if (numbers.length <= 12) {
      return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8)}`;
    } else {
      return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8, 12)}-${numbers.slice(12, 14)}`;
    }
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatarCNPJ(e.target.value);
    setCnpj(formatted);
  };

  const validarFormulario = (): boolean => {
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      showError('CNPJ inválido. Informe um CNPJ completo.');
      return false;
    }

    if (!dataInicial) {
      showError('Data Inicial é obrigatória.');
      return false;
    }

    if (!dataFinal) {
      showError('Data Final é obrigatória.');
      return false;
    }

    const dataIni = new Date(dataInicial);
    const dataFim = new Date(dataFinal);

    if (dataFim < dataIni) {
      showError('Data Final deve ser maior ou igual à Data Inicial.');
      return false;
    }

    return true;
  };

  const handleGerar = async () => {
    if (!validarFormulario()) {
      return;
    }

    setLoading(true);
    try {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      const periodoFormatado = `${dataInicial} a ${dataFinal}`;
      
      const resultado = await bancoHorasService.gerarRelatorio({
        cnpj: cnpjLimpo,
        dataInicial,
        dataFinal,
      });

      // Se o relatório foi gerado imediatamente (blob disponível - caso raro)
      if (resultado.blob) {
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        exportarArquivo(resultado.blob, `Banco_Horas_${cnpjLimpo}_${timestamp}.xlsx`);
        success('Relatório gerado com sucesso!');
      } else if (resultado.relatorioId) {
        // Relatório está sendo gerado em background - mostrar modal de progresso
        setProgressRelatorioId(resultado.relatorioId);
        setProgressCnpj(cnpj);
        setProgressPeriodo(periodoFormatado);
        setShowProgress(true);
      }

      // Limpar formulário (mas manter dados do progresso)
      setCnpj('');
      setDataInicial('');
      setDataFinal('');
    } catch (error: any) {
      // Tentar extrair mensagem de erro
      let errorMessage = 'Erro ao gerar relatório';
      if (error?.response?.data) {
        if (error.response.data instanceof Blob) {
          // Se for blob, tentar ler como JSON
          try {
            const text = await error.response.data.text();
            const json = JSON.parse(text);
            errorMessage = json.error || errorMessage;
          } catch {
            errorMessage = error?.message || errorMessage;
          }
        } else {
          errorMessage = error.response.data.error || error.response.data.message || errorMessage;
        }
      } else {
        errorMessage = error?.message || errorMessage;
      }
      showError(errorMessage);
      console.error('Erro ao gerar relatório:', error);
    } finally {
      setLoading(false);
    }
  };

  // Função simples para exportar arquivo
  const exportarArquivo = (blob: Blob, nomeArquivo: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Modal de Loading */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <svg
                className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Gerando Relatório</h3>
              <p className="text-sm text-gray-600">
                Por favor, aguarde enquanto processamos os dados...
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Este processo pode levar alguns minutos
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Formulário */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <ClockIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Horas-Homem Trabalhadas</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Gere relatórios de horas trabalhadas e horas extras por colaborador
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGerar();
              }}
              className="space-y-6"
            >
              <div>
                <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-2">
                  CNPJ da Empresa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="cnpj"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Informe o CNPJ da empresa (apenas números ou com formatação)
                </p>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Data inicial do período a ser consultado
                </p>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Data final do período a ser consultado
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Gerar Relatório
                </button>
              </div>
            </form>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-2">Informações:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>O relatório inclui apenas colaboradores ativos no período informado</li>
                <li>Horas trabalhadas são calculadas a partir da verba 5</li>
                <li>Horas extras incluem as verbas 603, 605, 608, 613 e 615</li>
                <li>O arquivo será baixado automaticamente após a geração</li>
              </ul>
            </div>
          </div>
        </div>

      </div>

      {/* Modal de Progresso */}
      {showProgress && progressRelatorioId && (
        <ProgressModal
          relatorioId={progressRelatorioId}
          cnpj={progressCnpj}
          periodo={progressPeriodo}
          onClose={() => {
            setShowProgress(false);
            setProgressRelatorioId(null);
            setProgressCnpj('');
            setProgressPeriodo('');
          }}
          onComplete={() => {
            // Nada a fazer após completar
          }}
        />
      )}
    </div>
  );
};

export default BancoHorasPage;
