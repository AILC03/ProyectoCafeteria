import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { createTestRouter } from './app/router';

function renderRoute(path: string) {
  return render(<RouterProvider router={createTestRouter([path])} />);
}

describe('application routes', () => {
  test.each([
    ['/', 'Aplicación unificada de cafetería'],
    ['/cliente/iniciar-sesion', 'Iniciar sesión'],
    ['/cliente', 'Menú'],
    ['/cliente/menu', 'Menú'],
    ['/cliente/cuenta', 'Cuenta'],
    ['/terminal', 'Terminal'],
    ['/terminal/pos', 'Punto de venta'],
    ['/terminal/cocina', 'Cocina'],
    ['/terminal/caja', 'Caja'],
    ['/terminal/administracion/catalogo', 'Administración'],
  ])('renders %s', async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  test('keeps client and terminal layouts separate', async () => {
    const { unmount } = renderRoute('/cliente/menu');
    expect(await screen.findByRole('navigation', { name: 'Navegación de cliente' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navegación de terminal' })).not.toBeInTheDocument();
    unmount();
    renderRoute('/terminal/pos');
    expect(await screen.findByRole('navigation', { name: 'Navegación de terminal' })).toBeInTheDocument();
  });

  test('renders a safe fallback for unknown routes', async () => {
    renderRoute('/desconocida');
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  test.each(['/cliente/desconocida', '/terminal/desconocida'])('renders a scoped safe fallback for %s', async (path) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  test('provides a keyboard-accessible skip link and visible focus styles', async () => {
    renderRoute('/cliente/menu');
    const skipLink = await screen.findByRole('link', { name: 'Saltar al contenido principal' });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(document.querySelector('main')).toHaveAttribute('tabindex', '-1');
  });
});
