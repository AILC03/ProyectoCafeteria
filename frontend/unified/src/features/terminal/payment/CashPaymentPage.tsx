import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import type { IdempotentOperation } from '../../../shared/api/idempotency';
import { useSession } from '../../../shared/auth/SessionProvider';
import { formatMxnCents } from '../../../shared/utils/money';
import { getCurrentCashSession, parseMxnAmountToCents, type CashSession } from '../cash/cashApi';
import { isCashSessionOwner } from '../cash/cashSessionRules';
import type { PosOrder } from '../pos/posApi';
import { formatPaymentError, getProtectedTicket, prepareCashPayment, sendCashPayment, shouldRetryCashPayment, type Ticket, UnverifiableCashPaymentResponseError } from './paymentApi';
import { ProtectedTicket } from './ProtectedTicket';

function usableOrder(value: unknown): value is PosOrder { return value !== null && typeof value === 'object' && (value as PosOrder).source === 'CASHIER' && (value as PosOrder).paymentMethod === 'CASH' && (value as PosOrder).status === 'PENDIENTE_PAGO' && (value as PosOrder).paidAt === null; }
export function CashPaymentPage() {
  const location = useLocation(); const actorState = useSession(); const order = usableOrder(location.state) ? location.state : null;
  const [session, setSession] = useState<CashSession | null>(null); const [received, setReceived] = useState(''); const [operation, setOperation] = useState<IdempotentOperation | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [confirmed, setConfirmed] = useState(false); const [saleId, setSaleId] = useState<string | null>(null); const [ticket, setTicket] = useState<Ticket | null>(null); const [ticketError, setTicketError] = useState<string | null>(null); const [blocked, setBlocked] = useState(false);
  useEffect(() => { void getCurrentCashSession().then(setSession).catch((e: unknown) => setError(formatPaymentError(e))); }, []);
  if (actorState.status !== 'authenticated' || order === null) return <section aria-labelledby="payment-title"><h1 id="payment-title">Cobro en efectivo</h1><p role="status">No hay una orden recién creada o seleccionada desde POS para cobrar. D-20: este cobro no se persiste ni se reintenta tras una recarga; concilia el estado con caja o la cafetería.</p><Link to="/terminal/pos">Volver a POS</Link></section>;
  const activeOrder = order;
  const owner = session !== null && session.closedAt === null && isCashSessionOwner(session, actorState.actor);
  async function loadTicket(saleId: string): Promise<void> { setTicketError(null); try { setTicket(await getProtectedTicket(saleId)); } catch { setTicketError('Pago confirmado; el ticket está pendiente. Reintenta sólo obtener el ticket.'); } }
  async function charge(existing?: IdempotentOperation): Promise<void> { if (!owner || busy || blocked) return; let next = existing; if (!next) { try { next = prepareCashPayment(session.id, activeOrder.id, parseMxnAmountToCents(received)); } catch (e) { setError(formatPaymentError(e)); return; } setOperation(next); } setBusy(true); setError(null); try { const paid = await sendCashPayment(next); setOperation(null); setSaleId(paid.saleId); setConfirmed(true); await loadTicket(paid.saleId); } catch (e) { if (e instanceof UnverifiableCashPaymentResponseError) { setBlocked(true); setOperation(null); } else if (!shouldRetryCashPayment(e)) setOperation(null); setError(formatPaymentError(e)); } finally { setBusy(false); } }
  return <section className="terminal-payment" aria-labelledby="payment-title"><h1 id="payment-title">Cobro en efectivo</h1><p>Orden {activeOrder.folio}. Total confirmado: {formatMxnCents(activeOrder.totalCents)}.</p>
    {!owner && <p role="status">Sólo el responsable de la caja abierta puede cobrar. La API confirmará esta regla.</p>}
    {!confirmed && <div className="auth-card"><label className="field-label" htmlFor="cash-payment-received">Efectivo recibido (MXN)</label><input id="cash-payment-received" inputMode="decimal" value={received} disabled={!owner || busy || blocked} onChange={(e) => setReceived(e.target.value)} /><button type="button" disabled={!owner || busy || blocked} onClick={() => { void charge(); }}>{busy ? 'Cobrando…' : 'Confirmar cobro'}</button>{operation !== null && !busy && !blocked && <button type="button" className="secondary-button" onClick={() => { void charge(operation); }}>Reintentar el mismo cobro</button>}</div>}
    {error !== null && <p role="alert">{error}</p>}{confirmed && <p role="status">Pago confirmado por la API.</p>}{ticketError !== null && confirmed && saleId !== null && <><p role="alert">{ticketError}</p><button type="button" className="secondary-button" onClick={() => { void loadTicket(saleId); }} disabled={busy}>Reintentar ticket</button></>}{ticket !== null && <ProtectedTicket ticket={ticket} />}</section>;
}
