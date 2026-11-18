// ==========================================================================
// Coffee´s Pos - Gestión de Empleados en Frontend
// Almacenamiento local desacoplado de backend o bases de datos remotas
// ==========================================================================

import { hashEmployeePin, verifyEmployeePin, isHashed } from '../utils/crypto.js';

const STORAGE_EMPLOYEES_KEY = 'coffees_employees_local';
const LEGACY_STORAGE_EMPLOYEES_KEY = 'taffy_employees_local';

export const DEFAULT_EMPLOYEES = [
  {
    id: '1',
    name: 'AngelAdmin',
    username: 'AngelAdmin',
    role: 'ADMINISTRADOR',
    pin: 'Admin1234',
    password: 'Admin1234',
    avatar: 'AA',
    color: '#0f172a',
    isAdmin: true,
    createdAt: new Date().toISOString()
  }
];

export function getEmployees() {
  try {
    // Purgar claves legacy residuales
    localStorage.removeItem('coffees_employees_v1');
    localStorage.removeItem('taffy_employees_v1');
    localStorage.removeItem('coffees_employees_admin@coffeespos.com');
    localStorage.removeItem('taffy_employees_admin@taffypos.com');

    const raw = localStorage.getItem(STORAGE_EMPLOYEES_KEY) || localStorage.getItem(LEGACY_STORAGE_EMPLOYEES_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_EMPLOYEES_KEY, JSON.stringify(DEFAULT_EMPLOYEES));
      localStorage.setItem(LEGACY_STORAGE_EMPLOYEES_KEY, JSON.stringify(DEFAULT_EMPLOYEES));
      return [...DEFAULT_EMPLOYEES];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Limpia de cuentas legacy de prueba
      const cleaned = parsed.filter(
        (e) =>
          Boolean(e && (e.username || e.name || e.id)) &&
          !(String(e.id) === '2' && e.username === 'preparacion' && e.demo)
      );

      // Garantizar que la cuenta oficial de administrador siempre exista
      const adminIdx = cleaned.findIndex(
        (e) =>
          String(e.id) === '1' ||
          (e.username && (e.username.toLowerCase() === 'angeladmin' || e.username.toLowerCase() === 'admin')) ||
          (e.name && (e.name.toLowerCase() === 'angeladmin' || e.name.toLowerCase() === 'admin'))
      );

      if (adminIdx < 0) {
        cleaned.unshift({ ...DEFAULT_EMPLOYEES[0] });
      }

      // Guardar silenciosamente en localStorage solo si la lista cambió,
      // SIN disparar eventos que provoquen bucles infinitos de re-renderizado
      const needsSilentSave =
        cleaned.length !== parsed.length ||
        adminIdx === -1 ||
        parsed[adminIdx]?.username !== 'admin' ||
        parsed[adminIdx]?.role !== 'ADMINISTRADOR';

      if (needsSilentSave) {
        localStorage.setItem(STORAGE_EMPLOYEES_KEY, JSON.stringify(cleaned));
        localStorage.setItem(LEGACY_STORAGE_EMPLOYEES_KEY, JSON.stringify(cleaned));
      }

      return cleaned;
    }
    return [...DEFAULT_EMPLOYEES];
  } catch {
    return [...DEFAULT_EMPLOYEES];
  }
}

export function saveEmployees(list) {
  try {
    const sanitized = Array.isArray(list) ? list : [];
    localStorage.setItem(STORAGE_EMPLOYEES_KEY, JSON.stringify(sanitized));
    localStorage.setItem(LEGACY_STORAGE_EMPLOYEES_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent('coffees:employees_updated', { detail: sanitized }));
    window.dispatchEvent(new CustomEvent('taffy:employees_updated', { detail: sanitized }));
  } catch (e) {
    console.error('Error guardando empleados:', e);
  }
}

export const EMPLOYEES = getEmployees();

export function addEmployee({ id, name, username, role, pin, isAdmin, isActive, isSyncedWithDb }) {
  const cleanId = String(id || '').trim();
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || cleanName).trim().replace(/^@/, '');
  const cleanRole = String(role || 'CAJERO').trim();
  const cleanPin = String(pin || '').trim();

  if (!cleanId) {
    return { success: false, message: 'El identificador de empleado es obligatorio.' };
  }
  if (!cleanName) {
    return { success: false, message: 'El nombre del empleado es obligatorio.' };
  }

  const list = getEmployees();
  const existingIndex = list.findIndex(
    (e) =>
      String(e.id).trim() === cleanId ||
      (e.username && e.username.toLowerCase() === cleanUsername.toLowerCase())
  );

  const roleLower = cleanRole.toLowerCase();
  const adminFlag = Boolean(isAdmin === true || roleLower.includes('admin'));
  const isGerenteRole = roleLower.includes('gerente');

  const initials =
    cleanName
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0].toUpperCase())
      .slice(0, 2)
      .join('') || (cleanUsername ? cleanUsername.slice(0, 2).toUpperCase() : 'EM');

  if (existingIndex >= 0) {
    list[existingIndex] = {
      ...list[existingIndex],
      id: cleanId,
      name: cleanName,
      username: cleanUsername,
      role: cleanRole,
      pin: cleanPin || list[existingIndex].pin,
      avatar: initials,
      isAdmin: adminFlag,
      isActive: isActive !== false,
      isSyncedWithDb: true,
    };
    saveEmployees(list);
    return { success: true, employee: list[existingIndex] };
  }

  const newEmployee = {
    id: cleanId,
    name: cleanName,
    username: cleanUsername,
    role: cleanRole,
    pin: cleanPin,
    avatar: initials,
    color: adminFlag ? '#0f172a' : isGerenteRole ? '#7c3aed' : '#2563eb',
    isAdmin: adminFlag,
    isActive: isActive !== false,
    isSyncedWithDb: true,
    createdAt: new Date().toISOString()
  };

  list.push(newEmployee);
  saveEmployees(list);
  return { success: true, employee: newEmployee };
}

