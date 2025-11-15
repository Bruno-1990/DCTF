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
import Pagamentos from '../pages/Pagamentos';

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
        path: 'pagamentos',
        element: <Pagamentos />,
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
]);

export const AppRouter = () => <RouterProvider router={router} />;
