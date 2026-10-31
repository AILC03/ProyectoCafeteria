import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
const file = 'docs/api/openapi.yaml',
  api = parse(readFileSync(file, 'utf8'));
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const nullable = (schema) => ({ ...schema, nullable: true });
const id = {
  type: 'string',
  pattern: '^[1-9][0-9]{0,18}$',
  description: 'BIGINT <=9223372036854775807.',
};
const money = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]{0,18})$',
  description: 'Centavos no negativos <=9223372036854775807; sin decimales ni Number.',
};
const date = { type: 'string', format: 'date-time' };
const reason = { type: 'string', minLength: 1, maxLength: 500 };
const schemas = api.components.schemas;
schemas.CashOpen = object({ openingAmountCents: money });
schemas.CashClose = object({ countedCashCents: money, exceptionalCloseReason: reason }, [
  'countedCashCents',
]);
schemas.CashCharge = object(
  { cashSessionId: id, orderId: id, cashReceivedCents: money, changeCents: money },
  ['cashSessionId', 'orderId', 'cashReceivedCents'],
);
schemas.CashSession = object({
  id,
  employeeId: id,
  openedAt: date,
  closedAt: nullable(date),
  closedByEmployeeId: nullable(id),
  exceptionalCloseReason: nullable(reason),
  openingAmountCents: money,
  expectedCashCents: nullable(money),
  countedCashCents: nullable(money),
  differenceCents: nullable({ type: 'string', pattern: '^-?(0|[1-9][0-9]{0,18})$' }),
  cashSalesCents: money,
  successfulPayments: { type: 'string', pattern: '^[0-9]+$' },
  computedExpectedCashCents: money,
});
schemas.CashPayment = object({
  id,
  orderId: id,
  method: { type: 'string', enum: ['CASH'] },
  status: { type: 'string', enum: ['SUCCEEDED'] },
  amountCents: money,
  currency: { type: 'string', enum: ['MXN'] },
  cashierId: id,
  cashSessionId: id,
  cashReceivedCents: money,
  changeCents: money,
  confirmedAt: date,
});
schemas.CashSale = object({
  id,
  saleNumber: { type: 'string', pattern: '^V[0-9]{6,}$' },
  orderId: id,
  paymentId: id,
  totalCents: money,
  soldAt: date,
});
schemas.CashChargeResult = object({
  payment: ref('CashPayment'),
  sale: ref('CashSale'),
  order: object({
    id,
    folio: { type: 'string' },
    status: { type: 'string', enum: ['EN_PREPARACION'] },
    paidAt: date,
  }),
  ticket: object({ saleId: id, path: { type: 'string' } }),
});
schemas.RegistrationQr = object({
  purpose: { type: 'string', enum: ['CUSTOMER_REGISTRATION'] },
  token: {
    type: 'string',
    pattern: '^[A-Za-z0-9_-]{43}$',
    description:
      '32 bytes aleatorios. Solo registro futuro, no credencial de lectura ni pago. No registrar ni persistir en frontend.',
  },
  qrPayload: { type: 'string', pattern: '^cafeteria:register:[A-Za-z0-9_-]{43}$' },
  expiresAt: date,
});
schemas.CashTicket = object({
  saleId: id,
  saleNumber: { type: 'string' },
  orderFolio: { type: 'string' },
  soldAt: date,
  currency: { type: 'string', enum: ['MXN'] },
  totalCents: money,
  cashReceivedCents: money,
  changeCents: money,
  items: { type: 'array', items: ref('OrderItemSnapshot') },
  registration: nullable(schemas.RegistrationQr),
});
const access = [{ accessCookie: [] }, { productionAccessCookie: [] }],
  mutate = access.map((value) => ({ ...value, csrfHeader: [] }));
