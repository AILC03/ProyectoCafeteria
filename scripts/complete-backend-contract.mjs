// Generador acotado de FIN-01: no altera operaciones previas.
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
const file = 'docs/api/openapi.yaml';
const api = YAML.parse(readFileSync(file, 'utf8'));
const string = { type: 'string' };
const id = { type: 'string', pattern: '^[1-9][0-9]{0,18}$' };
const money = { type: 'string', pattern: '^[0-9]+$' };
const date = { type: 'string', format: 'date-time' };
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const name = { type: 'string', minLength: 1, maxLength: 120 };
const phone = { type: 'string', pattern: '^\\+52[0-9]{10}$' };
const pin = { type: 'string', pattern: '^[0-9]{4}$' };
const password = { type: 'string', minLength: 8, maxLength: 24 };
const token = { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' };
const reason = { type: 'string', minLength: 1, maxLength: 500 };
const role = { type: 'string', enum: ['CAJERO', 'PREPARACION', 'ADMINISTRADOR'] };
const staff = object({ id, name, username: string, role, isActive: { type: 'boolean' } });
const customer = object({ id, customerNumber: string, name, phone });
const sale = object({
  id,
  saleNumber: string,
  orderId: id,
  paymentId: id,
  totalCents: money,
  soldAt: date,
  method: { type: 'string', enum: ['CASH', 'STRIPE'] },
});
const page = object({ limit: { type: 'integer' }, nextCursor: { type: 'string', nullable: true } });
const list = (item) => object({ data: { type: 'array', items: item }, page });
const data = (item) => object({ data: item });
function operation(
  path,
  method,
  summary,
  { body, result, status = '200', publicCsrf = false, query = [], description = '' } = {},
) {
  const mutation = method !== 'get';
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: id,
  }));
  for (const [key, schema] of query)
    parameters.push({ name: key, in: 'query', required: false, schema });
  const responses = {
    [status]: {
      description: status === '204' ? 'Operación completada sin cuerpo' : 'Resultado',
      ...(result ? { content: { 'application/json': { schema: result } } } : {}),
    },
  };
  for (const code of ['400', '401', '403', '404', '409', '429', '500', '503'])
    responses[code] = {
      description: `Error ${code}; application/problem+json con code, status y requestId`,
      content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
    };
  api.paths[path] ??= {};
  api.paths[path][method] = {
    tags: ['FIN-01'],
    summary,
    description: `${description} Entradas estrictas; rechaza campos y query extra. Respuestas privadas no-store. ${mutation ? 'Origin exacto y X-CSRF-Token obligatorios.' : 'Sin body.'}`,
    operationId: summary,
    security: publicCsrf
      ? [{ csrfHeader: [] }]
      : [{ accessCookie: [], ...(mutation ? { csrfHeader: [] } : {}) }],
    parameters,
    ...(body
      ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } }
      : {}),
    responses,
  };
}
const pages = [
  ['limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }],
  ['cursor', { type: 'string', maxLength: 2048 }],
];
const filters = [
  ['from', date],
  ['to', date],
  ['method', { type: 'string', enum: ['CASH', 'STRIPE'] }],
];
operation('/api/v1/sales', 'get', 'listSales', {
  result: list(sale),
  query: [...pages, ...filters],
  description:
    'CAJERO/ADMINISTRADOR. from inclusivo y to exclusivo sobre soldAt. Orden (soldAt,id), cursor ligado a filtros; no expone clientes.',
});
operation('/api/v1/sales/summary', 'get', 'summarizeSales', {
  result: data(object({ count: money, totalCents: money, cashCents: money, stripeCents: money })),
  query: filters,
  description:
    'CAJERO/ADMINISTRADOR. Totales del conjunto filtrado completo, no solo la página. Ventas históricas, no saldo neto de reembolsos.',
});
operation('/api/v1/customers/me', 'patch', 'updateOwnProfile', {
  body: object({ name, phone, currentPin: pin }, []),
  result: data(customer),
  description:
    'CLIENTE. Al menos name o phone; cambiar phone requiere currentPin válido y teléfono único. Sesión se revoca tras cambiar teléfono: volver a login.',
});
operation('/api/v1/customers/me/orders/{id}/ticket', 'get', 'getOwnOrderTicket', {
  result: data({ $ref: '#/components/schemas/CashTicket' }),
  description:
    'Solo CLIENTE propietario de orden pagada CASH o STRIPE. Comprobante con snapshots y sin QR de registro; 404 si ajena o no pagada.',
});
operation('/api/v1/admin/employees', 'get', 'listEmployees', {
  result: list(staff),
  query: pages,
  description: 'Solo ADMINISTRADOR. Incluye bajas; nunca hashes.',
});
operation('/api/v1/admin/employees', 'post', 'createEmployee', {
  status: '201',
  body: object({
    name,
    username: { type: 'string', pattern: '^[A-Za-z0-9_]{3,24}$' },
    password,
    role,
  }),
  result: data(staff),
  description: 'Solo ADMINISTRADOR. Argon2id, username único, auditoría sin contraseña.',
});
operation('/api/v1/admin/employees/{id}', 'patch', 'updateEmployee', {
  body: object({ name, role, isActive: { type: 'boolean' }, reason }, ['reason']),
  result: data(staff),
  description:
    'Solo ADMINISTRADOR. Baja lógica y cambio de rol revocan sesiones. No desactivar ni degradar la propia cuenta; no desactivar/degradar al responsable de caja abierta. No cambiar contraseñas por esta ruta.',
});
operation('/api/v1/admin/customers/{id}', 'patch', 'correctCustomer', {
  body: object({ name, phone, reason }, ['reason']),
  result: data(customer),
  description:
    'Solo ADMINISTRADOR; al menos name o phone. Auditoría y unicidad, no modifica compras. Cambio de teléfono revoca sesiones.',
});
operation('/api/v1/admin/customers/{id}/pin-reset', 'post', 'resetCustomerPin', {
  status: '204',
  body: object({ temporaryPin: pin, reason, verificationSummary: reason, recentSaleId: id }),
  description:
    'Solo ADMINISTRADOR. Verificar identidad presencialmente y proporcionar una venta pagada reciente asociada. NIP temporal introducido por administrador, no devuelto ni auditado. Revoca sesiones, activa must_change_pin.',
});
operation('/api/v1/customers/me/recovery-email', 'post', 'requestEmailVerification', {
  status: '202',
  body: object({ email: { type: 'string', format: 'email', maxLength: 254 } }),
  result: data(object({ accepted: { type: 'boolean' } })),
  description:
    'CLIENTE. Entrega vía outbox cifrada; conserva correo anterior hasta confirmar. Enlace de un uso, 30 minutos. Requiere cifrado y transporte de correo configurados.',
});
operation('/api/v1/auth/email-verification', 'post', 'confirmRecoveryEmail', {
  status: '204',
  publicCsrf: true,
  body: object({ token }),
  description:
    'Token del enlace en body, no query. Consumo único; revoca verificaciones/recuperaciones anteriores. No inicia sesión.',
});
operation('/api/v1/auth/pin-recovery', 'post', 'requestPinRecovery', {
  status: '202',
  publicCsrf: true,
  body: object({ identifier: { type: 'string', maxLength: 32 } }),
  result: data(object({ accepted: { type: 'boolean' } })),
  description:
    'Respuesta genérica incluso si no existe, está inactivo o no tiene correo verificado. Rate limit persistente por IP/cuenta. No devuelve token.',
});
operation('/api/v1/auth/pin-recovery/confirm', 'post', 'confirmPinRecovery', {
  status: '204',
  publicCsrf: true,
  body: object({ token, newPin: pin }),
  description:
    'Token de uso único 30 minutos; Argon2id, revoca sesiones y tokens anteriores. No inicia sesión.',
});
operation('/api/v1/orders/{id}/checkout', 'post', 'createStripeCheckout', {
  body: object({}),
  result: data(
    object({
      paymentId: id,
      checkoutSessionId: string,
      url: { type: 'string', format: 'uri' },
      expiresAt: date,
    }),
  ),
  description:
    'Solo CLIENTE propietario de orden STRIPE pendiente. Reutiliza intento persistente con clave Stripe estable; HTTP proveedor fuera de transacciones. Incertidumbre no crea segundo intento. Invitado recibe permiso limitado checkout al crear orden STRIPE, en X-Checkout-Token; no permite consultar estado. Idempotency-Key UUID v4 obligatoria.',
});
// Checkout invitado lleva permiso opaco independiente en vez de acceso a órdenes.
api.paths['/api/v1/orders/{id}/checkout'].post.security.push({ checkoutToken: [], csrfHeader: [] });
api.paths['/api/v1/orders/{id}/checkout'].post.parameters.push({
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  schema: { type: 'string', format: 'uuid' },
});
api.components.securitySchemes.checkoutToken = {
  type: 'apiKey',
  in: 'header',
  name: 'X-Checkout-Token',
};
api.paths['/api/v1/stripe/webhook'] = {
  post: {
    tags: ['FIN-01'],
    operationId: 'receiveStripeWebhook',
    summary: 'Recibir evento firmado Stripe',
    description:
      'Cuerpo raw antes del parser JSON y sin cookies/CSRF. Firma Stripe-Signature obligatoria. Guarda evento y job antes de 200; duplicados seguros. No llama proveedor dentro de la transacción. Payload normalizado no conserva datos de tarjeta/cliente. Solo checkout.session.completed y checkout.session.expired se procesan; otros se ignoran.',
    security: [],
    parameters: [{ name: 'Stripe-Signature', in: 'header', required: true, schema: string }],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: {
      200: {
        description: 'Evento persistido o duplicado',
        content: { 'application/json': { schema: object({ received: { type: 'boolean' } }) } },
      },
      400: { description: 'Firma/cuerpo inválido' },
      503: { description: 'Proveedor/configuración o persistencia indisponible; reintentar' },
    },
  },
};
api.info.version = '0.11.0';
api.info.description =
  'API de cafetería: catálogo, auth cookie/CSRF, administración, órdenes, CASH/Stripe, tickets, clientes, favoritos, ventas y worker. Registro exclusivamente por QR pagado. FIN-01 verificado con proveedores simulados; sin llamadas reales autorizadas, despliegue ni certificación de producción.';
api.components.schemas.MobileOrderCreate.properties.includeCheckoutToken = {
  type: 'boolean',
  description:
    'Opt-in exclusivo de invitado STRIPE: añade checkout con permiso opaco de cobro, nunca consulta de estado. Cifrado configurado; replay 48h conserva original.',
};
api.paths['/api/v1/orders'].post.responses['201'].content[
  'application/json'
].schema.properties.checkout = object({
  purpose: { type: 'string', enum: ['STRIPE_CHECKOUT'] },
  token,
  expiresAt: date,
});
api.paths['/api/v1/orders'].post.description = api.paths['/api/v1/orders'].post.description.replace(
  'sin Checkout, cobro ni expiración automática.',
  'La creación no cobra: Checkout se solicita aparte y worker realiza expiración.',
);
for (const key of ['CashTicket', 'GuestTicket'])
  for (const field of ['cashReceivedCents', 'changeCents'])
    api.components.schemas[key].properties[field] = {
      ...api.components.schemas[key].properties[field],
      nullable: true,
    };
for (const path of [
  '/api/v1/sales/{id}/ticket',
  '/api/v1/sales/{id}/ticket-access',
  '/api/v1/guest-ticket',
]) {
  const item = api.paths[path];
  for (const method of ['get', 'post'])
    if (item?.[method])
      item[method].description =
        item[method].description.split(' FIN-01 también admite')[0] +
        ' FIN-01 también admite venta STRIPE coherente; importes de efectivo null en tarjeta. Para Stripe las 24h cuentan desde providerPaidAt. Se conservan los permisos previos, sin consulta pública de estado.';
}
for (const item of Object.values(api.paths))
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
    const operation = item[method];
    if (!operation?.tags?.includes('FIN-01')) continue;
    if (operation.security?.some((s) => 'accessCookie' in s))
      operation.security.push({
        productionAccessCookie: [],
        ...(method === 'get' ? {} : { csrfHeader: [] }),
      });
  }
writeFileSync(file, YAML.stringify(api, { lineWidth: 100 }));
