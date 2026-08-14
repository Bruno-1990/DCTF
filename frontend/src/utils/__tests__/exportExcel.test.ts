import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { exportToExcel, formatarValorLegivel } from '../exportExcel';

/**
 * O download é feito via Blob + link temporário. Aqui interceptamos o Blob para
 * abrir a planilha de volta e conferir o que o usuário realmente recebe.
 */
let blobGerado: Blob | null = null;

beforeAll(() => {
  (window.URL as any).createObjectURL = vi.fn((blob: Blob) => {
    blobGerado = blob;
    return 'blob:teste';
  });
  (window.URL as any).revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  blobGerado = null;
});

/** O Blob do jsdom não tem `arrayBuffer()`; lemos pelo FileReader. */
function lerBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function planilhaGerada() {
  expect(blobGerado).not.toBeNull();
  const buffer = await lerBlob(blobGerado as Blob);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets[0];
}

const HEADERS = ['Cliente', 'CNPJ', 'Tipo', 'Campo', 'Antes', 'Depois'];

const DADOS = [
  ['EMPRESA A', '11.222.333/0001-81', 'campo', 'fantasia', 'X', 'Y'],
  ['EMPRESA A', '11.222.333/0001-81', 'campo', 'porte', 'ME', 'EPP'],
  ['EMPRESA B', '44.555.666/0001-99', 'sócio fora do cartão', 'FULANO', 'consta', 'não consta'],
  ['EMPRESA C', '77.888.999/0001-55', 'campo', 'situacao_cadastral', 'e', 'ATIVA'],
  ['EMPRESA C', '77.888.999/0001-55', 'campo', 'logradouro', 'R X', 'RUA X'],
];

describe('formatarValorLegivel', () => {
  it('converte a lista de CNAEs em JSON para texto corrido', () => {
    const json =
      '[{"code":"18.21-1-00","text":"Serviços de pré-impressão"},{"code":"18.30-0-03","text":"Reprodução de software em qualquer suporte"}]';
    expect(formatarValorLegivel(json)).toBe(
      '18.21-1-00 Serviços de pré-impressão; 18.30-0-03 Reprodução de software em qualquer suporte'
    );
  });

  it('aceita o objeto já desserializado', () => {
    expect(formatarValorLegivel([{ code: '33.13-9-99', text: 'Manutenção' }])).toBe('33.13-9-99 Manutenção');
  });

  it('não mexe em texto comum', () => {
    expect(formatarValorLegivel('ROD GOVERNADOR MARIO COVAS')).toBe('ROD GOVERNADOR MARIO COVAS');
    expect(formatarValorLegivel('(27) 3080-4990')).toBe('(27) 3080-4990');
  });

  it('devolve o original quando o texto só parece JSON', () => {
    expect(formatarValorLegivel('[não é json')).toBe('[não é json');
  });

  it('trata vazio e nulo como célula em branco', () => {
    expect(formatarValorLegivel(null)).toBe('');
    expect(formatarValorLegivel(undefined)).toBe('');
    expect(formatarValorLegivel('')).toBe('');
  });
});

describe('exportToExcel — agrupamento por coluna', () => {
  it('pula duas linhas a cada CNPJ novo, sem separar linhas da mesma empresa', async () => {
    await exportToExcel({
      filename: 'teste.xlsx',
      sheetName: 'Alterações',
      headers: HEADERS,
      data: DADOS,
      groupByColumn: 1,
      groupSpacing: 2,
    });

    const sheet = await planilhaGerada();

    // 1 cabeçalho + 5 dados + 2 separações de 2 linhas = 10
    expect(sheet.rowCount).toBe(10);

    const cnpjPorLinha = Array.from({ length: sheet.rowCount }, (_, i) =>
      sheet.getRow(i + 1).hasValues ? String(sheet.getRow(i + 1).getCell(2).value ?? '') : null
    );

    expect(cnpjPorLinha).toEqual([
      'CNPJ',
      '11.222.333/0001-81',
      '11.222.333/0001-81',
      null,
      null,
      '44.555.666/0001-99',
      null,
      null,
      '77.888.999/0001-55',
      '77.888.999/0001-55',
    ]);
  });

  it('destaca em negrito a primeira linha de cada empresa', async () => {
    await exportToExcel({
      filename: 'teste.xlsx',
      sheetName: 'Alterações',
      headers: HEADERS,
      data: DADOS,
      groupByColumn: 1,
    });

    const sheet = await planilhaGerada();
    const negrito = (linha: number) => Boolean(sheet.getRow(linha).getCell(1).font?.bold);

    expect(negrito(2)).toBe(true); // 1ª da EMPRESA A
    expect(negrito(3)).toBe(false); // 2ª da EMPRESA A
    expect(negrito(6)).toBe(true); // EMPRESA B
    expect(negrito(9)).toBe(true); // 1ª da EMPRESA C
    expect(negrito(10)).toBe(false); // 2ª da EMPRESA C
  });

  it('mantém o modelo visual padrão: cabeçalho fixo, azul e branco', async () => {
    await exportToExcel({
      filename: 'teste.xlsx',
      sheetName: 'Alterações',
      headers: HEADERS,
      data: DADOS,
      groupByColumn: 1,
    });

    const sheet = await planilhaGerada();
    const cabecalho = sheet.getRow(1).getCell(1);

    expect((cabecalho.fill as any)?.fgColor?.argb).toBe('FF1F4E78');
    expect(cabecalho.font?.color?.argb).toBe('FFFFFFFF');
    expect(cabecalho.font?.bold).toBe(true);
    expect(sheet.views[0]?.state).toBe('frozen');
    expect(sheet.views[0]?.ySplit).toBe(1);
  });

  it('respeita wrapText: false e mantém true como padrão', async () => {
    await exportToExcel({
      filename: 'teste.xlsx',
      sheetName: 'Alterações',
      headers: HEADERS,
      data: DADOS,
      groupByColumn: 1,
      wrapText: false,
    });
    const semQuebra = await planilhaGerada();
    expect(semQuebra.getRow(2).getCell(1).alignment?.wrapText).toBeFalsy();

    await exportToExcel({
      filename: 'teste.xlsx',
      sheetName: 'Alterações',
      headers: HEADERS,
      data: DADOS,
    });
    const comQuebra = await planilhaGerada();
    expect(comQuebra.getRow(2).getCell(1).alignment?.wrapText).toBe(true);
  });

  it('sem groupByColumn, nenhuma linha em branco é inserida', async () => {
    await exportToExcel({
      filename: 'teste.xlsx',
      sheetName: 'Alterações',
      headers: HEADERS,
      data: DADOS,
    });

    const sheet = await planilhaGerada();
    expect(sheet.rowCount).toBe(6); // cabeçalho + 5 linhas, sem separação
  });
});
