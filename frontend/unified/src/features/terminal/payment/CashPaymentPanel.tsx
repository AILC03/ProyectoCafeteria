import { useEffect, useState } from 'react';
import type { IdempotentOperation } from '../../../shared/api/idempotency';
import { useSession } from '../../../shared/auth/SessionProvider';
import { formatMxnCents } from '../../../shared/utils/money';
import { getCurrentCashSession, parseMxnAmountToCents, type CashSession } from '../cash/cashApi';
import { isCashSessionOwner } from '../cash/cashSessionRules';
import type { CashPaymentTarget } from './cashPaymentTarget';
import {
  formatPaymentError,
  getProtectedTicket,
  prepareCashPayment,
  sendCashPayment,
  shouldRetryCashPayment,
  type Ticket,
  UnverifiableCashPaymentResponseError,
} from './paymentApi';
import { ProtectedTicket } from './ProtectedTicket';

type CashPaymentPanelProps = {
  target: CashPaymentTarget;
  presentation?: 'page' | 'embedded';
  resetLabel?: string;
  onResetTarget?: () => void;
  onConfirmed?: (payment: { saleId: string; changeCents: string }) => void;
};

/**
 * Verifiable cash checkout for one order. It never creates orders, never trusts local totals
 * and reuses the same idempotency snapshot across retries.
 */
