import { ApiError } from '../../../shared/api/client';

const STAFF_USERNAME_MAX_LENGTH = 24;
const STAFF_PASSWORD_MIN_LENGTH = 8;
const STAFF_PASSWORD_MAX_LENGTH = 24;

/** Only trims surrounding whitespace: usernames are never rewritten or normalized further. */
export function normalizeStaffUsername(value: string): string {
  return value.trim();
}

/** Matches the username bounds declared by the StaffLogin contract. */
export function isValidStaffUsername(value: string): boolean {
  const normalized = normalizeStaffUsername(value);
  return normalized.length > 0 && normalized.length <= STAFF_USERNAME_MAX_LENGTH;
}

/** Matches the password bounds declared by the StaffLogin contract. */
export function isValidStaffPassword(value: string): boolean {
  return value.length >= STAFF_PASSWORD_MIN_LENGTH && value.length <= STAFF_PASSWORD_MAX_LENGTH;
}

/** Maps API and network errors into safe, user-facing Spanish messages. */
export function formatStaffAuthError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'No fue posible iniciar sesión. Inténtalo de nuevo.';
  }
  if (error.status === 0) {
    return 'No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.';
  }
  if (error.status === 401) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (error.status === 400) {
    return 'Revisa el usuario (hasta 24 caracteres) y la contraseña (de 8 a 24 caracteres).';
  }
  if (error.status === 409) {
    return 'Hay una sesión activa que debe cerrarse antes de iniciar otra.';
  }
  if (error.status === 429) {
    return 'Demasiados intentos seguidos. Espera un momento antes de volver a intentarlo.';
  }
  if (error.status === 403) {
    if (error.code === 'PIN_CHANGE_REQUIRED') return 'Debes cambiar tu NIP antes de continuar.';
    if (error.code === 'CSRF_INVALID') return 'La verificación de seguridad expiró. Inténtalo de nuevo.';
    return 'Esta cuenta no tiene acceso permitido en la terminal.';
  }
  if (error.status >= 500) {
    return 'El servicio no está disponible temporalmente. Inténtalo más tarde.';
  }
  return 'No fue posible iniciar sesión. Inténtalo de nuevo.';
}
