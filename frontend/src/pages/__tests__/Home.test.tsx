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
    expect(screen.getByText('Bem-vindo ao DCTF ANALYZER')).toBeInTheDocument();
  });

  it('renders navigation cards', () => {
    renderWithRouter(<Home />);
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('DCTF')).toBeInTheDocument();
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
  });

  it('has working navigation links', () => {
    renderWithRouter(<Home />);
    
    const accessLinks = screen.getAllByRole('link', { name: /Acessar/i });
    expect(accessLinks).toHaveLength(5);
    const hrefs = accessLinks.map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/dashboard', '/conferencias', '/clientes', '/dctf', '/relatorios']);
  });
});
