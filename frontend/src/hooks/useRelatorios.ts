import { useState, useCallback } from 'react';
import { relatoriosService, type RelatoriosListResponse, type RelatorioListItem } from '../services/relatorios';

type LoadParams = {
  page?: number;
  limit?: number;
  tipoRelatorio?: string;
  declaracaoId?: string;
  identification?: string;
  period?: string;
};

export function useRelatorios() {
  const [items, setItems] = useState<RelatorioListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params?: LoadParams): Promise<RelatoriosListResponse> => {
    try {
      setLoading(true);
      setError(null);
      const res = await relatoriosService.getAll(params);
      setItems(res.items);
      return res;
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar relatórios');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { items, load, loading, error, clearError: () => setError(null) };
}
