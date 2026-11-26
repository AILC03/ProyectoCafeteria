import { ApiError, apiFetchNoCsrfReplay } from '../../../shared/api/client';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const phonePattern = /^(?:\+52)?\d{10}$/;

export function normalizeRegistrationToken(value: string): string { return value.trim().replace(/^cafeteria:register:/i, ''); }
export function normalizeRegistrationPhone(value: string): string { const phone = value.trim(); return /^\d{10}$/.test(phone) ? `+52${phone}` : phone; }
export function validRegistrationInput(input: { token: string; name: string; phone: string; pin: string }): boolean {
  return tokenPattern.test(input.token) && input.name.trim().length >= 1 && input.name.trim().length <= 120 && [...input.name.trim()].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) && phonePattern.test(input.phone) && /^\d{4}$/.test(input.pin);
}
export async function registerTicketCustomer(input: { token: string; name: string; phone: string; pin: string }): Promise<{ customerNumber: string; name: string; phone: string }> {
  const response = await apiFetchNoCsrfReplay<{ data?: { customer?: unknown } }>('/customer-registration/ticket', { method: 'POST', body: input });
  const customer = response.data?.customer;
  if (customer === null || typeof customer !== 'object' || Array.isArray(customer) || typeof (customer as Record<string, unknown>).customerNumber !== 'string' || typeof (customer as Record<string, unknown>).name !== 'string' || typeof (customer as Record<string, unknown>).phone !== 'string') throw new ApiError(200, 'Respuesta de registro no verificable');
  return customer as { customerNumber: string; name: string; phone: string };
}
export function formatRegistrationError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No fue posible confirmar el registro. No se realizó ningún reintento automático.';
  if (error.status === 0 || error.status >= 500) return 'No fue posible confirmar el registro. No se realizó ningún reintento automático.';
  if (error.status === 429) return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
  if (error.code === 'REGISTRATION_TOKEN_USED') return 'Este código de registro ya fue utilizado.';
  if (error.code === 'REGISTRATION_TOKEN_EXPIRED') return 'Este código de registro venció.';
  if (error.code === 'REGISTRATION_PURCHASE_INELIGIBLE' || error.code === 'REGISTRATION_TOKEN_INVALID') return 'Este ticket no permite registrar una cuenta.';
  if (error.code === 'PHONE_ALREADY_REGISTERED') return 'Este teléfono ya está registrado.';
  if (error.code === 'CSRF_INVALID') return 'La verificación de seguridad se renovó; vuelve a enviar el formulario.';
  return 'Revisa los datos e inténtalo de nuevo.';
}
