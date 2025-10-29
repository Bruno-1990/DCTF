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
  // Colunas obrigatórias para planilhas DCTF
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

    // Validar se é um arquivo válido
    try {
      const workbook = XLSX.read(file, { type: 'buffer' });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        errors.push('Arquivo não contém planilhas válidas');
      }
    } catch (error) {
      errors.push('Arquivo corrompido ou formato inválido');
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
      // Ler planilha
      const workbook = XLSX.read(file, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Converter para JSON
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

      // Extrair cabeçalho
      const cabecalho = jsonData[0] as string[];
      const dadosLinhas = jsonData.slice(1) as any[][];

      // Validar cabeçalho
      const validacaoCabecalho = this.validarCabecalho(cabecalho);
      errors.push(...validacaoCabecalho.errors);
      warnings.push(...validacaoCabecalho.warnings);

      // Processar dados
      const dadosProcessados = this.processarDados(dadosLinhas, cabecalho);
      dados = dadosProcessados.dados;
      errors.push(...dadosProcessados.errors);
      warnings.push(...dadosProcessados.warnings);

      // Metadados
      metadados = {
        totalLinhas: dadosLinhas.length,
        colunasEncontradas: cabecalho,
        colunasObrigatorias: this.COLUNAS_OBRIGATORIAS.filter(c => c.obrigatoria).map(c => c.nome),
        colunasFaltantes: validacaoCabecalho.colunasFaltantes,
        encoding: 'UTF-8', // Assumindo UTF-8 para planilhas
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
   * Gerar template de planilha DCTF
   */
  static gerarTemplate(): Buffer {
    const dados = [
      // Cabeçalho
      this.COLUNAS_OBRIGATORIAS.map(c => c.nome),
      // Linha de exemplo
      [
        '001', // codigo
        'Receita Bruta', // descricao
        1000.00, // valor
        '2024-01', // periodo
        '2024-01-15', // data_ocorrencia
        '12345678000195', // cnpj_cpf
        '1.1.1.01.01', // codigo_receita
        'Exemplo de observação' // observacoes
      ]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(dados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DCTF');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
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

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
