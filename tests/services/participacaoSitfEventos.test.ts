jest.mock('../../src/config/mysql', () => ({ executeQuery: jest.fn(), executeTransaction: jest.fn() }));
jest.mock('../../src/models/Cliente', () => ({ Cliente: jest.fn() }));

import { EventEmitter } from 'events';
import {
  criarBarramento,
  ligarReplanejamento,
  resumirLote,
  type EventoParticipacao,
} from '../../src/services/participacaoSitf/eventos';

const coletar = (bus: EventEmitter) => {
  const recebidos: EventoParticipacao[] = [];
  bus.on('evento', (e: EventoParticipacao) => recebidos.push(e));
  return recebidos;
};

const espera = () => new Promise((r) => setImmediate(r));

describe('resumirLote', () => {
  it('manda só o que a tela precisa do progresso do lote', () => {
    expect(
      resumirLote('sitf-lote-1', {
        total: 66, processados: 3, sucessos: 2, erros: 1, porcentagem: 5, status: 'em_andamento',
        cnpjAtual: '12345678000195 - Empresa exemplo', erros_detalhados: [{ cnpj: 'x', razao_social: 'y', erro: 'z' }],
      }),
    ).toEqual({
      tipo: 'lote', progressId: 'sitf-lote-1', status: 'em_andamento', total: 66, processados: 3,
      sucessos: 2, erros: 1, porcentagem: 5, cnpjAtual: '12345678000195 - Empresa exemplo',
    });
  });
});

describe('ligarReplanejamento', () => {
  it('extração terminada vira a linha da prévia refeita para cada cliente daquele CNPJ', async () => {
    const bus = criarBarramento();
    const recebidos = coletar(bus);
    const item = { clienteId: 'c1', razaoSocial: 'Empresa exemplo', cnpj: '12345678000195', situacao: 'atualizar', extraidoEm: null, plano: null };
    const service = { previaDoCnpj: jest.fn().mockResolvedValue([item]) };
    ligarReplanejamento(bus, service as any);

    bus.emit('evento', { tipo: 'extracao', cnpj: '12.345.678/0001-95', sucesso: true });
    await espera();

    expect(service.previaDoCnpj).toHaveBeenCalledWith('12345678000195');
    expect(recebidos).toContainEqual({ tipo: 'cliente', item });
  });

  it('gravação também devolve a linha refeita (para sair de "Para atualizar")', async () => {
    const bus = criarBarramento();
    const recebidos = coletar(bus);
    const item = { clienteId: 'c1', razaoSocial: '', cnpj: '12345678000195', situacao: 'em_dia', extraidoEm: null, plano: null };
    const service = { previaDoCliente: jest.fn().mockResolvedValue([item]), previaDoCnpj: jest.fn() };
    ligarReplanejamento(bus, service as any);

    bus.emit('evento', { tipo: 'aplicado', clienteId: 'c1', sociosAtualizados: 2 });
    await espera();

    expect(service.previaDoCliente).toHaveBeenCalledWith('c1');
    expect(recebidos).toContainEqual({ tipo: 'cliente', item });
  });

  it('extração que falhou não refaz nada', async () => {
    const bus = criarBarramento();
    const service = { previaDoCnpj: jest.fn() };
    ligarReplanejamento(bus, service as any);
    bus.emit('evento', { tipo: 'extracao', cnpj: '12345678000195', sucesso: false });
    await espera();
    expect(service.previaDoCnpj).not.toHaveBeenCalled();
  });

  it('erro ao refazer a prévia não derruba o barramento', async () => {
    const bus = criarBarramento();
    const service = { previaDoCnpj: jest.fn().mockRejectedValue(new Error('banco fora')) };
    ligarReplanejamento(bus, service as any);
    const erro = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    bus.emit('evento', { tipo: 'extracao', cnpj: '12345678000195', sucesso: true });
    await espera();
    await espera();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
