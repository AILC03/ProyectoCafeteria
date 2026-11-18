import { argon2id, hash } from 'argon2';

// Política existente de auth/ADR0005. Reutilizada también por registro de NIP.
const hashOptions = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashCredential = (secret: string) => hash(secret, hashOptions);
