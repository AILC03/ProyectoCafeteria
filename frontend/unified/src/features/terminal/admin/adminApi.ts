import { ApiError, apiFetch } from '../../../shared/api/client';

const ID = /^[1-9][0-9]{0,18}$/;
const CENTS = /^(0|[1-9][0-9]{0,6})$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const USERNAME = /^[A-Za-z0-9_]{3,24}$/;
const ROLES = ['CAJERO', 'PREPARACION', 'ADMINISTRADOR'] as const;
const LEGACY_ROLES = [...ROLES, 'GERENTE'] as const;

export type AdminCategory = { id: string; name: string; isActive: boolean; deletedAt: string | null; createdAt: string };
export type AdminProduct = {
  id: string; categoryId: string; name: string; description: string | null; basePriceCents: string;
  imageUrl: string | null; imagePublicId: string | null; imageVersion: string | null;
  isAvailable: boolean; deletedAt: string | null; createdAt: string; updatedAt: string;
};
export type AdminGroup = { id: string; name: string; pricingScope: 'GLOBAL' | 'PER_PRODUCT'; deletedAt: string | null };
export type AdminValue = { id: string; optionGroupId: string; name: string; globalSurchargeCents: string | null; isAvailable: boolean; deletedAt: string | null };
export type AdminEmployee = { id: string; name: string; username: string; role: string; isActive: boolean };
export type AdminEntity = AdminCategory | AdminProduct | AdminGroup | AdminValue | AdminEmployee;
export type AdminKind = 'categories' | 'products' | 'option-groups' | 'option-values' | 'employees';
export type AdminPage<T extends AdminEntity> = { items: T[]; nextCursor: string | null };
export type AdminConfiguration = {
  groups: Array<{ groupId: string; minSelections: number; maxSelections: number;
    values: Array<{ valueId: string; surchargeOverrideCents?: string | null }> }>;
};

export class UnverifiableAdminResponseError extends Error {
  constructor() { super('La respuesta administrativa no se puede verificar.'); this.name = 'UnverifiableAdminResponseError'; }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[], required = allowed): boolean {
  return Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function date(value: unknown): value is string {
  return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value));
}
function nullableDate(value: unknown): boolean { return value === null || date(value); }
function nullableText(value: unknown, max: number): boolean { return value === null || (typeof value === 'string' && value.length <= max); }
function positiveId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function cents(value: unknown): value is string { return typeof value === 'string' && CENTS.test(value) && Number(value) <= 9999900; }
function uri(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; }
}

const fields: Record<AdminKind, string[]> = {
  categories: ['id', 'name', 'isActive', 'deletedAt', 'createdAt'],
  products: ['id', 'categoryId', 'name', 'description', 'basePriceCents', 'imageUrl', 'imagePublicId', 'imageVersion', 'isAvailable', 'deletedAt', 'createdAt', 'updatedAt'],
  'option-groups': ['id', 'name', 'pricingScope', 'deletedAt'],
  'option-values': ['id', 'optionGroupId', 'name', 'globalSurchargeCents', 'isAvailable', 'deletedAt'],
  employees: ['id', 'name', 'username', 'role', 'isActive'],
};

function parseEntity<K extends AdminKind>(kind: K, value: unknown): ExtractEntity<K> {
  if (!record(value) || !keys(value, fields[kind]) || !positiveId(value.id)) throw new UnverifiableAdminResponseError();
  let valid = false;
  switch (kind) {
    case 'categories': valid = text(value.name, 120) && typeof value.isActive === 'boolean' && nullableDate(value.deletedAt) && date(value.createdAt); break;
    case 'products': valid = positiveId(value.categoryId) && text(value.name, 160) && nullableText(value.description, 1500)
      && cents(value.basePriceCents) && uri(value.imageUrl)
      && (value.imagePublicId === null || text(value.imagePublicId, 255))
      && (value.imageVersion === null || text(value.imageVersion, 40))
      && typeof value.isAvailable === 'boolean' && nullableDate(value.deletedAt)
      && date(value.createdAt) && date(value.updatedAt); break;
    case 'option-groups': valid = text(value.name, 120) && (value.pricingScope === 'GLOBAL' || value.pricingScope === 'PER_PRODUCT') && nullableDate(value.deletedAt); break;
    case 'option-values': valid = positiveId(value.optionGroupId) && text(value.name, 120)
      && (value.globalSurchargeCents === null || cents(value.globalSurchargeCents))
      && typeof value.isAvailable === 'boolean' && nullableDate(value.deletedAt); break;
    case 'employees': valid = text(value.name, 120) && typeof value.username === 'string' && USERNAME.test(value.username)
      && LEGACY_ROLES.some((role) => role === value.role) && typeof value.isActive === 'boolean'; break;
  }
  if (!valid) throw new UnverifiableAdminResponseError();
  return value as ExtractEntity<K>;
}

