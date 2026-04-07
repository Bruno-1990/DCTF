import { useStore } from '../store/useStore';
import { clientesService } from '../services';
import type { Cliente } from '../types';
import type { ClientesListResponse } from '../services/clientes';

export const useClientes = () => {
  const {
    clientes,
    setClientes,
    addCliente,
    updateCliente,
    removeCliente,
    loading,
    setLoading,
    error,
    setError,
  } = useStore();

  const loadClientes = async (params?: { page?: number; limit?: number; nome?: string; cnpj?: string; search?: string; socio?: string; semCodigoSci?: boolean }): Promise<ClientesListResponse> => {
    try {
      setLoading(true);
      setError(null);
      const res = await clientesService.getAll(params);
      setClientes(res.items);
      return res;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar clientes';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createCliente = async (clienteData: Partial<Cliente>) => {
    try {
      setLoading(true);
      setError(null);
      const newCliente = await clientesService.create(clienteData);
      addCliente(newCliente);
      return newCliente;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar cliente';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateClienteById = async (id: string, clienteData: Partial<Cliente>) => {
    try {
      setLoading(true);
      setError(null);
      const updatedCliente = await clientesService.update(id, clienteData);
      updateCliente(id, updatedCliente);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar cliente';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteClienteById = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await clientesService.delete(id);
      removeCliente(id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir cliente';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getClienteById = (id: string) => {
    return clientes.find(cliente => cliente.id === id);
  };

  return {
    clientes,
    loading,
    error,
    loadClientes,
    createCliente,
    updateClienteById,
    deleteClienteById,
    getClienteById,
    clearError: () => setError(null),
  };
};
