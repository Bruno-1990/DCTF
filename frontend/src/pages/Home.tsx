import React from "react";
import { Link } from "react-router-dom";
import {
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  UsersIcon,
  ChartBarIcon,
  DocumentMagnifyingGlassIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

const cards = [
  {
    title: "Conferências",
    description: "Acompanhe pendências de prazos legais e priorize as declarações com maior risco de autuação.",
    href: "/conferencias",
    icon: ClipboardDocumentCheckIcon,
  },
  {
    title: "DCTF",
    description: "Processe e analise declarações de DCTF dos clientes.",
    href: "/dctf",
    icon: DocumentTextIcon,
  },
  {
    title: "Clientes",
    description: "Gerencie os dados dos clientes e suas informações fiscais.",
    href: "/clientes",
    icon: UsersIcon,
  },
  {
    title: "Relatórios",
    description: "Gere relatórios detalhados e análises fiscais em diferentes formatos.",
    href: "/relatorios",
    icon: ChartBarIcon,
  },
  {
    title: "Situação Fiscal",
    description: "Consulte a situação fiscal dos clientes através da Receita Federal.",
    href: "/situacao-fiscal",
    icon: DocumentMagnifyingGlassIcon,
  },
];

const Home: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Bem-vindo ao DCTF ANALYZER</h1>
        <p className="text-base text-gray-600">
          Sistema de análise e processamento de dados DCTF com interface web moderna
        </p>
      </div>

      {/* Cards Grid — auto-fit: as colunas se redistribuem conforme a largura disponivel */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              to={card.href}
              className="group bg-white border-4 border-blue-600 rounded-xl shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 transition-all duration-200 overflow-hidden flex flex-col"
            >
              <div className="p-5 flex flex-col flex-grow">
                <div className="flex items-start gap-4 mb-5">
                  <div className="p-3 rounded-xl bg-blue-50 group-hover:bg-blue-100 transition-colors shrink-0">
                    <Icon className="h-7 w-7 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{card.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
                  </div>
                </div>
                <div className="mt-auto w-full px-4 py-2.5 bg-white border-[3px] border-blue-600 rounded-lg text-sm font-medium text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center justify-center gap-2">
                  <span>Acessar</span>
                  <ArrowRightIcon className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default Home;
