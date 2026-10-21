import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { createDatabase } from '../../src/config/database.js';
import { createApp } from '../../src/app.js';
import { PrismaCatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { seedDemo } from '../../scripts/lib/demo-data.js';

// El runner asigna una base recién creada y desechable; jamás apuntar a desarrollo.
const target = process.env.CATALOG_TEST_DATABASE_URL;
describe.skipIf(!target)('catálogo con PostgreSQL real', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: ReturnType<typeof createApp>;
  let latte: string;
  let americano: string;
  let water: string;
  let retired: string;
  const ajv = new Ajv({ strict: false });
  addFormats.default(ajv);
  // El esquema de la operación se obtiene del contrato versionado, no de una copia.
  let api: Awaited<ReturnType<typeof SwaggerParser.dereference>>;
  beforeAll(async () => {
    const url = new URL(target!);
    if (
      !/^\/cafeteria_catalog_[a-f0-9]{12}$/.test(url.pathname) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new Error('Destino de integración inseguro.');
    db = createDatabase(url.href);
    await seedDemo(db);
    const counts = await db.product.count();
    await seedDemo(db);
    expect(await db.product.count()).toBe(counts);
    const products = await db.product.findMany();
    latte = products.find((p) => p.name === 'Latte (demo)')!.id.toString();
    americano = products.find((p) => p.name === 'Americano (demo)')!.id.toString();
    water = products.find((p) => p.name === 'Agua (demo)')!.id.toString();
    await db.product.update({ where: { id: BigInt(americano) }, data: { isAvailable: false } });
    const category = await db.category.findFirstOrThrow({ where: { name: 'Café (demo)' } });
    retired = (
      await db.product.create({
        data: {
          name: 'Retirado',
          categoryId: category.id,
          basePriceCents: 100n,
          deletedAt: new Date(),
        },
      })
    ).id.toString();
    const inactive = await db.category.create({ data: { name: 'Inactiva', isActive: false } });
    await db.product.create({
      data: { name: 'Invisible', categoryId: inactive.id, basePriceCents: 100n },
    });
    await db.product.create({
      data: {
        id: 9007199254740993n,
        name: 'ID amplio',
        categoryId: category.id,
        basePriceCents: 123n,
      },
    });
    // Misma fracción de milisegundo, microsegundos diferentes: sin duplicar ni saltar.
    await db.$executeRaw`UPDATE products SET created_at='2026-01-01T00:00:00.123456Z'::timestamptz WHERE id=${BigInt(latte)}`;
    await db.$executeRaw`UPDATE products SET created_at='2026-01-01T00:00:00.123457Z'::timestamptz WHERE id=${BigInt(americano)}`;
    app = createApp({ catalogRepository: new PrismaCatalogRepository(db), catalogRateLimit: 1000 });
    api = await SwaggerParser.dereference('docs/api/openapi.yaml');
  }, 30000);
  afterAll(async () => {
    await db?.$disconnect();
  });
  it('seed repetible no duplica roles ni menú', async () => {
    expect(await db.role.count()).toBe(4);
    expect(await db.product.count({ where: { name: { endsWith: '(demo)' } } })).toBe(4);
  });
  it('categorías inactivas no aparecen', async () => {
    const response = await request(app).get('/api/v1/categories');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
  });
  it('oculta bajas y categorías inactivas pero muestra agotados', async () => {
    const response = await request(app).get('/api/v1/products');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.data.find((p: { id: string }) => p.id === americano).isAvailable).toBe(
      false,
    );
    expect(response.body.data.some((p: { id: string }) => p.id === retired)).toBe(false);
  });
  it('filtro isAvailable=false devuelve solo agotados', async () => {
    const response = await request(app).get('/api/v1/products?isAvailable=false');
    expect(response.body.data.map((p: { id: string }) => p.id)).toEqual([americano]);
  });
  it('filtro por categoría y lista vacía válidos', async () => {
    const product = await db.product.findUniqueOrThrow({ where: { id: BigInt(water) } });
    const response = await request(app).get(`/api/v1/products?categoryId=${product.categoryId}`);
    expect(response.body.data.map((p: { id: string }) => p.id)).toEqual([water]);
    expect((await request(app).get('/api/v1/products?categoryId=999999')).body.data).toEqual([]);
  });
  it('paginar de uno en uno no duplica ni pierde filas con microsegundos', async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const response = await request(app).get(
        `/api/v1/products?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(response.status).toBe(200);
      ids.push(...response.body.data.map((p: { id: string }) => p.id));
      cursor = response.body.page.nextCursor;
      if (!cursor) break;
    }
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids.slice(0, 2)).toEqual([latte, americano]);
  });
  it('cursor de otros filtros se rechaza', async () => {
    const first = await request(app).get('/api/v1/products?limit=1');
    const response = await request(app).get(
      `/api/v1/products?isAvailable=false&cursor=${first.body.page.nextCursor}`,
    );
    expect(response.status).toBe(400);
  });
  it('detalle no visible 404 y agua sin personalización []', async () => {
    expect((await request(app).get(`/api/v1/products/${retired}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/products/${retired}/options`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/products/${water}/options`)).body).toEqual({
      data: [],
    });
  });
  it('IDs mayores a Number.MAX_SAFE_INTEGER salen exactos', async () => {
    const response = await request(app).get('/api/v1/products/9007199254740993');
    expect(response.body.data.id).toBe('9007199254740993');
    expect(response.body.data.basePriceCents).toBe('123');
  });
  it('resuelve tamaños por producto y precio global de leche', async () => {
    const one = (await request(app).get(`/api/v1/products/${latte}/options`)).body.data;
    const two = (await request(app).get(`/api/v1/products/${americano}/options`)).body.data;
    type Group = { name: string; values: { name: string; surchargeCents: string }[] };
    const price = (groups: Group[], group: string, value: string) =>
      groups.find((g) => g.name === group)?.values.find((v) => v.name === value)?.surchargeCents;
    expect(price(one, 'Tamaño (demo)', 'Grande')).toBe('2000');
    expect(price(two, 'Tamaño (demo)', 'Grande')).toBe('1000');
    expect(price(one, 'Leche (demo)', 'Almendra')).toBe('1000');
  });
  it('las cuatro respuestas cumplen OpenAPI', async () => {
    const paths = [
      ['/api/v1/categories', '/api/v1/categories'],
      ['/api/v1/products', '/api/v1/products'],
      ['/api/v1/products/{productId}', `/api/v1/products/${latte}`],
      ['/api/v1/products/{productId}/options', `/api/v1/products/${latte}/options`],
    ];
    // OpenAPI dereferenciado; tipos de SwaggerParser incluyen variantes OAS 2/3.
    const contract = api as unknown as {
      paths: Record<
        string,
        { get: { responses: Record<string, { content: Record<string, { schema: object }> }> } }
      >;
    };
    for (const [path, url] of paths) {
      const schema =
        contract.paths[path!]!.get.responses['200']!.content['application/json']!.schema;
      const validate = ajv.compile(schema);
      const response = await request(app).get(url!);
      expect(validate(response.body), JSON.stringify(validate.errors)).toBe(true);
    }
  });
  it('opción agotada visible y opción retirada oculta', async () => {
    const value = await db.optionValue.findFirstOrThrow({ where: { name: 'Vainilla' } });
    await db.optionValue.update({ where: { id: value.id }, data: { isAvailable: false } });
    const visible = await request(app).get(`/api/v1/products/${latte}/options`);
    type Group = { values: { id: string; isAvailable: boolean }[] };
    expect(
      visible.body.data
        .flatMap((g: Group) => g.values)
        .find((v: { id: string }) => v.id === value.id.toString()).isAvailable,
    ).toBe(false);
    await db.optionValue.update({ where: { id: value.id }, data: { deletedAt: new Date() } });
    const hidden = await request(app).get(`/api/v1/products/${latte}/options`);
    expect(
      hidden.body.data
        .flatMap((g: Group) => g.values)
        .some((v: { id: string }) => v.id === value.id.toString()),
    ).toBe(false);
  });
  it('configuración de precio incompleta no filtra información SQL', async () => {
    const value = await db.optionValue.findFirstOrThrow({ where: { name: 'Almendra' } });
    await db.optionValue.update({ where: { id: value.id }, data: { globalSurchargeCents: null } });
    try {
      const response = await request(app).get(`/api/v1/products/${latte}/options`);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('DEPENDENCY_UNAVAILABLE');
    } finally {
      await db.optionValue.update({
        where: { id: value.id },
        data: { globalSurchargeCents: 1000n },
      });
    }
  });
});
