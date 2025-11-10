import { DCTFDados } from '../../src/models/DCTFDados';

describe('DCTFDados.searchByDeclaracao (fallback)', () => {
  const originalEnv = process.env.SUPABASE_URL;

  afterEach(() => {
    process.env.SUPABASE_URL = originalEnv;
  });

  it('filtra por codigo, faixa de valor e ordena por valor desc (fallback)', async () => {
    process.env.SUPABASE_URL = '';
    const model = new DCTFDados();

    // Monkey patch do fallback base
    const mockData = [
      { codigo: '001', descricao: 'A', valor: 100, dataOcorrencia: new Date('2024-01-10'), linha: 2 },
      { codigo: '001', descricao: 'B', valor: 200, dataOcorrencia: new Date('2024-01-11'), linha: 3 },
      { codigo: '101', descricao: 'C', valor: 50, dataOcorrencia: new Date('2024-01-09'), linha: 4 },
    ] as any[];

    (model as any).findByDeclaracao = jest.fn().mockResolvedValue({ success: true, data: mockData });

    const result = await model.searchByDeclaracao({
      declaracaoId: 'dec-1',
      codigo: '001',
      valorMin: 50,
      valorMax: 1000,
      orderBy: 'valor',
      order: 'desc',
      page: 1,
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const items = result.data!.items as any[];
    expect(items.length).toBe(2);
    expect(items[0].valor).toBe(200);
    expect(items[1].valor).toBe(100);
  });

  it('aplica search em descricao/observacoes e paginação (fallback)', async () => {
    process.env.SUPABASE_URL = '';
    const model = new DCTFDados();

    const mockData = [
      { codigo: '001', descricao: 'Receita Bruta', valor: 100, linha: 1 },
      { codigo: '001', descricao: 'Receita Líquida', valor: 200, linha: 2 },
      { codigo: '101', descricao: 'Deduções', observacoes: 'ajuste', valor: 50, linha: 3 },
    ] as any[];

    (model as any).findByDeclaracao = jest.fn().mockResolvedValue({ success: true, data: mockData });

    const result = await model.searchByDeclaracao({
      declaracaoId: 'dec-1',
      search: 'receita',
      orderBy: 'linha',
      order: 'asc',
      page: 1,
      limit: 1,
    });

    expect(result.success).toBe(true);
    const items = result.data!.items as any[];
    expect(items.length).toBe(1);
    expect(result.data!.total).toBe(2);
    expect(items[0].descricao).toMatch(/Receita/);
  });
});


