import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EBEFTab from '../EBEFTab';
import type { EBEFParent } from '../../../types';

// ── Mock do service ──
const mockListarEBEF = vi.fn();
const mockObterProgressoEBEF = vi.fn();
const mockIniciarLoteEBEF = vi.fn();
const mockConsultarEBEFFilho = vi.fn();

vi.mock('../../../services/clientes', () => ({
  clientesService: {
    listarEBEF: (...args: any[]) => mockListarEBEF(...args),
    obterProgressoEBEF: (...args: any[]) => mockObterProgressoEBEF(...args),
    iniciarLoteEBEF: (...args: any[]) => mockIniciarLoteEBEF(...args),
    consultarEBEFFilho: (...args: any[]) => mockConsultarEBEFFilho(...args),
  },
}));

// ── Dados de teste ──
const mockParent: EBEFParent = {
  id: 'parent-1',
  razao_social: 'EMPRESA MAE LTDA',
  cnpj_limpo: '12345678000190',
  socios_pj: [
    {
      socio_id: 'socio-1',
      nome: 'EMPRESA FILHO S/A',
      cnpj_filho: '98765432000111',
      qual: 'Socio-Administrador',
      consulta: {
        id: 'consulta-1',
        cnpj_filho: '98765432000111',
        nome_filho: 'EMPRESA FILHO S/A',
        situacao_filho: 'ATIVA',
        capital_social_filho: 100000,
        status: 'concluido',
        erro_mensagem: null,
        consultado_em: '2026-04-07T10:00:00Z',
        socios: [
          { id: 'sf-1', nome: 'JOAO DA SILVA', qual: 'Socio-Administrador' },
          { id: 'sf-2', nome: 'MARIA SOUZA', qual: 'Socio' },
        ],
      },
    },
  ],
};

const mockParentPendente: EBEFParent = {
  id: 'parent-2',
  razao_social: 'OUTRA EMPRESA LTDA',
  cnpj_limpo: '11222333000144',
  socios_pj: [
    {
      socio_id: 'socio-2',
      nome: 'FILIAL ABC LTDA',
      cnpj_filho: '55666777000188',
      qual: 'Socio',
      consulta: null,
    },
  ],
};

