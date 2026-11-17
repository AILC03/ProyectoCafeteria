// Base de datos de empleados del sistema Coffee´s Pos
// Soporta altas, bajas y modificaciones con persistencia local

const STORAGE_KEY_EMPLOYEES = 'coffees_employees_v1';
const LEGACY_STORAGE_KEY_EMPLOYEES = 'taffy_employees_v1';

export const DEFAULT_EMPLOYEES = [
  {
    id: "101",
    name: "Juan Pérez",
    role: "Cajero",
    pin: "1234",
    avatar: "JP",
    color: "#2563eb",
    isAdmin: false
  },
  {
    id: "2676323",
    name: "Ulises Hernández",
    role: "Administrador",
    pin: "6323",
    avatar: "UH",
    color: "#0f172a",
    isAdmin: true
  }
];

// Obtener la lista activa de empleados
export function getEmployees() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EMPLOYEES) || localStorage.getItem(LEGACY_STORAGE_KEY_EMPLOYEES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_EMPLOYEES, JSON.stringify(DEFAULT_EMPLOYEES));
      localStorage.setItem(LEGACY_STORAGE_KEY_EMPLOYEES, JSON.stringify(DEFAULT_EMPLOYEES));
      return [...DEFAULT_EMPLOYEES];
    }
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
    localStorage.setItem(STORAGE_KEY_EMPLOYEES, JSON.stringify(DEFAULT_EMPLOYEES));
    return [...DEFAULT_EMPLOYEES];
  } catch (e) {
    return [...DEFAULT_EMPLOYEES];
  }
}

// Guardar lista de empleados
function saveEmployees(list) {
  try {
    localStorage.setItem(STORAGE_KEY_EMPLOYEES, JSON.stringify(list));
    localStorage.setItem(LEGACY_STORAGE_KEY_EMPLOYEES, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('coffees:employees_updated', { detail: list }));
    window.dispatchEvent(new CustomEvent('taffy:employees_updated', { detail: list }));
  } catch (e) {
    console.error('Error guardando empleados:', e);
  }
}

// Compatibilidad con export anterior
export const EMPLOYEES = getEmployees();

// Dar de alta un nuevo empleado (número de usuario y PIN manuales por gerencia)
export function addEmployee({ id, name, role, pin, isAdmin }) {
  const cleanId = String(id || '').trim();
  const cleanName = String(name || '').trim();
  const cleanRole = String(role || 'Cajero').trim();
  const cleanPin = String(pin || '').trim();

  if (!cleanId) {
    return { success: false, message: 'El número de empleado es obligatorio.' };
  }
  if (!cleanName) {
    return { success: false, message: 'El nombre del empleado es obligatorio.' };
  }
  if (!cleanPin || cleanPin.length < 4) {
    return { success: false, message: 'El PIN debe contener al menos 4 dígitos.' };
  }

  const list = getEmployees();
  const exists = list.some(e => String(e.id).trim() === cleanId);
  if (exists) {
    return { success: false, message: `El número de usuario ${cleanId} ya está registrado.` };
  }

  const roleLower = cleanRole.toLowerCase();
  const adminFlag = Boolean(
    isAdmin === true ||
    roleLower.includes('admin') ||
    roleLower.includes('gerente')
  );

  const initials = cleanName
    .split(' ')
    .filter(Boolean)
    .map(p => p[0].toUpperCase())
    .slice(0, 2)
    .join('') || 'EM';

  const newEmployee = {
    id: cleanId,
    name: cleanName,
    role: cleanRole,
    pin: cleanPin,
    avatar: initials,
    color: adminFlag ? '#0f172a' : '#2563eb',
    isAdmin: adminFlag,
    createdAt: new Date().toISOString()
  };

  list.push(newEmployee);
  saveEmployees(list);
  return { success: true, employee: newEmployee };
}

// Dar de baja a un empleado
export function deleteEmployee(id, currentUserId = null) {
  const cleanId = String(id).trim();
  const list = getEmployees();

  if (currentUserId && String(currentUserId).trim() === cleanId) {
    return { success: false, message: 'No puede darse de baja al usuario que tiene la sesión activa.' };
  }

  const target = list.find(e => String(e.id).trim() === cleanId);
  if (!target) {
    return { success: false, message: 'Empleado no encontrado.' };
  }

  // Prevenir eliminar si es el único administrador
  if (isEmployeeAdmin(target)) {
    const adminCount = list.filter(e => isEmployeeAdmin(e)).length;
    if (adminCount <= 1) {
      return { success: false, message: 'No se puede eliminar al único administrador del sistema.' };
    }
  }

  const updatedList = list.filter(e => String(e.id).trim() !== cleanId);
  saveEmployees(updatedList);
  return { success: true };
}

// Actualizar información de un empleado
export function updateEmployee(id, fields) {
  const cleanId = String(id).trim();
  const list = getEmployees();
  const index = list.findIndex(e => String(e.id).trim() === cleanId);
  if (index === -1) {
    return { success: false, message: 'Empleado no encontrado.' };
  }

  const existing = list[index];
  const role = fields.role !== undefined ? String(fields.role).trim() : existing.role;
  const roleLower = role.toLowerCase();
  const isAdmin = fields.isAdmin !== undefined
    ? Boolean(fields.isAdmin)
    : (roleLower.includes('admin') || roleLower.includes('gerente') || existing.isAdmin);

  list[index] = {
    ...existing,
    ...fields,
    role,
    isAdmin,
    pin: fields.pin ? String(fields.pin).trim() : existing.pin,
    name: fields.name ? String(fields.name).trim() : existing.name
  };

  saveEmployees(list);
  return { success: true, employee: list[index] };
}

// Comprueba si un empleado tiene rol de administrador / gerente
export function isEmployeeAdmin(employee) {
  if (!employee) return false;
  return Boolean(
    employee.isAdmin === true ||
    String(employee.id).trim() === "2676323" ||
    String(employee.role || '').toLowerCase().includes("admin") ||
    String(employee.role || '').toLowerCase().includes("gerente")
  );
}

// Busca un administrador registrado por su número de empleado
export function getAdminById(employeeId) {
  const cleanId = String(employeeId).trim();
  const emp = findEmployee(cleanId);
  if (emp && isEmployeeAdmin(emp)) {
    return emp;
  }
  return null;
}

// Valida credenciales completas de administrador (Número de empleado + PIN)
export function validateAdminCredentials(employeeId, pin) {
  const cleanId = String(employeeId).trim();
  const cleanPin = String(pin).trim();

  const emp = findEmployee(cleanId);
  if (!emp) {
    return { success: false, reason: 'notFound', message: 'Número de empleado no encontrado' };
  }

  if (!isEmployeeAdmin(emp)) {
    return { success: false, reason: 'notAdmin', message: 'El usuario no tiene permisos de administrador' };
  }

  if (String(emp.pin).trim() !== cleanPin) {
    return { success: false, reason: 'invalidPin', message: 'PIN de seguridad incorrecto' };
  }

  return { success: true, admin: emp };
}

// Función para buscar empleado por ID
export function findEmployee(id) {
  const cleanId = String(id).trim();
  const list = getEmployees();
  const emp = list.find(e => String(e.id).trim() === cleanId);
  if (emp) return emp;
  return null;
}
