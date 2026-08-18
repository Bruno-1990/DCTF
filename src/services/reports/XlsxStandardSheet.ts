import ExcelJS from 'exceljs';

/**
 * Modelo padrão de planilha do sistema.
 *
 * É o mesmo desenho de `frontend/src/utils/exportExcel.ts` (cabeçalho azul escuro
 * fixo, bordas claras nos dados, largura automática), para que um relatório gerado
 * aqui no servidor saia com a mesma cara dos que a tela exporta.
 *
 * Além do modelo, este helper sabe **separar grupos**: informando `groupByColumn`,
 * ele pula linhas em branco toda vez que o valor daquela coluna muda. É o que
 * deixa visível, no registro de alterações, onde termina um CNPJ e começa o outro.
 * Os dados precisam chegar já ordenados por esse critério.
 */

export const HEADER_FILL = 'FF1F4E78';
export const HEADER_TEXT = 'FFFFFFFF';
export const DATA_BORDER = { style: 'thin' as const, color: { argb: 'FFE0E0E0' } };
export const HEADER_BORDER = { style: 'thin' as const };

/**
 * `Date` entra na lista porque data gravada como TEXTO ordena alfabeticamente:
 * 01/12 vem antes de 02/01, e o filtro do Excel não oferece "depois de". Com
 * `Date` + `numFmt`, a célula mostra dd/mm/aaaa e continua sendo data.
 */
export type CellValue = string | number | Date | null | undefined;

/**
 * Formatação de UMA coluna.
 *
 * Existe porque o padrão "tudo texto à esquerda" serve para relatório de
 * cadastro, mas não para relatório com dinheiro: valores alinhados à esquerda e
 * sem separador de milhar não se comparam de relance, e é comparar que a pessoa
 * está fazendo quando abre a planilha.
 */
export interface ColumnFormat {
  /** Formato numérico do Excel — ex.: `'R$ #,##0.00'`, `'dd/mm/yyyy'`. */
  numFmt?: string;
  align?: 'left' | 'center' | 'right';
  /** Largura fixa. Sem isso, a largura sai do conteúdo mais longo. */
  width?: number;
}

export interface StandardSheetOptions {
  sheetName: string;
  headers: string[];
  rows: CellValue[][];
  /** Formatação por coluna, na mesma ordem de `headers`. */
  columnFormats?: Array<ColumnFormat | undefined>;
  /** Linha de título acima do cabeçalho — some quando não informada. */
  titulo?: string;
  /** Subtítulo da linha de título (competência, filtro aplicado…). */
  subtitulo?: string;
  /** Índice (base 0) da coluna que agrupa. Ao mudar de valor, pula linhas. */
  groupByColumn?: number;
  /** Quantas linhas em branco entre um grupo e o próximo. Padrão: 2. */
  groupSpacing?: number;
  /** Destaca em negrito a primeira linha de cada grupo. Padrão: true quando agrupado. */
  boldFirstRowOfGroup?: boolean;
  /** Liga o filtro do Excel no cabeçalho. Padrão: true. */
  autoFilter?: boolean;
}

