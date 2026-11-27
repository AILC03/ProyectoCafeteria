import { ApiError } from '../../../shared/api/client';
import { describe, expect, test } from 'vitest';
import { staffDestination, staffHomeLinks, isTerminalRole } from './staffAccess';
import {
  formatStaffAuthError,
  isValidStaffPassword,
  isValidStaffUsername,
  normalizeStaffUsername,
} from './staffAuthValidation';

describe('staff access helpers', () => {
  test('accepts only terminal roles and routes each role to an allowed destination', () => {
    expect(isTerminalRole('CAJERO')).toBe(true);
    expect(isTerminalRole('PREPARACION')).toBe(true);
    expect(isTerminalRole('ADMINISTRADOR')).toBe(true);
    expect(isTerminalRole('GERENTE')).toBe(false);
    expect(isTerminalRole('CLIENTE')).toBe(false);
    expect(staffDestination('CAJERO')).toBe('/terminal/pos');
    expect(staffDestination('ADMINISTRADOR')).toBe('/terminal/pos');
    expect(staffDestination('PREPARACION')).toBe('/terminal/cocina');
    expect(staffDestination('GERENTE')).toBe('/terminal');
  });

  test('offers only shortcuts permitted for the actor role', () => {
    expect(staffHomeLinks('CAJERO').map((link) => link.to)).toEqual(['/terminal/pos', '/terminal/cocina']);
    expect(staffHomeLinks('PREPARACION').map((link) => link.to)).toEqual(['/terminal/cocina']);
    expect(staffHomeLinks('ADMINISTRADOR').map((link) => link.to)).toEqual([
      '/terminal/pos', '/terminal/cocina', '/terminal/administracion',
    ]);
    expect(staffHomeLinks('GERENTE')).toEqual([]);
    expect(staffHomeLinks('CLIENTE')).toEqual([]);
  });
});

describe('staff credential validation', () => {
  test('trims the username without rewriting it and enforces contract bounds', () => {
    expect(normalizeStaffUsername('  cajero1  ')).toBe('cajero1');
    expect(isValidStaffUsername('  cajero1  ')).toBe(true);
    expect(isValidStaffUsername('')).toBe(false);
    expect(isValidStaffUsername('   ')).toBe(false);
    expect(isValidStaffUsername('a'.repeat(24))).toBe(true);
    expect(isValidStaffUsername('a'.repeat(25))).toBe(false);
  });

  test('enforces the 8-24 character password bounds', () => {
    expect(isValidStaffPassword('12345678')).toBe(true);
    expect(isValidStaffPassword('a'.repeat(24))).toBe(true);
    expect(isValidStaffPassword('1234567')).toBe(false);
    expect(isValidStaffPassword('a'.repeat(25))).toBe(false);
  });

  test('maps API and network errors to safe Spanish messages without echoing secrets', () => {
    expect(formatStaffAuthError(new ApiError(401, 'Invalid credentials'))).toBe('Usuario o contraseña incorrectos.');
    expect(formatStaffAuthError(new ApiError(429, 'Rate limited'))).toContain('Demasiados intentos');
    expect(formatStaffAuthError(new ApiError(409, 'Conflict'))).toContain('sesión activa');
    expect(formatStaffAuthError(new ApiError(0, 'Network'))).toContain('No pudimos conectar');
    expect(formatStaffAuthError(new ApiError(503, 'Unavailable'))).toContain('no está disponible');
    expect(formatStaffAuthError(new ApiError(400, 'Validation'))).toContain('24 caracteres');
    expect(formatStaffAuthError(new ApiError(403, 'Forbidden', { code: 'CSRF_INVALID' }))).toContain('verificación de seguridad');
    expect(formatStaffAuthError(new ApiError(403, 'Forbidden', { code: 'PIN_CHANGE_REQUIRED' }))).toContain('cambiar tu NIP');
    expect(formatStaffAuthError(new ApiError(403, 'Forbidden'))).toContain('no tiene acceso permitido');
    expect(formatStaffAuthError(new Error('secret password detail'))).toBe('No fue posible iniciar sesión. Inténtalo de nuevo.');
  });
});
