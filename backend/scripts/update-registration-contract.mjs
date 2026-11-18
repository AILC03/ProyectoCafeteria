import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
const file = 'docs/api/openapi.yaml',
  api = parse(readFileSync(file, 'utf8'));
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
api.components.schemas.TicketCustomerRegistration = object({
  token: {
    type: 'string',
    pattern: '^[A-Za-z0-9_-]{43}$',
    writeOnly: true,
    description:
      'Original de 32 bytes base64url emitido por CASH-02; no enviar qrPayload ni su prefijo. No se descifra el ticket ni se acepta token de pago/ticket digital.',
  },
  name: {
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'Nombre en un campo, trim; no controles ASCII.',
  },
  phone: {
    type: 'string',
    pattern: '^(\\+52[0-9]{10}|[0-9]{10})$',
    description:
      'Teléfono MX tras trim, sin separadores; se normaliza a +52 y debe ser único incluso en cuentas inactivas.',
  },
  pin: {
    type: 'string',
    pattern: '^[0-9]{4}$',
    writeOnly: true,
    description:
      'NIP string de cuatro dígitos; conserva ceros. Hash Argon2id con la política de auth.',
  },
});
api.components.schemas.RegisteredTicketCustomer = object({
  customer: object({
    customerNumber: {
      type: 'string',
      pattern: '^C[0-9]{6,19}$',
      description: 'ADR0011: C + identity mínimo seis dígitos; nunca Number ni CLI-.',
    },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    phone: { type: 'string', pattern: '^\\+52[0-9]{10}$' },
  }),
});
const path = '/api/v1/customer-registration/ticket';
const errors = {
  400: 'VALIDATION_ERROR: estructura/forma inválida, campos extra, NIP, teléfono o nombre inválidos.',
  403: 'CSRF_INVALID / FORBIDDEN / ORIGIN_NOT_ALLOWED: bootstrap CSRF y Origin exacto; solo invitado, sin cookie de acceso/refresh.',
  404: 'REGISTRATION_TOKEN_INVALID: código inexistente/no válido para este propósito. No revelar identificadores.',
  409: 'REGISTRATION_TOKEN_USED / REGISTRATION_TOKEN_EXPIRED / REGISTRATION_PURCHASE_INELIGIBLE / PHONE_ALREADY_REGISTERED / REGISTRATION_CONFLICT. No incluye datos de compras ni cuentas ajenas.',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'REGISTRATION_RATE_LIMITED / RATE_LIMITED: límite propio 20 intentos/minuto/IP (memoria por proceso), además del límite global.',
  500: 'INTERNAL_ERROR',
  503: 'DEPENDENCY_UNAVAILABLE: servicio/rol CLIENTE/BD indisponible.',
};
const responses = Object.fromEntries(
  Object.entries(errors).map(([code, description]) => [
    code,
    { description, content: { 'application/problem+json': { schema: ref('Problem') } } },
  ]),
);
responses['201'] = {
  description:
    'Cliente creado, compra del QR asociada y token consumido. Sin sesión automática ni Set-Cookie. Cache-Control:no-store, Referrer-Policy:no-referrer.',
  content: {
    'application/json': {
      schema: object({ data: ref('RegisteredTicketCustomer') }),
      example: {
        data: {
          customer: { customerNumber: 'C000123', name: 'Ana López', phone: '+526641234567' },
        },
      },
    },
  },
};
responses['409'].content['application/problem+json'].example = {
  type: 'about:blank',
  title: 'El código de registro ya fue utilizado',
  status: 409,
  detail: 'El código de registro ya fue utilizado',
  instance: path,
  code: 'REGISTRATION_TOKEN_USED',
  requestId: 'req_example',
};
api.paths[path] ??= {};
api.paths[path].post = {
  tags: ['CustomerRegistration'],
  operationId: 'registerCustomerFromTicket',
  summary: 'Registrar cliente exclusivamente mediante QR de compra pagada de invitado',
  description:
    'Público para invitado con Origin exacto y CSRF prelogin (GET /auth/csrf). No admite cookies de acceso/refresh ni un registro libre sin token. Comparar SHA-256 del original, bloquear token→venta→orden/pago y serializar teléfono; validar no usado, plazo y coherencia de pago SUCCEEDED/confirmado MXN con orden EN_PREPARACION/LISTO pagada, cliente NULL, referencias/total/método iguales. Cuenta CLIENTE/CUSTOMER, asociación solo de esa compra y consumo usedAt/usedBy se realizan en una transacción; conservar snapshots y hash, purgar cifrado al consumir. Vence al menor de expiresAt y pago+24h, revalidado tras hash de NIP. Teléfono existente 409 sin consumir token. Dos solicitudes simultáneas: una 201, las demás 409 usado. No hay replay de respuesta con identidad ni Idempotency-Key requerido. Sin cookies/JWT/login, IDs internos ni secretos en respuesta. QR no concede consultas de compras. Tras alta, iniciar sesión por flujo existente; ante respuesta perdida, no crear otra cuenta. No implementa Stripe, correo, recuperación ni historial.',
  security: [{ csrfHeader: [] }],
  parameters: [],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: ref('TicketCustomerRegistration'),
        example: { token: 'A'.repeat(43), name: 'Ana López', phone: '6641234567', pin: '0007' },
      },
    },
  },
  responses,
};
if (!api.tags.some((tag) => tag.name === 'CustomerRegistration'))
  api.tags.push({
    name: 'CustomerRegistration',
    description:
      'Alta de cliente solo con token de registro de ticket pagado; no registro abierto.',
  });
api.info.version = '0.6.0';
api.info.description =
  'API de catálogo, autenticación cookie/CSRF, administración y órdenes con snapshots. No hay registro abierto. CASH-01/02: caja, cobro efectivo, venta y ticket. AUTH-02: registro de cliente exclusivamente con QR válido de ticket pagado, sin login automático ni recuperación. Sin Stripe, worker ni expiración automática. Cloudinary real pendiente de configuración/verificación; ninguna clave real forma parte del contrato.';
writeFileSync(file, stringify(api, { lineWidth: 100 }));
