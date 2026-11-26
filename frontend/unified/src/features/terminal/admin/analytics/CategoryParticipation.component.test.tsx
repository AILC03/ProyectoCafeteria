import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { server } from '../../../../test/server';
import {
  categoryParticipationForUrl,
  freeCategoryItems,
  roundingCategoryItems,
} from '../../../../test/categoryFixture';
import { CSV_EXPORT_RANGE_UNAVAILABLE } from '../downloads/csvDownload';
import { CategoryParticipation } from './CategoryParticipation';

const todayFrom = '2026-11-24T08:00:00.000Z';
const todayTo = '2026-11-25T08:00:00.000Z';
const yesterdayFrom = '2026-11-23T08:00:00.000Z';

function renderPanel(
  props: {
    from?: string;
    to?: string;
    method?: 'ALL' | 'CASH' | 'STRIPE';
  } = {},
) {
  return render(
    <CategoryParticipation
      from={props.from ?? todayFrom}
      to={props.to ?? todayTo}
      method={props.method ?? 'ALL'}
    />,
  );
}

beforeEach(() => {
  server.use(
    http.get('/api/v1/admin/dashboard/category-participation', ({ request }) =>
      HttpResponse.json({ data: categoryParticipationForUrl(request.url) }),
    ),
  );
});

