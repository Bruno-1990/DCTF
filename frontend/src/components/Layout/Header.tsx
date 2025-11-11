import React from "react";
import { Link } from "react-router-dom";

const Header: React.FC = () => {
  return (
    <header className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold">
            DCTF ANALYZER
          </Link>
          <nav className="space-x-4">
            <Link to="/dashboard" className="hover:text-blue-200">
              Painel
            </Link>
            <Link to="/clientes" className="hover:text-blue-200">
              Clientes
            </Link>
            <Link to="/dctf" className="hover:text-blue-200">
              DCTF
            </Link>
            <Link to="/upload" className="hover:text-blue-200">
              Upload
            </Link>
            <Link to="/relatorios" className="hover:text-blue-200">
              Relatórios
            </Link>
            <Link to="/configuracoes" className="hover:text-blue-200">
              Configurações
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
