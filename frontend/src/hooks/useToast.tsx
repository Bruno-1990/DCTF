import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms
  closing?: boolean;
};

type ToastContextType = {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'>) => void;
  remove: (id: string) => void; // remove com animação (fade-out)
};

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    // Remove com animação: marca como "closing" e só remove do DOM após o fade-out
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, closing: true } : t)),
    );
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const push = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    const toast: ToastItem = { id, ...item, closing: false };
    setItems((prev) => [...prev, toast]);
    const duration = toast.duration ?? 4500;
    window.setTimeout(() => remove(id), duration);
  }, [remove]);

  const value = useMemo(() => ({ items, push, remove }), [items, push, remove]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  const success = (message: string, duration?: number) => ctx.push({ type: 'success', message, duration });
  const error = (message: string, duration?: number) => ctx.push({ type: 'error', message, duration });
  const info = (message: string, duration?: number) => ctx.push({ type: 'info', message, duration });
  const warning = (message: string, duration?: number) => ctx.push({ type: 'warning', message, duration });
  return { ...ctx, success, error, info, warning };
}


