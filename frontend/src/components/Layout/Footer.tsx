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
    <footer className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white border-t border-blue-800/30 overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px'
        }}></div>
      </div>
      
      <div className="relative container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Logo e Descrição */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-gradient-to-br from-blue-500/30 to-indigo-500/30 backdrop-blur-sm p-2.5 rounded-xl border border-blue-400/20 shadow-lg shadow-blue-500/10">
                <DocumentTextIcon className="h-5 w-5 text-blue-300" />
              </div>
              <h3 className="text-base font-bold bg-gradient-to-r from-blue-300 via-blue-200 to-indigo-300 bg-clip-text text-transparent">
                DCTF ANALYZER
              </h3>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed max-w-sm">
              Sistema de análise e processamento de dados DCTF com interface web moderna e intuitiva.
            </p>
          </div>

          {/* Links Úteis */}
          <div>
            <h3 className="text-base font-semibold mb-4 text-white flex items-center gap-2">
              <span className="h-0.5 w-8 bg-gradient-to-r from-blue-400 to-transparent"></span>
              Links Úteis
            </h3>
            <ul className="space-y-3">
              <li>
                <a 
                  href="#" 
                  className="flex items-center gap-3 text-gray-300 hover:text-blue-300 text-sm transition-all duration-300 group py-1.5"
                >
                  <div className="bg-blue-500/10 group-hover:bg-blue-500/20 p-1.5 rounded-lg transition-all duration-300 group-hover:scale-110">
                    <BookOpenIcon className="h-4 w-4 group-hover:text-blue-300 transition-colors" />
                  </div>
                  <span className="flex-1 group-hover:translate-x-1 transition-transform">Documentação</span>
                  <ArrowRightIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="flex items-center gap-3 text-gray-300 hover:text-blue-300 text-sm transition-all duration-300 group py-1.5"
                >
                  <div className="bg-blue-500/10 group-hover:bg-blue-500/20 p-1.5 rounded-lg transition-all duration-300 group-hover:scale-110">
                    <LifebuoyIcon className="h-4 w-4 group-hover:text-blue-300 transition-colors" />
                  </div>
                  <span className="flex-1 group-hover:translate-x-1 transition-transform">Suporte</span>
                  <ArrowRightIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="flex items-center gap-3 text-gray-300 hover:text-blue-300 text-sm transition-all duration-300 group py-1.5"
                >
                  <div className="bg-blue-500/10 group-hover:bg-blue-500/20 p-1.5 rounded-lg transition-all duration-300 group-hover:scale-110">
                    <EnvelopeIcon className="h-4 w-4 group-hover:text-blue-300 transition-colors" />
                  </div>
                  <span className="flex-1 group-hover:translate-x-1 transition-transform">Contato</span>
                  <ArrowRightIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </a>
              </li>
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-base font-semibold mb-4 text-white flex items-center gap-2">
              <span className="h-0.5 w-8 bg-gradient-to-r from-blue-400 to-transparent"></span>
              Contato
            </h3>
            <ul className="space-y-3">
              <li>
                <a 
                  href="mailto:bruno@central-rnc.com.br" 
                  className="flex items-center gap-3 text-gray-300 hover:text-blue-300 text-sm transition-all duration-300 group py-1.5"
                >
                  <div className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-400/30 p-2 rounded-lg group-hover:border-blue-400/50 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all duration-300">
                    <EnvelopeIcon className="h-4 w-4 text-blue-300" />
                  </div>
                  <span className="flex-1 group-hover:translate-x-1 transition-transform">bruno@central-rnc.com.br</span>
                </a>
              </li>
              <li>
                <a 
                  href="tel:+552721048322" 
                  className="flex items-center gap-3 text-gray-300 hover:text-blue-300 text-sm transition-all duration-300 group py-1.5"
                >
                  <div className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-400/30 p-2 rounded-lg group-hover:border-blue-400/50 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all duration-300">
                    <PhoneIcon className="h-4 w-4 text-blue-300" />
                  </div>
                  <span className="flex-1 group-hover:translate-x-1 transition-transform">(27) 2104-8322</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-blue-800/30 pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-400 text-sm text-center md:text-left">
              © {new Date().getFullYear()} <span className="text-blue-300 font-semibold">DCTF ANALYZER</span>. Todos os direitos reservados.
            </p>
            <p className="text-gray-400 text-sm text-center md:text-right">
              Desenvolvido para facilitar sua gestão fiscal
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

