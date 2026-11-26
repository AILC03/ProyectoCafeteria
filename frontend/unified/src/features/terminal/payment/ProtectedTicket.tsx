import { formatMxnCents } from '../../../shared/utils/money';
import type { Ticket } from './paymentApi';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

export function ProtectedTicket({ ticket }: { ticket: Ticket }) {
  const expiresAt = ticket.registration?.expiresAt ?? null;
  const [registrationExpired, setRegistrationExpired] = useState(
    () => expiresAt !== null && Date.parse(expiresAt) <= Date.now(),
  );

  useEffect(() => {
    if (expiresAt === null) {
      setRegistrationExpired(false);
      return;
    }

    const expiresAtMs = Date.parse(expiresAt);
    let timeoutId: number | undefined;

    const scheduleExpiration = () => {
      const remainingMs = expiresAtMs - Date.now();
      if (remainingMs <= 0) {
        setRegistrationExpired(true);
        return;
      }
      timeoutId = window.setTimeout(scheduleExpiration, Math.min(remainingMs, 2_147_483_647));
    };

    setRegistrationExpired(false);
    scheduleExpiration();
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [expiresAt]);

  const validRegistration = ticket.registration !== null && !registrationExpired;

  return <section className="protected-ticket" aria-labelledby="ticket-title">
    <div className="ticket-heading"><h2 id="ticket-title">Ticket {ticket.saleNumber}</h2><p>Comprobante de venta</p></div>
    <div className="ticket-meta"><p>Orden: {ticket.orderFolio}</p><p>{new Date(ticket.soldAt).toLocaleString('es-MX')}</p></div>
    <table><caption>Detalle de compra</caption><thead><tr><th>Producto</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>{ticket.items.map((item, index) => <tr key={`${item.productName}-${index}`}><td>{item.productName}</td><td>{item.quantity}</td><td>{formatMxnCents(item.lineTotalCents)}</td></tr>)}</tbody></table>
    <div className="ticket-totals"><p className="ticket-grand-total">Total: <strong>{formatMxnCents(ticket.totalCents)}</strong></p>
      {ticket.cashReceivedCents !== null && ticket.changeCents !== null && <><p>Recibido: {formatMxnCents(ticket.cashReceivedCents)}</p><p>Cambio: {formatMxnCents(ticket.changeCents)}</p></>}
    </div>
    {ticket.registration !== null && validRegistration && <section className="ticket-registration" aria-labelledby="registration-qr-title"><h3 id="registration-qr-title">Registra tu cuenta</h3><p>Escanea este código para abrir el registro de tu compra antes de que venza.</p><QRCodeSVG value={ticket.registration.qrPayload} size={176} level="M" aria-label="Código QR para registrar una cuenta con este ticket" role="img" /><p>Vence: {new Date(ticket.registration.expiresAt).toLocaleString('es-MX')}</p><p className="field-hint">Alternativa accesible: solicita al personal el registro manual de tu ticket.</p></section>}
    {ticket.registration !== null && registrationExpired && <section className="ticket-registration" aria-labelledby="registration-expired-title"><h3 id="registration-expired-title">Registro vencido</h3><p role="status">El código QR venció. Solicita al personal el estado de tu ticket.</p></section>}
    <button type="button" onClick={() => { window.print(); }}>Imprimir ticket</button>
  </section>;
}
