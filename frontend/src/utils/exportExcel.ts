import ExcelJS from 'exceljs';

interface ExportOptions {
  filename: string;
  sheetName: string;
  headers: string[];
  data: any[][];
  title?: string;
  metadata?: Record<string, string>;
  /**
   * Índice (base 0) da coluna que agrupa as linhas. Quando informado, o
   * exportador pula linhas em branco toda vez que o valor daquela coluna muda —
   * é o que separa visualmente um CNPJ do outro. Os dados precisam chegar já
   * ordenados por essa coluna.
   */
  groupByColumn?: number;
  /** Quantas linhas em branco entre um grupo e o próximo. Padrão: 2. */
  groupSpacing?: number;
  /** Primeira linha de cada grupo em negrito. Padrão: true quando agrupado. */
  boldFirstRowOfGroup?: boolean;
  /**
   * Quebra automática de linha dentro da célula. Padrão: true (comportamento
   * histórico). Vale desligar em relatórios com valores longos: como a altura da
   * linha é fixa, o texto quebrado aparece cortado no meio da segunda linha.
   */
  wrapText?: boolean;
}

/**
 * Sanitiza o nome da planilha removendo caracteres inválidos do Excel
 * Caracteres inválidos: * ? : \ / [ ]
 * Limite de 31 caracteres
 */
function sanitizeSheetName(name: string): string {
  // Remove caracteres inválidos: * ? : \ / [ ]
  let sanitized = name.replace(/[*?:\\\/\[\]]/g, ' ');
  
  // Remove espaços múltiplos
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Limita a 31 caracteres (limite do Excel)
  if (sanitized.length > 31) {
    sanitized = sanitized.substring(0, 31).trim();
  }
  
  // Se ficou vazio, usa um nome padrão
  if (!sanitized) {
    sanitized = 'Planilha';
  }
  
  return sanitized;
}

/**
 * Deixa o valor em texto corrido para a planilha.
 *
 * Campos como `atividades_secundarias` chegam em JSON
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

/**
 * Função utilitária para exportar dados para Excel
 */
export async function exportToExcel(options: ExportOptions): Promise<void> {
  const {
    filename,
    sheetName,
    headers,
    data,
    title,
    metadata,
    groupByColumn,
    groupSpacing = 2,
    boldFirstRowOfGroup = true,
    wrapText = true,
  } = options;

  try {
    const workbook = new ExcelJS.Workbook();
    const sanitizedSheetName = sanitizeSheetName(sheetName);
    const sheet = workbook.addWorksheet(sanitizedSheetName, {
      views: [{ state: 'frozen', ySplit: 1 }], // Cabeçalho fixo
    });

    // Adicionar título se fornecido
    if (title) {
      const titleRow = sheet.addRow([title]);
      sheet.mergeCells(1, 1, 1, headers.length);
      titleRow.getCell(1).font = { bold: true, size: 14 };
      titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.addRow([]); // Linha em branco
    }

    // Adicionar cabeçalhos
    const headerRow = sheet.addRow(headers);

    // Adicionar dados (pulando linhas quando o grupo muda)
    const agrupando = typeof groupByColumn === 'number' && groupByColumn >= 0;
    const primeirasLinhasDeGrupo: number[] = [];
    let grupoAnterior: string | undefined;

    data.forEach((row) => {
      if (agrupando) {
        const chave = String(row[groupByColumn as number] ?? '');
        if (grupoAnterior === undefined) {
          primeirasLinhasDeGrupo.push(sheet.rowCount + 1);
        } else if (chave !== grupoAnterior) {
          // As linhas em branco ficam sem borda de propósito: é o respiro que
          // marca onde termina uma empresa e começa a outra.
          for (let i = 0; i < groupSpacing; i += 1) {
            sheet.addRow([]);
          }
          primeirasLinhasDeGrupo.push(sheet.rowCount + 1);
        }
        grupoAnterior = chave;
      }
      sheet.addRow(row);
    });

    // Estilizar cabeçalho
    const headerRowNumber = title ? 3 : 1;
    sheet.getRow(headerRowNumber).height = 30;
    sheet.getRow(headerRowNumber).eachCell((cell) => {
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
    const dataStartRow = headerRowNumber + 1;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > headerRowNumber) {
        row.height = 20;
        row.eachCell((cell) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'left',
            wrapText,
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

    // Primeira linha de cada grupo em negrito: ajuda a bater o olho e achar
    // onde cada empresa começa.
    if (agrupando && boldFirstRowOfGroup) {
      primeirasLinhasDeGrupo.forEach((rowNumber) => {
        sheet.getRow(rowNumber).eachCell((cell) => {
          cell.font = { bold: true };
        });
      });
    }

    // Ajustar largura das colunas
    sheet.columns.forEach((column, index) => {
      let maxLength = headers[index]?.length || 10;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const cellValue = String(cell.value || '');
        if (cellValue.length > maxLength) {
          maxLength = cellValue.length;
        }
      });
      column.width = Math.min(60, Math.max(15, maxLength + 2));
    });

    // Adicionar metadata se fornecido
    if (metadata && Object.keys(metadata).length > 0) {
      sheet.addRow([]); // Linha em branco
      sheet.addRow(['Informações da Exportação']);
      Object.entries(metadata).forEach(([key, value]) => {
        sheet.addRow([key + ':', value]);
      });
    }

    // Gerar arquivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    console.error('Erro ao exportar Excel:', err);
    throw new Error('Erro ao exportar dados para Excel: ' + (err.message || 'Erro desconhecido'));
  }
}

