import { ApiError } from '../../../shared/api/client';

const CUSTOMER_IDENTIFIER_PATTERN = /^(?:(?:\+?52\s?)?\d{10}|C\d{1,19})$/i;
const CUSTOMER_PIN_PATTERN = /^\d{4}$/;

/** Trims surrounding spaces and an optional leading `@` from the identifier. */
export function normalizeCustomerIdentifier(value: string): string {
  return value.trim().replace(/^@/, '');
}

/** Checks MX 10-digit phone (optional +52) or `C`-prefixed customer number. */
export function isValidCustomerIdentifier(identifier: string): boolean {
  const normalized = normalizeCustomerIdentifier(identifier);
  return normalized.length > 0 && normalized.length <= 32 && CUSTOMER_IDENTIFIER_PATTERN.test(normalized);
}

/** Checks that the customer PIN contains exactly 4 numeric digits. */
export function isValidCustomerPin(pin: string): boolean {
  return CUSTOMER_PIN_PATTERN.test(pin);
}

/** Maps API and network errors into safe, user-facing Spanish messages. */
export function formatCustomerAuthError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'No fue posible iniciar sesión. Inténtalo de nuevo.';
  }
  if (error.status === 0) {
    return 'No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.';
  }
  if (error.status === 401) {
    return 'Teléfono, número de cliente o NIP incorrectos.';
  }
  if (error.status === 400) {
    return 'Revisa el formato de tu teléfono o número de cliente y tu NIP de 4 dígitos.';
  }
  if (error.status === 409) {
    return 'Hay una sesión activa que debe cerrarse antes de iniciar otra.';
  }
  if (error.status === 429) {
    return 'Demasiados intentos seguidos. Espera un momento antes de volver a intentarlo.';
  }
  if (error.status === 403) {
    return error.code === 'CSRF_INVALID'
      ? 'La verificación de seguridad expiró. Inténtalo de nuevo.'
      : 'Esta cuenta no tiene acceso permitido en el área de cliente.';
  }
  if (error.status >= 500) {
    return 'El servicio no está disponible temporalmente. Inténtalo más tarde.';
  }
  return 'No fue posible iniciar sesión. Inténtalo de nuevo.';
}
