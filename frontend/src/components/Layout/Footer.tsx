import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 text-white py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">DCTF ANALYZER</h3>
            <p className="text-gray-300">
              Sistema de análise e processamento de dados DCTF com interface web moderna.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Links Úteis</h3>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Documentação
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Suporte
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Contato
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Contato</h3>
            <p className="text-gray-300">
              Email: suporte@dctfmpc.com
            </p>
            <p className="text-gray-300">
              Telefone: (11) 99999-9999
            </p>
          </div>
        </div>
        <div className="border-t border-gray-700 mt-8 pt-8 text-center">
          <p className="text-gray-300">
            © 2024 DCTF ANALYZER. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