export function CashPaymentPanel({
  target,
  presentation = 'embedded',
  resetLabel,
  onResetTarget,
  onConfirmed,
}: CashPaymentPanelProps) {
  const actorState = useSession();
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setReceived('');
    setOperation(null);
    setBusy(false);
    setError(null);
    setConfirmed(false);
    setConfirmedChange(null);
    setSaleId(null);
    setTicket(null);
    setTicketError(null);
    setBlocked(false);
  }, [target.id]);

  useEffect(() => {
    let timeoutId: number | undefined;
    function scheduleExpiry(): void {
      const remaining = Date.parse(target.paymentExpiresAt) - Date.now();
      if (remaining <= 0) {
        setNow(Date.now());
        return;
      }
      timeoutId = window.setTimeout(() => {
        setNow(Date.now());
        scheduleExpiry();
      }, Math.min(remaining, 30_000));
    }
    scheduleExpiry();
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [target.paymentExpiresAt]);

  useEffect(() => {
    let cancelled = false;
    setSessionLoading(true);
    setSessionError(null);
    getCurrentCashSession()
      .then((nextSession) => { if (!cancelled) setSession(nextSession); })
      .catch(() => { if (!cancelled) setSessionError('No se pudo consultar la caja abierta. Reintenta la consulta.'); })
      .finally(() => { if (!cancelled) setSessionLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function loadSession(): void {
    setSessionLoading(true);
    setSessionError(null);
    getCurrentCashSession()
      .then((nextSession) => { setSession(nextSession); })
      .catch(() => { setSessionError('No se pudo consultar la caja abierta. Reintenta la consulta.'); })
      .finally(() => { setSessionLoading(false); });
  }

  async function loadTicket(nextSaleId: string): Promise<void> {
    setTicketError(null);
    try {
      setTicket(await getProtectedTicket(nextSaleId));
    } catch {
      setTicketError('Pago confirmado; el ticket está pendiente. Reintenta sólo obtener el ticket.');
    }
  }

  if (actorState.status !== 'authenticated') {
    return <p role="status" className="payment-notice">Comprobando sesión…</p>;
  }

  const owner = session !== null && session.closedAt === null && !sessionLoading && sessionError === null
    && isCashSessionOwner(session, actorState.actor);
  const expired = Date.parse(target.paymentExpiresAt) <= now && !confirmed;

  async function charge(existing?: IdempotentOperation): Promise<void> {
    if (!owner || busy || blocked || confirmed) return;
    let next = existing;
    if (!next) {
      try {
        next = prepareCashPayment(session.id, target.id, parseMxnAmountToCents(received));
      } catch (amountError) {
        setError(formatPaymentError(amountError));
        return;
      }
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
      onConfirmed?.({ saleId: paid.saleId, changeCents: paid.changeCents });
      await loadTicket(paid.saleId);
    } catch (paymentError) {
      if (paymentError instanceof UnverifiableCashPaymentResponseError) {
        setBlocked(true);
        setOperation(null);
      } else if (!shouldRetryCashPayment(paymentError)) {
        setOperation(null);
      }
      setError(formatPaymentError(paymentError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`cash-payment-panel${presentation === 'page' ? '' : ' payment-panel-embedded'}`}>
      <div className="payment-checkout-card">
        <div className="payment-total">
          <span>TOTAL A COBRAR</span>
          <strong>{formatMxnCents(target.totalCents)}</strong>
        </div>
        <p className="field-hint">
          {target.origin === 'qr' ? 'Pedido cargado por QR' : 'Orden creada en POS'} · {target.folio}
        </p>
        {target.items.length > 0 && (
          <ul className="payment-items">
            {target.items.map((item, index) => (
              <li key={`${item.productName}-${index}`}>
                {item.quantity} × {item.productName}
                {item.options && item.options.length > 0 ? ` (${item.options.join(', ')})` : ''}
              </li>
            ))}
          </ul>
        )}
        {target.origin === 'qr' && (
          <p className="field-hint">
            Vence: {new Date(target.paymentExpiresAt).toLocaleString('es-MX')}. Escanear no confirma el pago.
          </p>
        )}
        {expired && (
          <p role="alert" className="payment-notice payment-notice-error">
            La orden venció. No se puede cobrar; pide al cliente un pedido nuevo.
          </p>
        )}
        {sessionLoading && <p className="payment-notice" role="status">Consultando la caja abierta…</p>}
        {sessionError !== null && (
          <div className="payment-notice payment-notice-error" role="alert">
            <p>{sessionError}</p>
            <button type="button" className="secondary-button" onClick={loadSession}>Reintentar consulta</button>
          </div>
        )}
        {!sessionLoading && sessionError === null && !owner && (
          <p className="payment-notice" role="status">
            Sólo el responsable de la caja abierta puede cobrar. La API confirmará esta regla.
          </p>
        )}
        {!confirmed && !blocked && (
          <div className="payment-cash-form">
            <p className="payment-method">Efectivo</p>
            <label className="field-label" htmlFor="cash-payment-received">Efectivo recibido (MXN)</label>
            <input
              id="cash-payment-received"
              inputMode="decimal"
              value={received}
              disabled={!owner || busy || expired || operation !== null}
              onChange={(event) => setReceived(event.target.value)}
            />
            <button
              type="button"
              disabled={!owner || busy || expired || operation !== null}
              onClick={() => { void charge(); }}
            >
              {busy ? 'Cobrando…' : 'Confirmar cobro'}
            </button>
            {operation !== null && !busy && (
              <button type="button" className="secondary-button" onClick={() => { void charge(operation); }}>
                Reintentar el mismo cobro
              </button>
            )}
          </div>
        )}
        {error !== null && <p className="payment-notice payment-notice-error" role="alert">{error}</p>}
        {confirmed && (
          <div className="payment-notice payment-notice-success" role="status">
            <p>Pago confirmado por la API. La orden pasó a preparación.</p>
            {confirmedChange !== null && <p>Cambio confirmado: {formatMxnCents(confirmedChange)}</p>}
          </div>
        )}
        {ticketError !== null && confirmed && saleId !== null && (
          <>
            <p className="payment-notice payment-notice-error" role="alert">{ticketError}</p>
            <button type="button" className="secondary-button" onClick={() => { void loadTicket(saleId); }} disabled={busy}>
              Reintentar ticket
            </button>
          </>
        )}
        {!confirmed && operation === null && !busy && onResetTarget !== undefined && (
          <button type="button" className="secondary-button" onClick={onResetTarget}>
            {resetLabel ?? 'Elegir otra orden'}
          </button>
        )}
      </div>
      {ticket !== null && <ProtectedTicket ticket={ticket} />}
    </div>
  );
}
