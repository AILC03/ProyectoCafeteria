import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';

describe('configuración', () => {
  it('rechaza URL malformada sin exponer valor', () => {
    expect(() => parseEnvironment({ DATABASE_URL: 'INVALID_PRIVATE_VALUE' })).toThrow(
      'Configuración inválida en: DATABASE_URL',
    );
  });
  it('CORS exige origen HTTP sin path ni credenciales', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://localhost/test',
        FRONTEND_ORIGIN: 'http://localhost:5173/path',
      }),
    ).toThrow('FRONTEND_ORIGIN');
  });
  it('acepta PostgreSQL', () => {
    expect(parseEnvironment({ DATABASE_URL: 'postgresql://localhost/test' }).PORT).toBe(3000);
  });
  it('rechaza otro motor sin mostrar secretos', () => {
    expect(() => parseEnvironment({ DATABASE_URL: 'mysql://user:secret@localhost/test' })).toThrow(
      'Configuración inválida en: DATABASE_URL',
    );
  });
  it('rechaza puerto inválido', () => {
    expect(() =>
      parseEnvironment({ PORT: '0', DATABASE_URL: 'postgresql://localhost/test' }),
    ).toThrow('PORT');
  });
});
