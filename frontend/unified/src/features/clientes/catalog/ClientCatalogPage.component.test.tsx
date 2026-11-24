import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const categories = [
  { id: '1', name: 'Cafés' },
  { id: '2', name: 'Panadería' },
  { id: '3', name: 'Temporada' },
];

const productsPage1 = [
  {
    id: '10',
    categoryId: '1',
    name: 'Latte',
    description: 'Espresso con leche vaporizada',
    basePriceCents: '6500',
    imageUrl: null,
    isAvailable: true,
  },
];

const productsPage2 = [
  {
    id: '11',
    categoryId: '2',
    name: 'Croissant',
    description: 'Hojaldre de mantequilla',
    basePriceCents: '4500',
    imageUrl: null,
    isAvailable: false,
  },
];

const latteOptions = [
  {
    id: 'g-size',
    name: 'Tamaño',
    pricingScope: 'PER_PRODUCT',
    minSelections: 1,
    maxSelections: 1,
    values: [
      { id: 'v-med', name: 'Mediano', surchargeCents: '0', isAvailable: true },
      { id: 'v-large', name: 'Grande', surchargeCents: '1000', isAvailable: true },
    ],
  },
  {
    id: 'g-milk',
    name: 'Leche',
    pricingScope: 'GLOBAL',
    minSelections: 0,
    maxSelections: 2,
    values: [
      { id: 'v-oat', name: 'Avena', surchargeCents: '1200', isAvailable: true },
      { id: 'v-almond', name: 'Almendra', surchargeCents: '1000', isAvailable: true },
      { id: 'v-soy', name: 'Soya', surchargeCents: '1000', isAvailable: true },
      { id: 'v-lactose-free', name: 'Deslactosada', surchargeCents: '500', isAvailable: false },
    ],
  },
];