type ExtractEntity<K extends AdminKind> = K extends 'categories' ? AdminCategory : K extends 'products' ? AdminProduct
  : K extends 'option-groups' ? AdminGroup : K extends 'option-values' ? AdminValue : AdminEmployee;

function parseOne<K extends AdminKind>(kind: K, value: unknown, expectedId?: string): ExtractEntity<K> {
  if (!record(value) || !keys(value, ['data'])) throw new UnverifiableAdminResponseError();
  const item = parseEntity(kind, value.data);
  if (expectedId !== undefined && item.id !== expectedId) throw new UnverifiableAdminResponseError();
  return item;
}

export function adminQuery(includeDeleted = false, cursor?: string): string {
  if (cursor !== undefined && (cursor.length < 1 || cursor.length > 2048)) throw new TypeError('Cursor no válido.');
  const query = new URLSearchParams({ limit: '20' });
  if (cursor !== undefined) query.set('cursor', cursor);
  if (includeDeleted) query.set('includeDeleted', 'true');
  return `?${query.toString()}`;
}

export async function listAdmin<K extends AdminKind>(kind: K, cursor?: string, includeDeleted = false, signal?: AbortSignal): Promise<AdminPage<ExtractEntity<K>>> {
  const query = adminQuery(kind === 'employees' ? false : includeDeleted, cursor);
  const result = await apiFetch<unknown>(`/admin/${kind}${query}`, { signal });
  if (!record(result) || !keys(result, ['data', 'page']) || !Array.isArray(result.data)
    || !record(result.page) || !keys(result.page, ['limit', 'nextCursor'])
    || !Number.isInteger(result.page.limit) || (result.page.limit as number) < 1 || (result.page.limit as number) > 100
    || (result.page.nextCursor !== null && (typeof result.page.nextCursor !== 'string' || result.page.nextCursor.length < 1 || result.page.nextCursor.length > 2048))) {
    throw new UnverifiableAdminResponseError();
  }
  return { items: result.data.map((item) => parseEntity(kind, item)), nextCursor: result.page.nextCursor as string | null };
}

const writeFields: Record<AdminKind, string[]> = {
  categories: ['name', 'isActive'],
  products: ['name', 'categoryId', 'description', 'basePriceCents', 'isAvailable'],
  'option-groups': ['name', 'pricingScope'],
  'option-values': ['name', 'globalSurchargeCents', 'isAvailable'],
  employees: ['name', 'username', 'password', 'role', 'isActive', 'reason'],
};

