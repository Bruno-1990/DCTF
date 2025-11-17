import React from 'react';
import { 
  DocumentTextIcon, 
  BookOpenIcon, 
  LifebuoyIcon, 
  EnvelopeIcon, 
  PhoneIcon,
  ArrowRightIcon 
} from '@heroicons/react/24/outline';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white border-t border-gray-700/50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Logo e Descrição */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-blue-600/20 backdrop-blur-sm p-2 rounded-lg">
                <DocumentTextIcon className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                DCTF ANALYZER
              </h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Sistema de análise e processamento de dados DCTF com interface web moderna e intuitiva.
            </p>
          </div>

          {/* Links Úteis */}
          <div>
            <h3 className="text-base font-semibold mb-4 text-white">Links Úteis</h3>
            <ul className="space-y-2.5">
              <li>
                <a 
                  href="#" 
                  className="flex items-center gap-2 text-gray-400 hover:text-blue-400 text-sm transition-colors duration-200 group"
                >
                  <BookOpenIcon className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  <span>Documentação</span>
                  <ArrowRightIcon className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="flex items-center gap-2 text-gray-400 hover:text-blue-400 text-sm transition-colors duration-200 group"
                >
                  <LifebuoyIcon className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  <span>Suporte</span>
                  <ArrowRightIcon className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="flex items-center gap-2 text-gray-400 hover:text-blue-400 text-sm transition-colors duration-200 group"
                >
                  <EnvelopeIcon className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  <span>Contato</span>
                  <ArrowRightIcon className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-base font-semibold mb-4 text-white">Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-gray-400 text-sm">
                <div className="bg-gray-700/50 p-1.5 rounded-lg">
                  <EnvelopeIcon className="h-4 w-4 text-blue-400" />
                </div>
                <a 
                  href="mailto:bruno@central-rnc.com.br" 
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  bruno@central-rnc.com.br
                </a>
              </li>
              <li className="flex items-center gap-3 text-gray-400 text-sm">
                <div className="bg-gray-700/50 p-1.5 rounded-lg">
                  <PhoneIcon className="h-4 w-4 text-blue-400" />
                </div>
                <a 
                  href="tel:+552721048322" 
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  (27) 2104-8322
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-700/50 pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-400 text-sm text-center md:text-left">
              © {new Date().getFullYear()} <span className="text-blue-400 font-medium">DCTF ANALYZER</span>. Todos os direitos reservados.
            </p>
            <p className="text-gray-500 text-xs text-center md:text-right">
              Desenvolvido para facilitar sua gestão fiscal
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

