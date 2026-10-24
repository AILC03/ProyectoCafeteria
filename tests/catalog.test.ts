import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { CatalogRepository } from '../src/modules/catalog/catalog.types.js';
import { decodeCursor, paginate } from '../src/shared/http/pagination.js';
import { jsonValue } from '../src/shared/http/serialization.js';

const repository: CatalogRepository = {
  async listCategories() {
    return [];
  },
  async listProducts() {
    return [];
  },
  async getProduct() {
    return null;
  },
  async getOptions() {
    return null;
  },
};
const app = () => createApp({ catalogRepository: repository });

describe('base HTTP y validación de catálogo', () => {
  it('lista vacía tiene envoltura y página', async () => {
    const response = await request(app()).get('/api/v1/products');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], page: { limit: 20, nextCursor: null } });
  });
  it.each([
    'limit=101',
    'limit=0',
    'limit=abc',
    'limit=1&limit=2',
    'categoryId=0',
    'categoryId=9223372036854775808',
    'isAvailable=1',
    'unknown=1',
    'cursor=***',
  ])('rechaza %s', async (query) => {
    const response = await request(app()).get(`/api/v1/products?${query}`);
    expect(response.status).toBe(400);
    expect(response.type).toBe('application/problem+json');
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });
  it.each(['0', '-1', 'abc', '9223372036854775808'])('rechaza ID %s', async (id) => {
    expect((await request(app()).get(`/api/v1/products/${id}`)).status).toBe(400);
  });
  it('detalle ausente produce 404', async () => {
    expect((await request(app()).get('/api/v1/products/1')).body.code).toBe('NOT_FOUND');
  });
  it('ruta con encoding inválido produce 400', async () => {
    expect((await request(app()).get('/api/v1/products/%ZZ')).status).toBe(400);
  });
  it('no registra ni devuelve mensajes SQL del proveedor', async () => {
    const failing = {
      ...repository,
      async getProduct(): Promise<null> {
        throw Object.assign(new Error('secret SQL password=NO'), { code: 'P1001' });
      },
    };
    const response = await request(createApp({ catalogRepository: failing })).get(
      '/api/v1/products/1',
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
  it('fallo inesperado devuelve 500 saneado', async () => {
    const failing = {
      ...repository,
      async listCategories(): Promise<[]> {
        throw new Error('PRIVATE_DATABASE_MESSAGE');
      },
    };
    const response = await request(createApp({ catalogRepository: failing })).get(
      '/api/v1/categories',
    );
    expect(response.status).toBe(500);
    expect(response.body.detail).not.toContain('PRIVATE_DATABASE_MESSAGE');
  });
  it('CORS permite solo el origen configurado', async () => {
    const allowed = await request(app())
      .get('/api/v1/categories')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app())
      .get('/api/v1/categories')
      .set('Origin', 'https://evil.example');
    expect(denied.status).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('cabeceras seguras y sin x-powered-by', async () => {
    const response = await request(app()).get('/api/v1/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
  it('JSON inválido se trata como 400', async () => {
    const response = await request(app())
      .post('/api/v1/unknown')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(response.status).toBe(400);
  });
  it('entrada superior a 256 KiB produce 413', async () => {
    const response = await request(app())
      .post('/api/v1/unknown')
      .send({ text: 'x'.repeat(262144) });
    expect(response.status).toBe(413);
  });
  it('límite público devuelve 429 y health permanece disponible', async () => {
    const limited = createApp({ catalogRepository: repository, catalogRateLimit: 1 });
    expect((await request(limited).get('/api/v1/categories')).status).toBe(200);
    expect((await request(limited).get('/api/v1/categories')).status).toBe(429);
    expect((await request(limited).get('/api/v1/health')).status).toBe(200);
  });
  it('serializa BIGINT y fechas sin perder precisión', () => {
    expect(jsonValue({ id: 9007199254740993n, at: new Date('2026-01-01T00:00:00Z') })).toEqual({
      id: '9007199254740993',
      at: '2026-01-01T00:00:00.000Z',
    });
  });
  it('cursor conserva microsegundos y no se reutiliza entre filtros/recursos', () => {
    const position = { id: '9007199254740993', createdAt: '2026-01-01T00:00:00.123456Z' };
    const page = paginate(
      [
        { data: 1, position },
        { data: 2, position },
      ],
      1,
      'products',
      'filters',
    );
    expect(decodeCursor(page.page.nextCursor!, 'products', 'filters')).toEqual(position);
    expect(() => decodeCursor(page.page.nextCursor!, 'products', 'other')).toThrow();
    expect(() => decodeCursor(page.page.nextCursor!, 'categories', 'filters')).toThrow();
  });
});
