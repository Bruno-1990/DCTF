/**
 * Autenticação da Administração: uma senha (ADMIN_PASSWORD) conferida no servidor, que troca
 * por uma credencial assinada (ADMIN_TOKEN_SECRET) válida por algumas horas.
 */
import {
  ADMIN_TOKEN_TTL_MS,
  adminConfigurado,
  conferirSenha,
  emitirToken,
  validarToken,
} from '../../src/services/AdminAuthService';

const SENHA = 'senha-de-teste-123';
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';

describe('AdminAuthService', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env['ADMIN_PASSWORD'] = SENHA;
    process.env['ADMIN_TOKEN_SECRET'] = SEGREDO;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  describe('configuração', () => {
    it('está configurado com senha e segredo', () => {
      expect(adminConfigurado()).toBe(true);
    });

    it.each([
      ['sem senha', 'ADMIN_PASSWORD'],
      ['sem segredo', 'ADMIN_TOKEN_SECRET'],
    ])('não está configurado %s', (_rotulo, variavel) => {
      delete process.env[variavel];
      expect(adminConfigurado()).toBe(false);
    });

    it('segredo curto demais não conta como configurado', () => {
      process.env['ADMIN_TOKEN_SECRET'] = 'curto';
      expect(adminConfigurado()).toBe(false);
    });
  });

  describe('conferirSenha', () => {
    it('aceita a senha certa', () => {
      expect(conferirSenha(SENHA)).toBe(true);
    });

    it.each([['errada'], [''], [`${SENHA} `], [SENHA.toUpperCase()]])('recusa %p', (tentativa) => {
      expect(conferirSenha(tentativa)).toBe(false);
    });

    it('recusa tudo quando não está configurado (nunca aceita senha vazia)', () => {
      delete process.env['ADMIN_PASSWORD'];
      expect(conferirSenha('')).toBe(false);
      expect(conferirSenha(SENHA)).toBe(false);
    });

    it('recusa o que não é texto', () => {
      expect(conferirSenha(undefined as unknown as string)).toBe(false);
      expect(conferirSenha(123 as unknown as string)).toBe(false);
    });
  });

  describe('emitirToken / validarToken', () => {
    const agora = new Date('2026-11-18T12:00:00Z').getTime();

    it('a credencial emitida é válida e informa quando expira', () => {
      const { token, expiraEm } = emitirToken(agora);
      expect(expiraEm).toBe(agora + ADMIN_TOKEN_TTL_MS);
      expect(validarToken(token, agora + 1000)).toBe(true);
    });

    it('expira depois do prazo', () => {
      const { token } = emitirToken(agora);
      expect(validarToken(token, agora + ADMIN_TOKEN_TTL_MS - 1)).toBe(true);
      expect(validarToken(token, agora + ADMIN_TOKEN_TTL_MS)).toBe(false);
    });

    it('recusa credencial adulterada (prazo trocado sem refazer a assinatura)', () => {
      const { token } = emitirToken(agora);
      const [, assinatura] = token.split('.');
      const prazoForjado = Buffer.from(JSON.stringify({ exp: agora + 10 * ADMIN_TOKEN_TTL_MS })).toString('base64url');
      expect(validarToken(`${prazoForjado}.${assinatura}`, agora + ADMIN_TOKEN_TTL_MS + 1)).toBe(false);
    });

    it('recusa credencial assinada com outro segredo (trocar o segredo derruba as sessões)', () => {
      const { token } = emitirToken(agora);
      process.env['ADMIN_TOKEN_SECRET'] = 'outro-segredo-com-mais-de-32-caracteres!!!';
      expect(validarToken(token, agora + 1000)).toBe(false);
    });

    it.each([[''], ['lixo'], ['a.b'], ['a.b.c'], ['.'], [undefined as unknown as string]])('recusa %p', (t) => {
      expect(validarToken(t, agora)).toBe(false);
    });

    it('não emite nem valida sem configuração', () => {
      const { token } = emitirToken(agora);
      delete process.env['ADMIN_TOKEN_SECRET'];
      expect(validarToken(token, agora + 1000)).toBe(false);
      expect(() => emitirToken(agora)).toThrow();
    });
  });
});
