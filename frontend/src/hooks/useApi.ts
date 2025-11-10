import { useState, useCallback } from 'react';
import api from '../services/api';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any
  ): Promise<T> => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.request({
        method,
        url,
        data,
      });

      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Erro na requisição';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback(<T>(url: string): Promise<T> => {
    return request<T>('GET', url);
  }, [request]);

  const post = useCallback(<T>(url: string, data?: any): Promise<T> => {
    return request<T>('POST', url, data);
  }, [request]);

  const put = useCallback(<T>(url: string, data?: any): Promise<T> => {
    return request<T>('PUT', url, data);
  }, [request]);

  const del = useCallback(<T>(url: string): Promise<T> => {
    return request<T>('DELETE', url);
  }, [request]);

  return {
    loading,
    error,
    get,
    post,
    put,
    delete: del,
    clearError: () => setError(null),
  };
};

