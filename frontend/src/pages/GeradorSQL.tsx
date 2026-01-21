import React, { useState } from 'react';
import { geradorSQLService } from '../services/geradorSQL';
import { useToast } from '../hooks/useToast';
import { ArrowPathIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';

interface ObjetoEncontrado {
  object: string;
  type: 'VIEW' | 'TABLE';
  score: number;
  layer?: string;
  metadata: {
    name: string;
    domain_tags?: string[];
    total_colunas: number;
    colunas: Array<{
      nome: string;
      tipo: string;
      tags?: string[];
    }>;
  };
}

const GeradorSQL: React.FC = () => {
  const { success, error: showError } = useToast();
  const [abaAtiva, setAbaAtiva] = useState<'catalogo' | 'sql-direto'>('catalogo');
  
  // Estados para busca no catálogo
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState('');
  const [tipo, setTipo] = useState<'VIEW' | 'TABLE' | ''>('');
  const [quantidade, setQuantidade] = useState(10);
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<ObjetoEncontrado[]>([]);
  const [sqlGerado, setSqlGerado] = useState('');
  const [objetoSelecionado, setObjetoSelecionado] = useState<ObjetoEncontrado | null>(null);
  const [executandoSQL, setExecutandoSQL] = useState(false);
  const [resultadosSQL, setResultadosSQL] = useState<any[]>([]);
  const [colunasSQL, setColunasSQL] = useState<string[]>([]);
  const [rowCountSQL, setRowCountSQL] = useState(0);
  
  // Estados para consulta SQL direta
  const [sqlDireto, setSqlDireto] = useState('');
  const [loadingSQLDireto, setLoadingSQLDireto] = useState(false);
  const [resultadosSQLDireto, setResultadosSQLDireto] = useState<any[]>([]);
  const [colunasSQLDireto, setColunasSQLDireto] = useState<string[]>([]);
  const [rowCountSQLDireto, setRowCountSQLDireto] = useState(0);
  const [copiadoSQL, setCopiadoSQL] = useState(false);

  const areasDisponiveis = [
    { value: '', label: 'Todas' },
    { value: 'rh', label: 'RH' },
    { value: 'fiscal', label: 'Fiscal' },
    { value: 'estoque', label: 'Estoque' },
    { value: 'contabil', label: 'Contábil' },
    { value: 'vendas', label: 'Vendas' },
  ];

  const tiposDisponiveis = [
    { value: '', label: 'Todos' },
    { value: 'VIEW', label: 'VIEW' },
    { value: 'TABLE', label: 'TABLE' },
  ];

  const handleBuscar = async () => {
    if (!busca.trim()) {
      showError('Campo "Busca" é obrigatório');
      return;
    }

    setLoading(true);
    setResultados([]);
    setSqlGerado('');
    setObjetoSelecionado(null);
    setResultadosSQL([]);
    setColunasSQL([]);
    setRowCountSQL(0);

    try {
      const jsonBusca = {
        query: busca,
        domain: area || undefined,
        type: tipo || undefined,
        top_k: quantidade,
      };

      const resultado = await geradorSQLService.buscarTabelas(jsonBusca);
      setResultados(resultado.objetos || []);
      
      if (resultado.objetos && resultado.objetos.length > 0) {
        success(`${resultado.objetos.length} objeto(s) encontrado(s)!`);
      } else {
        showError('Nenhum objeto encontrado com os critérios informados');
      }
    } catch (err: any) {
      showError(err.message || 'Erro ao buscar no catálogo');
    } finally {
      setLoading(false);
    }
  };

  const handleGerarSQL = async (objeto: ObjetoEncontrado) => {
    try {
      setLoading(true);
      const sql = await geradorSQLService.gerarSQL({
        objeto: objeto.object,
        tipo: objeto.type,
        colunas: objeto.metadata.colunas || [],
      });
      
      setSqlGerado(sql);
      setObjetoSelecionado(objeto);
      setResultadosSQL([]);
      setColunasSQL([]);
      setRowCountSQL(0);
      success('SQL gerado com sucesso!');
    } catch (err: any) {
      showError(err.message || 'Erro ao gerar SQL');
    } finally {
      setLoading(false);
    }
  };

  const copiarSQL = async () => {
    if (!sqlGerado || !sqlGerado.trim()) {
      showError('Nenhum SQL para copiar');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sqlGerado);
        setCopiadoSQL(true);
        setTimeout(() => setCopiadoSQL(false), 2000);
        success('SQL copiado para a área de transferência!');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = sqlGerado;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            setCopiadoSQL(true);
            setTimeout(() => setCopiadoSQL(false), 2000);
            success('SQL copiado para a área de transferência!');
          } else {
            showError('Não foi possível copiar o SQL. Tente selecionar e copiar manualmente.');
          }
        } catch (err) {
          showError('Erro ao copiar SQL. Tente selecionar e copiar manualmente.');
        } finally {
          // Verificar se o elemento ainda existe antes de remover
          if (textArea && textArea.parentNode) {
            textArea.parentNode.removeChild(textArea);
          }
        }
      }
    } catch (err: any) {
      console.error('Erro ao copiar SQL:', err);
      showError('Erro ao copiar SQL. Tente selecionar e copiar manualmente.');
    }
  };

  const handleExecutarSQL = async () => {
    if (!sqlGerado.trim()) {
      showError('Nenhum SQL para executar');
      return;
    }

    setExecutandoSQL(true);
    setResultadosSQL([]);
    setColunasSQL([]);
    setRowCountSQL(0);

    try {
      const resultado = await geradorSQLService.executarSQL(sqlGerado, 1000);
      
      if (resultado.rows && resultado.rows.length > 0) {
        const colunas = resultado.columns && resultado.columns.length > 0
          ? resultado.columns
          : resultado.rows[0].map((_: any, index: number) => `Coluna ${index + 1}`);
        
        setColunasSQL(colunas);
        setResultadosSQL(resultado.rows);
        setRowCountSQL(resultado.rowCount);
        success(`${resultado.rowCount} registro(s) encontrado(s)!`);
      } else {
        showError('Nenhum resultado encontrado');
      }
    } catch (err: any) {
      showError(err.message || 'Erro ao executar SQL no banco');
    } finally {
      setExecutandoSQL(false);
    }
  };

  const exportarResultados = () => {
    if (!resultados || resultados.length === 0) {
      showError('Nenhum resultado para exportar');
      return;
    }

    try {
      let conteudo = '';
      resultados.forEach((obj) => {
        conteudo += obj.object + '\n';
      });
      
      const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const nomeArquivo = `objetos_encontrados_${timestamp}.txt`;
      
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      
      // Aguardar um pouco antes de remover para garantir que o download iniciou
      setTimeout(() => {
        // Verificar se o elemento ainda existe antes de remover
        if (link && link.parentNode) {
          link.parentNode.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 100);
      
      success(`Arquivo ${nomeArquivo} exportado com sucesso! (${resultados.length} objeto(s))`);
    } catch (err: any) {
      console.error('Erro ao exportar resultados:', err);
      showError('Erro ao exportar resultados. Tente novamente.');
    }
  };

  const handleSQLDireto = async () => {
    if (!sqlDireto.trim()) {
      showError('Digite uma consulta SQL');
      return;
    }

    setLoadingSQLDireto(true);
    setResultadosSQLDireto([]);
    setColunasSQLDireto([]);
    setRowCountSQLDireto(0);

    try {
      const resultado = await geradorSQLService.executarSQL(sqlDireto.trim(), 1000);
      
      if (resultado.rows && resultado.rows.length > 0) {
        const colunasResultado = resultado.columns && resultado.columns.length > 0
          ? resultado.columns
          : resultado.rows[0].map((_: any, index: number) => `Coluna ${index + 1}`);
        
        setColunasSQLDireto(colunasResultado);
        setResultadosSQLDireto(resultado.rows);
        setRowCountSQLDireto(resultado.rowCount);
        success(`${resultado.rowCount} registro(s) encontrado(s)!`);
      } else {
        showError('Nenhum resultado encontrado');
      }
    } catch (err: any) {
      showError(err.message || 'Erro ao executar SQL no banco');
    } finally {
      setLoadingSQLDireto(false);
    }
  };

  const handleKeyPressSQLDireto = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSQLDireto();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Gerador de SQL - SCI</h1>
          <p className="mt-2 text-sm text-gray-600">
            Busque tabelas e views no catálogo SCI e gere queries SQL automaticamente, ou execute consultas SQL diretamente
          </p>
        </div>

        {/* Abas */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setAbaAtiva('catalogo')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                abaAtiva === 'catalogo'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Busca no Catálogo
            </button>
            <button
              onClick={() => setAbaAtiva('sql-direto')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                abaAtiva === 'sql-direto'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Consulta SQL Direta
            </button>
          </nav>
        </div>

        {/* Conteúdo da Aba de Busca no Catálogo */}
        {abaAtiva === 'catalogo' && (
          <>
        {/* Formulário de Busca */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Buscar no Catálogo</h2>
          </div>

          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Campo Busca */}
              <div>
                <label htmlFor="busca" className="block text-sm font-medium text-gray-700 mb-2">
                  Busca <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleBuscar()}
                  placeholder="Ex: centro de custo, colaborador..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Digite palavras-chave relacionadas ao que procura
                </p>
              </div>

              {/* Campo Área */}
              <div>
                <label htmlFor="area" className="block text-sm font-medium text-gray-700 mb-2">
                  Área
                </label>
                <select
                  id="area"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                >
                  {areasDisponiveis.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Filtre por domínio do negócio
                </p>
              </div>

              {/* Campo Tipo */}
              <div>
                <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo
                </label>
                <select
                  id="tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as 'VIEW' | 'TABLE' | '')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                >
                  {tiposDisponiveis.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  VIEW (recomendado) ou TABLE
                </p>
              </div>

              {/* Campo Quantidade */}
              <div>
                <label htmlFor="quantidade" className="block text-sm font-medium text-gray-700 mb-2">
                  Quantidade
                </label>
                <input
                  type="number"
                  id="quantidade"
                  value={quantidade}
                  onChange={(e) => setQuantidade(parseInt(e.target.value) || 10)}
                  min={1}
                  max={50}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Número de resultados (1-50)
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleBuscar}
                disabled={loading || !busca.trim()}
                className={`px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center gap-2 ${
                  loading || !busca.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? (
                  <>
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  'Buscar'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Resultados */}
        {resultados.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  Resultados ({resultados.length})
                </h2>
                <button
                  onClick={exportarResultados}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Exportar Objetos (TXT)
                </button>
              </div>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-4">
                {resultados.map((obj, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 hover:bg-gray-50 transition-colors ${
                      objetoSelecionado?.object === obj.object 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg text-gray-900">
                            {obj.object}
                          </h3>
                          <span className={`px-2 py-1 text-xs rounded ${
                            obj.type === 'VIEW' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {obj.type}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-4 text-sm text-gray-600">
                          <span>Score: <strong>{obj.score.toFixed(3)}</strong></span>
                          {obj.layer && (
                            <span>Layer: <strong>{obj.layer}</strong></span>
                          )}
                        </div>
                        {obj.metadata.domain_tags && obj.metadata.domain_tags.length > 0 && (
                          <p className="text-sm text-gray-600 mt-1">
                            Domínios: <span className="font-medium">{obj.metadata.domain_tags.join(', ')}</span>
                          </p>
                        )}
                        {obj.metadata.colunas && obj.metadata.colunas.length > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            Colunas principais: {obj.metadata.colunas.slice(0, 5).map((c) => c.nome).join(', ')}
                            {obj.metadata.colunas.length > 5 && ` (+${obj.metadata.colunas.length - 5} mais)`}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleGerarSQL(obj)}
                          disabled={loading}
                          className="ml-4 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Gerar SQL
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SQL Gerado */}
        {sqlGerado && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">
                      SQL Gerado
                    </h2>
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                      Apenas SELECT permitido
                    </span>
                  </div>
                  {objetoSelecionado && (
                    <p className="text-sm text-gray-600 mt-1">
                      Para: <strong>{objetoSelecionado.object}</strong> ({objetoSelecionado.type})
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    ⚠️ Por segurança, apenas consultas SELECT são permitidas. Comandos INSERT, UPDATE, DELETE são bloqueados.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExecutarSQL}
                    disabled={executandoSQL}
                    className={`px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ${
                      executandoSQL ? 'animate-pulse' : ''
                    }`}
                  >
                    {executandoSQL ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Executando...
                      </>
                    ) : (
                      'Executar SQL'
                    )}
                  </button>
                  <button
                    onClick={copiarSQL}
                    disabled={!sqlGerado || !sqlGerado.trim()}
                    className={`px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors ${
                      !sqlGerado || !sqlGerado.trim() ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    Copiar SQL
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    SQL
                  </label>
                  <button
                    onClick={copiarSQL}
                    disabled={!sqlGerado || !sqlGerado.trim()}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      copiadoSQL
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } ${
                      !sqlGerado || !sqlGerado.trim() ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title="Copiar SQL"
                  >
                    {copiadoSQL ? (
                      <>
                        <ClipboardDocumentCheckIcon className="h-4 w-4" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <ClipboardDocumentIcon className="h-4 w-4" />
                        Copiar SQL
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={sqlGerado}
                  onChange={(e) => setSqlGerado(e.target.value)}
                  className="w-full bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-48 resize-y"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Resultados da Consulta SQL */}
        {resultadosSQL.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  Resultados da Consulta
                </h2>
                <span className="text-sm text-gray-600">
                  {rowCountSQL} registro(s) encontrado(s)
                </span>
              </div>
            </div>
            <div className="px-6 py-4 overflow-x-auto">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {colunasSQL.map((col, index) => (
                        <th
                          key={index}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {resultadosSQL.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        {row.map((cell: any, cellIndex: number) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                          >
                            {cell === null || cell === undefined ? (
                              <span className="text-gray-400 italic">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {resultadosSQL.length >= 1000 && (
              <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-200">
                <p className="text-sm text-yellow-800">
                  ⚠️ Mostrando apenas os primeiros 1000 registros. Ajuste o SQL para ver mais resultados.
                </p>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* Conteúdo da Aba de Consulta SQL Direta */}
        {abaAtiva === 'sql-direto' && (
          <>
            {/* Formulário SQL Direto */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Consulta SQL Direta</h2>
                <p className="text-xs text-gray-500 mt-1">
                  ⚠️ Por segurança, apenas consultas SELECT são permitidas. Pressione Ctrl+Enter para executar.
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SQL Query
                    </label>
                    <textarea
                      value={sqlDireto}
                      onChange={(e) => setSqlDireto(e.target.value)}
                      onKeyDown={handleKeyPressSQLDireto}
                      placeholder="Digite sua consulta SQL aqui...&#10;Exemplo: SELECT * FROM VW_VRH_SISQUAL_COL_CENTROCUSTO LIMIT 10"
                      className="w-full bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-48 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSQLDireto}
                      disabled={loadingSQLDireto || !sqlDireto.trim()}
                      className={`px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center gap-2 ${
                        loadingSQLDireto || !sqlDireto.trim() ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {loadingSQLDireto ? (
                        <>
                          <ArrowPathIcon className="h-5 w-5 animate-spin" />
                          Executando...
                        </>
                      ) : (
                        'Buscar'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Resultados SQL Direto */}
            {resultadosSQLDireto.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Resultados da Consulta
                    </h2>
                    <span className="text-sm text-gray-600">
                      {rowCountSQLDireto} registro(s) encontrado(s)
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {colunasSQLDireto.map((col, index) => (
                            <th
                              key={index}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {resultadosSQLDireto.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-gray-50">
                            {row.map((cell: any, cellIndex: number) => (
                              <td
                                key={cellIndex}
                                className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                              >
                                {cell === null || cell === undefined ? (
                                  <span className="text-gray-400 italic">NULL</span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {resultadosSQLDireto.length >= 1000 && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        ⚠️ Mostrando apenas os primeiros 1000 registros. Ajuste o SQL para ver mais resultados.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mensagem quando não há resultados SQL Direto */}
            {!loadingSQLDireto && resultadosSQLDireto.length === 0 && sqlDireto.trim() && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
                <p className="text-gray-500">Nenhum resultado encontrado. Verifique sua consulta SQL.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GeradorSQL;
