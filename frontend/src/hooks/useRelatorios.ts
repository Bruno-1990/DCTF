import { useState, useCallback } from 'react';
import { relatoriosService, type RelatoriosListResponse, type RelatorioListItem } from '../services/relatorios';

export function useRelatorios() {
  const [items, setItems] = useState<RelatorioListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params?: { page?: number; limit?: number; tipoRelatorio?: string; declaracaoId?: string }): Promise<RelatoriosListResponse> => {
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
