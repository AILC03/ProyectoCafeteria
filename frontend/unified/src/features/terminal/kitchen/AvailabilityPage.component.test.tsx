import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken, setCsrfToken } from '../../../shared/api/client';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const cajero = { id: '2', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const catalogProduct = {
  id: '10', categoryId: '1', name: 'Latte', description: null,
  basePriceCents: '6500', imageUrl: null, isAvailable: true,
};
const adminProduct = {
  ...catalogProduct,
  imagePublicId: null, imageVersion: null, deletedAt: null,
  createdAt: '2099-01-01T12:00:00.000Z', updatedAt: '2099-01-01T12:00:00.000Z',
};

function renderAvailability(actor = cajero) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })));
  render(<SessionProvider><RouterProvider router={createTestRouter(['/terminal/disponibilidad'])} /></SessionProvider>);
}

beforeEach(() => { setCsrfToken('csrf-test'); });
afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
  localStorage.clear();
});

describe('Terminal availability (TASK-18)', () => {
  test('changes availability only after a verified API response, without persistence', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get('/api/v1/products', () => HttpResponse.json({ data: [catalogProduct], page: { limit: 100, nextCursor: null } })),
      http.patch('/api/v1/products/10/availability', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { ...adminProduct, isAvailable: false } });
      }),
    );
    renderAvailability();
    fireEvent.click(await screen.findByRole('button', { name: 'Agotar Latte' }));
    expect(await screen.findByRole('status')).toHaveTextContent('agotado');
    expect(bodies).toEqual([{ isAvailable: false }]);
    expect(screen.getByRole('button', { name: 'Habilitar Latte' })).toBeEnabled();
    expect(localStorage.length).toBe(0);
  });

  test('keeps local state untouched when the response cannot be verified', async () => {
    server.use(
      http.get('/api/v1/products', () => HttpResponse.json({ data: [catalogProduct], page: { limit: 100, nextCursor: null } })),
      http.patch('/api/v1/products/10/availability', () => HttpResponse.json({ data: { ...adminProduct, isAvailable: false, surprise: true } })),
    );
    renderAvailability();
    fireEvent.click(await screen.findByRole('button', { name: 'Agotar Latte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede verificar/i);
    expect(screen.getByRole('button', { name: 'Agotar Latte' })).toBeEnabled();
  });

  test('reports a denied mutation without claiming success', async () => {
    server.use(
      http.get('/api/v1/products', () => HttpResponse.json({ data: [catalogProduct], page: { limit: 100, nextCursor: null } })),
      http.patch('/api/v1/products/10/availability', () => HttpResponse.json({ status: 403, code: 'FORBIDDEN', title: 'Denegado' }, { status: 403 })),
    );
    renderAvailability();
    fireEvent.click(await screen.findByRole('button', { name: 'Agotar Latte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sólo caja y administración/i);
    expect(screen.getByRole('button', { name: 'Agotar Latte' })).toBeEnabled();
  });
});
