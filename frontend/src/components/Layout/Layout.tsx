import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { ToastProvider } from '../../hooks/useToast';
import { ToastContainer } from '../UI/Toast';

const Layout: React.FC = () => {
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 bg-gray-50 p-6 overflow-x-hidden w-full max-w-full">
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
