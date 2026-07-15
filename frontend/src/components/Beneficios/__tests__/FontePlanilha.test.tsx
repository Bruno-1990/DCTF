import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FontePlanilha, { PORTAL_TRANSPARENCIA_URL } from '../FontePlanilha';
import { beneficiosService } from '../../../services/beneficios';
import type { FontePlanilhaDto } from '../../../services/beneficios';

vi.mock('../../../services/beneficios', () => ({
  beneficiosService: { obterFonte: vi.fn() },
}));

const obterFonte = vi.mocked(beneficiosService.obterFonte);

const ARQUIVO_URL = 'https://transparencia.es.gov.br/Comum/IncentivosFiscais/Download/547';

const fonteResolvida: FontePlanilhaDto = {
  programa: 'compete',
  secao: '04',
  descricao: 'Lista de Beneficiários do programa Compete',
  portalUrl: PORTAL_TRANSPARENCIA_URL,
  arquivoUrl: ARQUIVO_URL,
  arquivoLabel: 'Programa Compete - ES - Ativos em 07.2026',
  erro: null,
};

const fonteSemArquivo: FontePlanilhaDto = {
  ...fonteResolvida,
  arquivoUrl: null,
  arquivoLabel: null,
  erro: 'Portal indisponível.',
};

const setup = () =>
  render(
    <FontePlanilha
      programa="compete"
      secao="04"
      descricao="Lista de Beneficiários do programa Compete"
      accentColor="blue"
    />
  );

beforeEach(() => vi.clearAllMocks());

describe('FontePlanilha · link direto do CSV resolvido pelo backend', () => {
  it('o botão baixa o arquivo do mês, nomeando o que vai baixar', async () => {
    obterFonte.mockResolvedValue(fonteResolvida);
    setup();

    const botao = await screen.findByRole('link', { name: /Baixar Programa Compete - ES - Ativos em 07\.2026/ });
    expect(botao).toHaveAttribute('href', ARQUIVO_URL);
    expect(botao).toHaveAttribute('target', '_blank');
    expect(botao).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('pede a fonte do programa da aba', async () => {
    obterFonte.mockResolvedValue(fonteResolvida);
    setup();
    await waitFor(() => expect(obterFonte).toHaveBeenCalledWith('compete'));
  });

  it('cita a seção que o backend confirmou', async () => {
    obterFonte.mockResolvedValue(fonteResolvida);
    setup();
    expect(await screen.findByText(/04 — Lista de Beneficiários do programa Compete/)).toBeInTheDocument();
  });

  it('mantém o portal acessível mesmo com o link direto resolvido', async () => {
    obterFonte.mockResolvedValue(fonteResolvida);
    setup();
    const portal = await screen.findByRole('link', { name: 'Abrir o portal' });
    expect(portal).toHaveAttribute('href', PORTAL_TRANSPARENCIA_URL);
  });
});

describe('FontePlanilha · degradação quando o portal não resolve', () => {
  it('cai no link do portal quando o backend não achou o arquivo', async () => {
    obterFonte.mockResolvedValue(fonteSemArquivo);
    setup();

    const botao = await screen.findByRole('link', { name: /Abrir Portal da Transparência/ });
    expect(botao).toHaveAttribute('href', PORTAL_TRANSPARENCIA_URL);
    expect(screen.queryByRole('link', { name: /^Baixar/ })).not.toBeInTheDocument();
  });

  it('explica em termos de ação, sem falar de HTML quebrado', async () => {
    obterFonte.mockResolvedValue(fonteSemArquivo);
    setup();
    expect(await screen.findByText(/baixe pela seção 04 do portal/i)).toBeInTheDocument();
  });

  it('cai no link do portal quando a nossa API está fora', async () => {
    obterFonte.mockRejectedValue(new Error('Network Error'));
    setup();

    expect(await screen.findByRole('link', { name: /Abrir Portal da Transparência/ })).toBeInTheDocument();
    // Sem resposta do backend, resta a seção que a própria página já conhece.
    expect(screen.getByText(/04 — Lista de Beneficiários do programa Compete/)).toBeInTheDocument();
  });
});

describe('FontePlanilha · fallback dinâmico do link', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('revela a URL quando o clique no portal não abre nada (pop-up bloqueado)', async () => {
    obterFonte.mockResolvedValue(fonteSemArquivo);
    setup();
    await act(async () => {});

    fireEvent.click(screen.getByRole('link', { name: /Abrir Portal da Transparência/ }));
    act(() => { vi.advanceTimersByTime(1300); });

    expect(screen.getByText(PORTAL_TRANSPARENCIA_URL)).toBeInTheDocument();
  });

  it('NÃO revela a URL quando a aba realmente abre', async () => {
    obterFonte.mockResolvedValue(fonteSemArquivo);
    setup();
    await act(async () => {});

    fireEvent.click(screen.getByRole('link', { name: /Abrir Portal da Transparência/ }));
    act(() => { fireEvent.blur(window); });
    act(() => { vi.advanceTimersByTime(1300); });

    expect(screen.queryByText(PORTAL_TRANSPARENCIA_URL)).not.toBeInTheDocument();
  });

  it('havendo link direto, o fallback mostra o CSV — não a página do portal', async () => {
    obterFonte.mockResolvedValue(fonteResolvida);
    setup();
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /Não abriu\? Ver o link/ }));

    expect(screen.getByText(ARQUIVO_URL)).toBeInTheDocument();
  });
});

describe('FontePlanilha · copiar', () => {
  const revelar = async () => {
    obterFonte.mockResolvedValue(fonteResolvida);
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Não abriu\? Ver o link/ }));
  };

  it('usa a Clipboard API quando o contexto é seguro (HTTPS)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('isSecureContext', true);
    Object.assign(navigator, { clipboard: { writeText } });

    await revelar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copiar/ })); });

    expect(writeText).toHaveBeenCalledWith(ARQUIVO_URL);
    expect(screen.getByText(/Copiado!/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('cai no execCommand fora de contexto seguro — o app roda em HTTP num IP de LAN', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('isSecureContext', false);
    Object.assign(navigator, { clipboard: undefined });
    Object.assign(document, { execCommand });

    await revelar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copiar/ })); });

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByText(/Copiado!/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('se nem o execCommand funcionar, a URL continua na tela para copiar à mão', async () => {
    vi.stubGlobal('isSecureContext', false);
    Object.assign(navigator, { clipboard: undefined });
    Object.assign(document, { execCommand: vi.fn().mockReturnValue(false) });

    await revelar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copiar/ })); });

    expect(screen.queryByText(/Copiado!/)).not.toBeInTheDocument();
    expect(screen.getByText(ARQUIVO_URL)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