/** Excel não aceita * ? : \ / [ ] no nome da aba, e corta em 31 caracteres. */
function sanitizeSheetName(name: string): string {
  const sanitized = name
    .replace(/[*?:\\/[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 31)
    .trim();
  return sanitized || 'Planilha';
}

export async function buildStandardSheet(options: StandardSheetOptions): Promise<Buffer> {
  const {
    sheetName,
    headers,
    rows,
    columnFormats,
    titulo,
    subtitulo,
    groupByColumn,
    groupSpacing = 2,
    boldFirstRowOfGroup = true,
    autoFilter = true,
  } = options;

  // Com título, o cabeçalho desce e o congelamento tem de acompanhar — senão a
  // rolagem prende a faixa de título e esconde os nomes das colunas.
  const linhasDeTitulo = titulo ? (subtitulo ? 2 : 1) : 0;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: 'frozen', ySplit: linhasDeTitulo + 1 }],
  });

  if (titulo) {
    const linha = sheet.addRow([titulo]);
    linha.height = 26;
    linha.getCell(1).font = { bold: true, size: 14, color: { argb: HEADER_FILL } };
    sheet.mergeCells(1, 1, 1, headers.length);
    if (subtitulo) {
      const sub = sheet.addRow([subtitulo]);
      sub.height = 18;
      sub.getCell(1).font = { size: 11, color: { argb: 'FF666666' } };
      sheet.mergeCells(2, 1, 2, headers.length);
    }
  }

  const headerRow = sheet.addRow(headers);
  headerRow.height = 30;
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 12 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      top: HEADER_BORDER,
      left: HEADER_BORDER,
      bottom: HEADER_BORDER,
      right: HEADER_BORDER,
    };
  });

  const agrupando = typeof groupByColumn === 'number' && groupByColumn >= 0;
  let grupoAnterior: string | undefined;

  rows.forEach(valores => {
    let primeiraDoGrupo = false;

    if (agrupando) {
      const chave = String(valores[groupByColumn as number] ?? '');
      if (grupoAnterior === undefined) {
        primeiraDoGrupo = true;
      } else if (chave !== grupoAnterior) {
        // As linhas em branco não recebem borda: é justamente o respiro que
        // marca a troca de empresa.
        for (let i = 0; i < groupSpacing; i += 1) {
          sheet.addRow([]);
        }
        primeiraDoGrupo = true;
      }
      grupoAnterior = chave;
    }

    const row = sheet.addRow(valores as any[]);
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const formato = columnFormats?.[colNumber - 1];
      // Sem quebra automática: com altura fixa, um valor longo (JSON de CNAEs,
      // por exemplo) apareceria cortado no meio da segunda linha. Melhor a
      // célula truncar e o usuário alargar a coluna quando quiser ler inteiro.
      cell.alignment = {
        vertical: 'middle',
        horizontal: formato?.align ?? 'left',
        wrapText: false,
      };
      cell.border = { top: DATA_BORDER, left: DATA_BORDER, bottom: DATA_BORDER, right: DATA_BORDER };
      // Só numera o que É número: aplicar formato de moeda a uma célula vazia
      // faria o Excel exibir "R$ 0,00" onde não há valor — e zero apurado é
      // diferente de valor ausente.
      if (formato?.numFmt && (typeof cell.value === 'number' || cell.value instanceof Date)) {
        cell.numFmt = formato.numFmt;
      }
      if (primeiraDoGrupo && boldFirstRowOfGroup) {
        cell.font = { bold: true };
      }
    });
  });

  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    const larguraFixa = columnFormats?.[index]?.width;
    if (larguraFixa) {
      column.width = larguraFixa;
      return;
    }
    let maxLength = header.length;
    column.eachCell({ includeEmpty: false }, cell => {
      const value = cell.value === null || cell.value === undefined ? '' : String(cell.value);
      maxLength = Math.max(maxLength, value.length);
    });
    column.width = Math.min(60, Math.max(15, maxLength + 2));
  });

  if (autoFilter && rows.length > 0) {
    // O intervalo vai até a última linha de propósito: sem isso o Excel pararia
    // o filtro na primeira linha em branco, cobrindo só o primeiro grupo.
    const ultimaColuna = sheet.getColumn(headers.length).letter;
    const linhaCabecalho = linhasDeTitulo + 1;
    sheet.autoFilter = {
      from: `A${linhaCabecalho}`,
      to: `${ultimaColuna}${sheet.rowCount}`,
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Deixa o valor em texto corrido para a planilha.
 *
 * Campos como `atividades_secundarias` são guardados em JSON
 * (`[{"code":"18.21-1-00","text":"Serviços de pré-impressão"}, ...]`). Numa
 * célula, isso é ilegível — vira `18.21-1-00 Serviços de pré-impressão; ...`.
 * Texto que não é JSON passa intacto.
 */
export function formatarValorLegivel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'string') {
    const texto = value.trim();
    if (texto.startsWith('[') || texto.startsWith('{')) {
      try {
        return formatarValorLegivel(JSON.parse(texto));
      } catch {
        return value; // não era JSON de verdade: devolve como veio
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(formatarValorLegivel).filter(Boolean).join('; ');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('code' in obj || 'text' in obj) {
      return [obj.code, obj.text].filter(Boolean).map(String).join(' ').trim();
    }
    if ('nome' in obj || 'qual' in obj) {
      return [obj.nome, obj.qual].filter(Boolean).map(String).join(' — ');
    }
    return Object.entries(obj)
      .map(([chave, valor]) => `${chave}: ${formatarValorLegivel(valor)}`)
      .join('; ');
  }

  return String(value);
}

/** 00.000.000/0000-00 — mesma apresentação dos demais relatórios. */
export function formatarCnpj(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return String(value || '');
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export default buildStandardSheet;
