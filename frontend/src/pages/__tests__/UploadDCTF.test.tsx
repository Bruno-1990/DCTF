import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UploadDCTF from '../UploadDCTF';

describe('UploadDCTF Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('valida arquivo e mostra preview com contagens', async () => {
    const mockValidate = {
      success: true,
      data: {
        metadados: {},
        totalLinhas: 3,
        validos: 2,
        invalidos: 1,
        dados: [
          { codigo: '001', descricao: 'Receita', valor: 100, periodo: '2024-01', data_ocorrencia: '2024-01-15' },
          { codigo: '101', descricao: 'Deducao', valor: 10, periodo: '2024-01', data_ocorrencia: '2024-01-20' },
        ],
      },
      warnings: [],
    };

    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({ json: async () => mockValidate } as any);

    render(<UploadDCTF />);

    const actualInput = screen.getByTestId('upload-input') as HTMLInputElement;
    const file = new File(['a'], 'sample.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(actualInput, 'files', { value: [file] });
    fireEvent.change(actualInput);

    fireEvent.click(screen.getByRole('button', { name: /validar/i }));

    await screen.findByText(/Válidos:/);
    await screen.findByText(/Inválidos:/);
    expect(screen.getByText('Receita')).toBeInTheDocument();
  });

  it('importa em chunks quando declaracaoId informado', async () => {
    const mockValidate = {
      success: true,
      data: {
        metadados: {},
        totalLinhas: 2,
        validos: 2,
        invalidos: 0,
        dados: [
          { codigo: '001', descricao: 'Receita', valor: 100, periodo: '2024-01', data_ocorrencia: '2024-01-15' },
          { codigo: '101', descricao: 'Deducao', valor: 10, periodo: '2024-01', data_ocorrencia: '2024-01-20' },
        ],
      },
      warnings: [],
    };
    const mockImport = {
      success: true,
      data: { totalLinhasArquivo: 2, validos: 2, invalidos: 0, persisted: 2, failed: 0, chunkSize: 1000 },
      warnings: [],
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({ json: async () => mockValidate } as any);
    fetchMock.mockResolvedValueOnce({ json: async () => mockImport } as any);

    render(<UploadDCTF />);

    const actualInput = screen.getByTestId('upload-input') as HTMLInputElement;
    const file = new File(['a'], 'sample.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(actualInput, 'files', { value: [file] });
    fireEvent.change(actualInput);

    fireEvent.click(screen.getByRole('button', { name: /validar/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Preenche declaracaoId e importa
    fireEvent.change(screen.getByLabelText(/Declaracao ID/i), { target: { value: 'dec-123' } });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Importação concluída/i)).toBeInTheDocument();
      expect(screen.getByText(/Persistidos: 2/)).toBeInTheDocument();
    });
  });
});


