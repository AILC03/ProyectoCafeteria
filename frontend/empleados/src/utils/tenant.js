// ==========================================================================
// Gestor de Tenant / Cuenta para Coffee´s Pos
// Aísla estrictamente los datos (empleados, menú, ventas) por cuenta registrada
// ==========================================================================

import { hashAccountPassword, verifyAccountPassword, isHashed } from './crypto.js';

const ACCOUNT_KEY = 'coffees_pos_account';
const LEGACY_ACCOUNT_KEY = 'taffy_account';
const ACCOUNTS_REGISTRY_KEY = 'coffees_accounts_registry';
const LEGACY_REGISTRY_KEY = 'taffy_accounts_registry';

export function getCurrentAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY) || localStorage.getItem(LEGACY_ACCOUNT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getCurrentTenantId() {
  const account = getCurrentAccount();
  if (!account) return null;
  const rawId = account.tenantId || account.email || account.id || '';
  const clean = String(rawId).trim().toLowerCase();
  return clean || null;
}

export function getCurrentAuthToken() {
  const account = getCurrentAccount();
  return account?.token || null;
}

/**
 * Verifica que un registro (empleado, producto, pedido) pertenezca estrictamente
 * al usuario (Tenant) que tiene la sesión activa.
 */
export function belongsToCurrentTenant(item, explicitTenantId = null) {
  const activeTenant = explicitTenantId || getCurrentTenantId();
  if (!activeTenant) return false;
  if (!item || typeof item !== 'object') return false;

  const itemTenant = String(item.tenantId || item.tenant_id || '').trim().toLowerCase();
  // Si el registro tiene tenantId, debe coincidir exactamente con el tenant activo
  if (itemTenant) {
    return itemTenant === activeTenant;
  }
  return true;
}

/**
 * Guarda una cuenta en el registro local de tenants con contraseña hasheada
 * (nunca en texto plano) para permitir validación segura también en modo offline.
 */
export function saveTenantInLocalRegistry(accountData, plainOrHashedPassword) {
  try {
    const tenantId = String(accountData?.tenantId || accountData?.email || '').trim().toLowerCase();
    if (!tenantId) return;

    const rawRegistry = localStorage.getItem(ACCOUNTS_REGISTRY_KEY);
    const registry = rawRegistry ? JSON.parse(rawRegistry) : {};

    const passwordHash = plainOrHashedPassword
      ? (isHashed(plainOrHashedPassword)
          ? plainOrHashedPassword
          : hashAccountPassword(plainOrHashedPassword, tenantId))
      : registry[tenantId]?.passwordHash || '';

    registry[tenantId] = {
      id: accountData.id || `tenant_${tenantId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      tenantId,
      ownerName: accountData.ownerName || 'Propietario',
      businessName: accountData.businessName || 'Mi Cafetería',
      email: tenantId,
      terminalName: accountData.terminalName || 'Caja Principal',
      licenseKey: accountData.licenseKey || 'COFFEESPOS-DEMO-2026',
      adminEmployeeId: accountData.adminEmployeeId || '101',
      passwordHash,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(ACCOUNTS_REGISTRY_KEY, JSON.stringify(registry));
    localStorage.setItem(LEGACY_REGISTRY_KEY, JSON.stringify(registry));
  } catch (err) {
    console.warn('No se pudo actualizar el registro local de cuentas:', err);
  }
}

/**
 * Verifica las credenciales de una cuenta localmente (respaldo cuando está offline)
 */
export function verifyLocalTenantCredentials(email, passwordInput) {
  try {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !passwordInput) {
      return { success: false, message: 'Ingresa tu correo y contraseña.' };
    }

    const rawRegistry = localStorage.getItem(ACCOUNTS_REGISTRY_KEY) || localStorage.getItem(LEGACY_REGISTRY_KEY);
    const registry = rawRegistry ? JSON.parse(rawRegistry) : {};
    const record = registry[cleanEmail];

    if (!record) {
      return {
        success: false,
        notFoundLocally: true,
        message: 'No se encontró una cuenta registrada con ese correo en este servidor/equipo.'
      };
    }

    if (record.passwordHash && !verifyAccountPassword(passwordInput, record.passwordHash, cleanEmail)) {
      return {
        success: false,
        message: 'Contraseña incorrecta. Verifica tus credenciales.'
      };
    }

    const { passwordHash, ...safeAccount } = record;
    return { success: true, account: safeAccount };
  } catch {
    return { success: false, message: 'Error al validar credenciales de la cuenta.' };
  }
}

// ==========================================================================
// Cuenta de Pruebas Predeterminada (Inicia sesión directa en el POS)
// ==========================================================================
export const DEFAULT_TEST_ACCOUNT = {
  id: 'tenant_admin_coffeespos_com',
  tenantId: 'admin@coffeespos.com',
  ownerName: 'Admin Pruebas',
  businessName: 'Coffee´s Pos',
  email: 'admin@coffeespos.com',
  terminalName: 'Caja Principal',
  licenseKey: 'COFFEESPOS-DEMO-2026',
  adminEmployeeId: '1',
  configuredAt: '2026-10-24T00:00:00.000Z'
};

export const DEFAULT_TEST_EMPLOYEES = [
  {
    id: '1',
    name: 'admin',
    username: 'admin',
    role: 'ADMINISTRADOR',
    pin: 'Admin1234',
    password: 'Admin1234',
    avatar: 'AD',
    color: '#0f172a',
    isAdmin: true,
    createdAt: new Date().toISOString()
  }
];

export function initDefaultTestState() {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(DEFAULT_TEST_ACCOUNT));
    localStorage.setItem(LEGACY_ACCOUNT_KEY, JSON.stringify(DEFAULT_TEST_ACCOUNT));
    localStorage.setItem('coffees_employees_admin@coffeespos.com', JSON.stringify(DEFAULT_TEST_EMPLOYEES));
    localStorage.setItem('taffy_employees_admin@taffypos.com', JSON.stringify(DEFAULT_TEST_EMPLOYEES));
    localStorage.setItem('coffees_current_employee', JSON.stringify(DEFAULT_TEST_EMPLOYEES[0]));
    localStorage.setItem('taffy_current_employee', JSON.stringify(DEFAULT_TEST_EMPLOYEES[0]));
    saveTenantInLocalRegistry(DEFAULT_TEST_ACCOUNT, 'admin');
    return {
      account: DEFAULT_TEST_ACCOUNT,
      employee: DEFAULT_TEST_EMPLOYEES[0]
    };
  } catch (err) {
    console.warn('Error inicializando cuenta de pruebas:', err);
    return { account: DEFAULT_TEST_ACCOUNT, employee: DEFAULT_TEST_EMPLOYEES[0] };
  }
}

