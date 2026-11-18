jest.mock('../../src/config/mysql', () => ({ executeQuery: jest.fn(), executeTransaction: jest.fn() }));
jest.mock('../../src/models/Cliente', () => ({ Cliente: jest.fn() }));

import { ParticipacaoSitfService, inicioDoMesVigente, type RepositorioParticipacao } from '../../src/services/participacaoSitf/ParticipacaoSitfService';
import { barramentoParticipacao } from '../../src/services/participacaoSitf/eventos';

// "Agora" fixo em 17/11/2026 15:00 de Brasília: o mês vigente começa em 01/11 00:00 (-03:00).
const AGORA = () => new Date('2026-11-17T18:00:00Z');
const NOVEMBRO = '2026-11-10T13:00:00Z';

describe('inicioDoMesVigente', () => {
  it('é a meia-noite do dia 1 em Brasília, mesmo quando em UTC já virou o mês', () => {
    expect(inicioDoMesVigente(new Date('2026-11-17T18:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
    // 01/12 01:00 UTC ainda é 30/11 22:00 em Brasília
    expect(inicioDoMesVigente(new Date('2026-12-01T01:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});

describe('vigência da Situação Fiscal (só vale a consulta do mês corrente)', () => {
  it('consulta de meses anteriores deixa o cliente como desatualizada, com o plano só para informar', async () => {
    const r = repo({
      extracoes: jest.fn().mockResolvedValue([
        { cnpj: CNPJ, created_at: '2026-11-15T10:00:00Z', consultado_em: '2026-06-20T10:00:00Z', socios: [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 60 }] },
      ]),
    });
    const [item] = await new ParticipacaoSitfService(r, AGORA).previa();
    expect(item).toEqual(expect.objectContaining({ situacao: 'desatualizada', vigente: false, consultadoEm: '2026-06-20T10:00:00.000Z' }));
    expect(item.plano?.mudancas).toHaveLength(1);
  });

  it('a data que vale é a da consulta, não a da extração (reextrair o PDF velho não renova)', async () => {
    const r = repo({
      extracoes: jest.fn().mockResolvedValue([
        { cnpj: CNPJ, created_at: '2026-11-16T10:00:00Z', consultado_em: '2026-07-01T10:00:00Z', socios: [] },
      ]),
    });
    const [item] = await new ParticipacaoSitfService(r, AGORA).previa();
    expect(item.vigente).toBe(false);
  });

  it('sem data de consulta gravada não é vigente', async () => {
    const r = repo({
      extracoes: jest.fn().mockResolvedValue([{ cnpj: CNPJ, created_at: NOVEMBRO, consultado_em: null, socios: [] }]),
    });
    const [item] = await new ParticipacaoSitfService(r, AGORA).previa();
    expect(item.situacao).toBe('desatualizada');
  });

  it('aplicar recusa a desatualizada e não grava nada', async () => {
    const r = repo({
      extracoes: jest.fn().mockResolvedValue([
        { cnpj: CNPJ, created_at: NOVEMBRO, consultado_em: '2026-06-20T10:00:00Z', socios: [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 60 }] },
      ]),
    });
    const res = await new ParticipacaoSitfService(r, AGORA).aplicar(['c1']);
    expect(r.gravar).not.toHaveBeenCalled();
    expect(res.ignorados).toEqual([{ clienteId: 'c1', motivo: 'Situação Fiscal de 06/2026: consulte de novo antes de aplicar' }]);
  });
});

describe('fila de consulta obrigatória', () => {
  it('enfileira as desatualizadas e as sem Situação Fiscal, com o motivo, e deixa as vigentes de fora', async () => {
    const r = repo({
      clientes: jest.fn().mockResolvedValue([
        { id: 'c1', razao_social: 'Empresa exemplo', cnpj_limpo: CNPJ },
        { id: 'c2', razao_social: 'Outra exemplo', cnpj_limpo: '22222222000191' },
        { id: 'c3', razao_social: 'Vigente exemplo', cnpj_limpo: '33333333000191' },
      ]),
      extracoes: jest.fn().mockResolvedValue([
        { cnpj: CNPJ, created_at: NOVEMBRO, consultado_em: '2026-07-05T12:00:00Z', socios: [] },
        { cnpj: '33333333000191', created_at: NOVEMBRO, consultado_em: NOVEMBRO, socios: [] },
      ]),
      socios: jest.fn().mockResolvedValue([]),
      enfileirar: jest.fn().mockResolvedValue({ enfileirados: 2, emProcessamento: 0 }),
    });
    const res = await new ParticipacaoSitfService(r, AGORA).enfileirarConsultaObrigatoria();
    expect(r.enfileirar).toHaveBeenCalledWith([
      { cnpj: CNPJ, razaoSocial: 'Empresa exemplo', clienteId: 'c1', motivo: 'Situação Fiscal de 07/2026, fora de 11/2026' },
      { cnpj: '22222222000191', razaoSocial: 'Outra exemplo', clienteId: 'c2', motivo: 'Sem Situação Fiscal consultada' },
    ]);
    expect(res).toEqual({ enfileirados: 2, emProcessamento: 0, mesVigente: '11/2026' });
  });

  it('com todas vigentes não mexe na fila', async () => {
    const r = repo({
      extracoes: jest.fn().mockResolvedValue([{ cnpj: CNPJ, created_at: NOVEMBRO, consultado_em: NOVEMBRO, socios: [] }]),
      enfileirar: jest.fn(),
    });
    expect(await new ParticipacaoSitfService(r, AGORA).enfileirarConsultaObrigatoria()).toEqual({
      enfileirados: 0, emProcessamento: 0, mesVigente: '11/2026',
    });
    expect(r.enfileirar).not.toHaveBeenCalled();
  });
});

describe('ParticipacaoSitfService.previaDoCnpj', () => {
  it('acha os clientes ativos do CNPJ e devolve só as linhas deles', async () => {
    const r = repo();
    const itens = await new ParticipacaoSitfService(r, AGORA).previaDoCnpj('12.345.678/0001-95');
    expect(r.idsPorCnpj).toHaveBeenCalledWith(CNPJ);
    expect(r.clientes).toHaveBeenCalledWith(['c1']);
    expect(itens.map((i) => i.clienteId)).toEqual(['c1']);
  });

  it('CNPJ sem cliente ativo não consulta mais nada', async () => {
    const r = repo({ idsPorCnpj: jest.fn().mockResolvedValue([]) });
    expect(await new ParticipacaoSitfService(r, AGORA).previaDoCnpj(CNPJ)).toEqual([]);
    expect(r.clientes).not.toHaveBeenCalled();
  });
});

const CNPJ = '12345678000195';

function repo(over: Partial<RepositorioParticipacao> = {}) {
  const r: jest.Mocked<RepositorioParticipacao> = {
    clientes: jest.fn().mockResolvedValue([{ id: 'c1', razao_social: 'Empresa exemplo', cnpj_limpo: CNPJ }]),
    idsPorCnpj: jest.fn().mockResolvedValue(['c1']),
    extracoes: jest.fn().mockResolvedValue([
      { cnpj: CNPJ, created_at: '2026-01-10T10:00:00Z', consultado_em: '2026-01-10T10:00:00Z', socios: JSON.stringify([{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 40 }]) },
      { cnpj: CNPJ, created_at: '2026-11-10T10:00:00Z', consultado_em: '2026-11-10T10:00:00Z', socios: [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 60 }] },
    ]),
    socios: jest.fn().mockResolvedValue([
      { id: 's1', cliente_id: 'c1', nome: 'JOSE EXEMPLO', cpf: '11111111111', qual: null, participacao_percentual: '50.00' },
    ]),
    gravar: jest.fn().mockResolvedValue(1),
    recalcularValores: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as any;
  return r;
}

describe('ParticipacaoSitfService.previa', () => {
  it('usa a extração mais recente do CNPJ e marca o cliente para atualizar', async () => {
    const [item] = await new ParticipacaoSitfService(repo(), AGORA).previa();
    expect(item).toEqual(
      expect.objectContaining({ clienteId: 'c1', situacao: 'atualizar', extraidoEm: '2026-11-10T10:00:00.000Z' }),
    );
    expect(item.plano?.mudancas[0].percentual).toEqual({ de: 50, para: 60 });
  });

  it('cliente sem nenhuma extração fica como sem_sitf', async () => {
    const [item] = await new ParticipacaoSitfService(repo({ extracoes: jest.fn().mockResolvedValue([]) }), AGORA).previa();
    expect(item.situacao).toBe('sem_sitf');
    expect(item.plano).toBeNull();
  });

  it('sem mudança mas com sócio a mais no cadastro fica como revisar', async () => {
    const r = repo({
      socios: jest.fn().mockResolvedValue([
        { id: 's1', cliente_id: 'c1', nome: 'JOSE EXEMPLO', cpf: '11111111111', qual: null, participacao_percentual: 60 },
        { id: 's2', cliente_id: 'c1', nome: 'NOVO EXEMPLO', cpf: '22222222222', qual: null, participacao_percentual: null },
      ]),
    });
    const [item] = await new ParticipacaoSitfService(r, AGORA).previa();
    expect(item.situacao).toBe('revisar');
  });

  it('JSON de sócios corrompido não derruba a prévia', async () => {
    const r = repo({ extracoes: jest.fn().mockResolvedValue([{ cnpj: CNPJ, created_at: '2026-11-10', socios: '{quebrado' }]) });
    const [item] = await new ParticipacaoSitfService(r, AGORA).previa();
    expect(item.plano?.mudancas).toEqual([]);
  });
});

describe('ParticipacaoSitfService.aplicar', () => {
  it('grava o plano refeito no servidor e recalcula os valores', async () => {
    const r = repo();
    const res = await new ParticipacaoSitfService(r, AGORA).aplicar(['c1']);
    expect(r.clientes).toHaveBeenCalledWith(['c1']);
    expect(r.gravar).toHaveBeenCalledWith('c1', expect.objectContaining({ mudancas: [expect.objectContaining({ socioId: 's1' })] }));
    expect(r.recalcularValores).toHaveBeenCalledWith('c1');
    expect(res).toEqual({ aplicados: [{ clienteId: 'c1', sociosAtualizados: 1 }], ignorados: [] });
  });

  it('não grava quando não há o que mudar, nem quando falta a extração', async () => {
    const emDia = repo({
      socios: jest.fn().mockResolvedValue([
        { id: 's1', cliente_id: 'c1', nome: 'JOSE EXEMPLO', cpf: '11111111111', qual: null, participacao_percentual: 60 },
      ]),
    });
    expect((await new ParticipacaoSitfService(emDia, AGORA).aplicar(['c1'])).ignorados).toEqual([{ clienteId: 'c1', motivo: 'nada a mudar' }]);
    expect(emDia.gravar).not.toHaveBeenCalled();

    const semSitf = repo({ extracoes: jest.fn().mockResolvedValue([]) });
    expect((await new ParticipacaoSitfService(semSitf, AGORA).aplicar(['c1'])).ignorados).toEqual([
      { clienteId: 'c1', motivo: 'sem Situação Fiscal extraída' },
    ]);
    expect(semSitf.gravar).not.toHaveBeenCalled();
  });

  it('id que não existe (ou cliente inativo) volta como ignorado', async () => {
    const r = repo({ clientes: jest.fn().mockResolvedValue([]) });
    expect(await new ParticipacaoSitfService(r, AGORA).aplicar(['x'])).toEqual({
      aplicados: [],
      ignorados: [{ clienteId: 'x', motivo: 'cliente não encontrado' }],
    });
  });

  it('avisa o SSE de cada cliente gravado', async () => {
    const recebidos: unknown[] = [];
    const ouvir = (e: unknown) => recebidos.push(e);
    barramentoParticipacao.on('evento', ouvir);
    try {
      await new ParticipacaoSitfService(repo(), AGORA).aplicar(['c1']);
    } finally {
      barramentoParticipacao.off('evento', ouvir);
    }
    expect(recebidos).toContainEqual({ tipo: 'aplicado', clienteId: 'c1', sociosAtualizados: 1 });
  });

  it('só CPF preenchido não precisa recalcular valores', async () => {
    const r = repo({
      socios: jest.fn().mockResolvedValue([
        { id: 's1', cliente_id: 'c1', nome: 'JOSE EXEMPLO', cpf: null, qual: null, participacao_percentual: 60 },
      ]),
    });
    await new ParticipacaoSitfService(r, AGORA).aplicar(['c1']);
    expect(r.gravar).toHaveBeenCalled();
    expect(r.recalcularValores).not.toHaveBeenCalled();
  });
  it('quadro completo com sócio que saiu e sócio que entrou: atualizar, grava e recalcula', async () => {
    const r = repo({
      extracoes: jest.fn().mockResolvedValue([
        {
          cnpj: CNPJ,
          created_at: '2026-11-10T10:00:00Z',
          consultado_em: '2026-11-10T10:00:00Z',
          socios: [
            { nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 60 },
            { nome: 'ENTROU EXEMPLO', cpf: '33333333333', participacao_percentual: 40 },
          ],
        },
      ]),
      socios: jest.fn().mockResolvedValue([
        { id: 's1', cliente_id: 'c1', nome: 'JOSE EXEMPLO', cpf: '11111111111', qual: null, participacao_percentual: 60 },
        { id: 's2', cliente_id: 'c1', nome: 'SAIU EXEMPLO', cpf: '22222222222', qual: null, participacao_percentual: 40 },
      ]),
    });
    const service = new ParticipacaoSitfService(r, AGORA);
    const [item] = await service.previa();
    expect(item.situacao).toBe('atualizar');
    await service.aplicar(['c1']);
    expect(r.gravar).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        entradas: [{ nome: 'ENTROU EXEMPLO', cpf: '33333333333', participacao_percentual: 40, qual: 'Sócio' }],
        saidas: [{ socioId: 's2', nome: 'SAIU EXEMPLO' }],
      }),
    );
    expect(r.recalcularValores).toHaveBeenCalledWith('c1');
  });
});
