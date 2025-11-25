import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { ToastProvider } from '../../hooks/useToast';
import { ToastContainer } from '../UI/Toast';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleToggleSidebar = () => {
    console.log('Toggle sidebar clicked, current state:', sidebarOpen);
    setSidebarOpen(prev => {
      console.log('Setting sidebar to:', !prev);
      return !prev;
    });
  };

  const handleCloseSidebar = () => {
    console.log('Close sidebar clicked, current state:', sidebarOpen);
    setSidebarOpen(false);
    console.log('Sidebar state set to false');
  };
  
  // Debug: log state changes
  useEffect(() => {
    console.log('Sidebar state changed to:', sidebarOpen);
  }, [sidebarOpen]);

  // Detectar scroll para manter o botão visível
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fechar sidebar com tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        handleCloseSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-1 relative">
          {/* Botão para abrir/fechar menu (mobile) */}
          <button
            type="button"
            onClick={handleToggleSidebar}
            className="fixed top-16 left-4 z-[100] flex items-center justify-center w-11 h-11 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out lg:hidden cursor-pointer group hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border border-gray-200 hover:border-blue-500"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <XMarkIcon className="h-6 w-6 text-gray-700 group-hover:text-blue-600 transition-all duration-300 ease-in-out group-hover:rotate-90 group-hover:scale-110" />
            ) : (
              <Bars3Icon className="h-6 w-6 text-gray-700 group-hover:text-blue-600 transition-all duration-300 ease-in-out group-hover:scale-110" />
            )}
          </button>

          {/* Overlay para mobile quando menu está aberto */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-[90] transition-opacity duration-500 ease-in-out lg:hidden"
              onClick={handleCloseSidebar}
            />
          )}

          {/* Sidebar */}
          <div
            className="fixed lg:fixed z-[95] lg:z-30 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              left: sidebarOpen ? '0' : '-256px',
              width: '256px',
              top: '4rem', // 64px = altura do header
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              opacity: sidebarOpen ? 1 : 0,
              boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15), 2px 0 10px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              borderRadius: '0 20px 20px 0', // Quinas arredondadas estilo iOS/macOS (direita superior e inferior)
            }}
          >
            <div 
              className="bg-white w-64"
              style={{
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none', // IE and Edge
                maxHeight: 'calc(100vh - 4rem - 350px)', // Altura máxima respeitando header e footer
                overflowY: 'auto',
                borderRadius: '0 20px 20px 0', // Quinas arredondadas no conteúdo também
                overflow: 'hidden', // Garante que o conteúdo respeite as bordas arredondadas
              }}
            >
              <style>{`
                div::-webkit-scrollbar {
                  display: none; /* Chrome, Safari, Opera */
                }
              `}</style>
              <Sidebar onClose={handleCloseSidebar} />
            </div>
          </div>


          {/* Botão para abrir menu quando fechado (desktop) */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={handleToggleSidebar}
              className="hidden lg:flex fixed top-20 left-0 z-[100] items-center justify-center w-10 h-10 bg-white rounded-r-xl shadow-lg hover:shadow-xl cursor-pointer transition-all duration-300 ease-in-out group hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border-r-2 border-gray-200 hover:border-blue-500"
              style={{
                transform: isScrolled ? 'translateY(0)' : 'translateY(0)',
                opacity: 1,
              }}
              aria-label="Abrir menu"
              title="Abrir menu lateral"
            >
              <Bars3Icon className="h-5 w-5 text-gray-600 group-hover:text-blue-600 transition-all duration-300 ease-in-out group-hover:scale-110" />
            </button>
          )}

          <main className={`flex-1 bg-gray-50 p-6 overflow-x-hidden w-full max-w-full transition-all duration-300 ${
            sidebarOpen ? 'lg:ml-64' : 'lg:ml-0'
          }`}>
            <Outlet />
          </main>
        </div>
        <Footer />
        <ToastContainer />
      </div>
    </ToastProvider>
  );
};

export default Layout;
