import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';

// Solo contrato ORD-01: ejecutar antes de implementar; revisar siempre el diff.
const file = 'docs/api/openapi.yaml';
const api = parse(readFileSync(file, 'utf8'));
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const id = {
  type: 'string',
  pattern: '^[1-9][0-9]{0,18}$',
  description: 'BIGINT positivo <=9223372036854775807; nunca Number.',
};
const money = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]{0,6})$',
  description: 'Centavos enteros <=9999900.',
};
const date = { type: 'string', format: 'date-time' };
const nullable = (value) => ({ ...value, nullable: true });
const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const identifier = {
  type: 'string',
  pattern: '^(C[0-9]{1,19}|\\+52[0-9]{10}|[0-9]{10})$',
  description:
    'Búsqueda exacta por customer_number o teléfono MX; se normaliza trim/mayúsculas/+52.',
};
const s = api.components.schemas;
s.OrderCustomerSelection = object({ identifier, confirmedName: text(120) });
s.OrderCustomerMinimum = object({ id, name: text(120), customerNumber: text(20) });
s.OrderLineInput = object(
  {
    productId: id,
    quantity: { type: 'integer', minimum: 1, maximum: 99 },
    optionValueIds: {
      type: 'array',
      maxItems: 5000,
      uniqueItems: true,
      items: id,
      description:
        'IDs únicos de opciones asignadas al producto. Omisión equivale a []; se validan todos los mínimos/máximos.',
    },
  },
  ['productId', 'quantity'],
);
const items = { type: 'array', minItems: 1, maxItems: 50, items: ref('OrderLineInput') };
s.MobileOrderCreate = object(
  { paymentMethod: { type: 'string', enum: ['CASH', 'STRIPE'] }, guestName: text(120), items },
  ['paymentMethod', 'items'],
);
s.CashierOrderCreate = object(
  {
    paymentMethod: { type: 'string', enum: ['CASH'] },
    guestName: text(120),
    customer: ref('OrderCustomerSelection'),
    items,
  },
  ['paymentMethod', 'items'],
);
s.OrderOptionSnapshot = object({
  optionValueId: id,
  groupName: text(120),
  optionName: text(120),
  surchargeCents: money,
});
s.OrderItemSnapshot = object({
  id,
  productId: id,
  productName: text(160),
  basePriceCents: money,
  unitPriceCents: money,
  quantity: { type: 'integer', minimum: 1, maximum: 99 },
  lineTotalCents: money,
  options: { type: 'array', items: ref('OrderOptionSnapshot') },
});
s.Order = object({
  id,
  folio: { type: 'string', pattern: '^A[0-9]{6,}$' },
  source: { type: 'string', enum: ['MOBILE', 'CASHIER'] },
  status: { type: 'string', enum: ['PENDIENTE_PAGO', 'EN_PREPARACION', 'LISTO', 'EXPIRADA'] },
  paymentMethod: { type: 'string', enum: ['CASH', 'STRIPE'] },
  totalCents: money,
  customerId: nullable(id),
  guestName: nullable(text(120)),
  paymentExpiresAt: date,
  paidAt: nullable(date),
  readyAt: nullable(date),
  readyByEmployeeId: nullable(id),
  createdAt: date,
  items: { type: 'array', minItems: 1, maxItems: 50, items: ref('OrderItemSnapshot') },
});
s.OrderSummary = object({
  id,
  folio: { type: 'string', pattern: '^A[0-9]{6,}$' },
  guestName: nullable(text(120)),
  status: { type: 'string', enum: ['EN_PREPARACION'] },
  createdAt: date,
});
s.OrderCustomerSearch = object({ identifier });
const access = [{ accessCookie: [] }, { productionAccessCookie: [] }];
const mutation = access.map((entry) => ({ ...entry, csrfHeader: [] }));
const idParameter = { name: 'id', in: 'path', required: true, schema: id };
const keyParameter = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  schema: {
    type: 'string',
    format: 'uuid',
    pattern:
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
  },
  description:
    'UUID v4 aleatorio por operación. Alcance por ruta y actor (usuario o invitado). Hash de entrada canónica validada; repetir devuelve mismo 201 y cuerpo original por 48h, incluso si catálogo/estado cambia; otra entrada 409. Después de 48h es una operación nueva. No concede consultas. No registrar en logs.',
};
const example = {
  data: {
    id: '1',
    folio: 'A000001',
    source: 'MOBILE',
    status: 'PENDIENTE_PAGO',
    paymentMethod: 'CASH',
    totalCents: '2000',
    customerId: null,
    guestName: null,
    paymentExpiresAt: '2026-10-26T12:30:00.000Z',
    paidAt: null,
    readyAt: null,
    readyByEmployeeId: null,
    createdAt: '2026-10-26T12:00:00.000Z',
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
  },
};
function operation(
  path,
  method,
  operationId,
  description,
  {
    body,
    response = object({ data: ref('Order') }),
    security = access,
    parameters = [],
    status = 200,
    responseExample = example,
    requestExample,
  } = {},
) {
  const responses = Object.fromEntries(
    [400, 401, 403, 404, 409, 413, 429, 500, 503].map((code) => [
      code,
      {
        description: {
          400: 'VALIDATION_ERROR: entrada, query, ID o clave inválidos; campos extra rechazados.',
          401: 'UNAUTHENTICATED: requiere sesión válida; nunca degradar sesión inválida a invitado.',
          403: 'FORBIDDEN / PIN_CHANGE_REQUIRED / CSRF_INVALID / ORIGIN_NOT_ALLOWED.',
          404: 'NOT_FOUND: ausente, ajena/no visible o cliente no encontrado.',
          409: 'ORDER_CONFLICT / IDEMPOTENCY_CONFLICT: catálogo/configuración/estado o nombre de confirmación incompatibles.',
          413: 'PAYLOAD_TOO_LARGE',
          429: 'RATE_LIMITED',
          500: 'INTERNAL_ERROR',
          503: 'DEPENDENCY_UNAVAILABLE',
        }[code],
        content: { 'application/problem+json': { schema: ref('Problem') } },
      },
    ]),
  );
  responses[status] = {
    description: 'Resultado correcto; sin efectos de pago. Cache-Control: no-store.',
    headers: { 'Cache-Control': { schema: { type: 'string' } } },
    content: {
      'application/json': {
        schema: response,
        ...(responseExample ? { example: responseExample } : {}),
      },
    },
  };
  api.paths[path] ??= {};
  api.paths[path][method] = {
    tags: ['Orders'],
    operationId,
    summary: operationId,
    description,
    security,
    parameters,
    responses,
    ...(body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: body,
                ...(requestExample ? { example: requestExample } : {}),
              },
            },
          },
        }
      : {}),
  };
}
operation(
  '/api/v1/orders',
  'post',
  'createMobileOrder',
  'Invitado o CLIENTE, nunca personal. Requiere Origin exacto y bootstrap CSRF incluso invitado. Si hay cookie de acceso se valida; no se permite omitir sesión inválida como invitado. Cliente se asocia desde sesión, no desde body; guestName solo invitado. CASH o STRIPE fijo. Backend calcula catálogo bajo lock (2026,1), valida disponibilidad y selección; snapshots inmutables. 1–50 líneas, 1–99 unidades; total <=9999900. Folio A+identity (ADR0011), no permiso. PENDIENTE_PAGO con plazo 30 min; no hay Checkout, cobro, QR ni expiración automática.',
  {
    body: ref('MobileOrderCreate'),
    security: [{ csrfHeader: [] }],
    parameters: [keyParameter],
    status: 201,
    requestExample: {
      paymentMethod: 'CASH',
      items: [{ productId: '1', quantity: 1, optionValueIds: [] }],
    },
  },
);
operation(
  '/api/v1/cashier/orders',
  'post',
  'createCashierOrder',
  'CAJERO/ADMINISTRADOR. Crea CASH pendiente, sin abrir/cobrar caja ni exigir sesión de caja en esta entrega. Cliente opcional por identifier exacto y confirmedName; confirmar nombre vigente. customer y guestName son excluyentes. No acepta precios, customerId, source ni estado.',
  {
    body: ref('CashierOrderCreate'),
    security: mutation,
    parameters: [keyParameter],
    status: 201,
    responseExample: { data: { ...example.data, source: 'CASHIER' } },
    requestExample: { paymentMethod: 'CASH', items: [{ productId: '1', quantity: 1 }] },
  },
);
operation(
  '/api/v1/orders/{id}',
  'get',
  'getOrder',
  'CLIENTE solo propia (ajena 404); CAJERO/ADMINISTRADOR consulta operativa por ID; PREPARACION solo EN_PREPARACION. Invitado 401, aunque conozca folio o clave. Sin perfil, correo, teléfono, credenciales ni historial personal del cliente. Query estricta vacía.',
  { parameters: [idParameter] },
);
operation(
  '/api/v1/preparation/orders',
  'get',
  'listPreparationOrders',
  'PREPARACION/CAJERO/ADMINISTRADOR. Solo EN_PREPARACION; LISTO sale de esta vista. Resumen sin datos de cuenta, detalle autorizado vía /orders/{id}. Cursor ligado a preparación, estable por (createdAt,id), conserva microsegundos.',
  {
    parameters: [
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } },
    ],
    response: object({ data: { type: 'array', items: ref('OrderSummary') }, page: ref('Page') }),
    responseExample: { data: [], page: { limit: 20, nextCursor: null } },
  },
);
operation(
  '/api/v1/orders/{id}/ready',
  'post',
  'markOrderReady',
  'PREPARACION/CAJERO/ADMINISTRADOR. Body {}. Bajo lock de orden revalida EN_PREPARACION y paidAt no nulo; guarda LISTO, readyAt y readyByEmployeeId con auditoría. Estado diferente o repetición: 409 sin modificar actor/fecha. No existe endpoint para forzar pago/preparación ni CANCELADO.',
  {
    body: object({}),
    parameters: [idParameter],
    security: mutation,
    responseExample: {
      data: {
        ...example.data,
        status: 'LISTO',
        paidAt: '2026-10-26T12:05:00.000Z',
        readyAt: '2026-10-26T12:10:00.000Z',
        readyByEmployeeId: '2',
      },
    },
    requestExample: {},
  },
);
operation(
  '/api/v1/cashier/customers/search',
  'post',
  'searchOrderCustomer',
  'CAJERO/ADMINISTRADOR con CSRF. Búsqueda exacta de cliente activo por teléfono MX o customer_number; sin búsqueda parcial/listado general. POST evita PII en URL. Devuelve solo id, name, customerNumber; nunca correo, NIP, teléfono ni historial. Sin coincidencia 404.',
  {
    body: ref('OrderCustomerSearch'),
    security: mutation,
    response: object({ data: ref('OrderCustomerMinimum') }),
    responseExample: { data: { id: '10', name: 'Cliente ficticio', customerNumber: 'C000010' } },
    requestExample: { identifier: 'C000010' },
  },
);
operation(
  '/api/v1/cashier/orders/{id}/customer',
  'patch',
  'associateOrderCustomer',
  'CAJERO/ADMINISTRADOR. Asocia cliente activo por identifier y confirmedName. Solo PENDIENTE_PAGO, paidAt nulo y antes de paymentExpiresAt, bajo lock; borra guestName al asociar. No cambia cliente después de pago ni orden expirada. También permite asociar una orden móvil antes del pago; no expone historial del cliente.',
  {
    body: ref('OrderCustomerSelection'),
    security: mutation,
    parameters: [idParameter],
    requestExample: { identifier: 'C000010', confirmedName: 'Cliente ficticio' },
    responseExample: { data: { ...example.data, customerId: '10' } },
  },
);
api.info.version = '0.4.0';
api.info.description =
  api.info.description.split(' ORD-01:')[0] +
  ' ORD-01: creación pendiente, consultas protegidas, asociación mínima y preparación/LISTO; sin pagos ni expiración automática.';
writeFileSync(file, stringify(api, { lineWidth: 100 }));
