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
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Visão Geral', href: '/', icon: HomeIcon },
  { name: 'Dashboard', href: '/dashboard', icon: Squares2X2Icon },
  { name: 'Conferências', href: '/conferencias', icon: ClipboardDocumentCheckIcon },
  { name: 'DCTF', href: '/dctf', icon: DocumentTextIcon },
  { name: 'Clientes', href: '/clientes', icon: UsersIcon },
  { name: 'Relatórios', href: '/relatorios', icon: ChartBarIcon },
  { name: 'Situação Fiscal', href: '/situacao-fiscal', icon: DocumentTextIcon },
  { name: 'SCI', href: '/sci/banco-horas', icon: ClockIcon },
];

interface SidebarProps {
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 bg-white">
      <div className="p-5">
        <div className="mb-5">
          <h2 
            className="text-base font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors duration-200 select-none"
            onClick={() => {
              if (onClose && window.innerWidth >= 1024) {
                onClose();
              }
            }}
            title="Clique para fechar o menu (ou pressione ESC)"
          >
            DCTF ANALYZER
          </h2>
        </div>
        <nav className="space-y-1.5">
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
    </aside>
  );
};

export default Sidebar;