const key = api.paths['/api/v1/orders'].post.parameters.find(
  (param) => param.name === 'Idempotency-Key',
);
const pathId = { name: 'id', in: 'path', required: true, schema: id };
const instant = '2026-10-26T12:00:00.000Z';
const session = {
  id: '1',
  employeeId: '2',
  openedAt: instant,
  closedAt: null,
  closedByEmployeeId: null,
  exceptionalCloseReason: null,
  openingAmountCents: '50000',
  expectedCashCents: null,
  countedCashCents: null,
  differenceCents: null,
  cashSalesCents: '0',
  successfulPayments: '0',
  computedExpectedCashCents: '50000',
};
const sale = {
  id: '1',
  saleNumber: 'V000001',
  orderId: '1',
  paymentId: '1',
  totalCents: '2000',
  soldAt: instant,
};
const payment = {
  id: '1',
  orderId: '1',
  method: 'CASH',
  status: 'SUCCEEDED',
  amountCents: '2000',
  currency: 'MXN',
  cashierId: '2',
  cashSessionId: '1',
  cashReceivedCents: '5000',
  changeCents: '3000',
  confirmedAt: instant,
};
function operation(
  path,
  method,
  operationId,
  description,
  { body, response, example, input, status = 200, parameters = [], security = access } = {},
) {
  const responses = Object.fromEntries(
    [400, 401, 403, 404, 409, 413, 429, 500, 503].map((code) => [
      code,
      {
        description: {
          400: 'VALIDATION_ERROR: campos adicionales, query, ID/clave o importes inválidos.',
          401: 'UNAUTHENTICATED',
          403: 'FORBIDDEN / CSRF_INVALID / PIN_CHANGE_REQUIRED / ORIGIN_NOT_ALLOWED',
          404: 'NOT_FOUND',
          409: 'CASH_CONFLICT / IDEMPOTENCY_CONFLICT: estado, responsable, cambio, saldo o entrada incompatibles.',
          413: 'PAYLOAD_TOO_LARGE',
          429: 'RATE_LIMITED',
          500: 'INTERNAL_ERROR',
          503: 'DEPENDENCY_UNAVAILABLE: también clave de ticket ausente/inválida o cifrado no recuperable.',
        }[code],
        content: { 'application/problem+json': { schema: ref('Problem') } },
      },
    ]),
  );
  responses[status] = {
    description: 'Correcto. Cache-Control: no-store.',
    headers: { 'Cache-Control': { schema: { type: 'string' } } },
    content: {
      'application/json': { schema: object({ data: response }), example: { data: example } },
    },
  };
  api.paths[path] = {
    [method]: {
      operationId,
      tags: ['Cash'],
      summary: operationId,
      description,
      security,
      parameters,
      responses,
      ...(body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: body, example: input } },
            },
          }
        : {}),
    },
  };
}
const idem =
  ' Idempotency-Key UUID v4 obligatorio, por usuario/operación, 48h; replay devuelve resultado público original incluso tras cierre sin repetir efectos; cuerpo distinto 409. Nunca almacena token de registro en response_json.';
