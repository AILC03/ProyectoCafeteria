import type { BrowserContext, Page, Route } from '@playwright/test';

export type SyntheticRole = 'CAJERO' | 'ADMINISTRADOR' | 'PREPARACION' | 'CLIENTE';

export type SyntheticActor = {
  id: string;
  name: string;
  role: SyntheticRole;
  accountType: 'STAFF' | 'CUSTOMER';
  mustChangePin: boolean;
  email?: string;
};

export const SYNTHETIC_ACTORS = {
  CAJERO: {
    id: 'syn-staff-cajero-1',
    name: 'Cajero Sintético',
    role: 'CAJERO',
    accountType: 'STAFF',
    mustChangePin: false,
  },
  ADMINISTRADOR: {
    id: 'syn-staff-admin-1',
    name: 'Admin Sintético',
    role: 'ADMINISTRADOR',
    accountType: 'STAFF',
    mustChangePin: false,
  },
  PREPARACION: {
    id: 'syn-staff-prep-1',
    name: 'Cocina Sintético',
    role: 'PREPARACION',
    accountType: 'STAFF',
    mustChangePin: false,
  },
  CLIENTE: {
    id: 'syn-client-1',
    name: 'Cliente Sintético',
    role: 'CLIENTE',
    accountType: 'CUSTOMER',
    mustChangePin: false,
    email: 'cliente.sintetico@example.test',
  },
} as const satisfies Record<SyntheticRole, SyntheticActor>;

export const VISITOR_ACTOR: SyntheticActor | null = null;

export type SyntheticCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
};

export type SyntheticProduct = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  available: boolean;
  hasOptions: boolean;
};

export const SYNTHETIC_CATEGORIES: SyntheticCategory[] = [
  { id: 'cat-1', name: 'Café Caliente', slug: 'cafe-caliente', sortOrder: 1, active: true },
  { id: 'cat-2', name: 'Bebidas Frías', slug: 'bebidas-frias', sortOrder: 2, active: true },
  { id: 'cat-3', name: 'Panadería', slug: 'panaderia', sortOrder: 3, active: true },
];

export const SYNTHETIC_PRODUCTS: SyntheticProduct[] = [
  {
    id: 'prod-1',
    categoryId: 'cat-1',
    name: 'Americano Clásico',
    description: 'Espresso doble con agua caliente.',
    priceCents: 4500,
    imageUrl: null,
    available: true,
    hasOptions: true,
  },
  {
    id: 'prod-2',
    categoryId: 'cat-2',
    name: 'Latte Frío',
    description: 'Espresso sobre hielo con leche.',
    priceCents: 6500,
    imageUrl: null,
    available: true,
    hasOptions: false,
  },
  {
    id: 'prod-3',
    categoryId: 'cat-1',
    name: 'Flat White de Especialidad Tostado Medio Origen Único Chiapas',
    description: 'Doble ristretto con microespuma sedosa sin imagen asignada.',
    priceCents: 7200,
    imageUrl: null,
    available: true,
    hasOptions: true,
  },
  {
    id: 'prod-4',
    categoryId: 'cat-1',
    name: 'Espresso Tónico de Temporada',
    description: 'Edición limitada actualmente agotada.',
    priceCents: 6800,
    imageUrl: null,
    available: false,
    hasOptions: false,
  },
  {
    id: 'prod-5',
    categoryId: 'cat-3',
    name: 'Croissant de Mantequilla',
    description: 'Hojaldre horneado cada mañana.',
    priceCents: 5200,
    imageUrl: null,
    available: true,
    hasOptions: false,
  },
];

export type SyntheticOptionValue = {
  id: string;
  name: string;
  surchargeCents: string;
  isAvailable: boolean;
};

export type SyntheticOptionGroup = {
  id: string;
  name: string;
  pricingScope: 'GLOBAL' | 'PER_PRODUCT';
  minSelections: number;
  maxSelections: number;
  values: SyntheticOptionValue[];
};

