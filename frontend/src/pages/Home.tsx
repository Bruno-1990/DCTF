import React from "react";
import { Link } from "react-router-dom";
import {
  Squares2X2Icon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  DocumentMagnifyingGlassIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

const cards = [
  {
    title: "Dashboard",
    description: "Visualize métricas críticas, alertas e distribuição das declarações em tempo real.",
    href: "/dashboard",
    icon: Squares2X2Icon,
  },
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
    title: "Pagamentos",
    description: "Consulte e gerencie informações de pagamentos da Receita Federal.",
    href: "/pagamentos",
    icon: CreditCardIcon,
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
  {
    title: "Administração",
    description: "Configure e gerencie as opções administrativas do sistema.",
    href: "/administracao",
    icon: Cog6ToothIcon,
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

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              to={card.href}
              className="bg-white border-2 border-blue-600 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col"
            >
              <div className="p-5 flex flex-col flex-grow">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2.5 rounded-lg bg-blue-50">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 mb-2">{card.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
                  </div>
                </div>
                <div className="mt-auto w-full px-4 py-2.5 bg-white border-2 border-blue-600 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                  <span>Acessar</span>
                  <ArrowRightIcon className="h-4 w-4" />
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
