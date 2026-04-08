import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import Layout from '../components/Layout/Layout';
import Home from '../pages/Home';
import Clientes from '../pages/Clientes';
import ClientesCNAE from '../pages/ClientesCNAE';
import DCTF from '../pages/DCTF';
import Relatorios from '../pages/Relatorios';
import ErrorPage from '../pages/ErrorPage';
import UploadDCTF from '../pages/UploadDCTF';
import DCTFList from '../pages/DCTFList';
import DCTFDadosPage from '../pages/DCTFDadosPage';
import AdminDashboard from '../pages/AdminDashboard';
import Conferencias from '../pages/Conferencias';
import Administracao from '../pages/Administracao';
import SituacaoFiscal from '../pages/SituacaoFiscal';
import BancoHoras from '../pages/BancoHoras';
import GeradorSQL from '../pages/GeradorSQL';
import SpedValidacao from '../pages/SpedValidacao';
import Irpf2025 from '../pages/Irpf2025';
import Irpf2026ProtectedAdmin from '../pages/Irpf2026/Irpf2026ProtectedAdmin';
import Irpf2026AdminLayout from '../pages/Irpf2026/Irpf2026AdminLayout';
import Irpf2026VisaoGeral from '../pages/Irpf2026/Irpf2026VisaoGeral';
import Irpf2026LoginPage from '../pages/Irpf2026/Irpf2026LoginPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: '*',
        element: <Layout />,
        children: [
          { index: true, element: <Home /> },
          { path: 'admin', element: <Navigate to="/irpf-2026/admin" replace /> },
          { path: 'dashboard', element: <AdminDashboard /> },
          { path: 'conferencias', element: <Conferencias /> },
          { path: 'clientes', element: <Clientes /> },
          { path: 'clientes/cnae', element: <ClientesCNAE /> },
          { path: 'dctf', element: <DCTF /> },
          { path: 'dctf/list', element: <DCTFList /> },
          { path: 'dctf/:id/dados', element: <DCTFDadosPage /> },
          { path: 'relatorios', element: <Relatorios /> },
          { path: 'situacao-fiscal', element: <SituacaoFiscal /> },
          { path: 'administracao', element: <Administracao /> },
          { path: 'upload', element: <UploadDCTF /> },
          { path: 'sci/banco-horas', element: <BancoHoras /> },
          { path: 'sci/gerador-sql', element: <GeradorSQL /> },
          { path: 'sped', element: <SpedValidacao /> },
          {
            path: 'irpf-2026',
            element: <Outlet />,
            children: [
              { index: true, element: <Irpf2025 /> },
              { path: 'cliente/login', element: <Irpf2026LoginPage /> },
              {
                path: 'admin',
                element: <Irpf2026ProtectedAdmin />,
                children: [
                  {
                    element: <Irpf2026AdminLayout />,
                    children: [{ index: true, element: <Irpf2026VisaoGeral /> }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

export const AppRouter = () => <RouterProvider router={router} />;
