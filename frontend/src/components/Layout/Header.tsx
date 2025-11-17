import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  HomeIcon,
  Squares2X2Icon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Início', href: '/', icon: HomeIcon },
  { name: 'Dashboard', href: '/dashboard', icon: Squares2X2Icon },
  { name: 'Conferências', href: '/conferencias', icon: ClipboardDocumentCheckIcon },
  { name: 'DCTF', href: '/dctf', icon: DocumentTextIcon },
  { name: 'Clientes', href: '/clientes', icon: UsersIcon },
  { name: 'Relatórios', href: '/relatorios', icon: ChartBarIcon },
  { name: 'Administração', href: '/administracao', icon: Cog6ToothIcon },
];

const Header: React.FC = () => {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  return (
    <header className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-xl border-b border-blue-800/30">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link 
            to="/" 
            className="flex items-center gap-2 text-xl font-bold hover:opacity-90 transition-opacity"
          >
            <div className="bg-white/20 backdrop-blur-sm p-1.5 rounded-lg">
              <DocumentTextIcon className="h-6 w-6" />
            </div>
            <span className="hidden sm:inline">DCTF ANALYZER</span>
            <span className="sm:hidden">DCTF</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-white text-blue-700 shadow-md scale-105'
                      : 'hover:bg-white/10 hover:scale-105 text-white/90'
                  }`}
                  title={item.name}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-blue-700' : ''}`} />
                  <span className="hidden md:inline">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
