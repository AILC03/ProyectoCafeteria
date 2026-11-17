import { apiFetch, invalidateCsrfToken } from './client.js';

/**
 * Autentica al personal (ADMINISTRADOR, CAJERO, PREPARACION).
 * Genera cookies de sesión HttpOnly.
 */
export async function loginStaff(username, password) {
  const res = await apiFetch('/auth/login/staff', {
    method: 'POST',
    body: JSON.stringify({
      username: username.trim(),
      password: password.trim(),
    }),
  });
  return res.data?.user || res.user;
}

/**
 * Consulta la sesión actual de PostgreSQL para el personal autenticado.
 */
export async function getCurrentUser() {
  const res = await apiFetch('/auth/me');
  return res.data?.user || res.user;
}

/**
 * Cierra la sesión activa en el servidor y limpia las cookies.
 */
export async function logoutStaff() {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } finally {
    invalidateCsrfToken();
  }
}
