import React, { useState } from 'react';
import { geradorSQLService } from '../services/geradorSQL';
import { useToast } from '../hooks/useToast';

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
  const [filtrosAbertos, setFiltrosAbertos] = useState<{ [key: string]: boolean }>({});
  const [filtrosPorObjeto, setFiltrosPorObjeto] = useState<{ [key: string]: { codEmpresa?: string; dataInicio?: string; dataFim?: string } }>({});
  
  // Estados para consulta personalizada de centro de custo
  const [abaAtiva, setAbaAtiva] = useState<'busca' | 'consulta-personalizada'>('busca');
  const [codCC, setCodCC] = useState('');
  const [codCol, setCodCol] = useState('');
  const [nomeCol, setNomeCol] = useState('');
  const [viewEspecifica, setViewEspecifica] = useState('');
  const [resultadosConsultaPersonalizada, setResultadosConsultaPersonalizada] = useState<any[]>([]);
  const [loadingConsultaPersonalizada, setLoadingConsultaPersonalizada] = useState(false);

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
    setFiltrosAbertos({});
    setFiltrosPorObjeto({});

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
      let sql = await geradorSQLService.gerarSQL({
        objeto: objeto.object,
        tipo: objeto.type,
        colunas: objeto.metadata.colunas || [],
      });
      
      // Aplicar filtros se existirem para este objeto
      sql = aplicarFiltrosAoSQL(sql, objeto.object);
      
      setSqlGerado(sql);
      setObjetoSelecionado(objeto);
      success('SQL gerado com sucesso!');
    } catch (err: any) {
      showError(err.message || 'Erro ao gerar SQL');
    } finally {
      setLoading(false);
    }
  };

  const handleConsultaPersonalizada = async () => {
    try {
      setLoadingConsultaPersonalizada(true);
      const resultado = await geradorSQLService.consultaCentroCusto({
        cod_cc: codCC || undefined,
        cod_col: codCol || undefined,
        nome_col: nomeCol || undefined,
        view: viewEspecifica || undefined,
      });
      
      setResultadosConsultaPersonalizada(resultado.resultados || []);
      success(`Consulta realizada com sucesso! ${resultado.total_views} view(s) consultada(s).`);
    } catch (err: any) {
      showError(err.message || 'Erro ao realizar consulta personalizada');
    } finally {
      setLoadingConsultaPersonalizada(false);
    }
  };

  const exportarResultados = () => {
    // Exportar apenas os nomes dos objetos retornados na busca
    if (!resultados || resultados.length === 0) {
      showError('Nenhum resultado para exportar');
      return;
    }

    try {
      // Criar conteúdo do arquivo TXT - apenas os nomes dos objetos
      let conteudo = '';
      
      // Exportar apenas os nomes: VIEW ou TABLE
      resultados.forEach((obj) => {
        conteudo += obj.object + '\n';
      });
      
      // Criar blob e fazer download
      const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Nome do arquivo com timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const nomeArquivo = `objetos_encontrados_${timestamp}.txt`;
      
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      success(`Arquivo ${nomeArquivo} exportado com sucesso! (${resultados.length} objeto(s))`);
    } catch (err: any) {
      console.error('Erro ao exportar resultados:', err);
      showError('Erro ao exportar resultados. Tente novamente.');
    }
  };

  const copiarSQL = async () => {
    if (!sqlGerado || !sqlGerado.trim()) {
      showError('Nenhum SQL para copiar');
      return;
    }

    try {
      // Tentar usar a API moderna do Clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sqlGerado);
        success('SQL copiado para a área de transferência!');
      } else {
        // Fallback para método antigo (compatibilidade)
        const textArea = document.createElement('textarea');
        textArea.value = sqlGerado;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            success('SQL copiado para a área de transferência!');
          } else {
            showError('Não foi possível copiar o SQL. Tente selecionar e copiar manualmente.');
          }
        } catch (err) {
          showError('Erro ao copiar SQL. Tente selecionar e copiar manualmente.');
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err: any) {
      console.error('Erro ao copiar SQL:', err);
      showError('Erro ao copiar SQL. Tente selecionar e copiar manualmente.');
    }
  };

  const toggleFiltros = (objetoNome: string) => {
    setFiltrosAbertos(prev => ({
      ...prev,
      [objetoNome]: !prev[objetoNome]
    }));
  };

  const atualizarFiltro = (objetoNome: string, campo: 'codEmpresa' | 'dataInicio' | 'dataFim', valor: string) => {
    setFiltrosPorObjeto(prev => ({
      ...prev,
      [objetoNome]: {
        ...prev[objetoNome],
        [campo]: valor
      }
    }));
  };

  const removerFiltros = (objetoNome: string) => {
    setFiltrosPorObjeto(prev => {
      const novo = { ...prev };
      delete novo[objetoNome];
      return novo;
    });
    setFiltrosAbertos(prev => ({
      ...prev,
      [objetoNome]: false
    }));
  };

  const aplicarFiltrosAoSQL = (sql: string, objetoNome: string): string => {
    const filtrosObj = filtrosPorObjeto[objetoNome];
    if (!filtrosObj) {
      return sql;
    }

    const condicoes: string[] = [];

    // Obter colunas do objeto selecionado para identificar campos corretos
    const colunasDisponiveis = objetoSelecionado?.metadata?.colunas || [];
    const nomesColunas = colunasDisponiveis.map((c: any) => c.nome.toUpperCase());
    
    // Também verificar no SQL SELECT para garantir que o campo existe
    const sqlUpper = sql.toUpperCase();
    const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/i);
    let camposNoSelect: string[] = [];
    
    if (selectMatch) {
      const selectPart = selectMatch[1];
      // Se for *, não podemos verificar campos específicos
      if (selectPart.trim() === '*') {
        // Se for *, usar apenas as colunas do metadata
        camposNoSelect = nomesColunas;
      } else {
        // Extrair nomes das colunas do SELECT
        camposNoSelect = selectPart
          .split(',')
          .map(c => {
            // Remover aliases (AS alias) e pegar apenas o nome da coluna
            const coluna = c.trim().toUpperCase();
            // Pegar a primeira palavra (nome da coluna antes de espaço ou AS)
            return coluna.split(/\s+(AS\s+)?/)[0];
          })
          .filter(c => c.length > 0);
      }
    }

    // Cod Empresa - procurar campo de empresa nas colunas E no SELECT
    if (filtrosObj.codEmpresa && filtrosObj.codEmpresa.trim()) {
      const camposEmpresa = ['BDCODEMP', 'CODEMP', 'CODEMPRESA', 'CODEMPREGADO', 'CODEMPRESASALARIO'];
      const campoEmpresa = camposEmpresa.find(campo => {
        const campoUpper = campo.toUpperCase();
        // Verificar se existe nas colunas E no SELECT
        return nomesColunas.includes(campoUpper) && camposNoSelect.includes(campoUpper);
      });
      
      // Só adiciona filtro se o campo realmente existir nas colunas E no SELECT
      if (campoEmpresa) {
        condicoes.push(`${campoEmpresa} = ${filtrosObj.codEmpresa.trim()}`);
      }
      // Se não encontrou campo de empresa, não adiciona filtro (evita erro)
    }

    // Data Inicio - procurar campo de data nas colunas E no SELECT
    if (filtrosObj.dataInicio && filtrosObj.dataInicio.trim()) {
      const camposData = ['DATAINICIO', 'BDDATAADMCOL', 'BDDATA', 'DATA', 'DTINICIO', 'DTINICIAL', 'DATAINICIAL'];
      const campoData = camposData.find(campo => {
        const campoUpper = campo.toUpperCase();
        // Verificar se existe nas colunas E no SELECT
        return nomesColunas.includes(campoUpper) && camposNoSelect.includes(campoUpper);
      });
      
      // Só adiciona filtro se o campo realmente existir nas colunas E no SELECT
      if (campoData) {
        condicoes.push(`${campoData} >= '${filtrosObj.dataInicio.trim()}'`);
      }
      // Se não encontrou campo de data, não adiciona filtro (evita erro)
    }

    // Data Fim - usar o mesmo campo de data encontrado para início
    if (filtrosObj.dataFim && filtrosObj.dataFim.trim()) {
      // Primeiro, verificar se já encontramos um campo de data para início
      const camposDataInicio = ['DATAINICIO', 'BDDATAADMCOL', 'BDDATA', 'DATA', 'DTINICIO', 'DTINICIAL', 'DATAINICIAL'];
      const campoDataInicio = camposDataInicio.find(campo => {
        const campoUpper = campo.toUpperCase();
        return nomesColunas.includes(campoUpper) && camposNoSelect.includes(campoUpper);
      });
      
      // Se encontrou campo de data início, usar o mesmo para fim
      if (campoDataInicio) {
        condicoes.push(`${campoDataInicio} <= '${filtrosObj.dataFim.trim()}'`);
      } else {
        // Se não encontrou, tentar campos específicos de data fim
        const camposDataFim = ['DATAFIM', 'DTFIM', 'DTFINAL', 'DATAINICIO', 'BDDATAADMCOL', 'BDDATA', 'DATA'];
        const campoDataFim = camposDataFim.find(campo => {
          const campoUpper = campo.toUpperCase();
          return nomesColunas.includes(campoUpper) && camposNoSelect.includes(campoUpper);
        });
        
        if (campoDataFim) {
          condicoes.push(`${campoDataFim} <= '${filtrosObj.dataFim.trim()}'`);
        }
      }
      // Se não encontrou campo de data, não adiciona filtro (evita erro)
    }

    if (condicoes.length === 0) {
      return sql;
    }

    const whereClause = condicoes.join(' AND ');

    if (sqlUpper.includes('WHERE')) {
      const whereRegex = /WHERE\s+/i;
      const whereMatch = sql.match(whereRegex);
      
      if (whereMatch) {
        const whereIndex = whereMatch.index! + whereMatch[0].length;
        const afterWhere = sql.substring(whereIndex).trim();
        
        if (afterWhere && !afterWhere.toUpperCase().trim().startsWith('1=1')) {
          return sql.substring(0, whereIndex) + `${whereClause} AND ${afterWhere}`;
        } else {
          return sql.replace(/WHERE\s+1\s*=\s*1/i, `WHERE ${whereClause}`)
                   .replace(/WHERE\s*$/i, `WHERE ${whereClause}`);
        }
      }
    }
    
    const orderByIndex = sqlUpper.indexOf('ORDER BY');
    const limitIndex = sqlUpper.indexOf('LIMIT');
    
    let insertPosition = sql.length;
    if (orderByIndex !== -1) {
      insertPosition = orderByIndex;
    } else if (limitIndex !== -1) {
      insertPosition = limitIndex;
    }
    
    const beforeWhere = sql.substring(0, insertPosition).trim();
    const afterWhere = sql.substring(insertPosition).trim();
    
    return `${beforeWhere} WHERE ${whereClause}${afterWhere ? ' ' + afterWhere : ''}`.trim();
  };

  const aplicarFiltrosAoSQLTexto = (sql: string, filtrosTexto: string): string => {
    if (!filtrosTexto.trim()) {
      return sql;
    }

    // Parse dos filtros - espera formato: campo=valor ou campo operador valor
    // Exemplos: CNPJ=12345678000190, BDCODEMP=1, BDDATAADMCOL>='2024-01-01'
    const linhasFiltro = filtrosTexto
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('--'));

    if (linhasFiltro.length === 0) {
      return sql;
    }

    // Construir cláusula WHERE
    const condicoes: string[] = [];

    for (const linha of linhasFiltro) {
      // Suporta: campo=valor, campo>=valor, campo<=valor, campo>valor, campo<valor, campo!=valor, campo LIKE valor
      // Também suporta condições SQL completas (para usuários avançados)
      
      // Se já é uma condição SQL completa (contém AND, OR, etc), usar diretamente
      if (linha.toUpperCase().includes(' AND ') || linha.toUpperCase().includes(' OR ') || linha.toUpperCase().includes('(')) {
        condicoes.push(linha);
        continue;
      }

      // Tentar match com operadores: =, >=, <=, >, <, !=, LIKE, IN
      const match = linha.match(/^(\w+)\s*(=|>=|<=|>|<|!=|LIKE|IN)\s*(.+)$/i);
      
      if (match) {
        const [, campo, operador, valor] = match;
        let valorFormatado = valor.trim();
        
        // Se não tem aspas e não é número, adicionar aspas simples
        // Exceto para IN que pode ter lista entre parênteses
        if (operador.toUpperCase() === 'IN') {
          // IN já deve ter parênteses
          if (!valorFormatado.startsWith('(')) {
            valorFormatado = `(${valorFormatado})`;
          }
        } else if (!valorFormatado.match(/^['"].*['"]$/) && !valorFormatado.match(/^\d+(\.\d+)?$/) && !valorFormatado.toUpperCase().startsWith('(')) {
          // Adicionar aspas simples para strings
          valorFormatado = `'${valorFormatado.replace(/'/g, "''")}'`;
        }
        
        condicoes.push(`${campo} ${operador} ${valorFormatado}`);
      } else if (linha.includes('=')) {
        // Se não matchou o padrão, tentar como campo=valor simples
        const [campo, ...valorParts] = linha.split('=');
        const valor = valorParts.join('=').trim();
        let valorFormatado = valor;
        
        // Se valor já tem aspas ou é número, usar como está
        if (!valor.match(/^['"].*['"]$/) && !valor.match(/^\d+(\.\d+)?$/)) {
          valorFormatado = `'${valor.replace(/'/g, "''")}'`;
        }
        
        condicoes.push(`${campo.trim()} = ${valorFormatado}`);
      } else {
        // Se não tem = e não matchou padrão, adicionar como condição direta (para casos avançados)
        condicoes.push(linha);
      }
    }

    if (condicoes.length === 0) {
      return sql;
    }

    // Adicionar condições ao WHERE
    const sqlUpper = sql.toUpperCase();
    const whereClause = condicoes.join(' AND ');

    if (sqlUpper.includes('WHERE')) {
      // Se já tem WHERE, adicionar AND
      const whereRegex = /WHERE\s+/i;
      const whereMatch = sql.match(whereRegex);
      
      if (whereMatch) {
        const whereIndex = whereMatch.index! + whereMatch[0].length;
        const afterWhere = sql.substring(whereIndex).trim();
        
        // Verificar se já tem condições após WHERE
        if (afterWhere && !afterWhere.toUpperCase().trim().startsWith('1=1')) {
          // Adicionar AND antes das condições existentes
          return sql.substring(0, whereIndex) + `${whereClause} AND ${afterWhere}`;
        } else {
          // Se tem WHERE 1=1 ou WHERE vazio, substituir
          return sql.replace(/WHERE\s+1\s*=\s*1/i, `WHERE ${whereClause}`)
                   .replace(/WHERE\s*$/i, `WHERE ${whereClause}`);
        }
      }
    }
    
    // Se não tem WHERE, adicionar antes de ORDER BY ou LIMIT
    const orderByIndex = sqlUpper.indexOf('ORDER BY');
    const limitIndex = sqlUpper.indexOf('LIMIT');
    
    let insertPosition = sql.length;
    if (orderByIndex !== -1) {
      insertPosition = orderByIndex;
    } else if (limitIndex !== -1) {
      insertPosition = limitIndex;
    }
    
    const beforeWhere = sql.substring(0, insertPosition).trim();
    const afterWhere = sql.substring(insertPosition).trim();
    
    return `${beforeWhere} WHERE ${whereClause}${afterWhere ? ' ' + afterWhere : ''}`.trim();
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
      // O SQL já foi gerado com os filtros aplicados, então não precisa aplicar novamente
      const resultado = await geradorSQLService.executarSQL(sqlGerado, 100);
      
      if (resultado.rows && resultado.rows.length > 0) {
        // Usar nomes das colunas retornados pelo backend
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Gerador de SQL - SCI</h1>
          <p className="mt-2 text-sm text-gray-600">
            Busque tabelas e views no catálogo SCI e gere queries SQL automaticamente
          </p>
        </div>

        {/* Abas */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setAbaAtiva('busca')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                abaAtiva === 'busca'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Busca no Catálogo
            </button>
            <button
              onClick={() => setAbaAtiva('consulta-personalizada')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                abaAtiva === 'consulta-personalizada'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Consulta Personalizada - Centro de Custo
            </button>
          </nav>
        </div>

        {/* Conteúdo da Aba de Consulta Personalizada */}
        {abaAtiva === 'consulta-personalizada' && (
          <div className="space-y-6">
            {/* Formulário de Consulta */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Consulta Personalizada - Centro de Custo e Colaborador
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Código Centro de Custo
                  </label>
                  <input
                    type="text"
                    value={codCC}
                    onChange={(e) => setCodCC(e.target.value)}
                    placeholder="Ex: 4, 5, 16"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Código Colaborador
                  </label>
                  <input
                    type="text"
                    value={codCol}
                    onChange={(e) => setCodCol(e.target.value)}
                    placeholder="Ex: 147119, 147121"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome Colaborador (busca parcial)
                  </label>
                  <input
                    type="text"
                    value={nomeCol}
                    onChange={(e) => setNomeCol(e.target.value)}
                    placeholder="Ex: ALESSANDRA"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    View Específica (opcional)
                  </label>
                  <select
                    value={viewEspecifica}
                    onChange={(e) => setViewEspecifica(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas as views</option>
                    <option value="VW_VRH_SISQUAL_COL_CENTROCUSTO">VW_VRH_SISQUAL_COL_CENTROCUSTO</option>
                    <option value="VW_VRH_BASE_TCUSTOM_GPS_PGTO">VW_VRH_BASE_TCUSTOM_GPS_PGTO</option>
                    <option value="VW_VRH_BASE_TCUSTOM_GPS">VW_VRH_BASE_TCUSTOM_GPS</option>
                    <option value="VW_TOMADORES_REF_ATU">VW_TOMADORES_REF_ATU</option>
                    <option value="VW_VRHF_EMP_TPROVISAOFERIAS_CC">VW_VRHF_EMP_TPROVISAOFERIAS_CC</option>
                    <option value="VW_VRHF_EMP_TPROVISAO13_CC">VW_VRHF_EMP_TPROVISAO13_CC</option>
                    <option value="VW_VRHF_EMP_TPREPFN_ATU">VW_VRHF_EMP_TPREPFN_ATU</option>
                    <option value="VW_VRHF_EMP_TPREPFN">VW_VRHF_EMP_TPREPFN</option>
                    <option value="VW_TOMADORES_REF">VW_TOMADORES_REF</option>
                    <option value="VW_VRHF_FGTSSEFIP">VW_VRHF_FGTSSEFIP</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleConsultaPersonalizada}
                  disabled={loadingConsultaPersonalizada}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingConsultaPersonalizada ? 'Consultando...' : 'Consultar'}
                </button>
              </div>
            </div>

            {/* Resultados da Consulta Personalizada */}
            {resultadosConsultaPersonalizada.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Resultados da Consulta Personalizada
                  </h2>
                </div>
                <div className="p-6 space-y-6">
                  {resultadosConsultaPersonalizada.map((resultado, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-2">
                        {resultado.view}
                        {resultado.erro && (
                          <span className="ml-2 text-red-600 text-sm">(Erro: {resultado.erro})</span>
                        )}
                      </h3>
                      {resultado.campos && (
                        <div className="text-sm text-gray-600 mb-3">
                          <p><strong>Campos encontrados:</strong></p>
                          <ul className="list-disc list-inside ml-2">
                            {resultado.campos.cod_cc && <li>Cód. Centro de Custo: {resultado.campos.cod_cc}</li>}
                            {resultado.campos.desc_cc && <li>Desc. Centro de Custo: {resultado.campos.desc_cc}</li>}
                            {resultado.campos.cod_col && <li>Cód. Colaborador: {resultado.campos.cod_col}</li>}
                            {resultado.campos.nome_col && <li>Nome Colaborador: {resultado.campos.nome_col}</li>}
                          </ul>
                        </div>
                      )}
                      {resultado.resultados && resultado.resultados.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                {resultado.colunas?.map((col: string, colIdx: number) => (
                                  <th key={colIdx} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {resultado.resultados.slice(0, 20).map((row: any[], rowIdx: number) => (
                                <tr key={rowIdx} className="hover:bg-gray-50">
                                  {row.map((cell: any, cellIdx: number) => (
                                    <td key={cellIdx} className="px-4 py-2 text-sm text-gray-900">
                                      {cell || <span className="text-gray-400 italic">NULL</span>}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {resultado.total > 20 && (
                            <p className="mt-2 text-sm text-gray-600">
                              Mostrando 20 de {resultado.total} registros
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conteúdo da Aba de Busca Normal */}
        {abaAtiva === 'busca' && (
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
                className={`px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                  loading || !busca.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Buscando...' : 'Buscar'}
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
                        
                        {/* Formulário de Filtros */}
                        {filtrosAbertos[obj.object] && (
                          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-semibold text-gray-700">Filtros</h4>
                              <button
                                onClick={() => removerFiltros(obj.object)}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                Remover Filtros
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Cód. Empresa
                                </label>
                                <input
                                  type="number"
                                  value={filtrosPorObjeto[obj.object]?.codEmpresa || ''}
                                  onChange={(e) => atualizarFiltro(obj.object, 'codEmpresa', e.target.value)}
                                  placeholder="Ex: 1"
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Data Início
                                </label>
                                <input
                                  type="date"
                                  value={filtrosPorObjeto[obj.object]?.dataInicio || ''}
                                  onChange={(e) => atualizarFiltro(obj.object, 'dataInicio', e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Data Fim
                                </label>
                                <input
                                  type="date"
                                  value={filtrosPorObjeto[obj.object]?.dataFim || ''}
                                  onChange={(e) => atualizarFiltro(obj.object, 'dataFim', e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => toggleFiltros(obj.object)}
                          className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {filtrosAbertos[obj.object] ? 'Ocultar Filtros' : 'Add Filtro'}
                        </button>
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
                    className={`px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                      executandoSQL ? 'animate-pulse' : ''
                    }`}
                  >
                    {executandoSQL ? 'Executando...' : 'Consultar SQL no Banco'}
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
              {/* Mostrar filtros aplicados se houver */}
              {objetoSelecionado && filtrosPorObjeto[objetoSelecionado.object] && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-900 mb-2">Filtros aplicados:</p>
                  <div className="flex flex-wrap gap-2">
                    {filtrosPorObjeto[objetoSelecionado.object].codEmpresa && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        Cód. Empresa: {filtrosPorObjeto[objetoSelecionado.object].codEmpresa}
                      </span>
                    )}
                    {filtrosPorObjeto[objetoSelecionado.object].dataInicio && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        Data Início: {filtrosPorObjeto[objetoSelecionado.object].dataInicio}
                      </span>
                    )}
                    {filtrosPorObjeto[objetoSelecionado.object].dataFim && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        Data Fim: {filtrosPorObjeto[objetoSelecionado.object].dataFim}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* SQL Gerado */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SQL
                </label>
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
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
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
            {resultadosSQL.length >= 100 && (
              <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-200">
                <p className="text-sm text-yellow-800">
                  ⚠️ Mostrando apenas os primeiros 100 registros. Ajuste o SQL para ver mais resultados.
                </p>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};

export default GeradorSQL;

