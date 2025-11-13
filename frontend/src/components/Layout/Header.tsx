import React from "react";
import { Link, useLocation } from "react-router-dom";

const navigation = [
  { name: 'Início', href: '/' },
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Conferências', href: '/conferencias' },
  { name: 'DCTF', href: '/dctf' },
  { name: 'Clientes', href: '/clientes' },
  { name: 'Relatórios', href: '/relatorios' },
  { name: 'Administração', href: '/administracao' },
];

const Header: React.FC = () => {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  return (
    <header className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold">
            DCTF ANALYZER
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm font-medium">
            {navigation.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`px-3 py-1 rounded transition-colors ${
                  isActive(item.href)
                    ? 'bg-white text-blue-600'
                    : 'hover:bg-blue-500'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
