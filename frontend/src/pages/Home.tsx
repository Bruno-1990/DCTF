import React from "react";
import { Link } from "react-router-dom";

const Home: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Bem-vindo ao DCTF ANALYZER</h1>
        <p className="text-xl text-gray-600 mb-8">
          Sistema de análise e processamento de dados DCTF com interface web moderna
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Painel</h2>
          <p className="text-gray-600 mb-4">
            Visualize métricas críticas, alertas e distribuição das declarações em tempo real.
          </p>
          <Link to="/dashboard" className="inline-block bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
            Acessar
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Clientes</h2>
          <p className="text-gray-600 mb-4">Gerencie os dados dos clientes e suas informações fiscais.</p>
          <Link to="/clientes" className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Acessar
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">DCTF</h2>
          <p className="text-gray-600 mb-4">Processe e analise declarações de DCTF dos clientes.</p>
          <Link to="/dctf" className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Acessar
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Relatórios</h2>
          <p className="text-gray-600 mb-4">Gere relatórios detalhados e análises fiscais.</p>
          <Link to="/relatorios" className="inline-block bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
            Acessar
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
