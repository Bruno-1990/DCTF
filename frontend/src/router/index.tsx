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
import SituacaoFiscal from '../pages/SituacaoFiscal';
import BancoHoras from '../pages/BancoHoras';
import GeradorSQL from '../pages/GeradorSQL';
import SpedValidacao from '../pages/SpedValidacao';

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
        path: 'situacao-fiscal',
        element: <SituacaoFiscal />,
      },
      {
        path: 'administracao',
        element: <Administracao />,
      },
      {
        path: 'upload',
        element: <UploadDCTF />,
      },
      {
        path: 'sci/banco-horas',
        element: <BancoHoras />,
      },
      {
        path: 'sci/gerador-sql',
        element: <GeradorSQL />,
      },
      {
        path: 'sped',
        element: <SpedValidacao />,
      },
    ],
  },
]);

export const AppRouter = () => <RouterProvider router={router} />;
