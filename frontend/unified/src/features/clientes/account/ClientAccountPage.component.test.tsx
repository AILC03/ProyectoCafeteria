import { fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { idempotencyOperations } from '../../../shared/api/idempotency';
import { server } from '../../../test/server';
import { cashReceipts } from '../orders/cashReceipts';

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
beforeEach(() => { localStorage.clear(); idempotencyOperations.clear(); cashReceipts.clear(); });
afterEach(() => { localStorage.clear(); idempotencyOperations.clear(); cashReceipts.clear(); });

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

  test('repeat order clones the preview directly into the cart and opens it', async () => {
    mockAccount();
    server.use(
      http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
      http.get('/api/v1/products', () => HttpResponse.json({ data: [{ id: '9', categoryId: '1', name: 'Agua', description: null, imageUrl: null, basePriceCents: '2000', isAvailable: true }], page: { limit: 100, nextCursor: null } })),
      http.get('/api/v1/products/9', () => HttpResponse.json({ data: { id: '9', categoryId: '1', name: 'Agua', description: null, imageUrl: null, basePriceCents: '2000', isAvailable: true } })),
      http.get('/api/v1/products/9/options', () => HttpResponse.json({ data: [] })),
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Repetir pedido A000012' }));
    const cart = await screen.findByRole('dialog', { name: 'Tu carrito' });
    expect(await within(cart).findByText(/1 × Agua/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('cafeteria:cart-draft:v1') ?? '')).toEqual({ version: 1, items: [{ productId: '9', quantity: 1, optionValueIds: [] }] });
  });

  test('repeat order merges identical preview lines into one cart item', async () => {
    mockAccount();
    server.use(
      http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
      http.get('/api/v1/products', () => HttpResponse.json({ data: [{ id: '9', categoryId: '1', name: 'Agua', description: null, imageUrl: null, basePriceCents: '2000', isAvailable: true }], page: { limit: 100, nextCursor: null } })),
      http.get('/api/v1/products/9', () => HttpResponse.json({ data: { id: '9', categoryId: '1', name: 'Agua', description: null, imageUrl: null, basePriceCents: '2000', isAvailable: true } })),
      http.get('/api/v1/products/9/options', () => HttpResponse.json({ data: [] })),
      http.post('/api/v1/customers/me/orders/12/repeat-preview', () => HttpResponse.json({
        data: {
          ...preview,
          items: [
            { productId: '9', productName: 'Agua', quantity: 1, optionValueIds: [], currentUnitPriceCents: '2000', currentLineTotalCents: '2000' },
            { productId: '9', productName: 'Agua', quantity: 1, optionValueIds: [], currentUnitPriceCents: '2000', currentLineTotalCents: '2000' },
          ],
          totalCents: '4000',
        },
      })),
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Repetir pedido A000012' }));
    const cart = await screen.findByRole('dialog', { name: 'Tu carrito' });
    expect(await within(cart).findByText(/2 × Agua/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('cafeteria:cart-draft:v1') ?? '')).toEqual({
      version: 1,
      items: [{ productId: '9', quantity: 2, optionValueIds: [] }],
    });
  });

  test('blocking repeat preview reports the reason and does not alter the cart', async () => {
    mockAccount();
    server.use(http.post('/api/v1/customers/me/orders/12/repeat-preview', () => HttpResponse.json({ data: { ...preview, canCreateOrder: false, totalCents: null, warnings: [{ line: 1, code: 'PRODUCT_UNAVAILABLE', blocking: true, optionValueId: null }] } })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Repetir pedido A000012' }));
    expect(await screen.findByText(/La selección no se puede confirmar/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Tu carrito' })).not.toBeInTheDocument();
    expect(localStorage.getItem('cafeteria:cart-draft:v1')).toBeNull();
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
