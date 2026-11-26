import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { server } from '../../../../test/server';
import {
  manyNoMovementItems,
  noMovementCursorFor,
  noMovementForUrl,
  zeroNoMovement,
} from '../../../../test/noMovementFixture';
import { CSV_EXPORT_RANGE_UNAVAILABLE } from '../downloads/csvDownload';
import { NoMovementProducts } from './NoMovementProducts';

const todayFrom = '2026-11-24T08:00:00.000Z';
const todayTo = '2026-11-25T08:00:00.000Z';
const yesterdayFrom = '2026-11-23T08:00:00.000Z';

function renderNoMovement(
  props: {
    from?: string;
    to?: string;
    method?: 'ALL' | 'CASH' | 'STRIPE';
  } = {},
) {
  return render(
    <NoMovementProducts
      from={props.from ?? todayFrom}
      to={props.to ?? todayTo}
      method={props.method ?? 'ALL'}
    />,
  );
}

beforeEach(() => {
  server.use(
    http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) =>
      HttpResponse.json({ data: noMovementForUrl(request.url) }),
    ),
  );
});

describe('no-movement products panel', () => {
  test('renders safely and disables the export for ranges before 2000', () => {
    renderNoMovement({
      from: '1999-12-31T08:00:00.000Z',
      to: '2000-01-01T08:00:00.000Z',
    });
    expect(
      screen.getByRole('heading', { name: 'Activos sin movimiento' }),
    ).toBeInTheDocument();
    expect(screen.getByText(CSV_EXPORT_RANGE_UNAVAILABLE)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Descargar sin movimiento (CSV)' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  test('requests the default page and renders the separated list, universe and exact metadata', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: noMovementForUrl(request.url) });
      }),
    );
    renderNoMovement();
    expect(
      await screen.findByRole('heading', { name: 'Activos sin movimiento' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sin movimiento en el rango y método seleccionados'),
    ).toBeInTheDocument();
    expect(screen.getByText(/No afirma ausencia global de ventas/)).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Productos sin movimiento/ });
    const scrollRegion = screen.getByRole('region', { name: 'Tabla desplazable de activos sin movimiento' });
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    expect(scrollRegion).toContainElement(table);
    scrollRegion.focus();
    expect(scrollRegion).toHaveFocus();
    expect(queries).toHaveLength(1);
    expect(queries[0].get('limit')).toBe('20');
    expect(queries[0].has('cursor')).toBe(false);
    expect(queries[0].has('method')).toBe(false);
    expect(within(table).getAllByRole('columnheader').map((node) => node.textContent)).toEqual([
      'Producto',
      'Categoría',
      'Disponibilidad',
      'Alta',
    ]);
    expect(within(table).getAllByRole('rowheader')).toHaveLength(3);
    expect(within(table).getByText('Latte')).toBeInTheDocument();
    expect(within(table).getByText('ID 10')).toBeInTheDocument();
    expect(within(table).getAllByText('Cafés').length).toBeGreaterThan(0);
    expect(within(table).getByText('No disponible')).toBeInTheDocument();
    expect(within(table).getAllByText('Disponible').length).toBeGreaterThan(0);
    const altas = table.querySelectorAll('time');
    expect(altas[1]).toHaveAttribute('dateTime', '2026-11-20T17:30:00.123456Z');
    expect(screen.getByText(/Corte del universo:/)).toBeInTheDocument();
    expect(screen.getByText(/no dados de baja/)).toBeInTheDocument();
    expect(screen.queryByText(/createdAt < to/)).not.toBeInTheDocument();
    expect(screen.getByText(/La lista incluye productos agotados/)).toBeInTheDocument();
    expect(screen.getByText(/Total del conjunto sin movimiento/)).toHaveTextContent(
      /Total del conjunto sin movimiento en este rango y método: 3\. Mostrando 3 de 3\./,
    );
    expect(screen.getByText(/no es el total de productos activos/)).toBeInTheDocument();
    expect(screen.getByText('No hay más productos.')).toBeInTheDocument();
  });

  test('loads more with the opaque cursor, accumulates without duplicates and ends with a final status', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: noMovementForUrl(request.url, manyNoMovementItems) });
      }),
    );
    renderNoMovement();
    const table = await screen.findByRole('table', { name: /Productos sin movimiento/ });
    expect(within(table).getAllByRole('rowheader')).toHaveLength(20);
    expect(queries[0].has('cursor')).toBe(false);
    const button = screen.getByRole('button', { name: 'Cargar más' });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    await waitFor(() => expect(within(table).getAllByRole('rowheader')).toHaveLength(25));
    expect(queries.at(-1)?.get('cursor')).toBe(noMovementCursorFor(20));
    const ids = within(table)
      .getAllByRole('rowheader')
      .map((node) => /ID (\d+)/.exec(node.textContent ?? '')?.[1]);
    expect(new Set(ids).size).toBe(25);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.getByText('No hay más productos.')).toBeInTheDocument();
    expect(screen.getByText(/Total del conjunto sin movimiento/)).toHaveTextContent(
      /Total del conjunto sin movimiento en este rango y método: 25\. Mostrando 25 de 25\./,
    );
  });

  test('changing the page size restarts from the first page without a cursor', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: noMovementForUrl(request.url, manyNoMovementItems) });
      }),
    );
    renderNoMovement();
    const table = await screen.findByRole('table', { name: /Productos sin movimiento/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(within(table).getAllByRole('rowheader')).toHaveLength(25));

    fireEvent.change(screen.getByLabelText('Productos por página'), { target: { value: '10' } });
    await waitFor(() => expect(queries.at(-1)?.get('limit')).toBe('10'));
    expect(queries.at(-1)?.has('cursor')).toBe(false);
    const resized = await screen.findByRole('table', { name: /Productos sin movimiento/ });
    await waitFor(() => expect(within(resized).getAllByRole('rowheader')).toHaveLength(10));
    expect(within(resized).getByText('Activo 01')).toBeInTheDocument();
    expect(within(resized).queryByText('Activo 25')).not.toBeInTheDocument();
  });

  test('changing the period or method restarts the cursor and keeps the filter echo', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: noMovementForUrl(request.url, manyNoMovementItems) });
      }),
    );
    const view = renderNoMovement();
    const table = await screen.findByRole('table', { name: /Productos sin movimiento/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(within(table).getAllByRole('rowheader')).toHaveLength(25));
    expect(queries.at(-1)?.get('cursor')).toBe(noMovementCursorFor(20));

    view.rerender(
      <NoMovementProducts from={yesterdayFrom} to={todayTo} method="ALL" />,
    );
    await waitFor(() => expect(queries.at(-1)?.get('from')).toBe(yesterdayFrom));
    expect(queries.at(-1)?.has('cursor')).toBe(false);
    await screen.findByRole('table', { name: /Productos sin movimiento/ });

    view.rerender(<NoMovementProducts from={yesterdayFrom} to={todayTo} method="CASH" />);
    await waitFor(() => expect(queries.at(-1)?.get('method')).toBe('CASH'));
    expect(queries.at(-1)?.has('cursor')).toBe(false);
    expect(await screen.findByText(/Método: Efectivo\./)).toBeInTheDocument();
  });

  test('shows the zero state without inventing rows or a cursor', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', () =>
        HttpResponse.json({ data: zeroNoMovement }),
      ),
    );
    renderNoMovement();
    expect(
      await screen.findByText(/No hay productos sin movimiento en el rango y método seleccionados/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/Total del conjunto sin movimiento/)).toHaveTextContent(
      'Mostrando 0 de 0',
    );
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  test.each([
    ['401 session', 401, 'UNAUTHENTICATED', /Tu sesión venció/],
    ['403 generic role', 403, 'FORBIDDEN', /Sólo administración/],
    ['403 PIN change', 403, 'PIN_CHANGE_REQUIRED', /cambiar tu NIP/],
    ['403 origin', 403, 'ORIGIN_NOT_ALLOWED', /origen de la solicitud no está permitido/],
    ['429 rate limit', 429, 'RATE_LIMITED', /Demasiadas/],
    ['503 dependency', 503, 'DEPENDENCY_UNAVAILABLE', /no está disponible/],
  ])('shows a safe isolated error without a table or a loop: %s', async (_name, status, code, message) => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', () => {
        calls += 1;
        return HttpResponse.json({ title: 'Error', status, code }, { status });
      }),
    );
    renderNoMovement();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
    expect(screen.getByRole('button', { name: 'Reintentar lista' })).toBeInTheDocument();
  });

  test('rejects an invalid DTO without falling back to rows', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        const data = noMovementForUrl(request.url);
        return HttpResponse.json({ data: { ...data, page: { ...data.page, limit: '10' } } });
      }),
    );
    renderNoMovement();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede verificar/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('keeps the loaded rows when a later page fails and retries it', async () => {
    let failMore = true;
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        if (query.has('cursor') && failMore) {
          return HttpResponse.json({ title: 'No disponible' }, { status: 503 });
        }
        return HttpResponse.json({ data: noMovementForUrl(request.url, manyNoMovementItems) });
      }),
    );
    renderNoMovement();
    const table = await screen.findByRole('table', { name: /Productos sin movimiento/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/);
    expect(within(table).getAllByRole('rowheader')).toHaveLength(20);
    expect(screen.queryByText(/No fue posible consultar el resumen/)).not.toBeInTheDocument();

    failMore = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }));
    await waitFor(() => expect(within(table).getAllByRole('rowheader')).toHaveLength(25));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(queries.at(-1)?.get('cursor')).toBe(noMovementCursorFor(20));
  });

  test('discards an older response after the period changes', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from');
        if (from === todayFrom) {
          await delay(120);
          return HttpResponse.json({ data: noMovementForUrl(request.url, manyNoMovementItems) });
        }
        return HttpResponse.json({ data: noMovementForUrl(request.url) });
      }),
    );
    const view = renderNoMovement();
    expect(await screen.findByText('Consultando activos sin movimiento…')).toBeInTheDocument();
    view.rerender(<NoMovementProducts from={yesterdayFrom} to={todayTo} method="ALL" />);
    expect(await screen.findByText('Latte')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(screen.queryByText('Activo 25')).not.toBeInTheDocument();
  });

  test('aborts the in-flight request when unmounted', async () => {
    let calls = 0;
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', async () => {
        calls += 1;
        await delay(120);
        return HttpResponse.json({ data: noMovementForUrl(`http://fixture/?from=${todayFrom}&to=${todayTo}&limit=20`) });
      }),
    );
    const view = renderNoMovement();
    await waitFor(() => expect(calls).toBe(1));
    view.unmount();
    expect(abort).toHaveBeenCalled();
    abort.mockRestore();
  });

  test('never polls automatically and refreshes only when requested', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', () => {
        calls += 1;
        return HttpResponse.json({
          data: noMovementForUrl(`http://fixture/?from=${todayFrom}&to=${todayTo}&limit=20`),
        });
      }),
    );
    renderNoMovement();
    await screen.findByRole('table', { name: /Productos sin movimiento/ });
    expect(calls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar lista' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  test.each(['success', 'error'] as const)('refresh retains focus, blocks duplicate activation and unlocks after %s', async (outcome) => {
    let calls = 0;
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', async ({ request }) => {
        calls += 1;
        if (calls === 2) {
          await pending;
          if (outcome === 'error') return HttpResponse.json({ title: 'No disponible' }, { status: 503 });
        }
        return HttpResponse.json({ data: noMovementForUrl(request.url) });
      }),
    );
    renderNoMovement();
    await screen.findByRole('table');
    const refresh = screen.getByRole('button', { name: 'Actualizar lista' });
    refresh.focus();
    // Two synchronous clicks before React commits loading exercise the ref latch.
    act(() => { refresh.click(); refresh.click(); });
    await waitFor(() => expect(calls).toBe(2));
    expect(refresh).toHaveAttribute('aria-disabled', 'true');
    expect(refresh).not.toBeDisabled();
    expect(refresh).toHaveFocus();
    fireEvent.click(refresh);
    expect(calls).toBe(2);
    if (!release) throw new Error('Missing test response gate.');
    release();
    await waitFor(() => expect(refresh).toHaveAttribute('aria-disabled', 'false'));
    expect(refresh).toHaveFocus();
    if (outcome === 'error') expect(screen.getByRole('alert')).toHaveTextContent(/no está disponible/);
    else expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(refresh);
    await waitFor(() => expect(calls).toBe(3));
    await screen.findByRole('table');
  });
});
