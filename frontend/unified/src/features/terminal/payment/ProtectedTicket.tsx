import { formatMxnCents } from '../../../shared/utils/money';
import type { Ticket } from './paymentApi';
import { QRCodeSVG } from 'qrcode.react';

export function ProtectedTicket({ ticket }: { ticket: Ticket }) {
  return <section className="protected-ticket" aria-labelledby="ticket-title">
    <h2 id="ticket-title">Ticket {ticket.saleNumber}</h2>
    <p>Orden: {ticket.orderFolio}</p><p>{new Date(ticket.soldAt).toLocaleString('es-MX')}</p>
    <table><caption>Detalle de compra</caption><thead><tr><th>Producto</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>{ticket.items.map((item, index) => <tr key={`${item.productName}-${index}`}><td>{item.productName}</td><td>{item.quantity}</td><td>{formatMxnCents(item.lineTotalCents)}</td></tr>)}</tbody></table>
    <p>Total: <strong>{formatMxnCents(ticket.totalCents)}</strong></p><p>Recibido: {formatMxnCents(ticket.cashReceivedCents)}</p><p>Cambio: {formatMxnCents(ticket.changeCents)}</p>
    {ticket.registration !== null && <section aria-labelledby="registration-qr-title"><h3 id="registration-qr-title">Registra tu cuenta</h3><p>Escanea este código para abrir el registro de tu compra antes de que venza.</p><QRCodeSVG value={ticket.registration.qrPayload} size={176} level="M" aria-label="Código QR para registrar una cuenta con este ticket" role="img" /><p>Vence: {new Date(ticket.registration.expiresAt).toLocaleString('es-MX')}</p><p className="field-hint">Alternativa accesible: solicita al personal el registro manual de tu ticket.</p></section>}
    <button type="button" onClick={() => { window.print(); }}>Imprimir ticket</button>
  </section>;
}
