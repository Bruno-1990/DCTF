/**
 * Testes das transformações puras da integração com a Acessórias.
 * Espelham o que a API devolve de verdade em `GET /companies/ListAll`
 * (inclusive as sujeiras: datas "0000-00-00" e CPF marcado como empresa).
 */

import {
  limparDocumento,
  isCnpjValido,
  normalizarData,
  normalizarHonorario,
  mapEmpresaRow,
  isSincronizavel,
  camposParaCadastro,
  STATUS_ATIVA,
  type AcessoriasEmpresaRow,
} from '../acessorias.mappers';

const linhaBase: AcessoriasEmpresaRow = {
  ID: '283',
  Identificador: '42.081.159/0001-28',
  Razao: 'A G A P LTDA',
  Fantasia: 'BRAND2GO REGISTRO DE MARCAS',
  Status: 'Ativa',
  Telefone: '2797737081',
  UF: 'es',
  ClienteDesde: '0000-00-00',
  ClienteAte: '0000-00-00',
  DataDoCadastro: '2025-03-07',
  Honorario: '0.00',
};

describe('limparDocumento / isCnpjValido', () => {
  it('remove a formatação do CNPJ', () => {
    expect(limparDocumento('42.081.159/0001-28')).toBe('42081159000128');
  });

  it('trata null/undefined como string vazia', () => {
    expect(limparDocumento(null)).toBe('');
    expect(limparDocumento(undefined)).toBe('');
  });

  it('aceita só documento com 14 dígitos', () => {
    expect(isCnpjValido('42.081.159/0001-28')).toBe(true);
    expect(isCnpjValido('669.798.976-91')).toBe(false); // CPF cadastrado como empresa
    expect(isCnpjValido('04.154.441/604')).toBe(false); // CNPJ truncado
  });
});

describe('normalizarData', () => {
  it('converte a data zerada da API em null', () => {
    expect(normalizarData('0000-00-00')).toBeNull();
  });

  it('preserva data válida', () => {
    expect(normalizarData('2025-03-07')).toBe('2025-03-07');
  });

  it('trata vazio/null como null', () => {
    expect(normalizarData('')).toBeNull();
    expect(normalizarData(null)).toBeNull();
  });
});

describe('normalizarHonorario', () => {
  it('converte string decimal em número', () => {
    expect(normalizarHonorario('1250.50')).toBe(1250.5);
  });

  it('aceita vírgula como separador decimal', () => {
    expect(normalizarHonorario('1250,50')).toBe(1250.5);
  });

  it('mantém zero como zero (não confunde com ausente)', () => {
    expect(normalizarHonorario('0.00')).toBe(0);
  });

  it('vazio ou inválido vira null', () => {
    expect(normalizarHonorario('')).toBeNull();
    expect(normalizarHonorario(null)).toBeNull();
    expect(normalizarHonorario('abc')).toBeNull();
  });
});

describe('mapEmpresaRow', () => {
  it('mapeia a linha da API para o shape normalizado', () => {
    const e = mapEmpresaRow(linhaBase);
    expect(e).toEqual({
      id: '283',
      cnpj: '42.081.159/0001-28',
      cnpj_limpo: '42081159000128',
      razao_social: 'A G A P LTDA',
      fantasia: 'BRAND2GO REGISTRO DE MARCAS',
      status: 'Ativa',
      telefone: '2797737081',
      uf: 'ES',
      cliente_desde: null,
      honorario: 0,
    });
  });

  it('normaliza a UF para maiúsculas', () => {
    expect(mapEmpresaRow({ ...linhaBase, UF: 'es' }).uf).toBe('ES');
  });

  it('preserva o id como string (a API devolve string)', () => {
    expect(mapEmpresaRow(linhaBase).id).toBe('283');
  });

  it('campos ausentes viram null, sem quebrar', () => {
    const e = mapEmpresaRow({
      ...linhaBase,
      Razao: null,
      Fantasia: null,
      Telefone: null,
      UF: null,
      Honorario: null,
    });
    expect(e.razao_social).toBeNull();
    expect(e.fantasia).toBeNull();
    expect(e.telefone).toBeNull();
    expect(e.uf).toBeNull();
    expect(e.honorario).toBeNull();
  });
});

describe('isSincronizavel', () => {
  it('aceita empresa ativa com CNPJ válido', () => {
    expect(isSincronizavel(mapEmpresaRow(linhaBase))).toBe(true);
  });

  it('recusa empresa inativa', () => {
    expect(isSincronizavel(mapEmpresaRow({ ...linhaBase, Status: 'Inativa' }))).toBe(false);
  });

  it('recusa CPF cadastrado como empresa', () => {
    expect(isSincronizavel(mapEmpresaRow({ ...linhaBase, Identificador: '669.798.976-91' }))).toBe(false);
  });

  it('STATUS_ATIVA é o valor que a API usa', () => {
    expect(STATUS_ATIVA).toBe('Ativa');
  });
});

describe('camposParaCadastro', () => {
  it('devolve só os campos que a Acessórias sabe preencher', () => {
    expect(Object.keys(camposParaCadastro(mapEmpresaRow(linhaBase))).sort()).toEqual([
      'fantasia',
      'razao_social',
      'telefone',
      'uf',
    ]);
  });

  it('não inventa endereço/e-mail/regime (fica para a ReceitaWS)', () => {
    const campos = camposParaCadastro(mapEmpresaRow(linhaBase));
    expect(campos).not.toHaveProperty('email');
    expect(campos).not.toHaveProperty('endereco');
    expect(campos).not.toHaveProperty('regime_tributario');
  });
});
