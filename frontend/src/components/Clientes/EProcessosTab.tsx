/**
 * Componente: Aba de E-Processos dentro da página de Clientes
 * 
 * Este componente permite consultar processos eletrônicos na Receita Federal
 * usando o CNPJ do cliente.
 */

import React, { useState, useMemo } from 'react';
import axios from 'axios';
import LoadingSpinner from '../UI/LoadingSpinner';
import Alert from '../UI/Alert';
import { MagnifyingGlassIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import ExcelJS from 'exceljs';

interface EProcessosTabProps {
  cnpjPreenchido?: string; // CNPJ pré-preenchido quando vem do link "Adicionar"
}

interface ProcessoEletronico {
  numeroDoProcesso?: string;
  numero_do_processo?: string;
  relacaoDoInteressadoComOProcesso?: string;
  relacao_do_interessado_com_o_processo?: string;
  dataDeProtocolo?: string;
  data_de_protocolo?: string;
  tipoDoProcesso?: string;
  tipo_do_processo?: string;
  subtipoDoProcesso?: string;
  subtipo_do_processo?: string;
  localizacao?: string;
  situacao?: string;
  ultimoEncaminhamentoExterno?: string | null;
}

interface ProcessosEstruturados {
  metadata?: {
    status?: number | null;
    responseId?: string | null;
    responseDateTime?: string | null;
  };
  processos: ProcessoEletronico[];
}

// Função para formatar CNPJ com máscara
const formatCNPJ = (cnpj: string): string => {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

const EProcessosTab: React.FC<EProcessosTabProps> = ({ cnpjPreenchido }) => {
  const [cnpj, setCnpj] = useState(cnpjPreenchido ? cnpjPreenchido.replace(/\D/g, '') : '');
  
  // Atualizar CNPJ quando cnpjPreenchido mudar
  React.useEffect(() => {
    if (cnpjPreenchido) {
      setCnpj(cnpjPreenchido.replace(/\D/g, ''));
    }
  }, [cnpjPreenchido]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [processos, setProcessos] = useState<ProcessosEstruturados | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroSituacao, setFiltroSituacao] = useState<string>('');

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito
    if (value.length <= 14) {
      setCnpj(value);
    }
  };

  const handlePesquisar = async () => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    if (cnpjLimpo.length !== 14) {
      setError('CNPJ inválido. Deve conter 14 dígitos.');
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
      }, 5000);
      return;
    }

    setLoading(true);
    setError(null);
    setShowError(false);
    setProcessos(null);

    try {
      const response = await axios.get('/api/receita/e-processos', {
        params: { cnpj: cnpjLimpo }
      });

      if (response.data.success) {
        const dados = response.data.data;
        
        console.log('[EProcessosTab] Dados recebidos do backend:', {
          hasData: !!dados,
          dataKeys: dados ? Object.keys(dados) : [],
          dadosType: typeof dados,
          dadosIsArray: Array.isArray(dados),
        });
        
        // Verificar diferentes estruturas possíveis da resposta
        let processosArray: any[] = [];
        let metadata: any = {};
        
        // Estrutura 1: dados.Dados (array direto) - verificar se é array válido (não objeto vazio)
        if (dados && dados.Dados) {
          if (Array.isArray(dados.Dados) && dados.Dados.length > 0) {
            console.log('[EProcessosTab] Encontrado array em dados.Dados:', dados.Dados.length);
            // Garantir que cada item seja um objeto parseado (não string JSON)
            processosArray = dados.Dados.map((item: any) => {
              if (typeof item === 'string') {
                try {
                  return JSON.parse(item);
                } catch (e) {
                  return item;
                }
              }
              return item;
            });
          } else if (typeof dados.Dados === 'object' && !Array.isArray(dados.Dados)) {
            // Se Dados é um objeto, pode ser que o array esteja em outro lugar
            console.log('[EProcessosTab] dados.Dados é objeto, não array');
          }
          metadata = {
            status: dados.Status || dados.status || null,
            responseId: dados['Response Id'] || dados.responseId || null,
            responseDateTime: dados['Response Date Time'] || dados.responseDateTime || null,
          };
        }
        // Estrutura 2: dados.dados (array em minúscula) - mais comum
        else if (dados && dados.dados) {
          if (Array.isArray(dados.dados) && dados.dados.length > 0) {
            console.log('[EProcessosTab] Encontrado array em dados.dados:', dados.dados.length);
            // Garantir que cada item seja um objeto parseado (não string JSON)
            processosArray = dados.dados.map((item: any) => {
              if (typeof item === 'string') {
                try {
                  const parsed = JSON.parse(item);
                  console.log('[EProcessosTab] Item parseado de string JSON');
                  return parsed;
                } catch (e) {
                  console.warn('[EProcessosTab] Erro ao parsear item:', e);
                  return item;
                }
              }
              return item;
            });
          }
          metadata = {
            status: dados.Status || dados.status || null,
            responseId: dados['Response Id'] || dados.responseId || null,
            responseDateTime: dados['Response Date Time'] || dados.responseDateTime || null,
          };
        }
        // Estrutura 3: dados.dados é string JSON
        else if (dados && typeof dados.dados === 'string') {
          console.log('[EProcessosTab] dados.dados é string, tentando parsear...');
          try {
            const parsed = JSON.parse(dados.dados);
            if (Array.isArray(parsed)) {
              console.log('[EProcessosTab] Array parseado de string:', parsed.length);
              processosArray = parsed;
            } else if (parsed && Array.isArray(parsed.Dados)) {
              console.log('[EProcessosTab] Array encontrado em parsed.Dados:', parsed.Dados.length);
              processosArray = parsed.Dados;
            }
            metadata = {
              status: dados.Status || dados.status || null,
              responseId: dados['Response Id'] || dados.responseId || null,
              responseDateTime: dados['Response Date Time'] || dados.responseDateTime || null,
            };
          } catch (e) {
            console.error('[EProcessosTab] Erro ao parsear dados.dados:', e);
          }
        }
        // Estrutura 4: dados é um array direto
        else if (Array.isArray(dados)) {
          console.log('[EProcessosTab] dados é um array direto:', dados.length);
          processosArray = dados;
        }
        // Estrutura 5: Verificar se há um campo "Dados" dentro de um objeto "dados"
        else if (dados && dados.dados && typeof dados.dados === 'object' && Array.isArray(dados.dados.Dados)) {
          console.log('[EProcessosTab] Encontrado array em dados.dados.Dados:', dados.dados.Dados.length);
          processosArray = dados.dados.Dados;
          metadata = {
            status: dados.Status || dados.status || null,
            responseId: dados['Response Id'] || dados.responseId || null,
            responseDateTime: dados['Response Date Time'] || dados.responseDateTime || null,
          };
        }
        else {
          console.warn('[EProcessosTab] Estrutura de dados não reconhecida, tentando busca recursiva...');
          
          // Função auxiliar para buscar arrays recursivamente
          const buscarArrayRecursivo = (obj: any, path: string = ''): any[] | null => {
            if (Array.isArray(obj)) {
              // Se é um array e tem objetos com campos de processo, é o que procuramos
              if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') {
                const primeiroItem = obj[0];
                if (primeiroItem.numeroDoProcesso || primeiroItem.numero_do_processo || 
                    primeiroItem.tipoDoProcesso || primeiroItem.tipo_do_processo) {
                  console.log(`[EProcessosTab] Array encontrado recursivamente em: ${path}`, obj.length);
                  return obj;
                }
              }
            }
            
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
              for (const [key, value] of Object.entries(obj)) {
                const novoPath = path ? `${path}.${key}` : key;
                const resultado = buscarArrayRecursivo(value, novoPath);
                if (resultado) return resultado;
              }
            }
            
            return null;
          };
          
          const arrayEncontrado = buscarArrayRecursivo(dados);
          if (arrayEncontrado) {
            processosArray = arrayEncontrado;
            metadata = {
              status: dados.Status || dados.status || null,
              responseId: dados['Response Id'] || dados.responseId || null,
              responseDateTime: dados['Response Date Time'] || dados.responseDateTime || null,
            };
          } else {
            console.error('[EProcessosTab] Nenhum array de processos encontrado na resposta');
            console.error('[EProcessosTab] Estrutura completa:', JSON.stringify(dados, null, 2));
          }
        }
        
        console.log('[EProcessosTab] Processos extraídos:', processosArray.length);
        
        // Estruturar os dados da resposta da API
        const processosEstruturados: ProcessosEstruturados = {
          metadata,
          processos: processosArray,
        };
        
        setProcessos(processosEstruturados);
      } else {
        throw new Error(response.data.error || 'Erro ao consultar E-Processos');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao consultar E-Processos na Receita Federal';
      setError(errorMessage);
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
      }, 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePesquisar();
    }
  };

  // Filtrar processos baseado nos filtros aplicados
  const processosFiltrados = useMemo(() => {
    if (!processos || !processos.processos) return [];
    
    let filtrados = processos.processos;
    
    if (filtroTipo) {
      filtrados = filtrados.filter((p: ProcessoEletronico) => {
        const tipo = (p.tipoDoProcesso || p.tipo_do_processo || '').toLowerCase();
        return tipo === filtroTipo.toLowerCase();
      });
    }
    
    if (filtroSituacao) {
      filtrados = filtrados.filter((p: ProcessoEletronico) => {
        const situacao = (p.situacao || '').toLowerCase();
        return situacao === filtroSituacao.toLowerCase();
      });
    }
    
    return filtrados;
  }, [processos, filtroTipo, filtroSituacao]);

  // Função para exportar dados para Excel
  const handleExportarExcel = async () => {
    if (!processos || processosFiltrados.length === 0) {
      setError('Não há dados para exportar');
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('E-Processos', {
        views: [{ state: 'frozen', ySplit: 1 }], // Cabeçalho fixo
      });

      // Cabeçalhos
      const headers = [
        'Número do Processo',
        'Data de Protocolo',
        'Tipo',
        'Subtipo',
        'Localização',
        'Situação',
        'Relação do Interessado',
        'Último Encaminhamento Externo',
      ];

      sheet.addRow(headers);

      // Adicionar dados
      processosFiltrados.forEach((processo: ProcessoEletronico) => {
        sheet.addRow([
          processo.numeroDoProcesso || processo.numero_do_processo || 'N/A',
          processo.dataDeProtocolo || processo.data_de_protocolo || 'N/A',
          processo.tipoDoProcesso || processo.tipo_do_processo || 'N/A',
          processo.subtipoDoProcesso || processo.subtipo_do_processo || 'N/A',
          processo.localizacao || 'N/A',
          processo.situacao || 'N/A',
          processo.relacaoDoInteressadoComOProcesso || processo.relacao_do_interessado_com_o_processo || 'N/A',
          processo.ultimoEncaminhamentoExterno || 'N/A',
        ]);
      });

      // Estilizar cabeçalho
      sheet.getRow(1).height = 30;
      sheet.getRow(1).eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4E78' },
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
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      // Estilizar linhas de dados
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber !== 1) {
          row.height = 20;
          row.eachCell((cell) => {
            cell.alignment = {
              vertical: 'middle',
              horizontal: 'left',
              wrapText: true,
            };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
              left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
              bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
              right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            };
          });
        }
      });

      // Ajustar largura das colunas
      sheet.columns.forEach((column, index) => {
        let maxLength = headers[index].length;
        column.eachCell({ includeEmpty: false }, (cell) => {
          const cellValue = String(cell.value || '');
          if (cellValue.length > maxLength) {
            maxLength = cellValue.length;
          }
        });
        column.width = Math.min(60, Math.max(15, maxLength + 2));
      });

      // Adicionar informações de metadata se disponível
      if (processos.metadata) {
        sheet.addRow([]); // Linha em branco
        sheet.addRow(['Informações da Consulta']);
        if (processos.metadata.responseDateTime) {
          sheet.addRow(['Data da Consulta:', processos.metadata.responseDateTime]);
        }
        if (processos.metadata.responseId) {
          sheet.addRow(['ID da Resposta:', processos.metadata.responseId]);
        }
        if (cnpj) {
          sheet.addRow(['CNPJ Consultado:', formatCNPJ(cnpj)]);
        }
      }

      // Gerar arquivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cnpjFormatado = formatCNPJ(cnpj);
      const dataExportacao = new Date().toISOString().split('T')[0];
      link.download = `e-processos_${cnpjFormatado.replace(/\D/g, '')}_${dataExportacao}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Erro ao exportar Excel:', err);
      setError('Erro ao exportar dados para Excel: ' + (err.message || 'Erro desconhecido'));
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
    }
  };

  // Função para renderizar dados de forma recursiva e bonita
  const renderData = (data: any, depth: number = 0, key?: string): React.ReactNode => {
    if (data === null || data === undefined) {
      return <span className="text-gray-400 italic">Não informado</span>;
    }

    if (typeof data === 'boolean') {
      return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
          data ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {data ? 'Sim' : 'Não'}
        </span>
      );
    }

    if (typeof data === 'number') {
      // Verificar se parece ser um valor monetário ou data
      if (key && (key.toLowerCase().includes('valor') || key.toLowerCase().includes('total'))) {
        return (
          <span className="text-green-600 font-semibold">
            R$ {data.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      }
      return <span className="text-blue-600 font-semibold">{data.toLocaleString('pt-BR')}</span>;
    }

    if (typeof data === 'string') {
      // Verificar se é uma data
      if (/^\d{4}-\d{2}-\d{2}/.test(data) || /^\d{2}\/\d{2}\/\d{4}/.test(data)) {
        try {
          const date = new Date(data);
          if (!isNaN(date.getTime())) {
            return (
              <span className="text-gray-700 font-medium">
                {date.toLocaleDateString('pt-BR', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric' 
                })}
              </span>
            );
          }
        } catch {
          // Continuar para renderizar como string normal
        }
      }
      // Verificar se é um CNPJ
      if (data.replace(/\D/g, '').length === 14) {
        const cnpjFormatado = formatCNPJ(data);
        return <span className="text-gray-800 font-mono">{cnpjFormatado}</span>;
      }
      return <span className="text-gray-800">{data}</span>;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return <span className="text-gray-400 italic text-sm">Nenhum item encontrado</span>;
      }
      return (
        <div className="space-y-3">
          {data.map((item, index) => (
            <div key={index} className="border-l-4 border-indigo-400 pl-4 py-3 bg-indigo-50 rounded-r-lg shadow-sm">
              <div className="text-xs text-indigo-600 font-semibold mb-2 uppercase tracking-wide">
                Item {index + 1} de {data.length}
              </div>
              <div className="bg-white rounded-lg p-4 border border-indigo-100">
                {renderData(item, depth + 1)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (typeof data === 'object') {
      const entries = Object.entries(data);
      if (entries.length === 0) {
        return <span className="text-gray-400 italic text-sm">Sem informações</span>;
      }
      return (
        <div className="space-y-3">
          {entries.map(([entryKey, value]) => {
            const formattedKey = entryKey
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, str => str.toUpperCase())
              .trim();
            
            return (
              <div key={entryKey} className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0">
                <div className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                  {formattedKey}
                </div>
                <div className="ml-4 mt-1">{renderData(value, depth + 1, entryKey)}</div>
              </div>
            );
          })}
        </div>
      );
    }

    return <span className="text-gray-500">{String(data)}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">E-Processos</h2>
        <p className="text-gray-600">
          Consulte processos eletrônicos na Receita Federal por CNPJ
        </p>
      </div>

      {/* Formulário de pesquisa */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="space-y-4">
          {/* Linha do CNPJ e Botão */}
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label htmlFor="cnpj-e-processos" className="block text-sm font-medium text-gray-700 mb-2">
                CNPJ
              </label>
              <input
                id="cnpj-e-processos"
                type="text"
                value={formatCNPJ(cnpj)}
                onChange={handleCnpjChange}
                onKeyPress={handleKeyPress}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handlePesquisar}
              disabled={loading || cnpj.replace(/\D/g, '').length !== 14}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap h-[42px]"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Buscando...</span>
                </>
              ) : (
                <>
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  <span>Buscar na Receita</span>
                </>
              )}
            </button>
          </div>

          {/* Filtros - Aparecem apenas quando há resultados */}
          {processos && processos.processos && processos.processos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
              <div>
                <label htmlFor="filtro-tipo" className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo
                </label>
                <select
                  id="filtro-tipo"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">Todos os tipos</option>
                  {Array.from(new Set(processos.processos.map((p: ProcessoEletronico) => p.tipoDoProcesso || p.tipo_do_processo).filter(Boolean))).map((tipo: string) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filtro-situacao" className="block text-sm font-medium text-gray-700 mb-2">
                  Situação
                </label>
                <select
                  id="filtro-situacao"
                  value={filtroSituacao}
                  onChange={(e) => setFiltroSituacao(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">Todas as situações</option>
                  {Array.from(new Set(processos.processos.map((p: ProcessoEletronico) => p.situacao).filter(Boolean))).map((situacao: string) => (
                    <option key={situacao} value={situacao}>{situacao}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mensagem de erro */}
      {showError && error && (
        <Alert type="error" onClose={() => setShowError(false)}>
          {error}
        </Alert>
      )}

      {/* Resultados */}
      {processos && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h3 className="text-xl font-bold text-gray-900">
                Processos Eletrônicos Encontrados
              </h3>
              <div className="flex items-center gap-3">
                {processosFiltrados.length > 0 && (
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-semibold">
                    {processosFiltrados.length} {processosFiltrados.length === 1 ? 'processo' : 'processos'}
                    {processos.processos && processosFiltrados.length !== processos.processos.length && 
                      ` de ${processos.processos.length}`}
                  </span>
                )}
                {processosFiltrados.length > 0 && (
                  <button
                    onClick={handleExportarExcel}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center gap-2 text-sm font-medium"
                    title="Exportar dados para Excel"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    <span>Exportar Excel</span>
                  </button>
                )}
              </div>
            </div>
            {processos.metadata && (
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                {processos.metadata.responseDateTime && (
                  <div>
                    <span className="font-semibold">Data da Consulta:</span>{' '}
                    {processos.metadata.responseDateTime}
                  </div>
                )}
                {processos.metadata.responseId && (
                  <div>
                    <span className="font-semibold">ID da Resposta:</span>{' '}
                    <span className="font-mono text-xs">{processos.metadata.responseId}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {processosFiltrados.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Número do Processo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data de Protocolo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subtipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Localização
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Situação
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Relação
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {processosFiltrados.map((processo: ProcessoEletronico, index: number) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900">
                          {processo.numeroDoProcesso || processo.numero_do_processo || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-700">
                          {processo.dataDeProtocolo || processo.data_de_protocolo || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {processo.tipoDoProcesso || processo.tipo_do_processo || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-sm text-gray-700 max-w-xs truncate block"
                          title={processo.subtipoDoProcesso || processo.subtipo_do_processo || 'N/A'}
                        >
                          {processo.subtipoDoProcesso || processo.subtipo_do_processo || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {processo.localizacao || processo.localizacao || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            (processo.situacao || processo.situacao || '').toUpperCase() === 'ARQUIVADO'
                              ? 'bg-gray-100 text-gray-800'
                              : (processo.situacao || processo.situacao || '').toUpperCase() === 'CONFIRMADO'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {processo.situacao || processo.situacao || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {processo.relacaoDoInteressadoComOProcesso ||
                            processo.relacao_do_interessado_com_o_processo ||
                            'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <div className="text-gray-400 mb-2">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">
                {processos.processos && processos.processos.length > 0
                  ? 'Nenhum processo encontrado com os filtros aplicados'
                  : 'Nenhum processo encontrado'}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {processos.processos && processos.processos.length > 0
                  ? 'Tente ajustar os filtros de tipo ou situação'
                  : 'Não há processos eletrônicos para este CNPJ'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Estado vazio */}
      {!loading && !processos && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-600 text-lg">
            Digite um CNPJ e clique em "Pesquisar" para consultar os processos eletrônicos
          </p>
        </div>
      )}
    </div>
  );
};

export default EProcessosTab;

