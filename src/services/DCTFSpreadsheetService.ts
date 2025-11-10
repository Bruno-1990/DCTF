/**
 * Serviço de Validação de Planilhas DCTF
 * Implementa validação específica para upload e processamento de planilhas DCTF
 */

import * as XLSX from 'xlsx';
import { DCTFValidationService } from './DCTFValidationService';

export interface PlanilhaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dados: any[];
  metadados: {
    totalLinhas: number;
    colunasEncontradas: string[];
    colunasObrigatorias: string[];
    colunasFaltantes: string[];
    encoding: string;
    formato: string;
  };
}

export interface ColunaDCTF {
  nome: string;
  obrigatoria: boolean;
  tipo: 'string' | 'number' | 'date' | 'cnpj' | 'cpf' | 'codigo' | 'periodo';
  formato?: string;
  validacao?: (valor: any) => { isValid: boolean; error?: string };
}

export class DCTFSpreadsheetService {
  // Colunas internas padrão (layout antigo)
  private static readonly COLUNAS_OBRIGATORIAS: ColunaDCTF[] = [
    { nome: 'codigo', obrigatoria: true, tipo: 'codigo' },
    { nome: 'descricao', obrigatoria: true, tipo: 'string' },
    { nome: 'valor', obrigatoria: true, tipo: 'number' },
    { nome: 'periodo', obrigatoria: true, tipo: 'periodo' },
    { nome: 'data_ocorrencia', obrigatoria: true, tipo: 'date' },
    { nome: 'cnpj_cpf', obrigatoria: true, tipo: 'cnpj' },
    { nome: 'codigo_receita', obrigatoria: false, tipo: 'codigo' },
    { nome: 'observacoes', obrigatoria: false, tipo: 'string' }
  ];

  // Perfil alternativo (layout planilha em PT-BR da captura)
  private static readonly COLUNAS_PTBR = {
    tipoNi: ['tipo ni'],
    cnpj_cpf: ['cnpj'],
    periodo_apuracao: ['período de apuração', 'periodo de apuracao'],
    data_transmissao: ['data de transmissão', 'data de transmissao'],
    hora_transmissao: ['hora transmissão', 'hora transmissao'],
    categoria: ['categoria'],
    origem: ['origem'],
    tipo: ['tipo'],
    situacao: ['situação', 'situacao'],
    debito_apurado: ['débito apurado', 'debito apurado'],
    saldo_a_pagar: ['saldo a pagar'],
    observacoes: ['observações', 'observacoes']
  } as const;

  // Tamanho máximo de arquivo (10MB)
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

  // Tipos de arquivo permitidos
  private static readonly TIPOS_PERMITIDOS = ['.xls', '.xlsx', '.csv'];

