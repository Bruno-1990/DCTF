import React from "react";
import { Link } from "react-router-dom";

const cards = [
  {
    title: "Painel",
    description: "Visualize métricas críticas, alertas e distribuição das declarações em tempo real.",
    href: "/dashboard",
  },
  {
    title: "Conferências",
    description: "Acompanhe pendências de prazos legais e priorize as declarações com maior risco de autuação.",
    href: "/conferencias",
  },
  {
    title: "Clientes",
    description: "Gerencie os dados dos clientes e suas informações fiscais.",
    href: "/clientes",
  },
  {
    title: "DCTF",
    description: "Processe e analise declarações de DCTF dos clientes.",
    href: "/dctf",
  },
  {
    title: "Relatórios",
    description: "Gere relatórios detalhados e análises fiscais.",
    href: "/relatorios",
  },
];

const Home: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Bem-vindo ao DCTF ANALYZER</h1>
        <p className="text-xl text-gray-600 mb-8">
          Sistema de análise e processamento de dados DCTF com interface web moderna
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-8">
        {cards.map((card) => (
          <div
            key={card.href}
            className="flex h-full w-full max-w-xs flex-col rounded-lg bg-white p-6 text-center shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl sm:w-[calc(50%-1rem)] xl:w-[calc(33.333%-1.5rem)] min-h-[220px]"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-900">{card.title}</h2>
            <p className="text-gray-600 mb-6 leading-relaxed">{card.description}</p>
            <Link
              to={card.href}
              className="mt-auto inline-flex items-center justify-center w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Acessar
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
