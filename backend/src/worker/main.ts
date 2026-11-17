import { setTimeout } from 'node:timers/promises';
import { parseEnvironment } from '../config/env.js';
import { createDatabase } from '../config/database.js';
import { mailConfiguration } from '../config/completion.js';
import { WorkerRepository } from './worker.repository.js';
import { WorkerService } from './worker.service.js';
import { LocalSmtpTransport } from './mail.transport.js';
import { StripeRepository } from '../modules/payments/stripe.repository.js';
import { StripeService } from '../modules/payments/stripe.service.js';
import { ticketCipherConfiguration } from '../modules/tickets/tickets.cipher.js';

async function main() {
  const env = parseEnvironment(process.env);
  if (env.NODE_ENV === 'production')
    throw new Error('Worker FIN-01 requiere revisión operativa antes de producción');
  const db = createDatabase(env.DATABASE_URL);
  let closing = false;
  process.once('SIGINT', () => {
    closing = true;
  });
  process.once('SIGTERM', () => {
    closing = true;
  });
  const config = mailConfiguration(process.env, env.FRONTEND_ORIGIN);
  const mail =
    config && process.env.SMTP_LOCAL_PORT && process.env.MAIL_FROM
      ? {
          cipher: config.cipher,
          transport: new LocalSmtpTransport(
            Number(process.env.SMTP_LOCAL_PORT),
            process.env.MAIL_FROM,
          ),
        }
      : undefined;
  // Sin configuración ni autorización de proveedor real: falla cerrado.
  const stripe = new StripeService(
    new StripeRepository(db),
    undefined,
    ticketCipherConfiguration(process.env),
  );
  const worker = new WorkerService(
    new WorkerRepository(db),
    stripe.provider ? stripe.handlers() : {},
    mail,
  );
  try {
    await db.$connect();
    while (!closing) {
      await worker.tick();
      if (!closing) await setTimeout(1000);
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write('worker_failed_check_local_configuration\n');
  process.exitCode = 1;
});
