import { fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { idempotencyOperations } from '../../../shared/api/idempotency';
import { server } from '../../../test/server';

const actor = { id: '42', name: 'Ana', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
const profile = { customerNumber: 'C000105', name: 'Ana', phone: '+526641234567', recoveryEmail: null, recoveryEmailVerifiedAt: null, createdAt: '2026-11-09T12:00:00.000Z' };
const favorite = { productId: '9', categoryId: '1', name: 'Agua', description: null, basePriceCents: '2000', imageUrl: null, isAvailable: true, favoritedAt: '2026-11-09T12:00:00.000Z' };
const order = { id: '12', folio: 'A000012', status: 'LISTO', paymentMethod: 'CASH', totalCents: '2000', createdAt: '2026-11-09T12:00:00.000Z', paymentExpiresAt: '2026-11-09T12:10:00.000Z', paidAt: '2026-11-09T12:01:00.000Z', readyAt: null };
const preview = { sourceOrderId: '12', canCreateOrder: true, totalCents: '2000', items: [{ productId: '9', productName: 'Agua', quantity: 1, optionValueIds: [], currentUnitPriceCents: '2000', currentLineTotalCents: '2000' }], warnings: [{ line: 1, code: 'PRICE_CHANGED', blocking: false, optionValueId: null }] };
function mockAccount() {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })),
    http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'csrf-account' } })),
    http.get('/api/v1/customers/me', () => HttpResponse.json({ data: profile })),
    http.get('/api/v1/customers/me/favorites', () => HttpResponse.json({ data: [favorite], page: { limit: 20, nextCursor: null } })),
    http.get('/api/v1/customers/me/orders', () => HttpResponse.json({ data: [order], page: { limit: 20, nextCursor: null } })),
    http.get('/api/v1/orders/12', () => HttpResponse.json({ data: { ...order, source: 'MOBILE', items: [{ productName: 'Agua', quantity: 1, unitPriceCents: '2000', lineTotalCents: '2000' }] } })),
    http.post('/api/v1/customers/me/orders/12/repeat-preview', () => HttpResponse.json({ data: preview })),
  );
}
function mount() { return render(<SessionProvider><RouterProvider router={createTestRouter(['/cliente/cuenta'])} /></SessionProvider>); }
afterEach(() => { idempotencyOperations.clear(); });

describe('customer account', () => {
  test('guest and staff cannot request private account endpoints', async () => {
    let calls = 0;
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })), http.get('/api/v1/customers/me', () => { calls++; return HttpResponse.json({ data: profile }); }));
    const ui = mount();
    await screen.findByText(/requiere una sesión de cliente/);
    expect(calls).toBe(0);
    ui.unmount();
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: { ...actor, role: 'CAJERO', accountType: 'STAFF' } })));
    mount();
    await screen.findByText(/sesión de personal activa/);
    expect(calls).toBe(0);
  });

  test('favorite deletion is optimistic and rolls back on failure; cursor remains opaque', async () => {
    mockAccount();
    server.use(http.delete('/api/v1/customers/me/favorites/9', () => HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Agua' }));
    expect(await screen.findByText(/No fue posible completar la solicitud/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar Agua' })).toBeInTheDocument();
  });

  test('preview shows warnings and confirms a new pending order only on explicit click, with no retry on uncertain response', async () => {
    mockAccount();
    let posts = 0;
    const keys: string[] = [];
    server.use(http.post('/api/v1/orders', ({ request }) => {
      posts++; keys.push(request.headers.get('Idempotency-Key') ?? '');
      return posts === 1 ? HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 })
        : HttpResponse.json({ data: { id: '13', folio: 'A000013', source: 'MOBILE', status: 'PENDIENTE_PAGO', paymentMethod: 'CASH', paidAt: null, totalCents: '2000', paymentExpiresAt: '2026-11-09T12:10:00.000Z' } }, { status: 201 });
    }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver orden A000012' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar repetición' }));
    expect(await screen.findByText(/PRICE_CHANGED/)).toBeInTheDocument();
    expect(posts).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear nueva orden pendiente' }));
    expect(await screen.findByText(/No sabemos si se creó/)).toBeInTheDocument();
    expect(posts).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar la misma orden' }));
    await screen.findByText(/Nueva orden A000013 creada/);
    expect(posts).toBe(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test('blocking preview cannot create an order; foreign detail returns 404 without disclosure', async () => {
    mockAccount();
    server.use(http.post('/api/v1/customers/me/orders/12/repeat-preview', () => HttpResponse.json({ data: { ...preview, canCreateOrder: false, totalCents: null, warnings: [{ line: 1, code: 'PRODUCT_UNAVAILABLE', blocking: true, optionValueId: null }] } })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver orden A000012' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar repetición' }));
    expect(await screen.findByText(/PRODUCT_UNAVAILABLE/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar y crear nueva orden pendiente' })).not.toBeInTheDocument();
  });

  test('name-only PATCH excludes currentPin and phone', async () => {
    mockAccount();
    let body: unknown;
    server.use(http.patch('/api/v1/customers/me', async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: { id: '42', customerNumber: profile.customerNumber, name: 'Nueva', phone: profile.phone } }); }));
    mount();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre' }), { target: { value: 'Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
    await screen.findByText('Perfil actualizado.');
    expect(body).toEqual({ name: 'Nueva' });
  });

  test('phone change requires PIN, sends only contract fields, and removes private account content after revocation', async () => {
    mockAccount();
    let body: unknown;
    let revoked = false;
    server.use(
      http.get('/api/v1/auth/me', () => revoked ? HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }) : HttpResponse.json({ data: actor })),
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.patch('/api/v1/customers/me', async ({ request }) => {
        body = await request.json(); revoked = true;
        return HttpResponse.json({ data: { id: '42', customerNumber: profile.customerNumber, name: profile.name, phone: '+525512345678' } });
      }),
    );
    mount();
    fireEvent.change(await screen.findByRole('textbox', { name: /Teléfono/ }), { target: { value: '+525512345678' } });
    expect(screen.getByText(/revoca la sesión/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('NIP actual'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
    await screen.findByText(/requiere una sesión de cliente autorizada/);
    expect(body).toEqual({ phone: '+525512345678', currentPin: '1234' });
    expect(screen.queryByText('C000105')).not.toBeInTheDocument();
  });

  test('follows opaque cursors for favorites and history, never converts large IDs', async () => {
    mockAccount();
    const cursors: string[] = [];
    server.use(
      http.get('/api/v1/customers/me/favorites', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor) cursors.push(cursor);
        return HttpResponse.json({ data: cursor ? [{ ...favorite, productId: '9223372036854775807', name: 'Otro' }] : [favorite], page: { limit: 20, nextCursor: cursor ? null : 'opaque+/==' } });
      }),
      http.get('/api/v1/customers/me/orders', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor) cursors.push(cursor);
        return HttpResponse.json({ data: cursor ? [{ ...order, id: '9223372036854775807', folio: 'A000013' }] : [order], page: { limit: 20, nextCursor: cursor ? null : 'opaque+/==' } });
      }),
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Más favoritos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Más órdenes' }));
    await screen.findByRole('button', { name: 'Ver orden A000013' });
    expect(cursors).toEqual(['opaque+/==', 'opaque+/==']);
  });
});
