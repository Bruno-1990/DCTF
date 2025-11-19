import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  Squares2X2Icon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Visão Geral', href: '/', icon: HomeIcon },
  { name: 'Dashboard', href: '/dashboard', icon: Squares2X2Icon },
  { name: 'Conferências', href: '/conferencias', icon: ClipboardDocumentCheckIcon },
  { name: 'DCTF', href: '/dctf', icon: DocumentTextIcon },
  { name: 'Clientes', href: '/clientes', icon: UsersIcon },
  { name: 'Pagamentos', href: '/pagamentos', icon: CreditCardIcon },
  { name: 'Relatórios', href: '/relatorios', icon: ChartBarIcon },
  { name: 'Situação Fiscal', href: '/situacao-fiscal', icon: DocumentTextIcon },
  { name: 'Administração', href: '/administracao', icon: Cog6ToothIcon },
];

const Sidebar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 bg-white shadow-lg h-full">
      <div className="p-5">
        <h2 className="text-base font-bold text-gray-900 mb-5">DCTF ANALYZER</h2>
        <nav className="space-y-1.5">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  active
                    ? 'bg-blue-100 text-blue-700 font-medium shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;


