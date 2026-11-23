import { beforeEach, describe, expect, test } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setCsrfToken } from '../../../shared/api/client';
import { server } from '../../../test/server';
import { UnverifiableAdminResponseError, adminQuery, deleteAdmin, getConfiguration, listAdmin, putConfiguration, writeAdmin } from './adminApi';

const category = { id: '1', name: 'Bebidas', isActive: true, deletedAt: null, createdAt: '2026-01-01T12:00:00.000Z' };
const product = {
  id: '2', categoryId: '1', name: 'Café', description: null, basePriceCents: '4500', imageUrl: null,
  imagePublicId: null, imageVersion: null, isAvailable: true, deletedAt: null,
  createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z',
};
const employee = { id: '3', name: 'Ana', username: 'ana_123', role: 'CAJERO', isActive: true };
const config = { groups: [{ groupId: '4', minSelections: 0, maxSelections: 1, values: [{ valueId: '5' }] }] };

beforeEach(() => setCsrfToken('admin-csrf'));

describe('administration API (TASK-19)', () => {
  test('lists strict pages with opaque pagination and includeDeleted only on catalog', async () => {
    const urls: string[] = [];
    server.use(http.get('/api/v1/admin/categories', ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json({ data: [category], page: { limit: 20, nextCursor: 'opaque-next' } });
    }));
    expect(adminQuery(true, 'opaque-next')).toBe('?limit=20&cursor=opaque-next&includeDeleted=true');
    expect((await listAdmin('categories', 'opaque-next', true)).items).toEqual([category]);
    expect(new URL(urls[0]).searchParams.get('includeDeleted')).toBe('true');
    server.use(http.get('/api/v1/admin/categories', () => HttpResponse.json({ data: [category], page: { limit: 20, nextCursor: null, extra: true } })));
    await expect(listAdmin('categories')).rejects.toBeInstanceOf(UnverifiableAdminResponseError);
    server.use(http.get('/api/v1/admin/categories', () => HttpResponse.json({ data: [{ ...category, passwordHash: 'secret' }], page: { limit: 20, nextCursor: null } })));
    await expect(listAdmin('categories')).rejects.toBeInstanceOf(UnverifiableAdminResponseError);
  });

  test('creates, updates, and deletes catalog with exact bodies, CSRF and verified IDs', async () => {
    const bodies: unknown[] = [];
    const tokens: Array<string | null> = [];
    server.use(
      http.post('/api/v1/admin/products', async ({ request }) => {
        bodies.push(await request.json()); tokens.push(request.headers.get('X-CSRF-Token'));
        return HttpResponse.json({ data: product }, { status: 201 });
      }),
      http.patch('/api/v1/admin/products/2', async ({ request }) => {
        bodies.push(await request.json()); tokens.push(request.headers.get('X-CSRF-Token'));
        return HttpResponse.json({ data: { ...product, name: 'Café nuevo' } });
      }),
      http.delete('/api/v1/admin/products/2', ({ request }) => {
        tokens.push(request.headers.get('X-CSRF-Token'));
        return HttpResponse.json({ data: { ...product, deletedAt: '2026-01-02T12:00:00.000Z' } });
      }),
    );
    expect((await writeAdmin('products', { name: 'Café', categoryId: '1', basePriceCents: '4500' })).id).toBe('2');
    expect((await writeAdmin('products', { name: 'Café nuevo' }, '2')).name).toBe('Café nuevo');
    expect((await deleteAdmin('products', '2')).deletedAt).not.toBeNull();
    expect(bodies).toEqual([{ name: 'Café', categoryId: '1', basePriceCents: '4500' }, { name: 'Café nuevo' }]);
    expect(tokens).toEqual(['admin-csrf', 'admin-csrf', 'admin-csrf']);

    server.use(http.patch('/api/v1/admin/products/2', () => HttpResponse.json({ data: { ...product, id: '6' } })));
    await expect(writeAdmin('products', { name: 'Café' }, '2')).rejects.toBeInstanceOf(UnverifiableAdminResponseError);
    server.use(http.patch('/api/v1/admin/products/2', () => HttpResponse.json({ data: product })));
    await expect(writeAdmin('products', { name: 'Café nuevo' }, '2')).rejects.toBeInstanceOf(UnverifiableAdminResponseError);
    await expect(writeAdmin('products', { name: 'Café', basePriceCents: '10000000' }, '2')).rejects.toBeInstanceOf(TypeError);
  });

  test('creates GLOBAL values with a global price and PER_PRODUCT values with null under their groups', async () => {
    const bodies: unknown[] = [];
    server.use(http.post('/api/v1/admin/option-groups/4/values', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: {
        id: '5', optionGroupId: '4', name: 'Grande', globalSurchargeCents: '500', isAvailable: true, deletedAt: null,
      } }, { status: 201 });
    }));
    expect((await writeAdmin('option-values', { name: 'Grande', globalSurchargeCents: '500', isAvailable: true }, undefined, '4')).id).toBe('5');
    expect(bodies).toEqual([{ name: 'Grande', globalSurchargeCents: '500', isAvailable: true }]);
    // Group 6 is PER_PRODUCT: its value must not carry a global surcharge.
    server.use(http.post('/api/v1/admin/option-groups/6/values', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: {
        id: '7', optionGroupId: '6', name: 'Extra', globalSurchargeCents: null, isAvailable: true, deletedAt: null,
      } }, { status: 201 });
    }));
    expect((await writeAdmin('option-values', { name: 'Extra', globalSurchargeCents: null, isAvailable: true }, undefined, '6')).id).toBe('7');
    expect(bodies.at(-1)).toEqual({ name: 'Extra', globalSurchargeCents: null, isAvailable: true });
    await expect(writeAdmin('option-values', { name: 'Grande' })).rejects.toBeInstanceOf(TypeError);
  });

  test('restricts employee writes to existing roles and never accepts password in a patch', async () => {
    const bodies: unknown[] = [];
    server.use(http.post('/api/v1/admin/employees', async ({ request }) => {
      bodies.push(await request.json()); return HttpResponse.json({ data: employee }, { status: 201 });
    }));
    await writeAdmin('employees', { name: 'Ana', username: 'ana_123', password: 'longpass123', role: 'CAJERO' });
    expect(bodies).toEqual([{ name: 'Ana', username: 'ana_123', password: 'longpass123', role: 'CAJERO' }]);
    await expect(writeAdmin('employees', { name: 'Ana', username: 'ana_123', password: 'longpass123', role: 'GERENTE' })).rejects.toBeInstanceOf(TypeError);
    await expect(writeAdmin('employees', { name: 'Ana', username: 'ana_123', password: 'longpass123', role: 'CAJERO', isActive: true })).rejects.toBeInstanceOf(TypeError);
    await expect(writeAdmin('employees', { password: 'longpass123', reason: 'Cambio' }, '3')).rejects.toBeInstanceOf(TypeError);
  });

  test('validates complete configuration before PUT and rejects unverifiable success', async () => {
    server.use(http.get('/api/v1/admin/products/2/configuration', () => HttpResponse.json({ data: config })));
    expect(await getConfiguration('2')).toEqual(config);
    const sent: unknown[] = [];
    server.use(http.put('/api/v1/admin/products/2/configuration', async ({ request }) => {
      sent.push(await request.json()); return HttpResponse.json({ data: config });
    }));
    expect(await putConfiguration('2', config)).toEqual(config);
    expect(sent).toEqual([config]);
    await expect(putConfiguration('2', { groups: [{ ...config.groups[0], minSelections: 2 }] })).rejects.toBeInstanceOf(TypeError);
    server.use(http.put('/api/v1/admin/products/2/configuration', () => HttpResponse.json({ data: { groups: [], secret: true } })));
    await expect(putConfiguration('2', config)).rejects.toBeInstanceOf(UnverifiableAdminResponseError);
    server.use(http.put('/api/v1/admin/products/2/configuration', () => HttpResponse.json({ data: { groups: [] } })));
    await expect(putConfiguration('2', config)).rejects.toBeInstanceOf(UnverifiableAdminResponseError);
  });
});
