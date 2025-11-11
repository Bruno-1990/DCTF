import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useClientes } from '../useClientes';
import { clientesService } from '../../services';

// Mock the services
vi.mock('../../services', () => ({
  clientesService: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the store
vi.mock('../../store/useStore', () => ({
  useStore: () => ({
    clientes: [],
    addCliente: vi.fn(),
    updateCliente: vi.fn(),
    removeCliente: vi.fn(),
    loading: false,
    setLoading: vi.fn(),
    error: null,
    setError: vi.fn(),
  }),
}));

describe('useClientes', () => {
  it('creates a cliente successfully', async () => {
    const mockCliente = {
      id: '1',
      nome: 'Test Cliente',
      cnpj: '12.345.678/0001-90',
      email: 'test@example.com',
      telefone: '(11) 99999-9999',
      endereco: 'Test Address',
      cidade: 'Test City',
      estado: 'SP',
      cep: '01234-567',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(clientesService.create).mockResolvedValue(mockCliente);

    const { result } = renderHook(() => useClientes());

    await act(async () => {
      await result.current.createCliente({
        nome: 'Test Cliente',
        cnpj: '12.345.678/0001-90',
        email: 'test@example.com',
        telefone: '(11) 99999-9999',
        endereco: 'Test Address',
        cidade: 'Test City',
        estado: 'SP',
        cep: '01234-567',
      });
    });

    expect(clientesService.create).toHaveBeenCalledWith({
      nome: 'Test Cliente',
      cnpj: '12.345.678/0001-90',
      email: 'test@example.com',
      telefone: '(11) 99999-9999',
      endereco: 'Test Address',
      cidade: 'Test City',
      estado: 'SP',
      cep: '01234-567',
    });
  });

  it('handles errors when creating cliente', async () => {
    const error = new Error('API Error');
    vi.mocked(clientesService.create).mockRejectedValue(error);

    const { result } = renderHook(() => useClientes());

    await act(async () => {
      try {
        await result.current.createCliente({
          nome: 'Test Cliente',
          cnpj: '12.345.678/0001-90',
          email: 'test@example.com',
          telefone: '(11) 99999-9999',
          endereco: 'Test Address',
          cidade: 'Test City',
          estado: 'SP',
          cep: '01234-567',
        });
      } catch (e) {
        expect(e).toBe(error);
      }
    });
  });
});









