import { describe, it, vi, beforeEach, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DCTFDadosPage from '../DCTFDadosPage';

describe('DCTFDadosPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithRoute = (id: string) => (
    render(
      <MemoryRouter initialEntries={[`/dctf/${id}/dados`]}>
        <Routes>
          <Route path="/dctf/:id/dados" element={<DCTFDadosPage />} />
        </Routes>
      </MemoryRouter>
    )
  );

  it('carrega dados com filtros e mostra tabela', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: [
          { linha: 1, codigo: '001', descricao: 'Receita', valor: 100, dataOcorrencia: '15/01/2024' },
          { linha: 2, codigo: '101', descricao: 'Deducao', valor: 10, dataOcorrencia: '20/01/2024' },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
      })
    } as any);

    renderWithRoute('dec-1');

    await waitFor(() => expect(screen.getByText(/Dados da Declaração dec-1/)).toBeInTheDocument());
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText('Deducao')).toBeInTheDocument();

    // Aplicar um filtro simples e re-disparar
    fireEvent.change(screen.getByLabelText(/Código$/i), { target: { value: '001' } });
    // Não validamos resultado do segundo fetch aqui, apenas interação básica
  });
});


