import { describe, it, vi, beforeEach, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DCTFList from '../DCTFList';

describe('DCTFList Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carrega lista e mostra tabela com paginação', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: [
          { id: 'd1', clienteId: 'c1', periodo: '2024-01', dataDeclaracao: '15/01/2024', status: 'concluido' },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      })
    } as any);

    render(
      <BrowserRouter>
        <DCTFList />
      </BrowserRouter>
    );

    await waitFor(() => expect(screen.getByText('Declarações DCTF')).toBeInTheDocument());
    expect(screen.getByText('d1')).toBeInTheDocument();
    expect(screen.getByText('Total: 1')).toBeInTheDocument();

    // Mudar limite
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '5' } });
  });
});


