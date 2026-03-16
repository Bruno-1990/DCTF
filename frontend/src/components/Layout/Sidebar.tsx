import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  Squares2X2Icon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  UsersIcon,
  ChartBarIcon,
  ClockIcon,
  CodeBracketIcon,
  DocumentCheckIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import {
  PaperClipIcon,
} from '@heroicons/react/24/solid';

const navigation = [
  { name: 'Visão Geral', href: '/', icon: HomeIcon },
  { name: 'Dashboard', href: '/dashboard', icon: Squares2X2Icon },
  { name: 'Conferências', href: '/conferencias', icon: ClipboardDocumentCheckIcon },
  { name: 'DCTF', href: '/dctf', icon: DocumentTextIcon },
  { name: 'Clientes', href: '/clientes', icon: UsersIcon },
  { name: 'Relatórios', href: '/relatorios', icon: ChartBarIcon },
  { name: 'Situação Fiscal', href: '/situacao-fiscal', icon: DocumentTextIcon },
  { name: 'DIRF', href: '/dirf', icon: DocumentTextIcon },
  { name: 'SCI - Banco de Horas', href: '/sci/banco-horas', icon: ClockIcon },
  { name: 'SCI - Gerador SQL', href: '/sci/gerador-sql', icon: CodeBracketIcon },
  { name: 'SPED Validação', href: '/sped', icon: DocumentCheckIcon },
  { name: 'SPED Validação v2.0', href: '/sped/v2', icon: DocumentCheckIcon },
  { name: 'IRPF 2026', href: '/irpf-2026', icon: CurrencyDollarIcon },
];

interface SidebarProps {
  onClose?: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
  lockedClosed?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose, pinned = false, onTogglePin, lockedClosed = false }) => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 bg-white flex flex-col">
      <div className="p-5 flex-shrink-0">
        <div className="mb-5 flex items-center justify-between">
          <h2 
            className="text-base font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors duration-200 select-none flex-1"
            onClick={() => {
              if (onClose && window.innerWidth >= 1024 && !pinned && !lockedClosed) {
                onClose();
              }
            }}
            title={pinned ? "Menu fixado" : lockedClosed ? "Menu trancado fechado" : "Clique para fechar o menu (ou pressione ESC)"}
          >
            DCTF ANALYZER
          </h2>
          {onTogglePin && (
            <button
              onClick={onTogglePin}
              className={`p-1.5 rounded-lg transition-all duration-200 ${
                pinned
                  ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={pinned ? 'Desfixar menu' : 'Fixar menu sempre aberto'}
              aria-label={pinned ? 'Desfixar menu' : 'Fixar menu'}
            >
              <PaperClipIcon className={`h-4 w-4 transition-transform duration-200 ${pinned ? 'rotate-45' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {/* Container de navegação com scroll limitado a 8 itens */}
      <div className="flex-1 overflow-hidden px-5 pb-5 min-h-0 group/nav-container">
        <nav className="space-y-1.5 overflow-y-auto custom-scrollbar" style={{ 
          maxHeight: '22.5rem' // Altura para exibir exatamente 8 itens (8 * 2.5rem + 7 * 0.375rem ≈ 22.625rem)
        }}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => {
                  // Fechar menu no mobile ao clicar em um link
                  if (onClose && window.innerWidth < 1024) {
                    onClose();
                  }
                }}
                className={`relative flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm overflow-hidden group ${
                  active
                    ? 'text-blue-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {/* Barra azulada com transição do meio para as bordas */}
                <div 
                  className={`absolute inset-0 bg-blue-100 rounded-xl transition-all duration-500 ease-out ${
                    active 
                      ? 'scale-x-100 opacity-100' 
                      : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-100'
                  }`}
                  style={{
                    transformOrigin: 'center',
                    transition: 'transform 500ms ease-out, opacity 500ms ease-out',
                  }}
                />
                
                {/* Conteúdo do link */}
                <div className="relative z-10 flex items-center space-x-3 w-full">
                  {/* Ícone com efeito de cor quando ativo */}
                  {active ? (
                    <span className="relative inline-block">
                      {/* Ícone base - branco quando ativo */}
                      <Icon className="h-4 w-4 text-white transition-colors duration-300" />
                      
                      {/* Container que revela o ícone azul da esquerda para direita */}
                      <span 
                        className="absolute inset-0 block overflow-hidden w-full"
                        style={{
                          transition: 'width 1000ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <Icon className="h-4 w-4 text-blue-600" />
                      </span>
                    </span>
                  ) : (
                    <Icon className={`h-4 w-4 transition-colors duration-300 ${
                      'text-gray-600 group-hover:text-blue-600'
                    }`} />
                  )}
                  
                  {/* Texto com efeito de cor */}
                  <span className="relative inline-block w-full">
                    {/* Texto base - branco quando ativo ou durante hover para não distorcer */}
                    <span className={`block transition-colors duration-300 ${
                      active 
                        ? 'text-white font-medium' 
                        : 'text-gray-600 group-hover:text-white'
                    }`}>
                      {item.name}
                    </span>
                    
                    {/* Container que revela o texto azul da esquerda para direita */}
                    <span 
                      className={`absolute left-0 top-0 bottom-0 block overflow-hidden ${
                        active 
                          ? 'w-full' 
                          : 'w-0 group-hover:w-full'
                      }`}
                      style={{
                        transition: active 
                          ? 'width 1000ms cubic-bezier(0.4, 0, 0.2, 1)' 
                          : 'width 900ms cubic-bezier(0.4, 0, 0.2, 1)',
                        right: '0',
                      }}
                    >
                      <span className="block text-blue-600 font-medium whitespace-nowrap">
                        {item.name}
                      </span>
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
      <style>{`
        .custom-scrollbar {
          scrollbar-width: none; /* Firefox - esconder por padrão */
          scrollbar-color: transparent transparent;
        }
        .group\/nav-container:hover .custom-scrollbar {
          scrollbar-width: thin; /* Firefox - mostrar no hover */
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px; /* Chrome/Safari - esconder por padrão */
          transition: width 0.3s ease;
        }
        .group\/nav-container:hover .custom-scrollbar::-webkit-scrollbar {
          width: 6px; /* Chrome/Safari - mostrar no hover */
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: transparent; /* Esconder por padrão */
          border-radius: 10px;
          transition: background 0.3s ease;
        }
        .group\/nav-container:hover .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(59, 130, 246, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%);
        }
        .group\/nav-container:hover .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(59, 130, 246, 0.6) 0%, rgba(99, 102, 241, 0.6) 100%);
        }
        .custom-scrollbar {
          /* Suavizar a rolagem */
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;


