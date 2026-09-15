import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FiscalQuestionario from '../FiscalQuestionario';

/**
 * A página monta o formulário a partir da definição que vem do backend — por
 * isso o mock traz uma definição pequena, mas com as três formas que existem de
 * verdade: opção única, múltipla escolha e a caixa de observações gerais.
 *
 * O segundo teste é o que importa: o autosave só pode disparar DEPOIS do
 * debounce. Sem ele, cada clique viraria um PUT, e um formulário de 21
 * perguntas viraria uma enxurrada de gravações.
 */

vi.mock('../../services/fiscal', () => ({
  __esModule: true,
  CHAVE_COLABORADOR: 'fiscal:colaboradorId',
  PREFIXO_OBSERVACAO: 'obs:',
  default: {
    questionario: vi.fn(),
    colaboradores: vi.fn(),
    questionarioResposta: vi.fn(),
    questionarioRespostas: vi.fn(),
    salvarQuestionario: vi.fn(),
  },
}));

import fiscalService from '../../services/fiscal';

const servico = fiscalService as unknown as {
  questionario: ReturnType<typeof vi.fn>;
  colaboradores: ReturnType<typeof vi.fn>;
  questionarioResposta: ReturnType<typeof vi.fn>;
  questionarioRespostas: ReturnType<typeof vi.fn>;
  salvarQuestionario: ReturnType<typeof vi.fn>;
};

const DEFINICAO = {
  slug: 'cfop-xml-ou-sped',
  versao: 1,
  chapeu: 'Centria · Motor de apuração de ICMS',
  titulo: 'CFOP: XML ou SPED?',
  lead: 'Qual documento manda em cada situação.',
  comoResponder: ['Marque uma opção por pergunta.'],
  secoes: [
    {
      codigo: 'A',
      titulo: 'Fonte do CFOP',
      intro: 'Hoje o motor acata o SPED só para quatro CFOPs.',
      perguntas: [
        {
          id: 'q1',
          numero: 1,
          enunciado: 'Qual CFOP deve valer na apuração?',
          caso: [{ rotulo: 'XML', texto: '73 notas, 219 itens' }],
          tipo: 'unica' as const,
          opcoes: [
            { valor: 'sped_sempre', texto: 'O do SPED, sempre.' },
            { valor: 'xml_sempre', texto: 'O espelho do XML, sempre.' },
          ],
          defineNoMotor: 'cfop_adoption.py',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q2',
          numero: 2,
          enunciado: 'Em quais famílias o SPED manda?',
          tipo: 'multipla' as const,
          opcoes: [
            { valor: '1126', texto: '1.126 / 2.126' },
            { valor: '1653', texto: '1.653 / 2.653' },
          ],
        },
      ],
    },
    {
      codigo: 'B',
      titulo: 'Observações gerais',
      perguntas: [],
      observacoesGerais: { placeholder: 'Casos que não couberam acima' },
    },
  ],
};

const COLABORADORES = [
  { id: 1, nome: 'IAN', ordem: 1, total: 10, preenchidas: 2, inutilizadas: 0 },
  { id: 2, nome: 'PRISCILA', ordem: 2, total: 8, preenchidas: 0, inutilizadas: 0 },
];

const renderizar = () =>
  render(
    <MemoryRouter initialEntries={['/fiscal/questionario']}>
      <FiscalQuestionario />
    </MemoryRouter>
  );

describe('FiscalQuestionario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    servico.questionario.mockResolvedValue(DEFINICAO);
    servico.colaboradores.mockResolvedValue(COLABORADORES);
    servico.questionarioResposta.mockResolvedValue(null);
    servico.questionarioRespostas.mockResolvedValue([]);
    servico.salvarQuestionario.mockResolvedValue({
      id: 1,
      questionarioSlug: 'cfop-xml-ou-sped',
      questionarioVersao: 1,
      colaboradorId: 1,
      colaboradorNome: 'IAN',
      respostas: { q1: 'sped_sempre' },
      observacoes: null,
      criadoEm: '2026-09-15T12:00:00.000Z',
      atualizadoEm: '2026-09-15T12:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderiza as perguntas a partir da definição recebida', async () => {
    renderizar();

    await waitFor(() => expect(screen.getByText('CFOP: XML ou SPED?')).toBeInTheDocument());

    expect(screen.getByText('Qual CFOP deve valer na apuração?')).toBeInTheDocument();
    expect(screen.getByText('Em quais famílias o SPED manda?')).toBeInTheDocument();
    // O bloco "caso", a linha "Define no motor" e o texto do "como responder".
    expect(screen.getByText('73 notas, 219 itens')).toBeInTheDocument();
    expect(screen.getByText('cfop_adoption.py')).toBeInTheDocument();
    expect(screen.getByText('Marque uma opção por pergunta.')).toBeInTheDocument();
    // Pergunta 1 é radio; a 2, checkbox.
    expect(screen.getByLabelText('O do SPED, sempre.')).toHaveAttribute('type', 'radio');
    expect(screen.getByLabelText('1.126 / 2.126')).toHaveAttribute('type', 'checkbox');
    // A seção só de observações gerais aparece como textarea.
    expect(screen.getByLabelText('Observações gerais')).toBeInTheDocument();
  });

  it('sem colaborador escolhido, avisa e deixa tudo em leitura', async () => {
    renderizar();

    await waitFor(() => expect(screen.getByText('CFOP: XML ou SPED?')).toBeInTheDocument());

    expect(screen.getByText(/Escolha quem está respondendo/)).toBeInTheDocument();
    expect(screen.getByLabelText('O do SPED, sempre.')).toBeDisabled();
    expect(servico.questionarioResposta).not.toHaveBeenCalled();
  });

  it('marcar uma opção grava por PUT só depois do debounce', async () => {
    localStorage.setItem('fiscal:colaboradorId', '1');
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderizar();

    await waitFor(() =>
      expect(screen.getByLabelText('O do SPED, sempre.')).not.toBeDisabled()
    );
    await waitFor(() =>
      expect(servico.questionarioResposta).toHaveBeenCalledWith('cfop-xml-ou-sped', 1)
    );

    fireEvent.click(screen.getByLabelText('O do SPED, sempre.'));

    // Antes do debounce vencer, nada foi para o servidor.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(servico.salvarQuestionario).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(servico.salvarQuestionario).toHaveBeenCalledTimes(1);
    expect(servico.salvarQuestionario).toHaveBeenCalledWith(
      'cfop-xml-ou-sped',
      1,
      { q1: 'sped_sempre' },
      null
    );
  });

  it('agrupa várias marcações numa gravação só', async () => {
    localStorage.setItem('fiscal:colaboradorId', '1');
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderizar();
    await waitFor(() => expect(screen.getByLabelText('1.126 / 2.126')).not.toBeDisabled());

    fireEvent.click(screen.getByLabelText('1.126 / 2.126'));
    fireEvent.click(screen.getByLabelText('1.653 / 2.653'));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(servico.salvarQuestionario).toHaveBeenCalledTimes(1);
    expect(servico.salvarQuestionario).toHaveBeenCalledWith(
      'cfop-xml-ou-sped',
      1,
      { q2: ['1126', '1653'] },
      null
    );
  });
});
