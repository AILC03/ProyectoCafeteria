import { beforeEach, describe, expect, test } from 'vitest';
import { HttpResponse, http } from 'msw';
import { ApiError, setCsrfToken } from '../../../shared/api/client';
import { server } from '../../../test/server';
import {
  UnverifiableAvailabilityResponseError,
  formatAvailabilityError,
  listAvailabilityProducts,
  setProductAvailability,
} from './availabilityApi';

const catalogProduct = {
  id: '10', categoryId: '1', name: 'Latte', description: null,
  basePriceCents: '6500', imageUrl: null, isAvailable: true,
};
const adminProduct = {
  ...catalogProduct,
  imagePublicId: null,
  imageVersion: null,
  deletedAt: null,
  createdAt: '2099-01-01T12:00:00.000Z',
  updatedAt: '2099-01-01T12:00:00.000Z',
};

beforeEach(() => { setCsrfToken('csrf-test'); });

describe('availability API (TASK-18)', () => {
  test('lists active products including sold out ones with strict parsing', async () => {
    server.use(http.get('/api/v1/products', () => HttpResponse.json({
      data: [catalogProduct, { ...catalogProduct, id: '11', name: 'Café', isAvailable: false }],
      page: { limit: 100, nextCursor: null },
    })));
    const products = await listAvailabilityProducts();
    expect(products).toEqual([
      { id: '10', name: 'Latte', basePriceCents: '6500', isAvailable: true },
      { id: '11', name: 'Café', basePriceCents: '6500', isAvailable: false },
    ]);

    server.use(http.get('/api/v1/products', () => HttpResponse.json({
      data: [{ ...catalogProduct, customerId: '3' }],
      page: { limit: 100, nextCursor: null },
    })));
    await expect(listAvailabilityProducts()).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
    server.use(http.get('/api/v1/products', () => HttpResponse.json({
      data: [catalogProduct], page: { limit: 100, nextCursor: null }, surprise: true,
    })));
    await expect(listAvailabilityProducts()).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
    server.use(http.get('/api/v1/products', () => HttpResponse.json({
      data: [catalogProduct], page: { limit: 100, nextCursor: null, surprise: true },
    })));
    await expect(listAvailabilityProducts()).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
  });

  test('sends exactly isAvailable with CSRF and applies only a verified response', async () => {
    const bodies: unknown[] = [];
    const headers: Array<string | null> = [];
    server.use(http.patch('/api/v1/products/10/availability', async ({ request }) => {
      bodies.push(await request.json());
      headers.push(request.headers.get('X-CSRF-Token'));
      return HttpResponse.json({ data: { ...adminProduct, isAvailable: false } });
    }));
    const result = await setProductAvailability('10', false);
    expect(result.isAvailable).toBe(false);
    expect(bodies).toEqual([{ isAvailable: false }]);
    expect(headers).toEqual(['csrf-test']);

    server.use(http.patch('/api/v1/products/10/availability', () => HttpResponse.json({ data: adminProduct, extra: 'x' })));
    await expect(setProductAvailability('10', true)).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
    server.use(http.patch('/api/v1/products/10/availability', () => HttpResponse.json({ data: { ...adminProduct, isAvailable: 'false' } })));
    await expect(setProductAvailability('10', false)).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
    server.use(http.patch('/api/v1/products/10/availability', () => HttpResponse.json({ data: { ...adminProduct, id: '11', isAvailable: false } })));
    await expect(setProductAvailability('10', false)).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
    server.use(http.patch('/api/v1/products/10/availability', () => HttpResponse.json({ data: adminProduct })));
    await expect(setProductAvailability('10', false)).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
    server.use(http.patch('/api/v1/products/10/availability', () => HttpResponse.json({ data: { ...adminProduct, basePriceCents: '10000000' } })));
    await expect(setProductAvailability('10', true)).rejects.toBeInstanceOf(UnverifiableAvailabilityResponseError);
  });

  test('rejects invalid input and maps denied or conflicting responses', async () => {
    await expect(setProductAvailability('0', true)).rejects.toBeInstanceOf(TypeError);
    await expect(setProductAvailability('10', 'true' as unknown as boolean)).rejects.toBeInstanceOf(TypeError);

    server.use(http.patch('/api/v1/products/11/availability', () => HttpResponse.json({ status: 403, code: 'FORBIDDEN', title: 'Denegado' }, { status: 403 })));
    await expect(setProductAvailability('11', false)).rejects.toMatchObject({ status: 403 });
    expect(formatAvailabilityError(new ApiError(403, 'denied', { code: 'FORBIDDEN' }))).toMatch(/sólo caja y administración/i);
    expect(formatAvailabilityError(new ApiError(404, 'missing'))).toMatch(/ya no existe/i);
  });
});
