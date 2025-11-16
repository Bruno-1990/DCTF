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
    color: 'blue',
  },
  {
    title: "Conferências",
    description: "Acompanhe pendências de prazos legais e priorize as declarações com maior risco de autuação.",
    href: "/conferencias",
    icon: ClipboardDocumentCheckIcon,
    color: 'purple',
  },
  {
    title: "DCTF",
    description: "Processe e analise declarações de DCTF dos clientes.",
    href: "/dctf",
    icon: DocumentTextIcon,
    color: 'green',
  },
  {
    title: "Clientes",
    description: "Gerencie os dados dos clientes e suas informações fiscais.",
    href: "/clientes",
    icon: UsersIcon,
    color: 'indigo',
  },
  {
    title: "Pagamentos",
    description: "Consulte e gerencie informações de pagamentos da Receita Federal.",
    href: "/pagamentos",
    icon: CreditCardIcon,
    color: 'emerald',
  },
  {
    title: "Relatórios",
    description: "Gere relatórios detalhados e análises fiscais em diferentes formatos.",
    href: "/relatorios",
    icon: ChartBarIcon,
    color: 'blue',
  },
  {
    title: "Situação Fiscal",
    description: "Consulte a situação fiscal dos clientes através da Receita Federal.",
    href: "/situacao-fiscal",
    icon: DocumentMagnifyingGlassIcon,
    color: 'orange',
  },
  {
    title: "Administração",
    description: "Configure e gerencie as opções administrativas do sistema.",
    href: "/administracao",
    icon: Cog6ToothIcon,
    color: 'gray',
  },
];

const colorClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
  purple: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
  green: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
  orange: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
  gray: 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100',
};

const Home: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Bem-vindo ao DCTF ANALYZER</h1>
        <p className="text-xl text-gray-600">
          Sistema de análise e processamento de dados DCTF com interface web moderna
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const colorClass = colorClasses[card.color as keyof typeof colorClasses];
          return (
            <Link
              key={card.href}
              to={card.href}
              className={`bg-white border-2 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col ${colorClass}`}
            >
              <div className="p-5 flex flex-col flex-grow">
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 rounded-lg bg-white/80 ${colorClass.split(' ')[0]}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{card.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
                  </div>
                </div>
                <div className="mt-auto w-full px-4 py-2.5 bg-white border-2 border-current rounded-lg font-medium hover:bg-white/90 transition-colors flex items-center justify-center gap-2">
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