export const SYNTHETIC_OPTION_GROUPS: SyntheticOptionGroup[] = [
  {
    id: 'opt-grp-size',
    name: 'Tamaño',
    pricingScope: 'GLOBAL',
    minSelections: 1,
    maxSelections: 1,
    values: [
      { id: 'opt-val-chico', name: 'Chico (8 oz)', surchargeCents: '0', isAvailable: true },
      { id: 'opt-val-mediano', name: 'Mediano (12 oz)', surchargeCents: '1000', isAvailable: true },
      { id: 'opt-val-grande', name: 'Grande (16 oz)', surchargeCents: '1800', isAvailable: true },
    ],
  },
  {
    id: 'opt-grp-extras',
    name: 'Extras opcionales',
    pricingScope: 'GLOBAL',
    minSelections: 0,
    maxSelections: 2,
    values: [
      { id: 'opt-val-shot', name: 'Shot extra de espresso', surchargeCents: '1500', isAvailable: true },
      { id: 'opt-val-vainilla', name: 'Jarabe de vainilla', surchargeCents: '1000', isAvailable: true },
      { id: 'opt-val-avena', name: 'Leche de avena', surchargeCents: '1200', isAvailable: true },
    ],
  },
];

export type UnhandledApiRequest = {
  method: string;
  url: string;
  pathname: string;
};

export type ApiRouteHandler = (route: Route, pathname: string, method: string) => Promise<boolean>;

export type VisualApiMockOptions = {
  actor?: SyntheticActor | null;
  categories?: SyntheticCategory[];
  products?: SyntheticProduct[];
  omitRoutes?: string[];
  extraHandlers?: ApiRouteHandler[];
};

export type VisualApiMockController = {
  unhandledRequests: UnhandledApiRequest[];
  handledRequests: Array<{ method: string; pathname: string }>;
  setActor: (actor: SyntheticActor | null) => void;
  assertNoUnhandledRequests: () => void;
};

