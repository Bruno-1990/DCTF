import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from '../components/Layout/Layout';
import Home from '../pages/Home';
import Clientes from '../pages/Clientes';
import DCTF from '../pages/DCTF';
import Relatorios from '../pages/Relatorios';
import ErrorPage from '../pages/ErrorPage';
import UploadDCTF from '../pages/UploadDCTF';
import DCTFList from '../pages/DCTFList';
import DCTFDadosPage from '../pages/DCTFDadosPage';

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
        path: 'clientes',
        element: <Clientes />,
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
        path: 'upload',
        element: <UploadDCTF />,
      },
    ],
  },
]);

export const AppRouter = () => <RouterProvider router={router} />;


