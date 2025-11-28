import ExcelJS from 'exceljs';

interface ExportOptions {
  filename: string;
  sheetName: string;
  headers: string[];
  data: any[][];
  title?: string;
  metadata?: Record<string, string>;
}

/**
 * Função utilitária para exportar dados para Excel
 */
export async function exportToExcel(options: ExportOptions): Promise<void> {
  const { filename, sheetName, headers, data, title, metadata } = options;

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName, {
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

    // Adicionar dados
    data.forEach((row) => {
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

