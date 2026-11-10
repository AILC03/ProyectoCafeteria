import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
// Separación de dominio respecto a tickets; clave fuera de PostgreSQL.
export class PayloadCipher {
  private key: Buffer;
  constructor(
    key: string,
    readonly version = 'v1',
  ) {
    if (!/^[a-f0-9]{64}$/i.test(key) || !/^[A-Za-z0-9_-]{1,32}$/.test(version))
      throw new Error('Configuración de outbox inválida');
    this.key = Buffer.from(key, 'hex');
  }
  seal(value: unknown, reference: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`outbox:${reference}:${this.version}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((p) => p.toString('base64url')).join('.');
  }
  open(value: string, reference: string, version: string): unknown {
    if (version !== this.version || value.length > 16384) throw new Error('Payload no disponible');
    const parts = value.split('.').map((p) => Buffer.from(p, 'base64url'));
    if (parts.length !== 3 || parts[0]!.length !== 12 || parts[1]!.length !== 16)
      throw new Error('Payload inválido');
    const cipher = createDecipheriv('aes-256-gcm', this.key, parts[0]!);
    cipher.setAAD(Buffer.from(`outbox:${reference}:${version}`));
    cipher.setAuthTag(parts[1]!);
    return JSON.parse(Buffer.concat([cipher.update(parts[2]!), cipher.final()]).toString('utf8'));
  }
}
