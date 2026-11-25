import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const admin = {
  id: '1',
  name: 'Ana Admin',
  username: 'ana_admin',
  role: 'ADMINISTRADOR',
  accountType: 'STAFF',
  mustChangePin: false,
};

function setup() {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: admin })));
  render(
    <SessionProvider>
      <RouterProvider router={createTestRouter(['/terminal/administracion/configuracion'])} />
    </SessionProvider>,
  );
}

describe('administrative session settings', () => {
  test('shows resolved session data and reuses the shell logout', async () => {
    setup();
    const settings = await screen.findByRole('region', { name: 'Configuración de sesión' });
    expect(within(settings).getByText('Ana Admin')).toBeInTheDocument();
    expect(within(settings).getByText('ana_admin')).toBeInTheDocument();
    expect(within(settings).getByText('Administrador')).toBeInTheDocument();
    expect(within(settings).getByText('Personal')).toBeInTheDocument();
    expect(within(settings).getByText('Navegador')).toBeInTheDocument();
    expect(within(settings).getByText('/api/v1')).toBeInTheDocument();
    expect(within(settings).queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });
});