function validateWrite(kind: AdminKind, method: 'POST' | 'PATCH', input: Record<string, unknown>): void {
  if (!record(input) || !Object.keys(input).every((key) => writeFields[kind].includes(key))) throw new TypeError('Campos no permitidos.');
  const required = kind === 'employees' ? (method === 'POST' ? ['name', 'username', 'password', 'role'] : ['reason'])
    : method === 'PATCH' ? [] : kind === 'products' ? ['name', 'categoryId', 'basePriceCents']
      : kind === 'option-groups' ? ['name', 'pricingScope'] : ['name'];
  if (!required.every((key) => Object.hasOwn(input, key)) || (method === 'PATCH' && Object.keys(input).length === (kind === 'employees' ? 1 : 0))) {
    throw new TypeError('Faltan datos para guardar.');
  }
  if (kind === 'employees' && method === 'POST' && ('isActive' in input || 'reason' in input)) throw new TypeError('Campos no permitidos.');
  for (const [key, value] of Object.entries(input)) {
    if (key === 'name' && !text(value, kind === 'products' ? 160 : 120)) throw new TypeError('Nombre no válido.');
    if (key === 'categoryId' && !positiveId(value)) throw new TypeError('Categoría no válida.');
    if (key === 'basePriceCents' && !cents(value)) throw new TypeError('Precio no válido.');
    if (key === 'description' && !nullableText(value, 1500)) throw new TypeError('Descripción no válida.');
    if (key === 'isActive' || key === 'isAvailable') { if (typeof value !== 'boolean') throw new TypeError('Estado no válido.'); }
    if (key === 'pricingScope' && value !== 'GLOBAL' && value !== 'PER_PRODUCT') throw new TypeError('Tipo de recargo no válido.');
    if (key === 'globalSurchargeCents' && value !== null && !cents(value)) throw new TypeError('Recargo no válido.');
    if (key === 'username' && (typeof value !== 'string' || !USERNAME.test(value))) throw new TypeError('Usuario no válido.');
    if (key === 'password' && (typeof value !== 'string' || value.length < 8 || value.length > 24)) throw new TypeError('Contraseña no válida.');
    if (key === 'role' && !ROLES.some((role) => role === value)) throw new TypeError('Rol no permitido.');
    if (key === 'reason' && !text(value, 500)) throw new TypeError('Motivo obligatorio.');
  }
  if (kind === 'employees' && method === 'PATCH' && ('password' in input || 'username' in input)) throw new TypeError('Datos de acceso no editables.');
  if (kind !== 'employees' && ('reason' in input || 'password' in input)) throw new TypeError('Campos no permitidos.');
}

export async function writeAdmin<K extends AdminKind>(kind: K, input: Record<string, unknown>, id?: string, groupId?: string): Promise<ExtractEntity<K>> {
  const method = id === undefined ? 'POST' : 'PATCH';
  if (id !== undefined && !positiveId(id)) throw new TypeError('ID no válido.');
  if (groupId !== undefined && !positiveId(groupId)) throw new TypeError('Grupo no válido.');
  if (groupId !== undefined && (kind !== 'option-values' || method !== 'POST')) throw new TypeError('Grupo no permitido para esta operación.');
  if (kind === 'option-values' && method === 'POST' && groupId === undefined) throw new TypeError('Selecciona primero un grupo.');
  validateWrite(kind, method, input);
  const endpoint = groupId !== undefined ? `/admin/option-groups/${groupId}/values` : `/admin/${kind}${id === undefined ? '' : `/${id}`}`;
  const response = await apiFetch<unknown>(endpoint, { method, body: input });
  const item = parseOne(kind, response, id);
  if (groupId !== undefined && kind === 'option-values' && (item as AdminValue).optionGroupId !== groupId) throw new UnverifiableAdminResponseError();
  for (const [key, value] of Object.entries(input)) {
    if (key === 'password' || key === 'reason') continue;
    if ((item as unknown as Record<string, unknown>)[key] !== value) throw new UnverifiableAdminResponseError();
  }
  return item;
}

export async function deleteAdmin<K extends Exclude<AdminKind, 'employees'>>(kind: K, id: string): Promise<ExtractEntity<K>> {
  if (!positiveId(id)) throw new TypeError('ID no válido.');
  const response = await apiFetch<unknown>(`/admin/${kind}/${id}`, { method: 'DELETE' });
  const item = parseOne(kind, response, id);
  if ((item as AdminCategory).deletedAt === null) throw new UnverifiableAdminResponseError();
  return item;
}

