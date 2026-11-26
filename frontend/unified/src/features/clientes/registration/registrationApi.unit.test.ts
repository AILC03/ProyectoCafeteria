import { describe, expect, test } from 'vitest';
import { normalizeRegistrationPhone, normalizeRegistrationToken, validRegistrationInput } from './registrationApi';

describe('ticket registration input', () => {
  test('normalizes a scanner QR prefix only in the submitted value', () => {
    expect(normalizeRegistrationToken(`cafeteria:register:${'a'.repeat(43)}`)).toBe('a'.repeat(43));
  });
  test('uses the customer-registration contract validation', () => {
    expect(validRegistrationInput({ token: 'a'.repeat(43), name: 'Ana', phone: '+525512345678', pin: '1234' })).toBe(true);
    expect(validRegistrationInput({ token: 'cash-token', name: 'Ana', phone: normalizeRegistrationPhone('5512345678'), pin: '1234' })).toBe(false);
  });
});
