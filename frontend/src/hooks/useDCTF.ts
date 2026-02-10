import { useState, useCallback } from 'react';
import { dctfService, type DCTFListResponse, type DCTFListItem } from '../services/dctf';

type LoadParams = {
  page?: number;
  limit?: number;
  clienteId?: string;
  periodo?: string;
  status?: string;
  situacao?: string;
  tipo?: string;
  periodoTransmissao?: string;
  orderBy?: string;
  order?: 'asc' | 'desc';
  search?: string;
};

export function useDCTF() {
  const [items, setItems] = useState<DCTFListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params?: LoadParams): Promise<DCTFListResponse> => {
    try {
      setLoading(true);
      setError(null);
      const res = await dctfService.getAll(params);
      setItems(res.items);
      return res;
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar DCTF');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { items, load, loading, error, clearError: () => setError(null) };
}
