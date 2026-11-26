import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken, setCsrfToken } from '../../../shared/api/client';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';
import { productRankingForUrl } from '../../../test/rankingFixture';
import { salesSeriesForUrl } from '../../../test/seriesFixture';

const admin = { id: '1', name: 'Administrador', role: 'ADMINISTRADOR', accountType: 'STAFF', mustChangePin: false };
const cashier = { id: '2', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const category = { id: '1', name: 'Bebidas', isActive: true, deletedAt: null, createdAt: '2026-01-01T12:00:00.000Z' };

function dashboardSummary(url: string) {
  const query = new URL(url).searchParams;
  const from = query.get('from')!;
  const to = query.get('to')!;
  const duration = Date.parse(to) - Date.parse(from);
  return {
    generatedAt: new Date().toISOString(),
    currency: 'MXN',
    period: {
      from,
      to,
      timeZone: 'America/Tijuana',
      previousFrom: new Date(Date.parse(from) - duration).toISOString(),
      previousTo: from,
    },
    totalCents: '4500',
    ticketCount: '1',
    averageTicketCents: '4500',
    unitsSold: '1',
    paymentMix: { cashCents: '4500', stripeCents: '0' },
    comparison: {
      totalCents: { previous: '0', change: '4500', changePercent: null },
      ticketCount: { previous: '0', change: '1', changePercent: null },
      averageTicketCents: { previous: '0', change: '4500', changePercent: null },
      unitsSold: { previous: '0', change: '1', changePercent: null },
    },
  };
}

function setup(actor = admin, path = '/terminal/administracion') {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })),
    http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
      HttpResponse.json({ data: dashboardSummary(request.url) }),
    ),
    http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
    http.get('/api/v1/sales', () =>
      HttpResponse.json({ data: [], page: { limit: 5, nextCursor: null } }),
    ),
    http.get('/api/v1/admin/dashboard/sales-series', ({ request }) =>
      HttpResponse.json({ data: salesSeriesForUrl(request.url) }),
    ),
    http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) =>
      HttpResponse.json({ data: productRankingForUrl(request.url) }),
    ),
  );
  render(<SessionProvider><RouterProvider router={createTestRouter([path])} /></SessionProvider>);
}

beforeEach(() => setCsrfToken('admin-test'));
afterEach(() => invalidateCsrfToken());

