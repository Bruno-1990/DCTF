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


