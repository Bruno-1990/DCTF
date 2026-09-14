import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import Layout from '../components/Layout/Layout';
import Home from '../pages/Home';
import Clientes from '../pages/Clientes';
import ClientesCNAE from '../pages/ClientesCNAE';
import DCTF from '../pages/DCTF';
import ErrorPage from '../pages/ErrorPage';
import UploadDCTF from '../pages/UploadDCTF';
import DCTFList from '../pages/DCTFList';
import DCTFDadosPage from '../pages/DCTFDadosPage';
import Conferencias from '../pages/Conferencias';
import Administracao from '../pages/Administracao';
import SituacaoFiscal from '../pages/SituacaoFiscal';
import GeradorSQL from '../pages/GeradorSQL';
import SpedValidacao from '../pages/SpedValidacao';
import Irpf2025 from '../pages/Irpf2025';
import Beneficios from '../pages/Beneficios';
import Legalizacao from '../pages/Legalizacao';
import Trabalhista from '../pages/Trabalhista';
import Fiscal from '../pages/Fiscal';

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
          { path: 'conferencias', element: <Conferencias /> },
          { path: 'clientes', element: <Clientes /> },
          { path: 'clientes/cnae', element: <ClientesCNAE /> },
          { path: 'dctf', element: <DCTF /> },
          { path: 'dctf/list', element: <DCTFList /> },
          { path: 'dctf/:id/dados', element: <DCTFDadosPage /> },
          { path: 'situacao-fiscal', element: <SituacaoFiscal /> },
          { path: 'administracao', element: <Administracao /> },
          { path: 'upload', element: <UploadDCTF /> },
          { path: 'sci/gerador-sql', element: <GeradorSQL /> },
          { path: 'sped', element: <SpedValidacao /> },
          { path: 'beneficios', element: <Beneficios /> },
          { path: 'legalizacao', element: <Legalizacao /> },
          { path: 'trabalhista', element: <Trabalhista /> },
          { path: 'fiscal', element: <Fiscal /> },
          { path: 'irpf-2026', element: <Irpf2025 /> },
          // Rotas removidas (/sci/banco-horas, /relatorios) e qualquer URL desconhecida sob a casca
          // caem aqui. Sem isto o <Outlet /> nao renderiza nada e o usuario ve
          // header, menu e rodape com o miolo em branco, parecendo sistema quebrado.
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export const AppRouter = () => <RouterProvider router={router} />;
