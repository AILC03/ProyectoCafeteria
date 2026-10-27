import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { OrdersRepository } from '../src/modules/orders/orders.repository.js';
import { priceOrder, type CatalogProduct } from '../src/modules/orders/orders.pricing.js';
import { mobileOrder, operationKey } from '../src/modules/orders/orders.validation.js';

const product = (): CatalogProduct => ({
  id: 9007199254740993n,
  name: 'Producto',
  basePriceCents: 100n,
  isAvailable: true,
  deletedAt: null,
  category: { isActive: true, deletedAt: null },
  product_option_group_productId: [
    {
      minSelections: 1,
      maxSelections: 1,
      optionGroup: { id: 1n, name: 'Tamaño', pricingScope: 'PER_PRODUCT', deletedAt: null },
      product_option_value_productOptionGroupId: [
        {
          surchargeOverrideCents: 50n,
          optionValue: {
            id: 2n,
            name: 'Grande',
            optionGroupId: 1n,
            globalSurchargeCents: null,
            isAvailable: true,
            deletedAt: null,
          },
        },
      ],
    },
  ],
});
const body = () => ({
  paymentMethod: 'CASH',
  items: [{ productId: '9007199254740993', quantity: 2, optionValueIds: ['2'] }],
});
describe('orders: cálculo y validación', () => {
  it('centavos/IDs exactos, cantidad multiplica base y recargos', () => {
    const priced = priceOrder(mobileOrder.parse(body()), [product()]);
    expect(priced.totalCents).toBe(300n);
    expect(priced.items[0]!.productId).toBe(9007199254740993n);
    expect(priced.items[0]!.options[0]!.surchargeCentsSnapshot).toBe(50n);
  });
  it.each([0, 100, 1.5, '2'])('cantidad %s rechazada', (quantity) => {
    expect(
      mobileOrder.safeParse({ ...body(), items: [{ ...body().items[0], quantity }] }).success,
    ).toBe(false);
  });
  it('límites de líneas, IDs, opciones duplicadas y campos manipulados', () => {
    for (const value of [
      { ...body(), totalCents: '1' },
      { ...body(), source: 'CASHIER' },
      { ...body(), customerId: '1' },
      { ...body(), status: 'LISTO' },
      { ...body(), items: [] },
      { ...body(), items: Array.from({ length: 51 }, () => body().items[0]) },
      { ...body(), items: [{ ...body().items[0], basePriceCents: '1' }] },
      { ...body(), items: [{ ...body().items[0], optionValueIds: ['2', '2'] }] },
      { ...body(), items: [{ ...body().items[0], productId: '9223372036854775808' }] },
    ])
      expect(mobileOrder.safeParse(value).success).toBe(false);
  });
  it('UUID v4 obligatorio; no claves predecibles', () => {
    for (const key of ['', 'test', '00000000-0000-0000-0000-000000000000'])
      expect(operationKey.safeParse(key).success).toBe(false);
  });
  it('mínimos y opciones ajenas rechazados', () => {
    for (const optionValueIds of [[], ['3'], ['2', '3']])
      expect(() =>
        priceOrder(
          mobileOrder.parse({ ...body(), items: [{ ...body().items[0], optionValueIds }] }),
          [product()],
        ),
      ).toThrow();
  });
  it('disponibilidad, bajas y alcance incompatible rechazados', () => {
    const variants = [product(), product(), product(), product(), product()];
    variants[0]!.isAvailable = false;
    variants[1]!.deletedAt = new Date();
    variants[2]!.category.isActive = false;
    variants[3]!.product_option_group_productId[0]!.product_option_value_productOptionGroupId[0]!.optionValue.isAvailable = false;
    variants[4]!.product_option_group_productId[0]!.product_option_value_productOptionGroupId[0]!.optionValue.globalSurchargeCents =
      1n;
    for (const value of variants)
      expect(() => priceOrder(mobileOrder.parse(body()), [value])).toThrow();
  });
  it('total máximo exacto y exceso de un centavo', () => {
    const p = product();
    p.product_option_group_productId = [];
    p.basePriceCents = 9999900n;
    const input = mobileOrder.parse({
      paymentMethod: 'STRIPE',
      items: [{ productId: p.id.toString(), quantity: 1 }],
    });
    expect(priceOrder(input, [p]).totalCents).toBe(9999900n);
    p.basePriceCents++;
    expect(() => priceOrder(input, [p])).toThrow();
  });
});
describe('orders: reintentos transaccionales acotados', () => {
  it.each([
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40P01' } },
    { code: 'P2010', meta: { code: '40001' } },
  ])('reintenta conflicto reconocido %j', async (failure) => {
    const transaction = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue('ok');
    const repository = new OrdersRepository({
      $transaction: transaction,
    } as unknown as PrismaClient);
    expect(await repository.transaction(async () => 'ok')).toBe('ok');
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('no supera tres intentos', async () => {
    const failure = { code: 'P2034' },
      transaction = vi.fn().mockRejectedValue(failure);
    const repository = new OrdersRepository({
      $transaction: transaction,
    } as unknown as PrismaClient);
    await expect(repository.transaction(async () => 'ok')).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it('no reintenta errores de integridad', async () => {
    const failure = { code: 'P2002' },
      transaction = vi.fn().mockRejectedValue(failure);
    const repository = new OrdersRepository({
      $transaction: transaction,
    } as unknown as PrismaClient);
    await expect(repository.transaction(async () => 'ok')).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
describe('orders: frontera HTTP sin base', () => {
  function fixture() {
    const db = {} as PrismaClient;
    const auth = new AuthService(new AuthRepository(db), {
      jwtSecret: 'a'.repeat(64),
      csrfSecret: 'b'.repeat(64),
      issuer: 'test',
      audience: 'test',
      secure: false,
      origin: 'http://localhost:5173',
      ipLimit: 100,
    });
    const service = new OrdersService(new OrdersRepository(db));
    const create = vi.spyOn(service, 'create').mockResolvedValue({ data: { id: '1' } });
    const token = auth.tokens.csrf('pre');
    const app = createApp({ authService: auth, ordersService: service });
    return { app, create, token };
  }
  it('invitado requiere CSRF; validación no llega al servicio', async () => {
    const { app, create, token } = fixture();
    expect((await request(app).post('/api/v1/orders').send(body())).status).toBe(403);
    for (const payload of [
      { ...body(), totalCents: '1' },
      { ...body(), items: [] },
    ]) {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', `caf_csrf=${token}`)
        .set('X-CSRF-Token', token)
        .set('Idempotency-Key', 'd1e127cc-2de1-4d2e-b87b-9e025a194278')
        .send(payload);
      expect(response.status).toBe(400);
      expect(response.type).toBe('application/problem+json');
    }
    expect(create).not.toHaveBeenCalled();
  });
  it('invitado no consulta por ID/folio ni accede a preparación', async () => {
    const { app } = fixture();
    for (const path of ['/api/v1/orders/1', '/api/v1/orders/A000001', '/api/v1/preparation/orders'])
      expect((await request(app).get(path)).status).toBe(401);
  });
});
