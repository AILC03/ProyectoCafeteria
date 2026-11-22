import { formatMxnCents } from '../../../shared/utils/money';
import type { Ticket } from './paymentApi';

export function ProtectedTicket({ ticket }: { ticket: Ticket }) {
  return <section className="protected-ticket" aria-labelledby="ticket-title">
    <h2 id="ticket-title">Ticket {ticket.saleNumber}</h2>
    <p>Orden: {ticket.orderFolio}</p><p>{new Date(ticket.soldAt).toLocaleString('es-MX')}</p>
    <table><caption>Detalle de compra</caption><thead><tr><th>Producto</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>{ticket.items.map((item, index) => <tr key={`${item.productName}-${index}`}><td>{item.productName}</td><td>{item.quantity}</td><td>{formatMxnCents(item.lineTotalCents)}</td></tr>)}</tbody></table>
    <p>Total: <strong>{formatMxnCents(ticket.totalCents)}</strong></p><p>Recibido: {formatMxnCents(ticket.cashReceivedCents)}</p><p>Cambio: {formatMxnCents(ticket.changeCents)}</p>
    <button type="button" onClick={() => { window.print(); }}>Imprimir ticket</button>
  </section>;
}
