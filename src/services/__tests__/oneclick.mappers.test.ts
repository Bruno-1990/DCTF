/**
 * TDD — transformações puras do OneClickService ao repontar a fonte
 * do OneClick v1 (MySQL `ger_cad_cli`) para o OneClick de PROD
 * (PostgreSQL `public.clientes` na VPS).
 *
 * Regras de negócio validadas com o usuário (2026-07-07):
 *  - Fonte: public.clientes (banco `oneclick`).
 *  - Filtro "Mensais/Ativos": situacao='MENSAL' AND status='ATIVA'
 *    AND tipo_documento='CNPJ' AND deleted_at IS NULL (sem filtro de área por ora).
 *  - Regime `tributacao` (enum) → código inteiro compatível com o regimeMap
 *    já existente no Cliente.sincronizarComOneClick ({1:LP,2:LR,4:SN,5:SN}),
 *    mantendo controller/model intactos.
 */

import {
  mapTributacaoToRegimeCode,
  mapClienteRowToOneClick,
  MENSAIS_ATIVOS_WHERE,
  EMPRESA_ID_CENTRAL,
  getEmpresaId,
  type ClienteProdRow,
} from '../oneclick.mappers';

describe('mapTributacaoToRegimeCode', () => {
  it('mapeia SIMPLES_NACIONAL para 4 (→ "SIMPLES NACIONAL" no downstream)', () => {
    expect(mapTributacaoToRegimeCode('SIMPLES_NACIONAL')).toBe(4);
  });

  it('mapeia MEI para 5 (→ "SIMPLES NACIONAL" no downstream, como no legado)', () => {
    expect(mapTributacaoToRegimeCode('MEI')).toBe(5);
  });

  it('mapeia LUCRO_PRESUMIDO para 1', () => {
    expect(mapTributacaoToRegimeCode('LUCRO_PRESUMIDO')).toBe(1);
  });

  it('mapeia LUCRO_REAL para 2', () => {
    expect(mapTributacaoToRegimeCode('LUCRO_REAL')).toBe(2);
  });

  it('mapeia IMUNE/ISENTA para null (sem código no legado → não sobrescreve regime)', () => {
    expect(mapTributacaoToRegimeCode('IMUNE')).toBeNull();
    expect(mapTributacaoToRegimeCode('ISENTA')).toBeNull();
  });

  it('retorna null para null/vazio/desconhecido', () => {
    expect(mapTributacaoToRegimeCode(null)).toBeNull();
    expect(mapTributacaoToRegimeCode('')).toBeNull();
    expect(mapTributacaoToRegimeCode('QUALQUER_COISA')).toBeNull();
  });
});

describe('mapClienteRowToOneClick', () => {
  const row: ClienteProdRow = {
    id: 'cmabc123cuid',
    documento: '12.345.678/0001-90',
    razao_social: 'EMPRESA TESTE LTDA',
    email: 'contato@teste.com',
    telefone: '(27) 3333-4444',
    logradouro: 'Rua das Flores',
    numero: '100',
    bairro: 'Centro',
    cidade: 'Vitória',
    uf: 'ES',
    cep: '29000-000',
    complemento: 'Sala 2',
    tributacao: 'LUCRO_PRESUMIDO',
  };

  it('mapeia as colunas de prod para o shape cad_cli_* (contrato preservado)', () => {
    const oc = mapClienteRowToOneClick(row);
    expect(oc).toEqual({
      id: 'cmabc123cuid',
      cad_cli_cnpj: '12.345.678/0001-90',
      cad_cli_razao: 'EMPRESA TESTE LTDA',
      cad_cli_email: 'contato@teste.com',
      cad_cli_tel: '(27) 3333-4444',
      cad_cli_end: 'Rua das Flores',
      cad_cli_num: '100',
      cad_cli_bairro: 'Centro',
      cad_cli_cidade: 'Vitória',
      cad_cli_estado: 'ES',
      cad_cli_cep: '29000-000',
      cad_cli_complemento: 'Sala 2',
      cad_cli_regime: 1, // LUCRO_PRESUMIDO
    });
  });

  it('preserva o id como string (cuid do prod, não numérico)', () => {
    expect(typeof mapClienteRowToOneClick(row).id).toBe('string');
  });

  it('converte documento em cad_cli_cnpj (downstream normaliza p/ 14 dígitos)', () => {
    expect(mapClienteRowToOneClick({ ...row, documento: '12345678000190' }).cad_cli_cnpj).toBe(
      '12345678000190',
    );
  });

  it('mantém campos ausentes como null, sem quebrar', () => {
    const oc = mapClienteRowToOneClick({
      id: 'x',
      documento: '00000000000191',
      razao_social: 'SO CNPJ LTDA',
      email: null,
      telefone: null,
      logradouro: null,
      numero: null,
      bairro: null,
      cidade: null,
      uf: null,
      cep: null,
      complemento: null,
      tributacao: null,
    });
    expect(oc.cad_cli_email).toBeNull();
    expect(oc.cad_cli_estado).toBeNull();
    expect(oc.cad_cli_regime).toBeNull();
  });
});

describe('MENSAIS_ATIVOS_WHERE (filtro de comparação)', () => {
  it('só clientes MENSAIS', () => {
    expect(MENSAIS_ATIVOS_WHERE).toMatch(/situacao\s*=\s*'MENSAL'/i);
  });

  it('só clientes ATIVOS (exclui inativos)', () => {
    expect(MENSAIS_ATIVOS_WHERE).toMatch(/status\s*=\s*'ATIVA'/i);
  });

  it('só CNPJ (exclui CPF)', () => {
    expect(MENSAIS_ATIVOS_WHERE).toMatch(/tipo_documento\s*=\s*'CNPJ'/i);
  });

  it('exclui registros soft-deletados', () => {
    expect(MENSAIS_ATIVOS_WHERE).toMatch(/deleted_at\s+IS\s+NULL/i);
  });

  it('filtra pelo tenant (empresa_id) via parâmetro $1', () => {
    expect(MENSAIS_ATIVOS_WHERE).toMatch(/empresa_id\s*=\s*\$1/i);
  });
});

describe('getEmpresaId (tenant do OneClick)', () => {
  const original = process.env['ONECLICK_EMPRESA_ID'];

  afterEach(() => {
    if (original === undefined) delete process.env['ONECLICK_EMPRESA_ID'];
    else process.env['ONECLICK_EMPRESA_ID'] = original;
  });

  it('usa a Central Contábil por padrão', () => {
    delete process.env['ONECLICK_EMPRESA_ID'];
    expect(getEmpresaId()).toBe(EMPRESA_ID_CENTRAL);
  });

  it('permite override por env (outro escritório/ambiente)', () => {
    process.env['ONECLICK_EMPRESA_ID'] = 'jrg-empresa';
    expect(getEmpresaId()).toBe('jrg-empresa');
  });
});
