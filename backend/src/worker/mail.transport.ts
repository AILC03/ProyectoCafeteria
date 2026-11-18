import nodemailer from 'nodemailer';
import type { MailTransport } from './worker.service.js';
// Solo buzón local sin autenticación. Producción exige autorización y adaptador
// revisado; no hay proveedor ni credenciales comerciales por defecto.
export class LocalSmtpTransport implements MailTransport {
  private transport: ReturnType<typeof nodemailer.createTransport>;
  constructor(
    port: number,
    private from: string,
  ) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[^\s@]+@[^\s@]+$/.test(from))
      throw new Error('SMTP local inválido');
    this.transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 5000,
      socketTimeout: 15000,
      logger: false,
      debug: false,
    });
  }
  async send(message: { to: string; subject: string; text: string; messageId: string }) {
    await this.transport.sendMail({
      ...message,
      from: this.from,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
}