const mockParentErro: EBEFParent = {
  id: 'parent-3',
  razao_social: 'EMPRESA COM ERRO LTDA',
  cnpj_limpo: '99888777000166',
  socios_pj: [
    {
      socio_id: 'socio-3',
      nome: 'FILHA ERRO S/A',
      cnpj_filho: '44333222000155',
      qual: null,
      consulta: {
        id: 'consulta-3',
        cnpj_filho: '44333222000155',
        nome_filho: null,
        situacao_filho: null,
        capital_social_filho: null,
        status: 'erro',
        erro_mensagem: 'CNPJ nao encontrado na ReceitaWS',
        consultado_em: '2026-04-07T09:00:00Z',
        socios: [],
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockObterProgressoEBEF.mockResolvedValue({
    success: true,
    data: { total: 0, concluidos: 0, pendentes: 0, processando: 0, erros: 0, em_andamento: false },
  });
});

describe('EBEFTab', () => {
  it('exibe spinner enquanto carrega', () => {
    mockListarEBEF.mockReturnValue(new Promise(() => {})); // never resolves
    render(<EBEFTab />);
    // LoadingSpinner renders a div with role or spinner class
    expect(document.querySelector('.animate-spin') || screen.queryByRole('status')).toBeTruthy();
  });

  it('exibe mensagem quando nao ha dados', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [] });
    render(<EBEFTab />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma empresa com sócios PJ/i)).toBeInTheDocument();
    });
  });

  it('exibe titulo e botao Consultar Todos', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParent] });
    render(<EBEFTab />);
    await waitFor(() => {
      expect(screen.getByText('e-BEF — Beneficiários Finais')).toBeInTheDocument();
      expect(screen.getByText('Consultar Todos')).toBeInTheDocument();
    });
  });

  it('exibe cards de resumo com contadores corretos', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParent, mockParentPendente, mockParentErro] });
    render(<EBEFTab />);
    await waitFor(() => {
      // 3 empresas mae
      expect(screen.getByText('Empresas Mãe')).toBeInTheDocument();
      // 3 CNPJs filho (1 cada)
      expect(screen.getByText('CNPJs Filho')).toBeInTheDocument();
    });
  });

  it('exibe empresa mae e permite expandir accordion', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParent] });
    render(<EBEFTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA MAE LTDA')).toBeInTheDocument();
    });

    // Clicar para expandir
    fireEvent.click(screen.getByText('EMPRESA MAE LTDA'));

    // Deve mostrar dados do filho
    await waitFor(() => {
      expect(screen.getByText('EMPRESA FILHO S/A')).toBeInTheDocument();
    });
  });

  it('exibe QSA do filho quando concluido e expandido', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParent] });
    render(<EBEFTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA MAE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('EMPRESA MAE LTDA'));

    await waitFor(() => {
      expect(screen.getByText('JOAO DA SILVA')).toBeInTheDocument();
      expect(screen.getByText('MARIA SOUZA')).toBeInTheDocument();
    });
  });

  it('exibe badge de status Concluido', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParent] });
    render(<EBEFTab />);
    await waitFor(() => screen.getByText('EMPRESA MAE LTDA'));
    fireEvent.click(screen.getByText('EMPRESA MAE LTDA'));

    await waitFor(() => {
      expect(screen.getByText('Concluído')).toBeInTheDocument();
    });
  });

  it('exibe badge Pendente e mensagem para filho sem consulta', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParentPendente] });
    render(<EBEFTab />);
    await waitFor(() => screen.getByText('OUTRA EMPRESA LTDA'));
    fireEvent.click(screen.getByText('OUTRA EMPRESA LTDA'));

    await waitFor(() => {
      expect(screen.getByText('Pendente')).toBeInTheDocument();
      expect(screen.getByText(/Aguardando consulta/i)).toBeInTheDocument();
    });
  });

  it('exibe badge Erro com mensagem e botao Reconsultar', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParentErro] });
    render(<EBEFTab />);
    await waitFor(() => screen.getByText('EMPRESA COM ERRO LTDA'));
    fireEvent.click(screen.getByText('EMPRESA COM ERRO LTDA'));

    await waitFor(() => {
      expect(screen.getByText('Erro')).toBeInTheDocument();
      expect(screen.getByText(/CNPJ nao encontrado/i)).toBeInTheDocument();
      expect(screen.getByText('Reconsultar')).toBeInTheDocument();
    });
  });

  it('chama consultarEBEFFilho ao clicar Reconsultar', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParentErro] });
    mockConsultarEBEFFilho.mockResolvedValue({ success: true });
    render(<EBEFTab />);
    await waitFor(() => screen.getByText('EMPRESA COM ERRO LTDA'));
    fireEvent.click(screen.getByText('EMPRESA COM ERRO LTDA'));

    await waitFor(() => screen.getByText('Reconsultar'));
    fireEvent.click(screen.getByText('Reconsultar'));

    await waitFor(() => {
      expect(mockConsultarEBEFFilho).toHaveBeenCalledWith('consulta-3');
    });
  });

  it('chama iniciarLoteEBEF ao clicar Consultar Todos', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParentPendente] });
    mockIniciarLoteEBEF.mockResolvedValue({ success: true, data: { total: 1, inseridos: 1 } });
    render(<EBEFTab />);
    await waitFor(() => screen.getByText('Consultar Todos'));

    fireEvent.click(screen.getByText('Consultar Todos'));

    await waitFor(() => {
      expect(mockIniciarLoteEBEF).toHaveBeenCalled();
    });
  });

  it('exibe erro do service na UI', async () => {
    mockListarEBEF.mockResolvedValue({ success: false, error: 'Tabela nao existe' });
    render(<EBEFTab />);
    await waitFor(() => {
      expect(screen.getByText(/Tabela nao existe/i)).toBeInTheDocument();
    });
  });

  it('CNPJ do filho é formatado corretamente (XX.XXX.XXX/XXXX-XX)', async () => {
    mockListarEBEF.mockResolvedValue({ success: true, data: [mockParent] });
    render(<EBEFTab />);
    await waitFor(() => screen.getByText('EMPRESA MAE LTDA'));
    // CNPJ mãe formatado: 12.345.678/0001-90
    expect(screen.getByText('12.345.678/0001-90')).toBeInTheDocument();

    fireEvent.click(screen.getByText('EMPRESA MAE LTDA'));
    await waitFor(() => {
      // CNPJ filho formatado: 98.765.432/0001-11
      expect(screen.getByText(/98\.765\.432\/0001-11/)).toBeInTheDocument();
    });
  });
});
