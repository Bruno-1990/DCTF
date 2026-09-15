/**
 * O PUT do questionário é o único endpoint da aba que o autosave chama dezenas
 * de vezes por preenchimento. O que se testa aqui é a PORTA: slug que não
 * existe, colaborador que não é número e erro de validação do serviço têm de
 * sair como 400 com a frase pronta — nunca como 500, que faria a tela dizer
 * "erro do sistema" para um problema de dado.
 *
 * O serviço é mockado de propósito: a regra de validação de opção é testada em
 * tests/services/FiscalQuestionarios.test.ts, contra a definição real.
 */

import { FiscalController } from '../../src/controllers/FiscalController';
import fiscalQuestionarioService from '../../src/services/FiscalQuestionarioService';
import { ErroValidacao } from '../../src/services/FiscalFichaService';
import { questionarioPorSlug } from '../../src/services/FiscalQuestionarios';

jest.mock('../../src/services/FiscalQuestionarioService', () => ({
  __esModule: true,
  default: {
    listar: jest.fn(),
    definicao: jest.fn(),
    respostas: jest.fn(),
    respostaDe: jest.fn(),
    salvar: jest.fn(),
  },
}));

const servico = fiscalQuestionarioService as unknown as {
  listar: jest.Mock;
  definicao: jest.Mock;
  respostas: jest.Mock;
  respostaDe: jest.Mock;
  salvar: jest.Mock;
};

const respostaFalsa = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }) as any;

const requisicao = (params: Record<string, string>, body?: any) => ({ params, body }) as any;

describe('FiscalController — questionários', () => {
  const controller = new FiscalController();

  beforeEach(() => {
    jest.clearAllMocks();
    // O controller consulta a definição antes de qualquer acesso ao banco;
    // aqui ela vem da definição de verdade, que é o que a rota usa.
    servico.definicao.mockImplementation((slug: string) => questionarioPorSlug(slug));
  });

  describe('PUT respostas', () => {
    it('recusa slug que não existe, sem chamar o serviço', async () => {
      const res = respostaFalsa();
      await controller.questionarioSalvar(
        requisicao({ slug: 'nao-existe', colaboradorId: '1' }, { respostas: {} }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Questionário não encontrado.',
      });
      expect(servico.salvar).not.toHaveBeenCalled();
    });

    it.each(['abc', '0', '-3', '1.5', ''])(
      'recusa colaborador inválido (%s)',
      async (colaboradorId) => {
        const res = respostaFalsa();
        await controller.questionarioSalvar(
          requisicao({ slug: 'cfop-xml-ou-sped', colaboradorId }, { respostas: {} }),
          res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Informe o colaborador.',
        });
        expect(servico.salvar).not.toHaveBeenCalled();
      }
    );

    it('devolve 400 com a frase do serviço quando o valor está fora das opções', async () => {
      servico.salvar.mockRejectedValue(new ErroValidacao('Opção inválida em q1: talvez'));
      const res = respostaFalsa();

      await controller.questionarioSalvar(
        requisicao(
          { slug: 'cfop-xml-ou-sped', colaboradorId: '4' },
          { respostas: { q1: 'talvez' } }
        ),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Opção inválida em q1: talvez',
      });
    });

    it('grava e devolve a linha quando está tudo certo', async () => {
      const linha = { id: 7, colaboradorId: 4, respostas: { q1: 'sped_sempre' } };
      servico.salvar.mockResolvedValue(linha);
      const res = respostaFalsa();

      await controller.questionarioSalvar(
        requisicao(
          { slug: 'cfop-xml-ou-sped', colaboradorId: '4' },
          { respostas: { q1: 'sped_sempre' }, observacoes: 'ok' }
        ),
        res
      );

      expect(servico.salvar).toHaveBeenCalledWith(
        'cfop-xml-ou-sped',
        4,
        { q1: 'sped_sempre' },
        'ok'
      );
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, data: linha });
    });

    it('vira 500 quando o erro não é de validação', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      servico.salvar.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = respostaFalsa();

      await controller.questionarioSalvar(
        requisicao({ slug: 'cfop-xml-ou-sped', colaboradorId: '4' }, { respostas: {} }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Erro ao salvar as respostas.',
      });
    });
  });

  describe('GET', () => {
    it('lista os questionários', async () => {
      servico.listar.mockReturnValue([{ slug: 'cfop-xml-ou-sped', totalPerguntas: 21 }]);
      const res = respostaFalsa();

      await controller.questionarios(requisicao({}), res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ slug: 'cfop-xml-ou-sped', totalPerguntas: 21 }],
      });
    });

    it('devolve 404 na definição de slug desconhecido', async () => {
      const res = respostaFalsa();
      await controller.questionario(requisicao({ slug: 'nao-existe' }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('devolve a definição completa do slug conhecido', async () => {
      const res = respostaFalsa();
      await controller.questionario(requisicao({ slug: 'cfop-xml-ou-sped' }), res);

      expect(res.status).not.toHaveBeenCalled();
      const enviado = res.json.mock.calls[0][0];
      expect(enviado.success).toBe(true);
      expect(enviado.data.slug).toBe('cfop-xml-ou-sped');
      expect(enviado.data.secoes).toHaveLength(8);
    });

    it('responde 200 com data null quando o colaborador ainda não respondeu', async () => {
      servico.respostaDe.mockResolvedValue(null);
      const res = respostaFalsa();

      await controller.questionarioRespostaColaborador(
        requisicao({ slug: 'cfop-xml-ou-sped', colaboradorId: '9' }),
        res
      );

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
    });

    it('devolve todas as respostas do consolidado', async () => {
      servico.respostas.mockResolvedValue([{ id: 1, colaboradorNome: 'IAN' }]);
      const res = respostaFalsa();

      await controller.questionarioRespostas(requisicao({ slug: 'cfop-xml-ou-sped' }), res);

      expect(servico.respostas).toHaveBeenCalledWith('cfop-xml-ou-sped');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 1, colaboradorNome: 'IAN' }],
      });
    });
  });
});
