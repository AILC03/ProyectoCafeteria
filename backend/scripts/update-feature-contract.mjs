import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';

// Genera solo operaciones/componentes auth/admin; conserva el contrato público existente.
const file = 'docs/api/openapi.yaml',
  api = parse(readFileSync(file, 'utf8'));
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const text = (max) => ({ type: 'string', minLength: 1, maxLength: max });
const nullable = (schema) => ({ ...schema, nullable: true });
const id = {
  type: 'string',
  pattern: '^[1-9][0-9]{0,18}$',
  description: 'ID positivo dentro de BIGINT PostgreSQL, sin pérdida de precisión.',
};
const money = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]{0,6})$',
  description: 'Centavos enteros, máximo 9999900.',
};
const instant = { type: 'string', format: 'date-time' };
const bool = { type: 'boolean' };
const csrfSecurity = [{ csrfHeader: [] }];
const authSecurity = [{ accessCookie: [] }, { productionAccessCookie: [] }];
const mutationSecurity = authSecurity.map((entry) => ({ ...entry, csrfHeader: [] }));
api.components.securitySchemes = {
  accessCookie: {
    type: 'apiKey',
    in: 'cookie',
    name: 'caf_access',
    description: 'Desarrollo: JWT HttpOnly, máximo 15 min. No Bearer.',
  },
  productionAccessCookie: {
    type: 'apiKey',
    in: 'cookie',
    name: '__Host-caf_access',
    description: 'Producción: Secure, HttpOnly, Path=/, host-only.',
  },
  csrfHeader: {
    type: 'apiKey',
    in: 'header',
    name: 'X-CSRF-Token',
    description:
      'Token de GET /auth/csrf o login/refresh; coincide con cookie HttpOnly firmada y requiere Origin exacto.',
  },
};
const schemas = api.components.schemas;
schemas.AuthUser = object({
  id,
  name: text(120),
  role: { type: 'string', enum: ['CLIENTE', 'CAJERO', 'PREPARACION', 'ADMINISTRADOR'] },
  accountType: { type: 'string', enum: ['STAFF', 'CUSTOMER'] },
  mustChangePin: bool,
});
schemas.AuthSessionResponse = object({
  data: object({ user: ref('AuthUser'), csrfToken: text(1024) }),
});
schemas.StaffLogin = object({
  username: text(24),
  password: { type: 'string', minLength: 8, maxLength: 24, writeOnly: true },
});
schemas.CustomerLogin = object({
  identifier: text(32),
  pin: { type: 'string', pattern: '^[0-9]{4}$', writeOnly: true },
});
schemas.PinChange = object({
  currentPin: { type: 'string', pattern: '^[0-9]{4}$', writeOnly: true },
  newPin: { type: 'string', pattern: '^[0-9]{4}$', writeOnly: true },
});
schemas.PasswordChange = object({
  currentPassword: { type: 'string', minLength: 8, maxLength: 24, writeOnly: true },
  newPassword: { type: 'string', minLength: 8, maxLength: 24, writeOnly: true },
});
schemas.CategoryCreate = object({ name: text(120), isActive: bool }, ['name']);
schemas.CategoryPatch = { ...schemas.CategoryCreate, required: [], minProperties: 1 };
schemas.ProductCreate = object(
  {
    name: text(160),
    categoryId: id,
    description: nullable({ type: 'string', maxLength: 1500 }),
    basePriceCents: money,
    isAvailable: bool,
  },
  ['name', 'categoryId', 'basePriceCents'],
);
schemas.ProductPatch = { ...schemas.ProductCreate, required: [], minProperties: 1 };
schemas.GroupCreate = object({
  name: text(120),
  pricingScope: { type: 'string', enum: ['GLOBAL', 'PER_PRODUCT'] },
});
schemas.GroupPatch = { ...schemas.GroupCreate, required: [], minProperties: 1 };
schemas.ValueCreate = object(
  { name: text(120), globalSurchargeCents: nullable(money), isAvailable: bool },
  ['name'],
);
schemas.ValuePatch = { ...schemas.ValueCreate, required: [], minProperties: 1 };
schemas.Availability = object({ isAvailable: bool });
schemas.ProductConfiguration = object({
  groups: {
    type: 'array',
    maxItems: 50,
    items: object({
      groupId: id,
      minSelections: { type: 'integer', minimum: 0, maximum: 100 },
      maxSelections: { type: 'integer', minimum: 0, maximum: 100 },
      values: {
        type: 'array',
        maxItems: 100,
        items: object({ valueId: id, surchargeOverrideCents: nullable(money) }, ['valueId']),
      },
    }),
  },
});
schemas.AdminCategory = object({
  id,
  name: text(120),
  isActive: bool,
  deletedAt: nullable(instant),
  createdAt: instant,
});
schemas.AdminProduct = object({
  id,
  categoryId: id,
  name: text(160),
  description: nullable({ type: 'string', maxLength: 1500 }),
  basePriceCents: money,
  imageUrl: nullable({ type: 'string', format: 'uri' }),
  imagePublicId: nullable(text(255)),
  imageVersion: nullable(text(40)),
  isAvailable: bool,
  deletedAt: nullable(instant),
  createdAt: instant,
  updatedAt: instant,
});
schemas.AdminGroup = object({
  id,
  name: text(120),
  pricingScope: { type: 'string', enum: ['GLOBAL', 'PER_PRODUCT'] },
  deletedAt: nullable(instant),
});
schemas.AdminValue = object({
  id,
  optionGroupId: id,
  name: text(120),
  globalSurchargeCents: nullable(money),
  isAvailable: bool,
  deletedAt: nullable(instant),
});
schemas.ImageAuthorization = object({
  intentId: id,
  expiresAt: instant,
  maxBytes: { type: 'integer' },
  maxDimension: { type: 'integer' },
  parameters: {
    type: 'object',
    description:
      'Parámetros controlados y firmados; contiene uploadUrl público y api_key, nunca api_secret.',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
  },
});
schemas.ImageAssociation = object({ intentId: id });
const data = (schema) => object({ data: schema });
function errors() {
  const titles = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN / CSRF_INVALID / PIN_CHANGE_REQUIRED',
    404: 'NOT_FOUND',
    409: 'CONFLICT / REFRESH_ALREADY_ROTATED',
    413: 'PAYLOAD_TOO_LARGE',
    429: 'RATE_LIMITED / AUTH_RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    503: 'DEPENDENCY_UNAVAILABLE',
  };
  return Object.fromEntries(
    Object.entries(titles).map(([status, title]) => [
      status,
      { description: title, content: { 'application/problem+json': { schema: ref('Problem') } } },
    ]),
  );
}
function operation(
  path,
  method,
  operationId,
  description,
  { body, response, status = 200, security = authSecurity, parameters = [], tag = 'Auth' } = {},
) {
  const responses = errors();
  responses[status] = {
    description: status === 204 ? 'Operación completada sin cuerpo.' : 'Operación completada.',
    ...(response ? { content: { 'application/json': { schema: response } } } : {}),
    headers: {
      'Cache-Control': {
        schema: { type: 'string' },
        description: 'no-store para auth y administración.',
      },
      ...(tag === 'Auth'
        ? {
            'Set-Cookie': {
              schema: { type: 'string' },
              description:
                'Cookies HttpOnly, SameSite=Lax; Secure y prefijo __Host- en producción. Access <=15min; refresh sujeto al vencimiento absoluto; tokens no en JSON.',
            },
          }
        : {}),
    },
  };
  api.paths[path] ??= {};
  api.paths[path][method] = {
    tags: [tag],
    operationId,
    summary: description,
    description,
    security,
    parameters,
    responses,
    ...(body
      ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } }
      : {}),
  };
}
operation(
  '/api/v1/auth/csrf',
  'get',
  'bootstrapCsrf',
  'Bootstrap prelogin o contexto de familia; token firmado con TTL de 1 hora. No concede acceso.',
  { response: data(object({ csrfToken: text(1024) })), security: [] },
);
operation(
  '/api/v1/auth/login/staff',
  'post',
  'loginStaff',
  'Usuario y contraseña Argon2id; 5 fallos/15min, bloqueo 15min y límite IP persistente. Sesión absoluta 8h.',
  { body: ref('StaffLogin'), response: ref('AuthSessionResponse'), security: csrfSecurity },
);
operation(
  '/api/v1/auth/login/customer',
  'post',
  'loginCustomer',
  'Teléfono MX (+52 o diez dígitos) o número C, NIP string. No correo ni registro abierto; sesión absoluta 30 días.',
  { body: ref('CustomerLogin'), response: ref('AuthSessionResponse'), security: csrfSecurity },
);
operation(
  '/api/v1/auth/refresh',
  'post',
  'refreshSession',
  'Cookie refresh obligatoria. Rotación atómica; carrera <=5s produce 409 sin Set-Cookie; reuso posterior revoca familia. No extiende límite absoluto.',
  { body: object({}), response: ref('AuthSessionResponse'), security: csrfSecurity },
);
operation(
  '/api/v1/auth/logout',
  'post',
  'logoutSession',
  'Idempotente con CSRF válido; revoca familia actual si existe y limpia cookies. No revoca otros dispositivos.',
  { body: object({}), status: 204, security: csrfSecurity },
);
operation(
  '/api/v1/auth/me',
  'get',
  'currentUser',
  'JWT y estado actual en PostgreSQL. must_change_pin bloquea esta consulta.',
  { response: data(ref('AuthUser')) },
);
operation(
  '/api/v1/auth/pin',
  'patch',
  'changePin',
  'Cliente: NIP actual y nuevo de cuatro dígitos. Permite cambio obligatorio; revoca todas las sesiones y exige nuevo login.',
  { body: ref('PinChange'), status: 204, security: mutationSecurity },
);
operation(
  '/api/v1/auth/password',
  'patch',
  'changePassword',
  'Personal: contraseña actual y nueva, 8–24 caracteres. Revoca todas las sesiones y limpia cookies.',
  { body: ref('PasswordChange'), status: 204, security: mutationSecurity },
);
const parameter = { name: 'id', in: 'path', required: true, schema: id, example: '1' };
const listParameters = [
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } },
  { name: 'includeDeleted', in: 'query', schema: { type: 'boolean', default: false } },
];
for (const [resource, schemaName, createName, patchName] of [
  ['categories', 'AdminCategory', 'CategoryCreate', 'CategoryPatch'],
  ['products', 'AdminProduct', 'ProductCreate', 'ProductPatch'],
  ['option-groups', 'AdminGroup', 'GroupCreate', 'GroupPatch'],
  ['option-values', 'AdminValue', null, 'ValuePatch'],
]) {
  const base = `/api/v1/admin/${resource}`,
    single = `${base}/{id}`,
    tag = 'Admin';
  operation(
    base,
    'get',
    `listAdmin_${resource}`,
    `Solo ADMINISTRADOR: lista paginada de ${resource}; categorías/productos por (createdAt,id), grupos/valores por id.`,
    {
      response: object({ data: { type: 'array', items: ref(schemaName) }, page: ref('Page') }),
      parameters: [
        ...listParameters,
        ...(resource === 'option-values' ? [{ name: 'groupId', in: 'query', schema: id }] : []),
      ],
      tag,
    },
  );
  operation(
    single,
    'get',
    `getAdmin_${resource}`,
    `Solo ADMINISTRADOR: detalle, incluso retirado.`,
    { response: data(ref(schemaName)), parameters: [parameter], tag },
  );
  if (createName)
    operation(base, 'post', `createAdmin_${resource}`, `Solo ADMINISTRADOR: crear ${resource}.`, {
      body: ref(createName),
      response: data(ref(schemaName)),
      status: 201,
      security: mutationSecurity,
      tag,
    });
  operation(
    single,
    'patch',
    `updateAdmin_${resource}`,
    `Solo ADMINISTRADOR: editar; body estricto, sin campos de imagen arbitrarios.`,
    {
      body: ref(patchName),
      response: data(ref(schemaName)),
      parameters: [parameter],
      security: mutationSecurity,
      tag,
    },
  );
  operation(
    single,
    'delete',
    `retireAdmin_${resource}`,
    `Solo ADMINISTRADOR: baja lógica, conserva histórico. Categoría con cualquier producto: 409; opciones/grupos no pueden romper mínimos.`,
    { response: data(ref(schemaName)), parameters: [parameter], security: mutationSecurity, tag },
  );
}
operation(
  '/api/v1/admin/option-groups/{id}/values',
  'post',
  'createGroupValue',
  'Solo ADMINISTRADOR. GLOBAL exige precio global; PER_PRODUCT exige NULL.',
  {
    body: ref('ValueCreate'),
    response: data(ref('AdminValue')),
    status: 201,
    parameters: [parameter],
    security: mutationSecurity,
    tag: 'Admin',
  },
);
operation(
  '/api/v1/admin/option-groups/{id}/values',
  'get',
  'listGroupValues',
  'Valores paginados del grupo; solo ADMINISTRADOR.',
  {
    response: object({ data: { type: 'array', items: ref('AdminValue') }, page: ref('Page') }),
    parameters: [parameter, ...listParameters],
    tag: 'Admin',
  },
);
operation(
  '/api/v1/products/{id}/availability',
  'patch',
  'setProductAvailability',
  'CAJERO o ADMINISTRADOR. Exclusivamente isAvailable; cualquier otro campo produce 400.',
  {
    body: ref('Availability'),
    response: data(ref('AdminProduct')),
    parameters: [parameter],
    security: mutationSecurity,
    tag: 'Admin',
  },
);
operation(
  '/api/v1/admin/products/{id}/configuration',
  'get',
  'getProductConfiguration',
  'Configuración completa administrativa. Sin alterar GET público de opciones.',
  { response: data(ref('ProductConfiguration')), parameters: [parameter], tag: 'Admin' },
);
operation(
  '/api/v1/admin/products/{id}/configuration',
  'put',
  'setProductConfiguration',
  'Reemplazo atómico de asignaciones bajo lock (2026,1). No borra productos/valores ni snapshots; valida grupos, alcance, duplicados y mínimos.',
  {
    body: ref('ProductConfiguration'),
    response: data(ref('ProductConfiguration')),
    parameters: [parameter],
    security: mutationSecurity,
    tag: 'Admin',
  },
);
operation(
  '/api/v1/admin/products/{id}/image-upload',
  'post',
  'authorizeProductImage',
  'Solo ADMINISTRADOR. Intent de un uso, 10min, firma Cloudinary; sin credenciales del proveedor devuelve 503. Imagen <=5MiB, JPEG/PNG/WebP, <=8192px por dimensión y <=40MP.',
  {
    body: object({}),
    response: data(ref('ImageAuthorization')),
    status: 201,
    parameters: [parameter],
    security: mutationSecurity,
    tag: 'Admin',
  },
);
operation(
  '/api/v1/admin/products/{id}/image',
  'put',
  'associateProductImage',
  'Verifica asset en proveedor; solo intent propio. CAS por public_id y versión; limpieza durable diferida dos horas y dispatcher images:cleanup.',
  {
    body: ref('ImageAssociation'),
    response: data(ref('AdminProduct')),
    parameters: [parameter],
    security: mutationSecurity,
    tag: 'Admin',
  },
);
if (!api.tags.some((tag) => tag.name === 'Admin'))
  api.tags.push({
    name: 'Admin',
    description: 'Administración protegida, solo disponibilidad admite CAJERO.',
  });
