import { PayloadCipher } from '../worker/payload-cipher.js';
import { unavailable } from '../shared/http/problem.js';
export function mailConfiguration(env: Record<string, string | undefined>, frontendOrigin: string) {
  if (!env.OUTBOX_ENCRYPTION_KEY) return undefined;
  if (
    [env.AUTH_JWT_SECRET, env.AUTH_CSRF_SECRET, env.TICKET_ENCRYPTION_KEY].some(
      (key) => key && key.toLowerCase() === env.OUTBOX_ENCRYPTION_KEY!.toLowerCase(),
    )
  )
    throw unavailable();
  return {
    cipher: new PayloadCipher(env.OUTBOX_ENCRYPTION_KEY, env.OUTBOX_KEY_VERSION ?? 'v1'),
    frontendOrigin,
  };
}