describe('administrative workspace (TASK-19)', () => {
  test('shows backend dashboard and allows catalog CRUD only for ADMINISTRADOR', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get('/api/v1/admin/categories', () => HttpResponse.json({ data: [category], page: { limit: 20, nextCursor: null } })),
      http.post('/api/v1/admin/categories', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { ...category, id: '2', name: 'Comida' } }, { status: 201 });
      }),
    );
    setup();
    expect(await screen.findByText('Ventas registradas')).toBeInTheDocument();
    expect((await screen.findAllByText('$45.00')).length).toBeGreaterThanOrEqual(2);
    const tabs = screen.getByRole('navigation', { name: 'Secciones administrativas' });
    fireEvent.click(within(tabs).getByRole('link', { name: 'Categorías' }));
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Comida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('guardado');
    expect(bodies).toEqual([{ name: 'Comida', isActive: true }]);
  });

  test('denies CAJERO before any admin API or summary request', async () => {
    const requests: string[] = [];
    server.use(
      http.get('/api/v1/admin/categories', () => { requests.push('admin'); return HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } }); }),
      http.get('/api/v1/admin/dashboard/summary', () => { requests.push('dashboard'); return HttpResponse.json({ data: {} }); }),
      http.get('/api/v1/admin/dashboard/sales-series', () => { requests.push('series'); return HttpResponse.json({ data: {} }); }),
    );
    setup(cashier);
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(requests).toEqual([]);
    expect(screen.queryByRole('link', { name: 'Categorías' })).not.toBeInTheDocument();
  });

  test('keeps existing list on a 409 and offers explicit refresh', async () => {
    server.use(
      http.get('/api/v1/admin/categories', () => HttpResponse.json({ data: [category], page: { limit: 20, nextCursor: null } })),
      http.patch('/api/v1/admin/categories/1', () => HttpResponse.json({ status: 409, code: 'CONFLICT', title: 'Conflicto' }, { status: 409 })),
    );
    setup();
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Secciones administrativas' })).getByRole('link', { name: 'Categorías' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cambió o ya existe/);
    await waitFor(() => expect(screen.getByText('Bebidas')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Actualizar lista' })).toBeEnabled();
  });

  test('PATCH changes only the edited name and DELETE resets to the first page', async () => {
    const patchBodies: unknown[] = [];
    const pages: Array<string | null> = [];
    server.use(
      http.get('/api/v1/admin/categories', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        pages.push(cursor);
        return HttpResponse.json({ data: [category], page: { limit: 20, nextCursor: cursor === null ? 'opaque-2' : null } });
      }),
      http.patch('/api/v1/admin/categories/1', async ({ request }) => {
        patchBodies.push(await request.json());
        return HttpResponse.json({ data: { ...category, name: 'Otro nombre' } });
      }),
      http.delete('/api/v1/admin/categories/1', () => HttpResponse.json({ data: { ...category, deletedAt: '2026-01-02T12:00:00.000Z' } })),
    );
    setup();
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Secciones administrativas' })).getByRole('link', { name: 'Categorías' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Otro nombre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(patchBodies).toEqual([{ name: 'Otro nombre' }]));
    fireEvent.click(await screen.findByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(pages).toContain('opaque-2'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    await waitFor(() => expect(pages.at(-1)).toBeNull());
    expect(screen.getByText('Página 1')).toBeInTheDocument();
    confirm.mockRestore();
  });

  test('unverifiable success is uncertain and blocks further writes until authoritative reload', async () => {
    let posts = 0;
    server.use(
      http.get('/api/v1/admin/categories', () => HttpResponse.json({ data: [category], page: { limit: 20, nextCursor: null } })),
      http.post('/api/v1/admin/categories', () => { posts += 1; return HttpResponse.json({ data: { ...category, id: '5', name: 'Comida', secret: true } }, { status: 201 }); }),
    );
    setup();
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Secciones administrativas' })).getByRole('link', { name: 'Categorías' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre' }), { target: { value: 'Comida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/puede haberse aplicado/);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(posts).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Consultar lista antes de continuar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
    expect(posts).toBe(1);
  });

  test('keeps one main landmark and marks the active sidebar section', async () => {
    setup();
    const nav = await screen.findByRole('navigation', { name: 'Secciones administrativas' });
    expect(within(nav).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(await screen.findByRole('heading', { name: 'Administración' })).toHaveFocus();
  });

  test('returns focus to the page title after sidebar navigation', async () => {
    server.use(http.get('/api/v1/admin/categories', () => HttpResponse.json({ data: [category], page: { limit: 20, nextCursor: null } })));
    setup();
    const nav = await screen.findByRole('navigation', { name: 'Secciones administrativas' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Categorías' }));
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Administración' })).toHaveFocus();
  });

  test('employee PATCH includes a reason but never a password or unchanged role', async () => {
    const employee = { id: '3', name: 'María', username: 'maria_3', role: 'CAJERO', isActive: true };
    const bodies: unknown[] = [];
    server.use(
      http.get('/api/v1/admin/employees', () => HttpResponse.json({ data: [employee], page: { limit: 20, nextCursor: null } })),
      http.patch('/api/v1/admin/employees/3', async ({ request }) => {
        bodies.push(await request.json()); return HttpResponse.json({ data: { ...employee, name: 'María nueva' } });
      }),
    );
    setup();
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Secciones administrativas' })).getByRole('link', { name: 'Personal' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), { target: { value: 'María nueva' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo de modificación' }), { target: { value: 'Corrección de nombre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(bodies).toEqual([{ name: 'María nueva', reason: 'Corrección de nombre' }]));
  });
});
