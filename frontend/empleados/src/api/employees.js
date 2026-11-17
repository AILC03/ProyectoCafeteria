import { apiFetch } from './client.js';

export async function getAdminEmployees() {
  const res = await apiFetch('/admin/employees?limit=50');
  return res.data || [];
}

export async function createAdminEmployee({ name, username, password, role }) {
  const res = await apiFetch('/admin/employees', {
    method: 'POST',
    body: JSON.stringify({
      name: name.trim(),
      username: username.trim(),
      password: password.trim(),
      role, // 'ADMINISTRADOR' | 'CAJERO' | 'PREPARACION'
    }),
  });
  return res.data;
}

export async function updateAdminEmployee(id, { name, role, isActive, reason }) {
  const body = { reason: reason?.trim() || 'Actualización administrativa' };
  if (name !== undefined) body.name = name.trim();
  if (role !== undefined) body.role = role;
  if (isActive !== undefined) body.isActive = isActive;

  const res = await apiFetch(`/admin/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function deleteAdminEmployee(id) {
  const res = await apiFetch(`/admin/employees/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
  return res.data || res;
}