describe('category participation panel', () => {
  test('renders safely and disables the export for ranges before 2000', () => {
    renderPanel({
      from: '1999-12-31T08:00:00.000Z',
      to: '2000-01-01T08:00:00.000Z',
    });
    expect(
      screen.getByRole('heading', { name: 'Participación por categorías' }),
    ).toBeInTheDocument();
    expect(screen.getByText(CSV_EXPORT_RANGE_UNAVAILABLE)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Descargar participación (CSV)' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  test('renders the mandatory warning, denominator, metric selector and exact server shares', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: categoryParticipationForUrl(request.url) });
      }),
    );
    renderPanel();
    expect(
      await screen.findByRole('heading', { name: 'Participación por categorías' }),
    ).toBeInTheDocument();
    const warning = screen.getByRole('note', {
      name: 'Categoría vigente y reclasificación histórica',
    });
    expect(warning).toHaveTextContent(/Las ventas se agrupan por la categoría actual/);
    expect(warning).toHaveTextContent(/el total no cambia/);
    expect(warning).toBeVisible();

    const table = await screen.findByRole('table', {
      name: /Participación por categoría actual/,
    });
    const scrollRegion = screen.getByRole('region', {
      name: 'Tabla desplazable de participación por categorías',
    });
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    expect(scrollRegion).toContainElement(table);
    scrollRegion.focus();
    expect(scrollRegion).toHaveFocus();

    expect(queries).toHaveLength(1);
    expect([...queries[0].keys()]).toEqual(['from', 'to', 'metric']);
    expect(queries[0].get('metric')).toBe('units');
    expect(queries[0].has('method')).toBe(false);
    expect(queries[0].has('category')).toBe(false);
    expect(queries[0].has('categoryId')).toBe(false);

    expect(screen.getByLabelText('Métrica de participación')).toHaveValue('units');
    expect(screen.getByText(/Denominador de la métrica/).closest('div')).toHaveTextContent(
      'Denominador de la métrica (unidades vendidas)12',
    );
    expect(within(table).getAllByRole('columnheader').map((node) => node.textContent)).toEqual([
      'Categoría',
      'Estado',
      'Unidades vendidas',
      'Importe bruto',
      'Participación',
    ]);
    expect(within(table).getAllByRole('rowheader')).toHaveLength(3);
    expect(within(table).getByText('Cafés')).toBeInTheDocument();
    expect(within(table).getByText('ID 3')).toBeInTheDocument();
    expect(within(table).getByText('Inactiva')).toBeInTheDocument();
    expect(within(table).getByText('Panadería')).toBeInTheDocument();
    expect(within(table).getAllByText('Activa')).toHaveLength(2);
    expect(
      within(table).getAllByRole('row').slice(1).map((row) => row.lastElementChild?.textContent),
    ).toEqual(['66.67 %', '25.00 %', '8.33 %']);
    expect(screen.getByText(/no se recalculan ni se normalizan a 100 %/)).toBeInTheDocument();
  });

  test('changing the metric requests and renders the server shares for that metric', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: categoryParticipationForUrl(request.url) });
      }),
    );
    renderPanel();
    await screen.findByRole('table', {
      name: /Participación por categoría actual/,
    });
    fireEvent.change(screen.getByLabelText('Métrica de participación'), {
      target: { value: 'amount' },
    });
    await waitFor(() => expect(queries.at(-1)?.get('metric')).toBe('amount'));
    await waitFor(() => {
      const updated = screen.getByRole('table', {
        name: /Participación por categoría actual/,
      });
      expect(
        within(updated)
          .getAllByRole('row')
          .slice(1)
          .map((row) => row.lastElementChild?.textContent),
      ).toEqual(['72.22 %', '20.83 %', '6.94 %']);
    });
    expect(screen.getByText(/Métrica: importe bruto\./)).toBeInTheDocument();
    expect(screen.getByText(/Denominador de la métrica/).closest('div')).toHaveTextContent(
      'Denominador de la métrica (importe bruto MXN)$360.00',
    );
  });

  test('propagates the period and method and discards an older response', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', async ({ request }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        if (query.get('from') === todayFrom) {
          await delay(120);
          return HttpResponse.json({
            data: categoryParticipationForUrl(request.url, roundingCategoryItems),
          });
        }
        return HttpResponse.json({ data: categoryParticipationForUrl(request.url) });
      }),
    );
    const view = renderPanel();
    expect(
      await screen.findByText('Consultando participación por categorías del periodo…'),
    ).toBeInTheDocument();
    view.rerender(<CategoryParticipation from={yesterdayFrom} to={todayTo} method="CASH" />);
    const table = await screen.findByRole('table', {
      name: /Participación por categoría actual/,
    });
    await waitFor(() => expect(queries.at(-1)?.get('from')).toBe(yesterdayFrom));
    expect(queries.at(-1)?.get('method')).toBe('CASH');
    expect(within(table).getByText('Cafés')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(within(table).queryByText('Gratis')).not.toBeInTheDocument();
    expect(screen.getByText(/Método: Efectivo\./)).toBeInTheDocument();
  });

  test('shows an explicit zero state without a table', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) =>
        HttpResponse.json({ data: categoryParticipationForUrl(request.url, []) }),
      ),
    );
    renderPanel();
    expect(
      await screen.findByText(
        'No hay categorías con movimiento en el rango y método seleccionados.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/Denominador de la métrica/).closest('div')).toHaveTextContent(
      'Denominador de la métrica (unidades vendidas)0',
    );
  });

  test('shows "sin base" for a zero selected denominator without recalculating', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) =>
        HttpResponse.json({ data: categoryParticipationForUrl(request.url, freeCategoryItems) }),
      ),
    );
    renderPanel();
    await screen.findByRole('table', { name: /Participación por categoría actual/ });
    fireEvent.change(screen.getByLabelText('Métrica de participación'), {
      target: { value: 'amount' },
    });
    expect(await screen.findByText(/Sin base:/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Participación por categoría actual/ });
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.lastElementChild?.textContent),
    ).toEqual(['sin base', 'sin base']);
    expect(within(table).queryByText('0.00 %')).not.toBeInTheDocument();
  });

  test('keeps the rounding residue as received instead of normalizing to 100 %', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) =>
        HttpResponse.json({
          data: categoryParticipationForUrl(request.url, roundingCategoryItems),
        }),
      ),
    );
    renderPanel();
    const table = await screen.findByRole('table', {
      name: /Participación por categoría actual/,
    });
    const shares = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.lastElementChild?.textContent);
    expect(shares).toEqual(['33.33 %', '33.33 %', '33.33 %']);
    expect(within(table).queryByText('33.34 %')).not.toBeInTheDocument();
    expect(within(table).queryByText('100.00 %')).not.toBeInTheDocument();
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
      http.get('/api/v1/admin/dashboard/category-participation', () => {
        calls += 1;
        return HttpResponse.json({ title: 'Error', status, code }, { status });
      }),
    );
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
    expect(
      screen.getByRole('button', { name: 'Reintentar participación' }),
    ).toBeInTheDocument();
  });

  test('rejects an invalid DTO without falling back to rows', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) => {
        const data = categoryParticipationForUrl(request.url);
        return HttpResponse.json({ data: { ...data, totalCategories: '9' } });
      }),
    );
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede verificar/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('never polls automatically and refreshes only when requested', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) => {
        calls += 1;
        return HttpResponse.json({ data: categoryParticipationForUrl(request.url) });
      }),
    );
    renderPanel();
    await screen.findByRole('table', { name: /Participación por categoría actual/ });
    expect(calls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar participación' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  test('aborts the in-flight request when unmounted', async () => {
    let calls = 0;
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', async () => {
        calls += 1;
        await delay(120);
        return HttpResponse.json({
          data: categoryParticipationForUrl(
            `http://fixture/?from=${todayFrom}&to=${todayTo}&metric=units`,
          ),
        });
      }),
    );
    const view = renderPanel();
    await waitFor(() => expect(calls).toBe(1));
    view.unmount();
    expect(abort).toHaveBeenCalled();
    abort.mockRestore();
  });
});
