import React from 'react';
import { useToast } from '../../hooks/useToast';

const colors: Record<string, string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-blue-600',
  warning: 'bg-yellow-600',
};

export const ToastContainer: React.FC = () => {
  const { items, remove } = useToast();
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded shadow-lg text-white px-4 py-3 min-w-[240px] ${colors[t.type] ?? colors.info}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">{t.message}</div>
            <button
              onClick={() => remove(t.id)}
              className="text-white/80 hover:text-white text-sm"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

import { useEffect } from 'react';

type ToastProps = {
  type?: 'success' | 'error' | 'info' | 'warning';
  message: string;
  onClose?: () => void;
  autoHideMs?: number;
};

export default function Toast({ type = 'info', message, onClose, autoHideMs = 3000 }: ToastProps) {
  useEffect(() => {
    const id = setTimeout(() => onClose && onClose(), autoHideMs);
    return () => clearTimeout(id);
  }, [autoHideMs, onClose]);

  const base = 'fixed right-4 top-4 z-50 px-4 py-3 rounded shadow-lg text-white';
  const color =
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600';

  return (
    <div className={`${base} ${color}`} role="alert">
      {message}
    </div>
  );
}