operation(
  '/api/v1/cash-sessions',
  'post',
  'openCashSession',
  'CAJERO/ADMINISTRADOR; fondo inicial, una sesión abierta globalmente con lock e índice único parcial; auditoría. No cambia responsable.' +
    idem,
  {
    body: ref('CashOpen'),
    response: ref('CashSession'),
    input: { openingAmountCents: '50000' },
    example: session,
    status: 201,
    security: mutate,
    parameters: [key],
  },
);
operation(
  '/api/v1/cash-sessions/current',
  'get',
  'currentCashSession',
  'CAJERO/ADMINISTRADOR. Caja activa y resumen calculado bajo lock: fondo + ventas efectivo (ingreso neto, no recibido bruto). data=null si no existe. No altera caja al expirar auth.',
  { response: nullable(schemas.CashSession), example: session },
);
operation(
  '/api/v1/cash-sessions/{id}',
  'get',
  'getCashSession',
  'CAJERO/ADMINISTRADOR. Resumen de sesión abierta o cerrada por ID; no acceso a perfiles de clientes.',
  { response: ref('CashSession'), example: session, parameters: [pathId] },
);
operation(
  '/api/v1/cash-sessions/{id}/close',
  'post',
  'closeCashSession',
  'Responsable cierra su caja. ADMINISTRADOR puede cerrar ajena solo con exceptionalCloseReason no vacío (1–500 tras trim). Responsable original inmutable, actor/fecha/motivo registrados y auditoría. Motivo en cierre propio se rechaza. Esperado=fondo+ventas CASH; diferencia=contado-esperado, calculados en backend. Serializado con cobros.' +
    idem,
  {
    body: ref('CashClose'),
    response: ref('CashSession'),
    input: { countedCashCents: '49000' },
    example: {
      ...session,
      closedAt: instant,
      closedByEmployeeId: '2',
      expectedCashCents: '50000',
      countedCashCents: '49000',
      differenceCents: '-1000',
    },
    parameters: [pathId, key],
    security: mutate,
  },
);
operation(
  '/api/v1/payments/cash',
  'post',
  'chargeCashOrder',
  'Solo responsable de cashSessionId abierta (CAJERO/ADMINISTRADOR, sin excepción de cobro ajeno). Orden CASH PENDIENTE_PAGO, paidAt NULL, no vencida; locks caja→orden→pago→venta. Recibido>=total de snapshots; calcula cambio; changeCents opcional solo como aserción y debe coincidir. Crea payment SUCCEEDED, sale V+identity, paidAt y EN_PREPARACION, auditoría y token de registro si invitado, todo atómico. No recotiza catálogo. Orden pagada/expirada/STRIPE o caja cerrada 409; ajena 403. Sin clave cifrado de tickets, invitado 503 y rollback. Ticket se obtiene aparte por ruta protegida, nunca token en respuesta idempotente.' +
    idem,
  {
    body: ref('CashCharge'),
    response: ref('CashChargeResult'),
    input: { cashSessionId: '1', orderId: '1', cashReceivedCents: '5000', changeCents: '3000' },
    example: {
      payment,
      sale,
      order: { id: '1', folio: 'A000001', status: 'EN_PREPARACION', paidAt: instant },
      ticket: { saleId: '1', path: '/api/v1/sales/1/ticket' },
    },
    status: 201,
    security: mutate,
    parameters: [key],
  },
);
operation(
  '/api/v1/sales/{id}/ticket',
  'get',
  'getCashTicket',
  'CAJERO/ADMINISTRADOR únicamente. Ticket JSON imprimible desde snapshots y pago/venta CASH coherentes. Invitado pagado: registration contiene token aleatorio un uso, caduca exactamente 24h desde pago; qrPayload es dato para renderizar en frontend, no URL de consulta. Reimpresión no crea/consume/renueva token. Asociado, usado o vencido: registration=null. Nunca expone QR de pago ni acceso digital de invitado, ni implementa endpoint final de registro. No-store, Referrer-Policy:no-referrer; no guardar respuesta sensible en logs/cachés/localStorage.',
  {
    response: ref('CashTicket'),
    example: {
      saleId: '1',
      saleNumber: 'V000001',
      orderFolio: 'A000001',
      soldAt: instant,
      currency: 'MXN',
      totalCents: '2000',
      cashReceivedCents: '5000',
      changeCents: '3000',
      items: [
        {
          id: '1',
          productId: '1',
          productName: 'Café',
          basePriceCents: '2000',
          unitPriceCents: '2000',
          quantity: 1,
          lineTotalCents: '2000',
          options: [],
        },
      ],
      registration: {
        purpose: 'CUSTOMER_REGISTRATION',
        token: 'A'.repeat(43),
        qrPayload: `cafeteria:register:${'A'.repeat(43)}`,
        expiresAt: '2026-10-27T12:00:00.000Z',
      },
    },
    parameters: [pathId],
  },
);
// Endurecimiento imprescindible al conectar pagos reales: paidAt aislado no prueba pago CASH.
api.paths['/api/v1/orders/{id}/ready'].post.description =
  api.paths['/api/v1/orders/{id}/ready'].post.description.split(' CASH-02:')[0] +
  ' CASH-02: CASH además exige payment SUCCEEDED y venta coherentes; paidAt aislado no basta.';
if (!api.tags.some((tag) => tag.name === 'Cash'))
  api.tags.push({
    name: 'Cash',
    description: 'Caja, cobro CASH y ticket protegido; sin Stripe ni registro final.',
  });
api.info.version = '0.5.0';
api.info.description =
  api.info.description.split(' CASH-01:')[0] +
  ' CASH-01: caja, cobro efectivo, venta y ticket con registro preparado; sin Stripe/registro final/worker.';
writeFileSync(file, stringify(api, { lineWidth: 100 }));