api.info.version = '0.3.0';
api.info.description =
  'API de catálogo, autenticación cookie/CSRF y administración. No hay registro abierto. Cloudinary es opcional y requiere credenciales; ninguna clave real forma parte del contrato.';
const exampleUser = {
  id: '1',
  name: 'Usuario de ejemplo',
  role: 'ADMINISTRADOR',
  accountType: 'STAFF',
  mustChangePin: false,
};
api.paths['/api/v1/auth/login/staff'].post.responses['200'].content['application/json'].example = {
  data: { user: exampleUser, csrfToken: 'example-only-not-a-real-token' },
};
api.paths['/api/v1/auth/login/staff'].post.requestBody.content['application/json'].example = {
  username: 'AngelAdmin',
  password: 'ExampleOnly42',
};
api.paths['/api/v1/auth/login/customer'].post.responses['200'].content['application/json'].example =
  {
    data: {
      user: { ...exampleUser, id: '2', role: 'CLIENTE', accountType: 'CUSTOMER' },
      csrfToken: 'example-only-not-a-real-token',
    },
  };
api.paths['/api/v1/auth/login/customer'].post.requestBody.content['application/json'].example = {
  identifier: 'C000099',
  pin: '0007',
};
api.paths['/api/v1/auth/csrf'].get.responses['200'].content['application/json'].example = {
  data: { csrfToken: 'example-only-not-a-real-token' },
};
api.paths['/api/v1/auth/me'].get.responses['200'].content['application/json'].example = {
  data: exampleUser,
};
api.paths['/api/v1/admin/categories'].post.responses['201'].content['application/json'].example = {
  data: {
    id: '10',
    name: 'Café',
    isActive: true,
    deletedAt: null,
    createdAt: '2026-10-24T12:00:00.000Z',
  },
};
api.paths['/api/v1/admin/categories'].post.requestBody.content['application/json'].example = {
  name: 'Café',
};
api.paths['/api/v1/admin/products/{id}/configuration'].put.requestBody.content[
  'application/json'
].example = {
  groups: [
    {
      groupId: '1',
      minSelections: 1,
      maxSelections: 1,
      values: [
        { valueId: '1', surchargeOverrideCents: '0' },
        { valueId: '2', surchargeOverrideCents: '1000' },
      ],
    },
  ],
};
api.paths['/api/v1/admin/products/{id}/image-upload'].post.responses['201'].content[
  'application/json'
].example = {
  data: {
    intentId: '1',
    expiresAt: '2026-10-24T12:10:00.000Z',
    maxBytes: 5242880,
    maxDimension: 8192,
    parameters: {
      public_id: 'cafeteria/products/1/example',
      timestamp: 1792843200,
      signature: 'example-only-not-a-real-signature',
      api_key: 'example-public-key',
      cloud_name: 'example-cloud',
      uploadUrl: 'https://api.cloudinary.com/v1_1/example-cloud/image/upload',
    },
  },
};
function clean(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.required) && value.required.length === 0) delete value.required;
  for (const child of Object.values(value)) clean(child);
}
clean(api);
for (const item of Object.values(api.paths))
  for (const method of ['post', 'patch', 'put']) {
    const body = item[method]?.requestBody;
    const schema = body?.content?.['application/json']?.schema;
    if (schema?.type === 'object' && Object.keys(schema.properties ?? {}).length === 0)
      body.required = false;
  }
writeFileSync(file, stringify(api, { lineWidth: 100 }));