  /**
   * Validar arquivo de planilha
   */
  static validateFile(file: Buffer, filename: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validar tamanho
    if (file.length > this.MAX_FILE_SIZE) {
      errors.push(`Arquivo excede tamanho máximo de ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Validar extensão
    const extensao = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!this.TIPOS_PERMITIDOS.includes(extensao)) {
      errors.push(`Tipo de arquivo não permitido. Use: ${this.TIPOS_PERMITIDOS.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Processar e validar planilha DCTF
   */
  static async processarPlanilha(file: Buffer, filename: string): Promise<PlanilhaValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let dados: any[] = [];
    let metadados: any = {};

    try {
      const workbook = XLSX.read(file, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (jsonData.length < 2) {
        errors.push('Planilha deve ter pelo menos 2 linhas (cabeçalho + dados)');
        return {
          isValid: false,
          errors,
          warnings,
          dados: [],
          metadados: {
            totalLinhas: 0,
            colunasEncontradas: [],
            colunasObrigatorias: this.COLUNAS_OBRIGATORIAS.map(c => c.nome),
            colunasFaltantes: this.COLUNAS_OBRIGATORIAS.map(c => c.nome),
            encoding: 'unknown',
            formato: 'unknown'
          }
        };
      }

      const cabecalhoOriginal = (jsonData[0] as any[]).map(v => (v ?? '').toString());
      const cabecalho = cabecalhoOriginal.map(col => col?.toString().trim().toLowerCase());
      const dadosLinhas = jsonData.slice(1) as any[][];

      // Detectar se é o layout PT-BR da captura (tem "débito apurado" e "saldo a pagar")
      const isPtBrLayout = cabecalho.some(h => this.COLUNAS_PTBR.debito_apurado.includes(h)) && cabecalho.some(h => this.COLUNAS_PTBR.saldo_a_pagar.includes(h));

      // Construir mapa de cabeçalhos -> nomes internos
      const { headerMap, faltantes, warningsCabecalho } = this.mapearCabecalho(cabecalho);
      warnings.push(...warningsCabecalho);

      // Validar colunas obrigatórias conforme o layout
      const obrigatoriasInternas = isPtBrLayout
        ? ['cnpj_cpf', 'periodo', 'data_ocorrencia', 'valor']
        : this.COLUNAS_OBRIGATORIAS.filter(c => c.obrigatoria).map(c => c.nome);

      const colunasFaltantes = obrigatoriasInternas.filter(c => !Object.values(headerMap).includes(c));
      if (colunasFaltantes.length > 0) {
        colunasFaltantes.forEach(c => errors.push(`Coluna obrigatória '${c}' não encontrada`));
      }

      // Processar linhas aplicando o headerMap
      const dadosProcessados = this.processarDadosComMapa(dadosLinhas, cabecalhoOriginal, headerMap, isPtBrLayout);
      dados = dadosProcessados.dados;
      errors.push(...dadosProcessados.errors);
      warnings.push(...dadosProcessados.warnings);

      metadados = {
        totalLinhas: dadosLinhas.length,
        colunasEncontradas: cabecalhoOriginal,
        colunasObrigatorias: obrigatoriasInternas,
        colunasFaltantes,
        encoding: 'UTF-8',
        formato: filename.toLowerCase().substring(filename.lastIndexOf('.'))
      };

    } catch (error: any) {
      errors.push(`Erro ao processar planilha: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dados,
      metadados
    };
  }

  /**
   * Mapeia cabeçalhos PT-BR/variantes para nomes internos
   */
  private static mapearCabecalho(cabecalhoNormalizado: string[]): { headerMap: Record<string, string>; faltantes: string[]; warningsCabecalho: string[] } {
    const warnings: string[] = [];
    const headerMap: Record<string, string> = {};

    const addMap = (labels: readonly string[], internal: string) => {
      for (const l of labels) {
        const idx = cabecalhoNormalizado.findIndex(h => h === l);
        if (idx !== -1) {
          headerMap[String(idx)] = internal;
          return true;
        }
      }
      return false;
    };

    // Mapear PT-BR
    addMap(this.COLUNAS_PTBR.cnpj_cpf, 'cnpj_cpf');
    addMap(this.COLUNAS_PTBR.periodo_apuracao, 'periodo_apuracao');
    addMap(this.COLUNAS_PTBR.data_transmissao, 'data_transmissao');
    addMap(this.COLUNAS_PTBR.hora_transmissao, 'hora_transmissao');
    addMap(this.COLUNAS_PTBR.debito_apurado, 'valor');
    addMap(this.COLUNAS_PTBR.saldo_a_pagar, 'saldo_a_pagar');
    addMap(this.COLUNAS_PTBR.categoria, 'categoria');
    addMap(this.COLUNAS_PTBR.origem, 'origem');
    addMap(this.COLUNAS_PTBR.tipo, 'tipo');
    addMap(this.COLUNAS_PTBR.situacao, 'situacao');
    addMap(this.COLUNAS_PTBR.observacoes, 'observacoes');

    // Também aceitar layout antigo mantendo nomes idênticos
    const legacy = ['codigo','descricao','valor','periodo','data_ocorrencia','cnpj_cpf','codigo_receita','observacoes'];
    legacy.forEach((n) => {
      const idx = cabecalhoNormalizado.findIndex(h => h === n);
      if (idx !== -1) headerMap[String(idx)] = n;
    });

    return { headerMap, faltantes: [], warningsCabecalho: warnings };
  }

  /**
   * Processar dados a partir do mapa de cabeçalhos
   */
  private static processarDadosComMapa(dadosLinhas: any[][], cabecalhoOriginal: string[], headerMap: Record<string, string>, isPtBrLayout: boolean): { dados: any[]; errors: string[]; warnings: string[] } {
    const dados: any[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < dadosLinhas.length; i++) {
      const linha = dadosLinhas[i];
      const numeroLinha = i + 2;

      if (!linha || linha.every(c => c === undefined || c === null || String(c).trim() === '')) continue;

      const obj: any = { linha: numeroLinha };
      for (let j = 0; j < linha.length; j++) {
        const internal = headerMap[String(j)];
        if (!internal) continue;
        obj[internal] = linha[j];
      }

      // Transformações específicas do layout PT-BR
      if (isPtBrLayout) {
        // periodo: derivar YYYY-MM a partir de 'periodo_apuracao' (provavelmente dd/mm/yyyy)
        if (obj['periodo_apuracao']) {
          const d = new Date(typeof obj['periodo_apuracao'] === 'number' ? XLSX.SSF.parse_date_code(obj['periodo_apuracao']) : obj['periodo_apuracao']);
          // Se veio em string dd/mm/yyyy
          if (typeof obj['periodo_apuracao'] === 'string') {
            const parts = obj['periodo_apuracao'].split('/');
            if (parts.length === 3) {
              const y = parts[2];
              const m = parts[1];
              obj['periodo'] = `${y}-${m.padStart(2,'0')}`;
            }
          }
          if (!obj['periodo']) {
            const y = (d as any).y || new Date(obj['periodo_apuracao']).getFullYear();
            const m = (d as any).m || (new Date(obj['periodo_apuracao']).getMonth()+1);
            obj['periodo'] = `${String(y)}-${String(m).padStart(2,'0')}`;
          }
        }

        // data_ocorrencia: usar data_transmissao
        if (obj['data_transmissao']) {
          obj['data_ocorrencia'] = this.parseDateCell(obj['data_transmissao']);
        }

        // valor: converter moeda brasileira
        if (obj['valor'] !== undefined) {
          obj['valor'] = this.parseBrlCurrency(obj['valor']);
        }

        // cnpj normalizar
        if (obj['cnpj_cpf']) {
          obj['cnpj_cpf'] = String(obj['cnpj_cpf']).replace(/\D/g, '');
        }
      }

      // Validar linha com o validador existente (flexível)
      const validacao = DCTFValidationService.validateDCTFLinha({
        codigo: obj['codigo'],
        descricao: obj['descricao'],
        valor: obj['valor'],
        dataOcorrencia: obj['data_ocorrencia'],
        cnpjCpf: obj['cnpj_cpf'],
        codigoReceita: obj['codigo_receita'],
        periodo: obj['periodo']
      });

      if (!validacao.isValid) {
        errors.push(...validacao.errors.map(e => `Linha ${numeroLinha}: ${e}`));
      }
      warnings.push(...validacao.warnings.map(w => `Linha ${numeroLinha}: ${w}`));

      // Marcar validade da linha para uso no preview
      (obj as any).__valid = validacao.isValid;

      dados.push(obj);
    }

    return { dados, errors, warnings };
  }

  private static parseDateCell(value: any): string {
    if (value == null || value === '') return '';
    if (typeof value === 'number') {
      // Excel serial
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        const jsDate = new Date(Date.UTC(date.y, (date.m || 1) - 1, date.d || 1));
        return jsDate.toISOString();
      }
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
    // tentar dd/mm/yyyy
    const parts = String(value).split('/');
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts.map(p => parseInt(p, 10));
      const jsDate = new Date(yyyy, mm - 1, dd);
      if (!isNaN(jsDate.getTime())) return jsDate.toISOString();
    }
    return String(value);
  }

  private static parseBrlCurrency(value: any): number {
    if (typeof value === 'number') return value;
    const s = String(value).trim();
    // Remover R$, pontos de milhar e trocar vírgula por ponto
    const normalized = s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Validar cabeçalho da planilha
   */
  private static validarCabecalho(cabecalho: string[]): {
    errors: string[];
    warnings: string[];
    colunasFaltantes: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const colunasFaltantes: string[] = [];

    // Normalizar cabeçalho (remover espaços, converter para minúsculo)
    const cabecalhoNormalizado = cabecalho.map(col => col?.toString().trim().toLowerCase() || '');

    // Verificar colunas obrigatórias
    for (const coluna of this.COLUNAS_OBRIGATORIAS) {
      if (coluna.obrigatoria) {
        const colunaEncontrada = cabecalhoNormalizado.find(col => 
          col === coluna.nome || 
          col === coluna.nome.replace('_', ' ') ||
          col === coluna.nome.replace('_', '-')
        );

        if (!colunaEncontrada) {
          colunasFaltantes.push(coluna.nome);
          errors.push(`Coluna obrigatória '${coluna.nome}' não encontrada`);
        }
      }
    }

    // Verificar colunas duplicadas
    const colunasDuplicadas = cabecalhoNormalizado.filter((col, index) => 
      cabecalhoNormalizado.indexOf(col) !== index
    );

    if (colunasDuplicadas.length > 0) {
      errors.push(`Colunas duplicadas encontradas: ${colunasDuplicadas.join(', ')}`);
    }

    // Verificar colunas não reconhecidas
    const colunasReconhecidas = this.COLUNAS_OBRIGATORIAS.map(c => c.nome);
    const colunasNaoReconhecidas = cabecalhoNormalizado.filter(col => 
      col && !colunasReconhecidas.includes(col)
    );

    if (colunasNaoReconhecidas.length > 0) {
      warnings.push(`Colunas não reconhecidas: ${colunasNaoReconhecidas.join(', ')}`);
    }

    return { errors, warnings, colunasFaltantes };
  }

  /**
   * Processar dados da planilha
   */
  private static processarDados(dadosLinhas: any[][], cabecalho: string[]): {
    dados: any[];
    errors: string[];
    warnings: string[];
  } {
    const dados: any[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < dadosLinhas.length; i++) {
      const linha = dadosLinhas[i];
      const numeroLinha = i + 2; // +2 porque começa do cabeçalho

      // Pular linhas vazias
      if (linha.every(celula => !celula || celula.toString().trim() === '')) {
        continue;
      }

      // Converter linha para objeto
      const linhaObj: any = {};
      for (let j = 0; j < cabecalho.length; j++) {
        const coluna = cabecalho[j]?.toString().trim().toLowerCase();
        const valor = linha[j];
        linhaObj[coluna] = valor;
      }

      // Validar linha
      const validacaoLinha = this.validarLinha(linhaObj, numeroLinha);
      errors.push(...validacaoLinha.errors);
      warnings.push(...validacaoLinha.warnings);

      dados.push(linhaObj);
    }

    return { dados, errors, warnings };
  }

  /**
   * Validar linha individual
   */
  private static validarLinha(linha: any, numeroLinha: number): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validar cada coluna obrigatória
    for (const coluna of this.COLUNAS_OBRIGATORIAS) {
      if (coluna.obrigatoria) {
        const valor = linha[coluna.nome];
        
        if (valor === null || valor === undefined || valor === '') {
          errors.push(`Linha ${numeroLinha}: Coluna '${coluna.nome}' é obrigatória`);
          continue;
        }

        // Validar tipo
        const validacaoTipo = this.validarTipoColuna(valor, coluna);
        if (!validacaoTipo.isValid) {
          errors.push(`Linha ${numeroLinha}: ${validacaoTipo.error}`);
        }
      }
    }

    // Validar dados DCTF específicos
    if (linha.codigo || linha.valor || linha.periodo) {
      const validacaoDCTF = DCTFValidationService.validateDCTFLinha({
        codigo: linha.codigo,
        valor: linha.valor,
        periodo: linha.periodo,
        cnpjCpf: linha.cnpj_cpf,
        codigoReceita: linha.codigo_receita,
        dataOcorrencia: linha.data_ocorrencia
      });

      errors.push(...validacaoDCTF.errors.map(e => `Linha ${numeroLinha}: ${e}`));
      warnings.push(...validacaoDCTF.warnings.map(w => `Linha ${numeroLinha}: ${w}`));
    }

    return { errors, warnings };
  }

  /**
   * Validar tipo de coluna
   */
  private static validarTipoColuna(valor: any, coluna: ColunaDCTF): {
    isValid: boolean;
    error?: string;
  } {
    switch (coluna.tipo) {
      case 'string':
        if (typeof valor !== 'string' && typeof valor !== 'number') {
          return { isValid: false, error: `Valor deve ser texto` };
        }
        break;

      case 'number':
        if (isNaN(Number(valor))) {
          return { isValid: false, error: `Valor deve ser numérico` };
        }
        break;

      case 'date':
        if (!this.isValidDate(valor)) {
          return { isValid: false, error: `Data inválida` };
        }
        break;

      case 'cnpj':
        const validacaoCNPJ = DCTFValidationService.validateCNPJCPF(valor?.toString() || '');
        if (!validacaoCNPJ.isValid) {
          return { isValid: false, error: `CNPJ/CPF inválido` };
        }
        break;

      case 'codigo':
        const validacaoCodigo = DCTFValidationService.validateDCTFCode(valor?.toString() || '');
        if (!validacaoCodigo.isValid) {
          return { isValid: false, error: `Código inválido` };
        }
        break;

      case 'periodo':
        const validacaoPeriodo = DCTFValidationService.validatePeriodoFiscal(valor?.toString() || '');
        if (!validacaoPeriodo.isValid) {
          return { isValid: false, error: `Período inválido` };
        }
        break;
    }

    return { isValid: true };
  }

  /**
   * Validar se é uma data válida
   */
  private static isValidDate(valor: any): boolean {
    if (!valor) return false;
    
    const data = new Date(valor);
    return !isNaN(data.getTime());
  }

  /**
   * Gerar template de planilha DCTF (layout PT-BR)
   */
  static gerarTemplate(): Buffer {
    const headers = [
      'Tipo NI',
      'CNPJ',
      'Período de Apuração',
      'Data de Transmissão',
      'Hora Transmissão',
      'Categoria',
      'Origem',
      'Tipo',
      'Situação',
      'Débito Apurado',
      'Saldo a Pagar',
      'Observações'
    ];

    const exemplo = [
      'CNPJ',
      '12345678000195',
      '01/01/2025',
      '15/02/2025',
      '10:30:00',
      'Geral',
      'eSocial',
      'Original',
      'Ativa',
      'R$ 1.234,56',
      'R$ 1.234,56',
      'Observação opcional sobre a linha'
    ];

    const dados = [headers, exemplo];

    const worksheet = XLSX.utils.aoa_to_sheet(dados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DCTF');

    const written: any = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const buffer: Buffer = Buffer.isBuffer(written)
      ? written
      : Buffer.from(typeof written === 'string' ? (written || 'xlsx') : 'xlsx');
    return buffer;
  }

  /**
   * Exportar dados para planilha
   */
  static exportarParaPlanilha(dados: any[]): Buffer {
    if (dados.length === 0) {
      throw new Error('Nenhum dado para exportar');
    }

    // Adicionar cabeçalho
    const cabecalho = Object.keys(dados[0]);
    const dadosComCabecalho = [cabecalho, ...dados.map(linha => 
      cabecalho.map(col => linha[col])
    )];

    const worksheet = XLSX.utils.aoa_to_sheet(dadosComCabecalho);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DCTF');

    const output: any = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    if (Buffer.isBuffer(output)) return output;
    if (typeof output === 'string') return Buffer.from(output);
    return Buffer.from('xlsx');
  }
}

