import { z } from 'zod';
import type { PayloadCipher } from './payload-cipher.js';
import { WorkerRepository } from './worker.repository.js';

export interface MailTransport {
  send(message: { to: string; subject: string; text: string; messageId: string }): Promise<void>;
}
export type JobHandler = (reference: string) => Promise<void>;
export class WorkerService {
  constructor(
    readonly repository: WorkerRepository,
    readonly handlers: Record<string, JobHandler>,
    readonly mail?: { cipher: PayloadCipher; transport: MailTransport },
    readonly now: () => Date = () => new Date(),
  ) {}
  async tick() {
    await this.repository.maintenance(this.now());
    for (const outbox of [false, true]) {
      if (outbox && !this.mail) continue;
      const work = await this.repository.claim(
        outbox,
        this.now(),
        60000,
        outbox ? ['EMAIL'] : Object.keys(this.handlers),
      );
      if (!work) continue;
      try {
        if (outbox) {
          if (work.expiresAt && work.expiresAt <= this.now()) {
            await this.repository.finish(work, true, true, this.now());
            continue;
          }
          if (!this.mail || !work.encryptedPayload || !work.keyVersion || work.type !== 'EMAIL')
            throw new Error('MAIL_UNAVAILABLE');
          const value = z
            .object({
              to: z.string().email(),
              subject: z.string().max(200),
              text: z.string().max(8000),
            })
            .strict()
            .parse(this.mail.cipher.open(work.encryptedPayload, work.reference, work.keyVersion));
          // SMTP no garantiza exactly-once; Message-ID estable facilita deduplicación.
          await this.mail.transport.send({
            ...value,
            messageId: `<outbox-${work.id}@cafeteria.local>`,
          });
        } else {
          const handler = this.handlers[work.type];
          if (!handler) throw new Error('UNKNOWN_JOB');
          await handler(work.reference);
        }
        await this.repository.finish(work, outbox, true, this.now());
      } catch {
        // No almacenar mensajes externos: pueden contener tokens/credenciales.
        await this.repository.finish(work, outbox, false, this.now());
      }
    }
  }
}
