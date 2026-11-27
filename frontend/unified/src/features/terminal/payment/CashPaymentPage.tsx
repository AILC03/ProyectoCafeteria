import { useCallback, useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import type { IdempotentOperation } from '../../../shared/api/idempotency';
import { useSession } from '../../../shared/auth/SessionProvider';
import { formatMxnCents } from '../../../shared/utils/money';
import { getCurrentCashSession, parseMxnAmountToCents, type CashSession } from '../cash/cashApi';
import { isCashSessionOwner } from '../cash/cashSessionRules';
import type { PosOrder } from '../pos/posApi';
import { formatCashQrError, scanCashQr, type ScannedCashOrder } from './cashQrApi';
import { CashQrScanner } from './CashQrScanner';
import { formatPaymentError, getProtectedTicket, prepareCashPayment, sendCashPayment, shouldRetryCashPayment, type Ticket, UnverifiableCashPaymentResponseError } from './paymentApi';
import { ProtectedTicket } from './ProtectedTicket';

function usableOrder(value: unknown): value is PosOrder {
  return value !== null && typeof value === 'object' && (value as PosOrder).source === 'CASHIER' && (value as PosOrder).paymentMethod === 'CASH' && (value as PosOrder).status === 'PENDIENTE_PAGO' && (value as PosOrder).paidAt === null;
}

type Target = { id: string; folio: string; totalCents: string };

export function CashPaymentPage() {
  const location = useLocation();
  const actorState = useSession();
  const posOrder = usableOrder(location.state) ? location.state : null;
  const [scanned, setScanned] = useState<ScannedCashOrder | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [session, setSession] = useState<CashSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [received, setReceived] = useState('');
  const [operation, setOperation] = useState<IdempotentOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedChange, setConfirmedChange] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const target: Target | null = scanned !== null
    ? { id: scanned.orderId, folio: scanned.orderFolio, totalCents: scanned.totalCents }
    : posOrder !== null ? { id: posOrder.id, folio: posOrder.folio, totalCents: posOrder.totalCents } : null;

  const loadSession = useCallback(async (): Promise<void> => {
    setSessionLoading(true);
    setSessionError(null);
    try { setSession(await getCurrentCashSession()); }
    catch { setSessionError('No se pudo consultar la caja abierta. Reintenta la consulta.'); }
    finally { setSessionLoading(false); }
  }, []);
  useEffect(() => { void loadSession(); }, [loadSession]);

  if (actorState.status !== 'authenticated') {
    return <section aria-labelledby="payment-title"><h1 id="payment-title">Cobro en efectivo</h1><p role="status">Comprobando sesión…</p></section>;
  }

  async function loadTicket(nextSaleId: string): Promise<void> {
    setTicketError(null);
    try { setTicket(await getProtectedTicket(nextSaleId)); }
    catch { setTicketError('Pago confirmado; el ticket está pendiente. Reintenta sólo obtener el ticket.'); }
  }

  async function loadScanned(token: string): Promise<void> {
    if (scanBusy || busy) return;
    setScanBusy(true);
    setScanError(null);
    setError(null);
    try {
      const order = await scanCashQr(token);
      setScanned(order);
    } catch (err) {
      setScanError(formatCashQrError(err));
    } finally {
      setScanBusy(false);
    }
  }

  function resetTarget(): void {
    if (busy || operation !== null || confirmed || blocked) return;
    setScanned(null);
    setScanError(null);
    setReceived('');
    setError(null);
  }

  if (target === null) {
    return <section className="terminal-payment" aria-labelledby="payment-title">
      <header className="payment-header"><h1 id="payment-title">Cobro en efectivo</h1><p>Sin orden seleccionada en POS</p></header>
      {scanError !== null && <p role="alert" className="payment-notice payment-notice-error">{scanError}</p>}
      <CashQrScanner onToken={(token) => { void loadScanned(token); }} busy={scanBusy} />
      <p className="field-hint"><Link to="/terminal/pos">Volver a POS</Link></p>
    </section>;
  }

  const activeTarget = target;
  const owner = session !== null && session.closedAt === null && !sessionLoading && sessionError === null && isCashSessionOwner(session, actorState.actor);
  const expiresAt = scanned?.paymentExpiresAt ?? posOrder?.paymentExpiresAt ?? '';
  const expired = expiresAt !== '' && Date.parse(expiresAt) <= Date.now();

  async function charge(existing?: IdempotentOperation): Promise<void> {
    if (!owner || busy || blocked) return;
    let next = existing;
    if (!next) {
      try { next = prepareCashPayment(session.id, activeTarget.id, parseMxnAmountToCents(received)); }
      catch (e) { setError(formatPaymentError(e)); return; }
      setOperation(next);
    }
    setBusy(true);
    setError(null);
    try {
      const paid = await sendCashPayment(next);
      setOperation(null);
      setSaleId(paid.saleId);
      setConfirmedChange(paid.changeCents);
      setConfirmed(true);
      await loadTicket(paid.saleId);
    } catch (e) {
      if (e instanceof UnverifiableCashPaymentResponseError) { setBlocked(true); setOperation(null); }
      else if (!shouldRetryCashPayment(e)) setOperation(null);
      setError(formatPaymentError(e));
    } finally {
      setBusy(false);
    }
  }

  return <section className="terminal-payment" aria-labelledby="payment-title">
    <header className="payment-header"><h1 id="payment-title">Cobro en efectivo</h1><p>Orden {activeTarget.folio}</p></header>
    <div className="payment-checkout-card">
      <div className="payment-total"><span>TOTAL A COBRAR</span><strong>{formatMxnCents(activeTarget.totalCents)}</strong></div>
      {scanned !== null && scanned.items.length > 0 && <ul className="payment-items">{scanned.items.map((item, index) => <li key={`${item.productName}-${index}`}>{item.quantity} × {item.productName}{item.options && item.options.length > 0 ? ` (${item.options.map((option) => option.optionName).join(', ')})` : ''}</li>)}</ul>}
      {scanned !== null && <p className="field-hint">Vence: {new Date(scanned.paymentExpiresAt).toLocaleString('es-MX')}. Escanear no confirma el pago.</p>}
      {expired && !confirmed && <p role="alert" className="payment-notice payment-notice-error">La orden venció. No se puede cobrar; pide al cliente un pedido nuevo.</p>}
      {sessionLoading && <p className="payment-notice" role="status">Consultando la caja abierta…</p>}
      {sessionError !== null && <div className="payment-notice payment-notice-error" role="alert"><p>{sessionError}</p><button type="button" className="secondary-button" onClick={() => { void loadSession(); }}>Reintentar consulta</button></div>}
      {!sessionLoading && sessionError === null && !owner && <p className="payment-notice" role="status">Sólo el responsable de la caja abierta puede cobrar. La API confirmará esta regla.</p>}
      {!confirmed && <div className="payment-cash-form"><p className="payment-method">Efectivo</p><label className="field-label" htmlFor="cash-payment-received">Efectivo recibido (MXN)</label><input id="cash-payment-received" inputMode="decimal" value={received} disabled={!owner || busy || blocked || expired || operation !== null} onChange={(e) => setReceived(e.target.value)} /><button type="button" disabled={!owner || busy || blocked || expired || operation !== null} onClick={() => { void charge(); }}>{busy ? 'Cobrando…' : 'Confirmar cobro'}</button>{operation !== null && !busy && !blocked && <button type="button" className="secondary-button" onClick={() => { void charge(operation); }}>Reintentar el mismo cobro</button>}</div>}
      {error !== null && <p className="payment-notice payment-notice-error" role="alert">{error}</p>}
      {confirmed && <div className="payment-notice payment-notice-success" role="status"><p>Pago confirmado por la API. La orden pasó a preparación.</p>{confirmedChange !== null && <p>Cambio confirmado: {formatMxnCents(confirmedChange)}</p>}</div>}
      {ticketError !== null && confirmed && saleId !== null && <><p className="payment-notice payment-notice-error" role="alert">{ticketError}</p><button type="button" className="secondary-button" onClick={() => { void loadTicket(saleId); }} disabled={busy}>Reintentar ticket</button></>}
      {!confirmed && operation === null && !busy && <button type="button" className="secondary-button" onClick={resetTarget}>{scanned !== null ? 'Escanear otro pedido' : 'Elegir otra orden en POS'}</button>}
    </div>
    {ticket !== null && <ProtectedTicket ticket={ticket} />}
  </section>;
}
