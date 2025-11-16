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
    icon: DocumentTextIcon,
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
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Bem-vindo ao DCTF ANALYZER</h1>
        <p className="text-xl text-gray-600 mb-8">
          Sistema de análise e processamento de dados DCTF com interface web moderna
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              to={card.href}
              className="flex h-full flex-col rounded-lg bg-white p-6 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl min-h-[220px] group"
            >
              <div className="flex items-center justify-center mb-4">
                <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <Icon className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-3 text-gray-900 text-center">{card.title}</h2>
              <p className="text-gray-600 mb-6 leading-relaxed text-center flex-grow">{card.description}</p>
              <div className="mt-auto">
                <span className="inline-flex items-center justify-center w-full px-4 py-2 bg-blue-600 group-hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
                  Acessar
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default Home;
