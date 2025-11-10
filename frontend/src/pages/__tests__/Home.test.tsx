import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Home from '../Home';

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Home', () => {
  it('renders welcome message', () => {
    renderWithRouter(<Home />);
    expect(screen.getByText('Bem-vindo ao DCTF MPC')).toBeInTheDocument();
  });

  it('renders navigation cards', () => {
    renderWithRouter(<Home />);
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('DCTF')).toBeInTheDocument();
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
  });

  it('has working navigation links', () => {
    renderWithRouter(<Home />);
    
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/clientes');
    expect(links[1]).toHaveAttribute('href', '/dctf');
    expect(links[2]).toHaveAttribute('href', '/relatorios');
  });
});
