import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { ToastProvider } from '../../hooks/useToast';
import { ToastContainer } from '../UI/Toast';
import { Bars3Icon, XMarkIcon, LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline';

const Layout: React.FC = () => {
  // Carregar preferência de pin do localStorage
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    const saved = localStorage.getItem('sidebar-pinned');
    return saved === 'true';
  });
  
  // Carregar preferência de locked closed do localStorage
  const [sidebarLockedClosed, setSidebarLockedClosed] = useState(() => {
    const saved = localStorage.getItem('sidebar-locked-closed');
    return saved === 'true';
  });
  
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Se estiver fixado, sempre começar aberto
    // Se estiver trancado fechado, sempre começar fechado
    const pinned = localStorage.getItem('sidebar-pinned') === 'true';
    const lockedClosed = localStorage.getItem('sidebar-locked-closed') === 'true';
    if (pinned) return true;
    if (lockedClosed) return false;
    return true; // Por padrão começa aberto
  });
  const [isScrolled, setIsScrolled] = useState(false);

  const handleToggleSidebar = () => {
    // Não permitir toggle se estiver trancado fechado ou fixado aberto
    if (sidebarLockedClosed || sidebarPinned) {
      return;
    }
    console.log('Toggle sidebar clicked, current state:', sidebarOpen);
    setSidebarOpen(prev => {
      const newState = !prev;
      console.log('Setting sidebar to:', newState);
      localStorage.setItem('sidebar-open', newState ? 'true' : 'false');
      return newState;
    });
  };

  const handleTogglePin = () => {
    const newPinnedState = !sidebarPinned;
    setSidebarPinned(newPinnedState);
    localStorage.setItem('sidebar-pinned', newPinnedState ? 'true' : 'false');
    
    // Se fixar, garantir que está aberto e desbloquear fechado
    if (newPinnedState) {
      setSidebarOpen(true);
      setSidebarLockedClosed(false);
      localStorage.setItem('sidebar-locked-closed', 'false');
    }
  };

  const handleToggleLockClosed = () => {
    const newLockedState = !sidebarLockedClosed;
    setSidebarLockedClosed(newLockedState);
    localStorage.setItem('sidebar-locked-closed', newLockedState ? 'true' : 'false');
    
    // Se trancar fechado, garantir que está fechado e desfixar aberto
    if (newLockedState) {
      setSidebarOpen(false);
      setSidebarPinned(false);
      localStorage.setItem('sidebar-pinned', 'false');
    }
  };

  const handleCloseSidebar = () => {
    // Não fechar se estiver fixado
    if (sidebarPinned) {
      return;
    }
    // Não fechar se já estiver trancado fechado (já está fechado)
    if (sidebarLockedClosed) {
      return;
    }
    console.log('Close sidebar clicked, current state:', sidebarOpen);
    setSidebarOpen(false);
    console.log('Sidebar state set to false');
  };
  
  // Debug: log state changes
  useEffect(() => {
    console.log('Sidebar state changed to:', sidebarOpen);
  }, [sidebarOpen]);

  // Garantir que menu fique aberto quando fixado ou fechado quando trancado
  useEffect(() => {
    if (sidebarPinned && !sidebarOpen) {
      setSidebarOpen(true);
    }
    if (sidebarLockedClosed && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [sidebarPinned, sidebarLockedClosed]);

  // Detectar scroll para manter o botão visível
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fechar sidebar com tecla ESC (só se não estiver fixado ou trancado)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen && !sidebarPinned && !sidebarLockedClosed) {
        handleCloseSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen, sidebarPinned, sidebarLockedClosed]);

  // Esconder menu lateral quando o botão "voltar ao topo" aparecer
  // Só funciona se o menu não estiver fixado ou trancado (comportamento dinâmico)
  useEffect(() => {
    const handleShowScrollToTop = () => {
      // Verificar se estamos na página de Clientes (onde está a aba Participação) ou IRPF
      // E se o menu não estiver fixado ou trancado (comportamento dinâmico apenas quando livre)
      if (!sidebarPinned && !sidebarLockedClosed && (window.location.pathname === '/clientes' || window.location.pathname === '/irpf-2026')) {
        setSidebarOpen(false);
      }
    };

    const handleHideScrollToTop = () => {
      // Verificar se estamos na página de Clientes ou IRPF
      // E se o menu não estiver fixado ou trancado (comportamento dinâmico apenas quando livre)
      if (!sidebarPinned && !sidebarLockedClosed && (window.location.pathname === '/clientes' || window.location.pathname === '/irpf-2026')) {
        // Reabrir o menu lateral quando o scroll voltar ao topo
        setSidebarOpen(true);
      }
    };

    window.addEventListener('showScrollToTopButton', handleShowScrollToTop);
    window.addEventListener('hideScrollToTopButton', handleHideScrollToTop);
    
    return () => {
      window.removeEventListener('showScrollToTopButton', handleShowScrollToTop);
      window.removeEventListener('hideScrollToTopButton', handleHideScrollToTop);
    };
  }, [sidebarPinned, sidebarLockedClosed]);

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
            className="fixed lg:fixed z-[95] lg:z-30"
            style={{
              left: (sidebarOpen || sidebarPinned) ? '0' : '-256px',
              width: '256px',
              top: '4rem', // 64px = altura do header
              transform: (sidebarOpen || sidebarPinned) ? 'translateX(0)' : 'translateX(-100%)',
              opacity: (sidebarOpen || sidebarPinned) ? 1 : 0,
              boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15), 2px 0 10px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              borderRadius: '0 20px 20px 0', // Quinas arredondadas estilo iOS/macOS (direita superior e inferior)
              transition: sidebarPinned ? 'none' : 'transform 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              willChange: sidebarPinned ? 'auto' : 'transform, opacity',
            }}
          >
            <div 
              className="bg-white w-64"
              style={{
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none', // IE and Edge
                maxHeight: 'calc(100vh - 4rem)', // Altura máxima respeitando apenas o header
                overflowY: 'auto',
                borderRadius: '0 20px 20px 0', // Quinas arredondadas no conteúdo também
              }}
            >
              <style>{`
                div::-webkit-scrollbar {
                  display: none; /* Chrome, Safari, Opera */
                }
              `}</style>
              <Sidebar 
                onClose={handleCloseSidebar} 
                pinned={sidebarPinned}
                onTogglePin={handleTogglePin}
                lockedClosed={sidebarLockedClosed}
              />
            </div>
          </div>


          {/* Botão para abrir menu quando fechado (desktop) - só aparece se não estiver fixado ou trancado */}
          {!sidebarOpen && !sidebarPinned && (
            <div className="hidden lg:flex fixed top-20 left-0 z-[100] items-center gap-1">
              <button
                type="button"
                onClick={handleToggleSidebar}
                disabled={sidebarLockedClosed}
                className={`flex items-center justify-center w-10 h-10 bg-white rounded-r-xl shadow-lg hover:shadow-xl cursor-pointer transition-all duration-300 ease-in-out group border-r-2 ${
                  sidebarLockedClosed
                    ? 'opacity-50 cursor-not-allowed border-gray-200'
                    : 'hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border-gray-200 hover:border-blue-500'
                }`}
                style={{
                  transform: isScrolled ? 'translateY(0)' : 'translateY(0)',
                  opacity: 1,
                }}
                aria-label="Abrir menu"
                title={sidebarLockedClosed ? 'Menu trancado fechado - clique no cadeado para destrancar' : 'Abrir menu lateral'}
              >
                <Bars3Icon className={`h-5 w-5 transition-all duration-300 ease-in-out group-hover:scale-110 ${
                  sidebarLockedClosed ? 'text-gray-400' : 'text-gray-600 group-hover:text-blue-600'
                }`} />
              </button>
              {/* Botão de cadeado para trancar fechado */}
              <button
                type="button"
                onClick={handleToggleLockClosed}
                className={`flex items-center justify-center w-10 h-10 bg-white rounded-r-xl shadow-lg hover:shadow-xl cursor-pointer transition-all duration-300 ease-in-out group border-r-2 ${
                  sidebarLockedClosed
                    ? 'bg-red-50 border-red-300 hover:bg-red-100'
                    : 'border-gray-200 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:border-gray-300'
                }`}
                aria-label={sidebarLockedClosed ? 'Destrancar menu' : 'Trancar menu fechado'}
                title={sidebarLockedClosed ? 'Destrancar menu (permitir abrir)' : 'Trancar menu fechado (manter sempre fechado)'}
              >
                {sidebarLockedClosed ? (
                  <LockClosedIcon className="h-5 w-5 text-red-600 group-hover:text-red-700 transition-all duration-300 ease-in-out" />
                ) : (
                  <LockOpenIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-700 transition-all duration-300 ease-in-out" />
                )}
              </button>
            </div>
          )}

          <main className={`flex-1 bg-gray-50 p-6 overflow-x-hidden w-full max-w-full transition-all duration-600 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            (sidebarOpen || sidebarPinned) ? 'lg:ml-64' : 'lg:ml-0'
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
