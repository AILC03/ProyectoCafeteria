import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/client';
import {
  formatCustomerAuthError,
  isValidCustomerIdentifier,
  isValidCustomerPin,
  normalizeCustomerIdentifier,
} from './customerAuthValidation';
import {
  clearGuestSession,
  enterGuestSession,
  getGuestSessionSnapshot,
  normalizeGuestName,
  subscribeGuestSession,
} from './guestSession';

afterEach(() => {
  clearGuestSession();
  localStorage.clear();
  sessionStorage.clear();
});

describe('guestSession', () => {
  it('stores guest mode only in memory and never touches browser storage', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGuestSession(listener);

    expect(getGuestSessionSnapshot()).toEqual({ isGuest: false, guestName: null });

    const active = enterGuestSession('  Ana Sofía  ');
    expect(active).toEqual({ isGuest: true, guestName: 'Ana Sofía' });
    expect(getGuestSessionSnapshot()).toEqual({ isGuest: true, guestName: 'Ana Sofía' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    clearGuestSession();
    expect(getGuestSessionSnapshot()).toEqual({ isGuest: false, guestName: null });
    expect(listener).toHaveBeenCalledTimes(2);

    // Clearing again when already inactive does not notify redundantly.
    clearGuestSession();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('normalizes empty and overly long guest names safely', () => {
    expect(normalizeGuestName()).toBe('Invitado');
    expect(normalizeGuestName('   ')).toBe('Invitado');
    expect(normalizeGuestName('A'.repeat(80))).toHaveLength(60);
  });
});

describe('customerAuthValidation', () => {
  it('normalizes and validates phone numbers and customer C-numbers', () => {
    expect(normalizeCustomerIdentifier('  @C000105  ')).toBe('C000105');
    expect(isValidCustomerIdentifier('5512345678')).toBe(true);
    expect(isValidCustomerIdentifier('+52 5512345678')).toBe(true);
    expect(isValidCustomerIdentifier('c000105')).toBe(true);
    expect(isValidCustomerIdentifier('12345')).toBe(false);
    expect(isValidCustomerIdentifier('cliente@correo.com')).toBe(false);
    expect(isValidCustomerIdentifier('C')).toBe(false);
  });

  it('validates 4-digit numeric PINs', () => {
    expect(isValidCustomerPin('0429')).toBe(true);
    expect(isValidCustomerPin('123')).toBe(false);
    expect(isValidCustomerPin('12ab')).toBe(false);
    expect(isValidCustomerPin('12345')).toBe(false);
  });

  it('formats API errors without leaking technical internals', () => {
    expect(formatCustomerAuthError(new ApiError(0, 'Network request failed'))).toContain('conectar con el servidor');
    expect(formatCustomerAuthError(new ApiError(401, 'Unauthorized', { detail: 'raw stack' }))).toBe(
      'Teléfono, número de cliente o NIP incorrectos.',
    );
    expect(formatCustomerAuthError(new ApiError(429, 'Too many'))).toContain('Demasiados intentos');
    expect(formatCustomerAuthError(new ApiError(503, 'Down'))).toContain('no está disponible');
    expect(formatCustomerAuthError(new Error('SQLITE_BUSY'))).not.toContain('SQLITE_BUSY');
  });
});
