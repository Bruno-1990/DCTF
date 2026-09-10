/**
 * A regra que separa "0% de verdade" de "a extração não leu a coluna".
 *
 * Importa porque o cadastro só pode gravar 0% no primeiro caso: no segundo,
 * escrever 0 apagaria a porcentagem que veio da Situação Fiscal e já estava
 * conferida. A pegadinha é "49-Sócio-Administrador", que tem a palavra
 * Administrador mas é sócio e TEM capital.
 */
import { qualificacaoSemCapital } from '../pythonExtractor';

describe('qualificacaoSemCapital', () => {
  it('reconhece quem realmente não tem capital', () => {
    expect(qualificacaoSemCapital('05-Administrador')).toBe(true);
    expect(qualificacaoSemCapital('53-Sócio sem Capital')).toBe(true);
    expect(qualificacaoSemCapital('53-Socio sem Capital')).toBe(true);
    expect(qualificacaoSemCapital('ADMINISTRADOR')).toBe(true);
  });

  it('não confunde Sócio-Administrador com Administrador', () => {
    expect(qualificacaoSemCapital('49-Sócio-Administrador')).toBe(false);
    expect(qualificacaoSemCapital('49-Socio Administrador')).toBe(false);
  });

  it('trata sócio comum como quem tem capital', () => {
    expect(qualificacaoSemCapital('22-Sócio')).toBe(false);
    expect(qualificacaoSemCapital('10-Diretor')).toBe(false);
  });

  it('sem qualificação, não assume zero', () => {
    expect(qualificacaoSemCapital(null)).toBe(false);
    expect(qualificacaoSemCapital(undefined)).toBe(false);
    expect(qualificacaoSemCapital('')).toBe(false);
  });
});