function renderMenu() {
  return render(
    <SessionProvider>
      <RouterProvider router={createTestRouter(['/cliente/menu'])} />
    </SessionProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('Client catalog and customization (TASK-10)', () => {
  test('renders loading state, follows opaque nextCursor pagination, and filters categories via keyboard', async () => {
    const requestedCursors: Array<string | null> = [];
    let releaseProducts!: () => void;
    const productsPending = new Promise<void>((resolve) => {
      releaseProducts = resolve;
    });
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get('/api/v1/categories', () =>
        HttpResponse.json({ data: categories, page: { limit: 100, nextCursor: null } }),
      ),
      http.get('/api/v1/products', async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        requestedCursors.push(cursor);
        if (cursor === null) {
          await productsPending;
          return HttpResponse.json({ data: productsPage1, page: { limit: 100, nextCursor: 'opaque-cursor-2' } });
        }
        return HttpResponse.json({ data: productsPage2, page: { limit: 100, nextCursor: null } });
      }),
    );

    renderMenu();
    expect(await screen.findByText('Cargando catálogo…')).toBeInTheDocument();
    releaseProducts();

    expect(await screen.findByRole('heading', { name: 'Latte' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Croissant' })).toBeInTheDocument();
    expect(requestedCursors).toEqual([null, 'opaque-cursor-2']);

    // Sold-out product displays Agotado and cannot be customized.
    const soldOutButton = screen.getByRole('button', { name: 'Croissant agotado' });
    expect(soldOutButton).toBeDisabled();

    // Keyboard navigation across category bar.
    const allButton = screen.getByRole('button', { name: 'Todas' });
    const cafesButton = screen.getByRole('button', { name: 'Cafés' });
    const bakeryButton = screen.getByRole('button', { name: 'Panadería' });
    const seasonalButton = screen.getByRole('button', { name: 'Temporada' });

    allButton.focus();
    fireEvent.keyDown(allButton, { key: 'ArrowRight' });
    expect(cafesButton).toHaveFocus();
    fireEvent.keyDown(cafesButton, { key: 'End' });
    expect(seasonalButton).toHaveFocus();
    fireEvent.keyDown(seasonalButton, { key: 'ArrowLeft' });
    expect(bakeryButton).toHaveFocus();
    fireEvent.keyDown(bakeryButton, { key: 'Home' });
    expect(allButton).toHaveFocus();

    // Filter to empty category and reset back to all.
    fireEvent.click(seasonalButton);
    expect(screen.getByRole('heading', { name: 'Sin productos en esta categoría' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas las categorías' }));
    expect(screen.getByRole('heading', { name: 'Latte' })).toBeInTheDocument();
  });

  test('ignores legacy localStorage catalog caches during empty and error states and supports retry', async () => {
    localStorage.setItem(
      'coffees_menu_products_local',
      JSON.stringify([{ id: '999', name: 'Producto Local Prohibido', price: 1, categoryId: '1', isAvailable: true }]),
    );
    localStorage.setItem(
      'taffy_menu_products_local',
      JSON.stringify([{ id: '998', name: 'Producto Taffy Prohibido', price: 1, categoryId: '1', isAvailable: true }]),
    );
    localStorage.setItem('coffees_menu_categories_local', JSON.stringify([{ id: '1', name: 'LocalCat' }]));

    let attempt = 0;
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
      http.get('/api/v1/products', () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
        }
        return HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } });
      }),
    );

    renderMenu();
    expect(await screen.findByRole('alert')).toHaveTextContent('no está disponible temporalmente');
    expect(screen.queryByText('Producto Local Prohibido')).not.toBeInTheDocument();
    expect(screen.queryByText('Producto Taffy Prohibido')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }));
    expect(await screen.findByRole('heading', { name: 'Menú vacío' })).toBeInTheDocument();
    expect(screen.queryByText('Producto Local Prohibido')).not.toBeInTheDocument();
  });

  test('opens customization dialog, enforces options/availability/surcharges, restores focus on Escape, and confirms without ordering', async () => {
    let orderPosted = false;
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get('/api/v1/categories', () =>
        HttpResponse.json({ data: categories, page: { limit: 100, nextCursor: null } }),
      ),
      http.get('/api/v1/products', () =>
        HttpResponse.json({ data: productsPage1, page: { limit: 100, nextCursor: null } }),
      ),
      http.get('/api/v1/products/10', () => HttpResponse.json({ data: productsPage1[0] })),
      http.get('/api/v1/products/10/options', () => HttpResponse.json({ data: latteOptions })),
      http.post('/api/v1/orders', () => {
        orderPosted = true;
        return HttpResponse.json({ data: {} }, { status: 201 });
      }),
    );

    renderMenu();
    const customizeButton = await screen.findByRole('button', { name: 'Personalizar Latte' });
    customizeButton.focus();
    fireEvent.click(customizeButton);

    const dialog = await screen.findByRole('dialog', { name: 'Latte' });
    expect(await within(dialog).findByText('Tamaño — Obligatorio (mín. 1, máx. 1)')).toBeInTheDocument();
    expect(document.querySelector('.session-content')).toHaveAttribute('inert');
    expect(document.querySelector('.session-content')).toHaveAttribute('aria-hidden', 'true');

    // Focus wraps across Tab and Shift+Tab within the modal.
    const closeButton = within(dialog).getByRole('button', { name: 'Cerrar' });
    const confirmButton = within(dialog).getByRole('button', { name: 'Confirmar personalización' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(confirmButton).toHaveFocus();
    fireEvent.keyDown(confirmButton, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    // Reaching quantity lower limit keeps focus on the decrease button so Escape still closes.
    const increaseButton = within(dialog).getByRole('button', { name: 'Aumentar cantidad' });
    const decreaseButton = within(dialog).getByRole('button', { name: 'Disminuir cantidad' });
    fireEvent.click(increaseButton);
    decreaseButton.focus();
    fireEvent.click(decreaseButton);
    expect(decreaseButton).toHaveAttribute('aria-disabled', 'true');
    expect(decreaseButton).toHaveFocus();

    // Pressing Escape closes dialog, restores background accessibility, and restores focus to trigger.
    fireEvent.keyDown(decreaseButton, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('.session-content')).not.toHaveAttribute('inert');
    expect(customizeButton).toHaveFocus();

    // Reopen and customize options.
    fireEvent.click(customizeButton);
    const reopened = await screen.findByRole('dialog', { name: 'Latte' });
    await within(reopened).findByText('Leche — Opcional (mín. 0, máx. 2)');

    const unavailableMilk = within(reopened).getByRole('button', { name: /Deslactosada/i });
    expect(unavailableMilk).toBeDisabled();

    fireEvent.click(within(reopened).getByRole('button', { name: /Grande/i }));
    fireEvent.click(within(reopened).getByRole('button', { name: /Avena/i }));
    fireEvent.click(within(reopened).getByRole('button', { name: /Almendra/i }));
    // 3rd selection in max=2 group is ignored.
    fireEvent.click(within(reopened).getByRole('button', { name: /Soya/i }));
    expect(within(reopened).getByRole('button', { name: /Soya/i })).toHaveAttribute('aria-pressed', 'false');

    // Increase quantity to 2: (6500 + 1000 + 1200 + 1000) * 2 = 9700 * 2 = 19400 ($194.00)
    fireEvent.click(within(reopened).getByRole('button', { name: 'Aumentar cantidad' }));
    expect(within(reopened).getByText('$194.00')).toBeInTheDocument();

    fireEvent.click(within(reopened).getByRole('button', { name: 'Confirmar personalización' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(screen.getByRole('status')).toHaveTextContent('2 × Latte');
    expect(screen.getByRole('status')).toHaveTextContent('$194.00');
    expect(orderPosted).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  test('blocks confirmation if product becomes unavailable on detail fetch', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get('/api/v1/categories', () =>
        HttpResponse.json({ data: categories, page: { limit: 100, nextCursor: null } }),
      ),
      http.get('/api/v1/products', () =>
        HttpResponse.json({ data: productsPage1, page: { limit: 100, nextCursor: null } }),
      ),
      http.get('/api/v1/products/10', () =>
        HttpResponse.json({ data: { ...productsPage1[0], isAvailable: false } }),
      ),
      http.get('/api/v1/products/10/options', () => HttpResponse.json({ data: latteOptions })),
    );

    renderMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar Latte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Latte' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('agotado');
    expect(within(dialog).getByRole('button', { name: 'Confirmar personalización' })).toBeDisabled();
  });

  test('hides fallback prices during dialog fetch error, supports retry without losing focus, and enforces mandatory selections', async () => {
    let detailAttempt = 0;
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get('/api/v1/categories', () =>
        HttpResponse.json({ data: categories, page: { limit: 100, nextCursor: null } }),
      ),
      http.get('/api/v1/products', () =>
        HttpResponse.json({ data: productsPage1, page: { limit: 100, nextCursor: null } }),
      ),
      http.get('/api/v1/products/10', () => {
        detailAttempt += 1;
        if (detailAttempt === 1) {
          return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
        }
        return HttpResponse.json({ data: productsPage1[0] });
      }),
      http.get('/api/v1/products/10/options', () =>
        HttpResponse.json({
          data: [
            {
              id: 'g-size',
              name: 'Tamaño',
              pricingScope: 'PER_PRODUCT',
              minSelections: 1,
              maxSelections: 1,
              values: [{ id: 'v-med', name: 'Mediano', surchargeCents: '0', isAvailable: false }],
            },
          ],
        }),
      ),
    );

    renderMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar Latte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Latte' });

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ya no está disponible');
    expect(within(dialog).queryByText(/Precio base/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('group', { name: 'Cantidad' })).not.toBeInTheDocument();

    const retryButton = within(dialog).getByRole('button', { name: 'Reintentar' });
    retryButton.focus();
    fireEvent.click(retryButton);
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toHaveFocus();

    expect(await within(dialog).findByText('Tamaño — Obligatorio (mín. 1, máx. 1)')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Selecciona al menos 1 opción');
    expect(within(dialog).getByRole('button', { name: 'Confirmar personalización' })).toBeDisabled();
  });
});
