import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from '../components/Layout/Layout';
import Home from '../pages/Home';
import Clientes from '../pages/Clientes';
import DCTF from '../pages/DCTF';
import Relatorios from '../pages/Relatorios';
import ErrorPage from '../pages/ErrorPage';
import UploadDCTF from '../pages/UploadDCTF';
import UploadClientes from '../pages/UploadClientes';
import DCTFList from '../pages/DCTFList';
import DCTFDadosPage from '../pages/DCTFDadosPage';
import AdminDashboard from '../pages/AdminDashboard';
import Conferencias from '../pages/Conferencias';
import Administracao from '../pages/Administracao';

// Usa o base path do Vite (import.meta.env.BASE_URL)
// Para GitHub Pages: /DCTF/ -> basename: /DCTF
// Para desenvolvimento: / -> basename: undefined (usa /)
const basename = import.meta.env.BASE_URL !== '/' 
  ? import.meta.env.BASE_URL.replace(/\/$/, '') // Remove trailing slash
  : undefined;

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'dashboard',
        element: <AdminDashboard />,
      },
      {
        path: 'conferencias',
        element: <Conferencias />,
      },
      {
        path: 'clientes',
        element: <Clientes />,
      },
      {
        path: 'clientes/upload',
        element: <UploadClientes />,
      },
      {
        path: 'dctf',
        element: <DCTF />,
      },
      {
        path: 'dctf/list',
        element: <DCTFList />,
      },
      {
        path: 'dctf/:id/dados',
        element: <DCTFDadosPage />,
      },
      {
        path: 'relatorios',
        element: <Relatorios />,
      },
      {
        path: 'administracao',
        element: <Administracao />,
      },
      {
        path: 'upload',
        element: <UploadDCTF />,
      },
    ],
  },
], {
  basename,
});

export const AppRouter = () => <RouterProvider router={router} />;
