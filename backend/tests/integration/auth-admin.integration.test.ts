import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { hash, verify, argon2id } from 'argon2';
import jwt from 'jsonwebtoken';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { createDatabase } from '../../src/config/database.js';
import { createApp } from '../../src/app.js';
import { seedDemo } from '../../scripts/lib/demo-data.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { AuthConfig } from '../../src/modules/auth/auth.types.js';
import { AdminRepository } from '../../src/modules/catalog/admin.repository.js';
import { AdminService } from '../../src/modules/catalog/admin.service.js';
import { PrismaCatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { ImageService, cleanupImages } from '../../src/modules/catalog/image.service.js';
import type { ImageProvider, ImageAsset } from '../../src/modules/catalog/image.provider.js';

const target = process.env.CATALOG_TEST_DATABASE_URL;
type Jar = Record<string, string>;
const origin = 'http://localhost:5173',
  password = 'ExamplePassword42';
function capture(headers: Record<string, unknown>, jar: Jar) {
  const raw = headers['set-cookie'];
  for (const line of typeof raw === 'string'
    ? [raw]
    : Array.isArray(raw)
      ? (raw as string[])
      : []) {
    const pair = line.split(';')[0] ?? '',
      at = pair.indexOf('=');
    if (at > 0) {
      const name = pair.slice(0, at),
        value = pair.slice(at + 1);
      if (value) jar[name] = value;
      else delete jar[name];
    }
  }
}
const cookies = (jar: Jar) =>
  Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
describe.skipIf(!target)('auth y administración con PostgreSQL real', () => {
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    admin: AdminService,
    app: ReturnType<typeof createApp>;
  let time = Date.now();
  const now = () => new Date(time);
  const config: AuthConfig = {
    jwtSecret: 'a'.repeat(64),
    csrfSecret: 'b'.repeat(64),
    issuer: 'test-api',
    audience: 'test-web',
    secure: false,
    origin,
    ipLimit: 100,
  };
  let imageFail = false,
    destroyFail = false;
  const assets = new Map<string, ImageAsset>(),
    deleted: string[] = [];
  const provider: ImageProvider = {
    authorize(publicId, timestamp) {
      return { public_id: publicId, timestamp, signature: 'test-not-real' };
    },
    async inspect(publicId) {
      if (imageFail) throw new Error('Simulated provider failure');
      return (
        assets.get(publicId) ?? {
          publicId,
          version: String(time),
          url: `https://res.cloudinary.com/test/image/upload/${publicId}`,
          bytes: 1024,
          width: 200,
          height: 200,
          format: 'png',
          resourceType: 'image',
        }
      );
    },
    async destroy(publicId) {
      if (destroyFail) throw new Error('Simulated cleanup failure');
      deleted.push(publicId);
    },
  };
  let latte: string, adminId: bigint;
  let contract: {
    paths: Record<
      string,
      Record<
        string,
        { responses: Record<string, { content?: Record<string, { schema: object }> }> }
      >
    >;
  };
  const ajv = new Ajv({ strict: false });
  addFormats.default(ajv);
  function conform(path: string, method: string, status: string, body: unknown) {
    const schema =
      contract.paths[path]![method]!.responses[status]!.content!['application/json']!.schema;
    const validate = ajv.compile(schema);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  beforeAll(async () => {
    const url = new URL(target!);
    if (
      !/^\/cafeteria_catalog_[a-f0-9]{12}$/.test(url.pathname) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new Error('Destino inseguro');
    db = createDatabase(url.href);
    await seedDemo(db);
    const passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    for (const [username, role] of [
      ['admin.test', 'ADMINISTRADOR'],
      ['cashier.test', 'CAJERO'],
      ['prep.test', 'PREPARACION'],
      ['blocked.test', 'CAJERO'],
      ['change.test', 'CAJERO'],
    ]) {
      const found = await db.role.findUniqueOrThrow({ where: { name: role } });
      const user = await db.user.create({
        data: {
          accountType: 'STAFF',
          roleId: found.id,
          name: username!,
          username: username!,
          passwordHash,
        },
      });
      if (role === 'ADMINISTRADOR') adminId = user.id;
    }
    const role = await db.role.findUniqueOrThrow({ where: { name: 'CLIENTE' } });
    for (const [number, phone, forced] of [
      ['C000099', '+526641111111', false],
      ['C000100', '+526641111112', true],
    ] as const) {
      await db.user.create({
        data: {
          accountType: 'CUSTOMER',
          roleId: role.id,
          name: 'Cliente ficticio',
          customerNumber: number,
          phone,
          pinHash: await hash('0007', {
            type: argon2id,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          }),
          mustChangePin: forced,
        },
      });
    }
    auth = new AuthService(new AuthRepository(db), config, now);
    admin = new AdminService(new AdminRepository(db), now);
    app = createApp({
      authService: auth,
      adminService: admin,
      imageService: new ImageService(admin, provider, now),
      catalogRepository: new PrismaCatalogRepository(db),
      catalogRateLimit: 10000,
    });
    contract = (await SwaggerParser.dereference(
      'docs/api/openapi.yaml',
    )) as unknown as typeof contract;
    latte = (await db.product.findFirstOrThrow({ where: { name: 'Latte (demo)' } })).id.toString();
  }, 30000);
  afterAll(async () => {
    await db?.$disconnect();
  });
  async function bootstrap(jar: Jar) {
    const response = await request(app)
      .get('/api/v1/auth/csrf')
      .set('Origin', origin)
      .set('Cookie', cookies(jar));
    capture(response.headers, jar);
    expect(response.status).toBe(200);
    return response.body.data.csrfToken as string;
  }
  async function login(username = 'admin.test', jar: Jar = {}, secret = password) {
    const csrf = await bootstrap(jar);
    const response = await request(app)
      .post('/api/v1/auth/login/staff')
      .set('Origin', origin)
      .set('Cookie', cookies(jar))
      .set('X-CSRF-Token', csrf)
      .send({ username, password: secret });
    capture(response.headers, jar);
    return { response, jar };
  }
  function mutate(
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    jar: Jar,
    body: object = {},
  ) {
    const client = request(app);
    return client[method](path)
      .set('Origin', origin)
      .set('Cookie', cookies(jar))
      .set('X-CSRF-Token', jar.caf_csrf ?? '')
      .send(body);
  }
  it('login Argon2id emite cookies y DTO sin token JSON', async () => {
    const { response, jar } = await login();
    expect(response.status).toBe(200);
    conform('/api/v1/auth/login/staff', 'post', '200', response.body);
    expect(response.body.data.user.role).toBe('ADMINISTRADOR');
    expect(response.body.data.token).toBeUndefined();
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(jar.caf_access).toBeTruthy();
    expect(jar.caf_refresh).toBeTruthy();
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(response.headers['set-cookie'])).toContain('SameSite=Lax');
    const decoded = jwt.decode(jar.caf_access!) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(900);
    expect(decoded.sid).toBeTruthy();
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookies(jar))).status).toBe(
      200,
    );
    expect(
      (await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${jar.caf_access}`))
        .status,
    ).toBe(401);
  });
  it('login y mutaciones exigen Origin y CSRF', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login/staff')
          .send({ username: 'admin.test', password })
      ).status,
    ).toBe(403);
    const { jar } = await login();
    expect(
      (
        await request(app)
          .post('/api/v1/admin/categories')
          .set('Cookie', cookies(jar))
          .send({ name: 'No permitido' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/admin/categories')
          .set('Origin', 'https://evil.example')
          .set('Cookie', cookies(jar))
          .set('X-CSRF-Token', jar.caf_csrf!)
          .send({ name: 'No permitido' })
      ).status,
    ).toBe(403);
  });
  it('cliente usa teléfono o número y NIP con ceros', async () => {
    for (const identifier of ['6641111111', 'C000099']) {
      const jar: Jar = {},
        csrf = await bootstrap(jar);
      const response = await request(app)
        .post('/api/v1/auth/login/customer')
        .set('Origin', origin)
        .set('Cookie', cookies(jar))
        .set('X-CSRF-Token', csrf)
        .send({ identifier, pin: '0007' });
      expect(response.status).toBe(200);
      expect(response.body.data.user.role).toBe('CLIENTE');
    }
  });
  it('JWT válido no permite acceder después de baja', async () => {
    const { jar } = await login('prep.test');
    await db.user.update({ where: { username: 'prep.test' }, data: { isActive: false } });
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookies(jar))).status).toBe(
      401,
    );
    await db.user.update({ where: { username: 'prep.test' }, data: { isActive: true } });
  });
  it('cinco fallos concurrentes bloquean persistentemente', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        auth
          .login('staff', 'blocked.test', 'IncorrectSecret42', `ip-${i}`)
          .catch((error: unknown) => error),
      ),
    );
    expect(results.every((result) => result instanceof Error)).toBe(true);
    expect(
      await db.authAttemptLimit.count({ where: { blockedUntil: { gt: now() } } }),
    ).toBeGreaterThan(0);
    const restarted = new AuthService(new AuthRepository(db), config, now);
    await expect(
      restarted.login('staff', 'blocked.test', password, 'fresh-ip'),
    ).rejects.toMatchObject({ status: 429 });
    time += 15 * 60000 + 1;
    await expect(
      restarted.login('staff', 'blocked.test', password, 'fresh-ip'),
    ).resolves.toHaveProperty('access');
  });
  it('el límite IP también es persistente y cubre cuentas inexistentes', async () => {
    const limited = new AuthService(new AuthRepository(db), { ...config, ipLimit: 2 }, now);
    for (let i = 0; i < 2; i++)
      await expect(
        limited.login('staff', `missing-${i}`, password, 'limited-ip'),
      ).rejects.toMatchObject({ status: 401 });
    const restarted = new AuthService(new AuthRepository(db), { ...config, ipLimit: 2 }, now);
    await expect(
      restarted.login('staff', 'admin.test', password, 'limited-ip'),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('refresh concurrente: éxito y 409 sin Set-Cookie; reuso revoca', async () => {
    const { jar } = await login();
    const original = { ...jar };
    const responses = await Promise.all([
      mutate('post', '/api/v1/auth/refresh', original),
      mutate('post', '/api/v1/auth/refresh', original),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)!.headers['set-cookie']).toBeUndefined();
    const next = { ...original };
    capture(responses.find((r) => r.status === 200)!.headers, next);
    time += 6001;
    expect((await mutate('post', '/api/v1/auth/refresh', original)).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookies(next))).status).toBe(
      401,
    );
  });
  it('logout revoca la familia aun con JWT anterior firmado', async () => {
    const { jar } = await login();
    const old = { ...jar };
    expect((await mutate('post', '/api/v1/auth/logout', jar)).status).toBe(204);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookies(old))).status).toBe(
      401,
    );
    expect((await mutate('post', '/api/v1/auth/refresh', old)).status).toBe(401);
  });
  it('must_change_pin solo permite cambio/logout y revoca sesiones', async () => {
    const jar: Jar = {},
      csrf = await bootstrap(jar);
    const response = await request(app)
      .post('/api/v1/auth/login/customer')
      .set('Origin', origin)
      .set('Cookie', cookies(jar))
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'C000100', pin: '0007' });
    capture(response.headers, jar);
    expect(response.status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookies(jar))).status).toBe(
      403,
    );
    expect((await mutate('post', '/api/v1/auth/refresh', jar)).status).toBe(403);
    expect(
      (await mutate('patch', '/api/v1/auth/pin', jar, { currentPin: '0007', newPin: '0008' }))
        .status,
    ).toBe(204);
    const user = await db.user.findUniqueOrThrow({ where: { customerNumber: 'C000100' } });
    expect(user.mustChangePin).toBe(false);
    expect(await verify(user.pinHash!, '0008')).toBe(true);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookies(jar))).status).toBe(
      401,
    );
  });
  it('cambiar contraseña revoca todas las sesiones del usuario', async () => {
    const first = await login('change.test'),
      second = await login('change.test');
    expect(
      (
        await mutate('patch', '/api/v1/auth/password', first.jar, {
          currentPassword: password,
          newPassword: 'ReplacementSecret42',
        })
      ).status,
    ).toBe(204);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', cookies(second.jar))).status,
    ).toBe(401);
    const user = await db.user.findUniqueOrThrow({ where: { username: 'change.test' } });
    expect(await verify(user.passwordHash!, 'ReplacementSecret42')).toBe(true);
  });
  it('admin CRUD y cajero solo disponibilidad', async () => {
    const owner = await login(),
      cashier = await login('cashier.test'),
      prep = await login('prep.test');
    const created = await mutate('post', '/api/v1/admin/categories', owner.jar, {
      name: 'Categoría API',
    });
    expect(created.status).toBe(201);
    const categoryId = created.body.data.id;
    conform('/api/v1/admin/categories', 'post', '201', created.body);
    const product = await mutate('post', '/api/v1/admin/products', owner.jar, {
      name: 'Producto API',
      categoryId,
      basePriceCents: '5500',
    });
    expect(product.status).toBe(201);
    const id = product.body.data.id;
    conform('/api/v1/admin/products', 'post', '201', product.body);
    expect(
      (
        await mutate('patch', `/api/v1/products/${id}/availability`, cashier.jar, {
          isAvailable: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate('patch', `/api/v1/products/${id}/availability`, cashier.jar, {
          isAvailable: true,
          basePriceCents: '1',
        })
      ).status,
    ).toBe(400);
    expect(
      (await mutate('patch', `/api/v1/admin/products/${id}`, cashier.jar, { name: 'No' })).status,
    ).toBe(403);
    expect(
      (
        await mutate('patch', `/api/v1/products/${id}/availability`, prep.jar, {
          isAvailable: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (await mutate('delete', `/api/v1/admin/categories/${categoryId}`, owner.jar)).status,
    ).toBe(409);
    expect((await mutate('delete', `/api/v1/admin/products/${id}`, owner.jar)).status).toBe(200);
    expect((await request(app).get(`/api/v1/products/${id}`)).status).toBe(404);
    expect(
      (await mutate('delete', `/api/v1/admin/categories/${categoryId}`, owner.jar)).status,
    ).toBe(409);
    expect(await db.auditEvent.count({ where: { actorId: adminId } })).toBeGreaterThan(0);
  });
  it('cliente e invitado no administran; claims de rol no dan privilegios', async () => {
    expect((await request(app).get('/api/v1/admin/products')).status).toBe(401);
    const client = await auth.login('customer', 'C000099', '0007', 'client-role-ip');
    expect(
      (
        await request(app)
          .get('/api/v1/admin/products')
          .set(
            'Cookie',
            cookies({
              caf_access: client.access,
              caf_refresh: client.refresh,
              caf_csrf: client.csrf,
            }),
          )
      ).status,
    ).toBe(403);
    const { jar } = await login('cashier.test');
    const original = jwt.decode(jar.caf_access!) as jwt.JwtPayload;
    const forgedRole = jwt.sign({ ...original, role: 'ADMINISTRADOR' }, config.jwtSecret, {
      algorithm: 'HS256',
    });
    expect(
      (
        await request(app)
          .get('/api/v1/admin/products')
          .set('Cookie', cookies({ ...jar, caf_access: forgedRole }))
      ).status,
    ).toBe(403);
  });
  it('editar y retirar producto no reescribe snapshots históricos', async () => {
    const { jar } = await login();
    const category = await db.category.findFirstOrThrow({ where: { name: 'Café (demo)' } });
    const product = await db.product.create({
      data: { name: 'Producto histórico', categoryId: category.id, basePriceCents: 6500n },
    });
    const order = await db.order.create({
      data: {
        folio: 'HISTORY-TEST',
        source: 'MOBILE',
        paymentMethod: 'STRIPE',
        status: 'EN_PREPARACION',
        totalCents: 6500n,
        paidAt: now(),
        paymentExpiresAt: new Date(time + 1800000),
      },
    });
    const item = await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        productNameSnapshot: product.name,
        basePriceCentsSnapshot: 6500n,
        unitPriceCents: 6500n,
        quantity: 1,
        lineTotalCents: 6500n,
      },
    });
    expect(
      (
        await mutate('patch', `/api/v1/admin/products/${product.id}`, jar, {
          name: 'Nombre nuevo',
          basePriceCents: '7000',
        })
      ).status,
    ).toBe(200);
    expect((await mutate('delete', `/api/v1/admin/products/${product.id}`, jar)).status).toBe(200);
    const historical = await db.orderItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(historical.productNameSnapshot).toBe('Producto histórico');
    expect(historical.unitPriceCents).toBe(6500n);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } })).deletedAt,
    ).not.toBeNull();
  });
  it('precios, pertenencia y mínimos no dejan escrituras parciales', async () => {
    const { jar } = await login();
    const original = await request(app)
      .get(`/api/v1/admin/products/${latte}/configuration`)
      .set('Cookie', cookies(jar));
    expect(original.status).toBe(200);
    const body = original.body.data as {
      groups: {
        groupId: string;
        minSelections: number;
        maxSelections: number;
        values: { valueId: string; surchargeOverrideCents: string | null }[];
      }[];
    };
    const invalid = structuredClone(body);
    invalid.groups[0]!.values[0]!.surchargeOverrideCents = null;
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/configuration`, jar, invalid)).status,
    ).toBe(409);
    const wrongGroup = structuredClone(body);
    wrongGroup.groups[0]!.values[0]!.valueId = (
      await db.optionValue.findFirstOrThrow({ where: { name: 'Entera' } })
    ).id.toString();
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/configuration`, jar, wrongGroup))
        .status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .get(`/api/v1/admin/products/${latte}/configuration`)
          .set('Cookie', cookies(jar))
      ).body,
    ).toEqual(original.body);
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/configuration`, jar, body)).status,
    ).toBe(200);
    const milk = await db.optionValue.findFirstOrThrow({ where: { name: 'Entera' } });
    const almond = await db.optionValue.findFirstOrThrow({ where: { name: 'Almendra' } });
    expect(
      (await mutate('patch', `/api/v1/admin/option-values/${milk.id}`, jar, { isAvailable: false }))
        .status,
    ).toBe(200);
    expect((await mutate('delete', `/api/v1/admin/option-values/${almond.id}`, jar)).status).toBe(
      409,
    );
    expect(
      (await mutate('patch', `/api/v1/admin/products/${latte}`, jar, { basePriceCents: '-1' }))
        .status,
    ).toBe(400);
  });
  it('grupos y valores tienen CRUD y bajas sin romper configuración', async () => {
    const { jar } = await login();
    const category = await db.category.findFirstOrThrow({ where: { name: 'Café (demo)' } });
    const product = await mutate('post', '/api/v1/admin/products', jar, {
      name: 'Configuración propia',
      categoryId: category.id.toString(),
      basePriceCents: '1000',
    });
    const productId = product.body.data.id;
    const group = await mutate('post', '/api/v1/admin/option-groups', jar, {
      name: 'Extra de prueba',
      pricingScope: 'GLOBAL',
    });
    expect(group.status).toBe(201);
    const groupId = group.body.data.id;
    const value = await mutate('post', `/api/v1/admin/option-groups/${groupId}/values`, jar, {
      name: 'Extra',
      globalSurchargeCents: '500',
    });
    expect(value.status).toBe(201);
    const valueId = value.body.data.id;
    expect(
      (
        await mutate('patch', `/api/v1/admin/option-values/${valueId}`, jar, {
          globalSurchargeCents: '700',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate('patch', `/api/v1/admin/option-groups/${groupId}`, jar, {
          pricingScope: 'PER_PRODUCT',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await mutate('put', `/api/v1/admin/products/${productId}/configuration`, jar, {
          groups: [{ groupId, minSelections: 0, maxSelections: 1, values: [{ valueId }] }],
        })
      ).status,
    ).toBe(200);
    expect((await mutate('delete', `/api/v1/admin/option-groups/${groupId}`, jar)).status).toBe(
      409,
    );
    expect((await mutate('delete', `/api/v1/admin/option-values/${valueId}`, jar)).status).toBe(
      200,
    );
    expect(
      (
        await mutate('put', `/api/v1/admin/products/${productId}/configuration`, jar, {
          groups: [],
        })
      ).status,
    ).toBe(200);
    expect((await mutate('delete', `/api/v1/admin/option-groups/${groupId}`, jar)).status).toBe(
      200,
    );
    expect(
      (await db.optionValue.findUniqueOrThrow({ where: { id: BigInt(valueId) } })).deletedAt,
    ).not.toBeNull();
    const list = await request(app)
      .get('/api/v1/admin/option-values?includeDeleted=true&limit=1')
      .set('Cookie', cookies(jar));
    expect(list.status).toBe(200);
    conform('/api/v1/admin/option-values', 'get', '200', list.body);
  });
  it('reemplazo de imagen conserva vigente ante fallo y rechaza intent reutilizado', async () => {
    const { jar } = await login();
    const start = await mutate('post', `/api/v1/admin/products/${latte}/image-upload`, jar);
    expect(start.status).toBe(201);
    const intentId = start.body.data.intentId;
    conform('/api/v1/admin/products/{id}/image-upload', 'post', '201', start.body);
    imageFail = true;
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/image`, jar, { intentId })).status,
    ).toBe(503);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } })).imagePublicId,
    ).toBeNull();
    imageFail = false;
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/image`, jar, { intentId })).status,
    ).toBe(200);
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/image`, jar, { intentId })).status,
    ).toBe(409);
  });
  it('dos reemplazos concurrentes solo asocian un ganador y limpieza reintenta', async () => {
    const { jar } = await login();
    const first = await mutate('post', `/api/v1/admin/products/${latte}/image-upload`, jar),
      second = await mutate('post', `/api/v1/admin/products/${latte}/image-upload`, jar);
    const results = await Promise.all([
      mutate('put', `/api/v1/admin/products/${latte}/image`, jar, {
        intentId: first.body.data.intentId,
      }),
      mutate('put', `/api/v1/admin/products/${latte}/image`, jar, {
        intentId: second.body.data.intentId,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    time += 2 * 3600000 + 1;
    destroyFail = true;
    expect(await cleanupImages(db, provider, now)).toBe(0);
    expect(
      await db.job.count({
        where: { type: 'CLOUDINARY_DELETE', status: 'PENDING', attempts: { gt: 0 } },
      }),
    ).toBeGreaterThan(0);
    destroyFail = false;
    time += 10000;
    expect(await cleanupImages(db, provider, now)).toBeGreaterThan(0);
    expect(deleted).not.toContain(winner.imagePublicId);
  });
  it('imagen de tipo/tamaño inválido o intent ajeno se rechaza', async () => {
    const { jar } = await login();
    const start = await mutate('post', `/api/v1/admin/products/${latte}/image-upload`, jar);
    const id = start.body.data.intentId,
      publicId = start.body.data.parameters.public_id as string;
    assets.set(publicId, {
      publicId,
      url: 'https://res.cloudinary.com/test/image/upload/asset',
      version: '42',
      bytes: 6 * 1024 * 1024,
      width: 200,
      height: 200,
      format: 'svg',
      resourceType: 'image',
    });
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/image`, jar, { intentId: id })).status,
    ).toBe(400);
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/image`, jar, { intentId: '999999' }))
        .status,
    ).toBe(403);
    const role = await db.role.findUniqueOrThrow({ where: { name: 'ADMINISTRADOR' } });
    await db.user.create({
      data: {
        name: 'Otro admin ficticio',
        username: 'other.admin',
        accountType: 'STAFF',
        roleId: role.id,
        passwordHash: await hash(password, {
          type: argon2id,
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        }),
      },
    });
    const other = await login('other.admin');
    expect(
      (await mutate('put', `/api/v1/admin/products/${latte}/image`, other.jar, { intentId: id }))
        .status,
    ).toBe(403);
  });
  it('sesiones no se extienden más de 8h o 30 días', async () => {
    const staff = await auth.login('staff', 'admin.test', password, 'time-ip');
    expect(staff.expiresAt.getTime() - time).toBe(8 * 3600000);
    time += 3600000;
    const afterIdle = await auth.refresh(staff.refresh);
    expect(afterIdle.expiresAt).toEqual(staff.expiresAt);
    time += 7 * 3600000 + 1;
    await expect(auth.refresh(afterIdle.refresh)).rejects.toMatchObject({ status: 401 });
    const customer = await auth.login('customer', 'C000099', '0007', 'time-ip2');
    expect(customer.expiresAt.getTime() - time).toBe(30 * 86400000);
    time += 29 * 86400000;
    const renewed = await auth.refresh(customer.refresh);
    expect(renewed.expiresAt).toEqual(customer.expiresAt);
    time += 86400000 + 1;
    await expect(auth.refresh(renewed.refresh)).rejects.toMatchObject({ status: 401 });
  });
});
