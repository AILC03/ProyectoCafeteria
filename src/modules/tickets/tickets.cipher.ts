import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { unavailable } from '../../shared/http/problem.js';

export class TicketCipher {
  private key: Buffer;
  constructor(
    key: string,
    readonly version = 'v1',
  ) {
    if (!/^[a-f0-9]{64}$/i.test(key) || !/^[a-zA-Z0-9_-]{1,32}$/.test(version))
      throw new Error('Configuración de cifrado de tickets inválida');
    this.key = Buffer.from(key, 'hex');
  }
  seal(value: string, saleId: bigint) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`customer-registration:${saleId}:${this.version}`));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }
  open(value: string, saleId: bigint, version: string) {
    try {
      if (
        version !== this.version ||
        value.length > 512 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
      )
        throw unavailable();
      const parts = value.split('.').map((part) => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, parts[0]!);
      decipher.setAAD(Buffer.from(`customer-registration:${saleId}:${version}`));
      decipher.setAuthTag(parts[1]!);
      const result = Buffer.concat([decipher.update(parts[2]!), decipher.final()]).toString('utf8');
      if (!/^[A-Za-z0-9_-]{43}$/.test(result)) throw unavailable();
      return result;
    } catch {
      throw unavailable();
    }
  }
}
export function ticketCipherConfiguration(input: Record<string, string | undefined>) {
  const key = input.TICKET_ENCRYPTION_KEY;
  if (!key && !input.TICKET_KEY_VERSION) return undefined;
  if (
    !key ||
    key.toLowerCase() === input.AUTH_JWT_SECRET?.toLowerCase() ||
    key.toLowerCase() === input.AUTH_CSRF_SECRET?.toLowerCase()
  )
    throw new Error('Configuración de tickets incompleta o clave compartida');
  return new TicketCipher(key, input.TICKET_KEY_VERSION ?? 'v1');
}