function jsonResponse(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Installs a strict synthetic API interceptor on `/api/**`.
 * Any `/api/**` request without a matching mock is recorded and fails explicitly.
 */
export async function installApiMocks(
  target: BrowserContext | Page,
  options: VisualApiMockOptions = {},
): Promise<VisualApiMockController> {
  let activeActor: SyntheticActor | null = options.actor ?? null;
  const categories = options.categories ?? SYNTHETIC_CATEGORIES;
  const products = options.products ?? SYNTHETIC_PRODUCTS;
  const omitted = new Set(options.omitRoutes ?? []);
  const unhandledRequests: UnhandledApiRequest[] = [];
  const handledRequests: Array<{ method: string; pathname: string }> = [];

  await target.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = request.url();
    const { pathname } = new URL(url);
    const routeKey = `${method} ${pathname}`;

    if (options.extraHandlers) {
      for (const handler of options.extraHandlers) {
        if (await handler(route, pathname, method)) {
          handledRequests.push({ method, pathname });
          return;
        }
      }
    }

    if (!omitted.has(routeKey) && !omitted.has(pathname)) {
      if ((pathname === '/api/v1/auth/me' || pathname === '/api/auth/me') && method === 'GET') {
        handledRequests.push({ method, pathname });
        if (activeActor === null) {
          await jsonResponse(route, 401, { code: 'UNAUTHENTICATED', status: 401 });
          return;
        }
        await jsonResponse(route, 200, { data: activeActor });
        return;
      }

      if (pathname === '/api/v1/auth/csrf' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, { data: { csrfToken: 'synthetic-csrf-token' } });
        return;
      }

      if (pathname === '/api/v1/auth/refresh' && method === 'POST') {
        handledRequests.push({ method, pathname });
        if (activeActor === null) {
          await jsonResponse(route, 401, { code: 'UNAUTHENTICATED', status: 401 });
          return;
        }
        await jsonResponse(route, 200, {
          data: { user: activeActor, csrfToken: 'synthetic-csrf-refreshed' },
        });
        return;
      }

      if (pathname === '/api/v1/categories' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, {
          data: categories,
          page: { limit: 100, nextCursor: null },
        });
        return;
      }

      if (pathname === '/api/v1/products' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, {
          data: products.map((product) => ({
            ...product,
            basePriceCents: String(product.priceCents),
            isAvailable: product.available,
          })),
          page: { limit: 100, nextCursor: null },
        });
        return;
      }

      const productOptionsMatch = pathname.match(/^\/api\/v1\/products\/([^/]+)\/options$/);
      if (productOptionsMatch && method === 'GET') {
        handledRequests.push({ method, pathname });
        const product = products.find((p) => p.id === productOptionsMatch[1]);
        if (!product) {
          await jsonResponse(route, 404, { code: 'NOT_FOUND', message: 'Producto no encontrado' });
          return;
        }
        await jsonResponse(route, 200, {
          data: product.hasOptions ? SYNTHETIC_OPTION_GROUPS : [],
        });
        return;
      }

      const productDetailMatch = pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
      if (productDetailMatch && method === 'GET') {
        handledRequests.push({ method, pathname });
        const product = products.find((p) => p.id === productDetailMatch[1]);
        if (!product) {
          await jsonResponse(route, 404, { code: 'NOT_FOUND', message: 'Producto no encontrado' });
          return;
        }
        await jsonResponse(route, 200, {
          data: {
            ...product,
            basePriceCents: String(product.priceCents),
            isAvailable: product.available,
          },
        });
        return;
      }

      if (pathname === '/api/v1/cash-sessions/current' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, { data: null });
        return;
      }

      if (pathname === '/api/v1/sales' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, {
          data: [],
          page: { limit: 20, nextCursor: null },
        });
        return;
      }

      if (pathname === '/api/v1/sales/summary' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, {
          data: { count: '0', totalCents: '0', cashCents: '0', stripeCents: '0' },
        });
        return;
      }

      if (pathname === '/api/v1/preparation/orders' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, {
          data: [],
          page: { limit: 20, nextCursor: null },
        });
        return;
      }

      if (pathname === '/api/v1/customers/me' && method === 'GET') {
        handledRequests.push({ method, pathname });
        if (activeActor === null || activeActor.role !== 'CLIENTE') {
          await jsonResponse(route, 401, { message: 'No autenticado' });
          return;
        }
        await jsonResponse(route, 200, {
          data: {
            id: activeActor.id,
            customerNumber: 'C0001',
            name: activeActor.name,
            phone: '5550000001',
            recoveryEmail: activeActor.email ?? null,
            recoveryEmailVerifiedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        });
        return;
      }

      if (pathname === '/api/v1/customers/me/favorites' && method === 'GET') {
        handledRequests.push({ method, pathname });
        if (activeActor === null || activeActor.role !== 'CLIENTE') {
          await jsonResponse(route, 401, { message: 'No autenticado' });
          return;
        }
        await jsonResponse(route, 200, { data: [] });
        return;
      }

      if (pathname === '/api/v1/customers/me/orders' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, { data: [] });
        return;
      }

      if (pathname === '/api/v1/favorites' && method === 'GET') {
        handledRequests.push({ method, pathname });
        await jsonResponse(route, 200, { data: [] });
        return;
      }
    }

    unhandledRequests.push({ method, url, pathname });
    await jsonResponse(route, 501, {
      code: 'UNMOCKED_API_REQUEST',
      detail: `Unmocked API request intercepted by visual harness: ${routeKey}`,
    });
  });

  return {
    unhandledRequests,
    handledRequests,
    setActor(actor: SyntheticActor | null) {
      activeActor = actor;
    },
    assertNoUnhandledRequests() {
      if (unhandledRequests.length > 0) {
        const formatted = unhandledRequests
          .map((req) => `${req.method} ${req.pathname} (${req.url})`)
          .join('; ');
        throw new Error(`Unmocked API request(s) detected: ${formatted}`);
      }
    },
  };
}