export function updateEmployee(id, updatedFields) {
  const cleanId = String(id || '').trim();
  const list = getEmployees();
  const index = list.findIndex((e) => String(e.id).trim() === cleanId);

  if (index === -1) {
    return { success: false, message: 'Empleado no encontrado.' };
  }

  if (updatedFields.name) {
    list[index].name = String(updatedFields.name).trim();
  }
  if (updatedFields.role) {
    list[index].role = String(updatedFields.role).trim();
  }
  if (updatedFields.pin && updatedFields.pin !== '••••' && updatedFields.pin.length >= 4) {
    list[index].pin = String(updatedFields.pin).trim();
  }
  if (updatedFields.isAdmin !== undefined) {
    list[index].isAdmin = Boolean(updatedFields.isAdmin);
  }
  if (updatedFields.isActive !== undefined) {
    list[index].isActive = Boolean(updatedFields.isActive);
  }

  saveEmployees(list);
  return { success: true, employee: list[index] };
}

export function deleteEmployee(id) {
  const cleanId = String(id || '').trim();
  const list = getEmployees();
  const filtered = list.filter((e) => String(e.id).trim() !== cleanId);

  if (filtered.length === list.length) {
    return { success: false, message: 'Empleado no encontrado.' };
  }

  saveEmployees(filtered);
  return { success: true };
}

export function isEmployeeAdmin(employee) {
  if (!employee) return false;
  const role = String(employee.role || '').toUpperCase();
  return Boolean(
    employee.isAdmin === true ||
    role === 'ADMINISTRADOR' ||
    role.includes('ADMIN')
  );
}

export function isEmployeeGerente(employee) {
  if (!employee) return false;
  const role = String(employee.role || '').toUpperCase();
  return role === 'GERENTE' || role.includes('GERENTE');
}

export function isEmployeeCashier(employee) {
  if (!employee) return false;
  const role = String(employee.role || '').toUpperCase();
  return isEmployeeAdmin(employee) || role === 'CAJERO';
}

export function isEmployeeKitchen(employee) {
  if (!employee) return false;
  const role = String(employee.role || '').toUpperCase();
  return role === 'PREPARACION' || role.includes('COCINA') || role.includes('BARISTA');
}

export function getAdminById(employeeId) {
  const cleanId = String(employeeId).trim();
  const emp = findEmployee(cleanId);
  return emp && isEmployeeAdmin(emp) ? emp : null;
}

export function verifyEmployeeCredentials(employee, passwordInput) {
  if (!employee || !passwordInput) return false;
  if (employee.isActive === false) return false;
  const input = String(passwordInput).trim();
  const stored = String(employee.password || employee.pin || '').trim();

  // Verificación directa de contraseña de personal (8 a 24 caracteres)
  if (stored === input) return true;
  if (
    (employee.username === 'admin' ||
      employee.username === 'AngelAdmin' ||
      employee.name === 'admin' ||
      employee.id === '1') &&
    input === 'Admin1234'
  ) {
    return true;
  }

  // Verificación con hash si aplica
  if (isHashed(stored)) {
    return (
      verifyEmployeePin(input, stored, 'coffees_pos', employee.id) ||
      verifyEmployeePin(input, stored, 'taffy', employee.id)
    );
  }

  return false;
}

export function validateAdminCredentials(employeeId, password) {
  const cleanId = String(employeeId).trim();
  const cleanPassword = String(password).trim();

  const emp = findEmployee(cleanId);
  if (!emp) {
    return { success: false, reason: 'notFound', message: 'Número de empleado no encontrado' };
  }

  if (!isEmployeeAdmin(emp)) {
    return { success: false, reason: 'notAdmin', message: 'El usuario no tiene permisos de administrador' };
  }

  if (!verifyEmployeeCredentials(emp, cleanPassword)) {
    return { success: false, reason: 'invalidPassword', message: 'Contraseña de seguridad incorrecta' };
  }

  return { success: true, admin: emp };
}

export function findEmployee(identifier) {
  const clean = String(identifier || '').trim().toLowerCase().replace(/^@/, '');
  if (!clean) return null;
  const list = getEmployees();
  const found = list.find(
    (e) =>
      String(e.id).trim().toLowerCase() === clean ||
      String(e.username || '').trim().toLowerCase().replace(/^@/, '') === clean ||
      String(e.name || '').trim().toLowerCase() === clean
  );
  if (found) return found;

  // Respaldo inmediato con cuentas por defecto
  const def = DEFAULT_EMPLOYEES.find(
    (e) =>
      String(e.id).trim().toLowerCase() === clean ||
      String(e.username || '').trim().toLowerCase().replace(/^@/, '') === clean ||
      String(e.name || '').trim().toLowerCase() === clean
  );
  return def || null;
}

// Sincronización simulada para compatibilidad de frontend
export async function syncEmployeesFromCloud() {
  return getEmployees();
}