function parseConfiguration(value: unknown): AdminConfiguration {
  if (!record(value) || !keys(value, ['groups']) || !Array.isArray(value.groups) || value.groups.length > 50) throw new UnverifiableAdminResponseError();
  const seenGroups = new Set<string>();
  for (const group of value.groups) {
    if (!record(group) || !keys(group, ['groupId', 'minSelections', 'maxSelections', 'values'])
      || !positiveId(group.groupId) || seenGroups.has(group.groupId)
      || !Number.isInteger(group.minSelections) || !Number.isInteger(group.maxSelections)
      || (group.minSelections as number) < 0 || (group.maxSelections as number) > 100
      || (group.minSelections as number) > (group.maxSelections as number)
      || !Array.isArray(group.values) || group.values.length > 100) throw new UnverifiableAdminResponseError();
    seenGroups.add(group.groupId);
    const seenValues = new Set<string>();
    for (const option of group.values) {
      if (!record(option) || !keys(option, ['valueId', 'surchargeOverrideCents'], ['valueId'])
        || !positiveId(option.valueId) || seenValues.has(option.valueId)
        || (option.surchargeOverrideCents !== undefined && option.surchargeOverrideCents !== null && !cents(option.surchargeOverrideCents))) {
        throw new UnverifiableAdminResponseError();
      }
      seenValues.add(option.valueId);
    }
  }
  return value as AdminConfiguration;
}

export async function getConfiguration(productId: string, signal?: AbortSignal): Promise<AdminConfiguration> {
  if (!positiveId(productId)) throw new TypeError('Producto no válido.');
  const response = await apiFetch<unknown>(`/admin/products/${productId}/configuration`, { signal });
  if (!record(response) || !keys(response, ['data'])) throw new UnverifiableAdminResponseError();
  return parseConfiguration(response.data);
}

export async function putConfiguration(productId: string, configuration: AdminConfiguration): Promise<AdminConfiguration> {
  if (!positiveId(productId)) throw new TypeError('Producto no válido.');
  try { parseConfiguration(configuration); }
  catch (error) {
    if (error instanceof UnverifiableAdminResponseError) throw new TypeError('Configuración no válida. No se envió ningún cambio.');
    throw error;
  }
  const response = await apiFetch<unknown>(`/admin/products/${productId}/configuration`, { method: 'PUT', body: configuration });
  if (!record(response) || !keys(response, ['data'])) throw new UnverifiableAdminResponseError();
  const saved = parseConfiguration(response.data);
  const canonical = (groups: AdminConfiguration['groups']) => groups.map((group) => ({
    groupId: group.groupId, minSelections: group.minSelections, maxSelections: group.maxSelections,
    values: group.values.map((value) => ({ valueId: value.valueId, surchargeOverrideCents: value.surchargeOverrideCents ?? null }))
      .sort((a, b) => a.valueId.localeCompare(b.valueId)),
  })).sort((a, b) => a.groupId.localeCompare(b.groupId));
  if (JSON.stringify(canonical(saved.groups)) !== JSON.stringify(canonical(configuration.groups))) throw new UnverifiableAdminResponseError();
  return saved;
}

export function formatAdminError(error: unknown): string {
  if (error instanceof UnverifiableAdminResponseError || error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No se pudo consultar la administración.';
  if (error.status === 403) return 'No tienes permiso para esta operación administrativa.';
  if (error.status === 401) return 'La sesión venció. Vuelve a acceder.';
  if (error.status === 404) return 'El elemento ya no existe. Actualiza la lista.';
  if (error.status === 409) return 'El elemento cambió o ya existe. Actualiza la lista antes de intentarlo de nuevo.';
  if (error.status === 429) return 'Demasiadas solicitudes. Inténtalo más tarde.';
  return 'No se pudo completar la operación. Comprueba el estado en el servidor antes de repetirla.';
}

export function formatAdminMutationError(error: unknown): string {
  if (isUncertainAdminMutation(error)) {
    return 'Resultado incierto: el cambio puede haberse aplicado en el servidor. Actualiza los datos antes de decidir qué hacer; no repitas la operación sin comprobarla.';
  }
  return formatAdminError(error);
}

export function isUncertainAdminMutation(error: unknown): boolean {
  return error instanceof UnverifiableAdminResponseError || error instanceof ApiError && (error.status === 0 || error.status === 503);
}
