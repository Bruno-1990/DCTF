import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Overlay. Fica FORA do contêiner do painel e o painel é `relative`:
          sem isso o overlay — que é posicionado — pinta por cima do painel, que
          não era, e o modal virava uma tela cinza vazia.

          Isso passou despercebido porque a marcação original era a do Tailwind
          2/3, onde a classe `transform` do painel criava contexto de
          empilhamento sozinha. No Tailwind 4 (4.1 aqui) ela deixou de criar, e
          o empilhamento passou a depender do `relative` explícito. */}
      <div
        className="fixed inset-0 bg-gray-900/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* `min-h-full` com flex centraliza de verdade em qualquer altura de tela.
          O arranjo anterior (`inline-block` + `align-middle`) dependia de um
          espaçador de altura total que não existia neste arquivo, e por isso o
          painel encostava no topo. */}
      <div className="relative flex min-h-full items-center justify-center p-4">
        <div
          className={`w-full overflow-hidden rounded-2xl bg-white text-left shadow-2xl ${sizeClasses[size]}`}
        >
          {title && (
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-bold text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <span className="sr-only">Fechar</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}

          <div className="px-5 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Modal;




















