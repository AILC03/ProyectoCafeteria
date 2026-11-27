import { useCallback, useEffect, useRef, useState } from 'react';
import type { IdempotentOperation } from '../../../shared/api/idempotency';
import { useSession } from '../../../shared/auth/SessionProvider';
import { formatMxnCents } from '../../../shared/utils/money';
import {
  UnverifiableCashSessionResponseError,
  formatCashError,
  getCurrentCashSession,
  parseMxnAmountToCents,
  prepareCashClose,
  prepareCashOpen,
  sendCashClose,
  sendCashOpen,
  shouldKeepCashOperation,
  type CashSession,
} from './cashApi';
import { mayCloseCashSession, requiresExceptionalCloseReason } from './cashSessionRules';

type PendingAction = {
  operation: IdempotentOperation;
  kind: 'open' | 'close';
  sessionId?: string;
};

/** Cash session screen: no charges, no QR and no local cash authority. */
export function CashSessionsPage() {
  const actorState = useSession();
  const [session, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingAmount, setOpeningAmount] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  function showActionError(text: string): void {
    setActionError(text);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const current = await getCurrentCashSession(signal);
      if (signal?.aborted) return;
      setSession(current);
    } catch (error) {
      // React StrictMode aborts the first effect immediately; that is not a server failure.
      if (signal?.aborted) return;
      setLoadError(formatCashError(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (actorState.status !== 'authenticated') {
    return <section className="terminal-cash" aria-labelledby="cash-title"><h1 id="cash-title">Caja</h1><p role="status">Comprobando sesión…</p></section>;
  }
  const actor = actorState.actor;

  function handleActionFailure(error: unknown): void {
    if (error instanceof UnverifiableCashSessionResponseError) {
      setBlocked(true);
      setPending(null);
    } else if (!shouldKeepCashOperation(error)) {
      setPending(null);
    }
    setActionError(formatCashError(error));
  }

  async function openSession(operation: IdempotentOperation): Promise<void> {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const opened = await sendCashOpen(operation);
      setSession(opened);
      setPending(null);
      setOpeningAmount('');
      setMessage(`Caja abierta con fondo ${formatMxnCents(opened.openingAmountCents)}.`);
    } catch (error) {
      handleActionFailure(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(): Promise<void> {
    if (busy || blocked || session !== null) return;
    let cents: string;
    try {
      cents = parseMxnAmountToCents(openingAmount);
    } catch (error) {
      showActionError(formatCashError(error));
      return;
    }
    let operation = pending?.operation;
    if (operation === undefined) {
      try {
        operation = prepareCashOpen(cents);
      } catch (error) {
        showActionError(formatCashError(error));
        return;
      }
      setPending({ operation, kind: 'open' });
    }
    await openSession(operation);
  }

  async function closeSession(sessionId: string, operation: IdempotentOperation): Promise<void> {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const closed = await sendCashClose(sessionId, operation);
      setSession(closed);
      setPending(null);
      setCountedAmount('');
      setCloseReason('');
      setMessage(`Caja cerrada. ${closed.differenceCents === null
        ? 'El servidor no informó una diferencia verificable.'
        : `Diferencia calculada por el servidor: ${formatMxnCents(closed.differenceCents)}.`}`);
    } catch (error) {
      handleActionFailure(error);
      if (error !== null && typeof error === 'object' && 'status' in error && error.status === 409) {
        void load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(): Promise<void> {
    if (busy || blocked || session === null || session.closedAt !== null) return;
    if (!mayCloseCashSession(session, actor)) return;
    let cents: string;
    try {
      cents = parseMxnAmountToCents(countedAmount);
    } catch (error) {
      showActionError(formatCashError(error));
      return;
    }
    const reason = requiresExceptionalCloseReason(session, actor) ? closeReason.trim() : '';
    if (requiresExceptionalCloseReason(session, actor) && reason.length < 1) {
      showActionError('Indica el motivo para cerrar una caja ajena.');
      return;
    }
    let operation = pending?.operation;
    if (operation === undefined || pending?.kind !== 'close') {
      try {
        operation = prepareCashClose(session.id, {
          countedCashCents: cents,
          ...(reason.length > 0 ? { exceptionalCloseReason: reason } : {}),
        });
      } catch (error) {
        showActionError(formatCashError(error));
        return;
      }
      setPending({ operation, kind: 'close', sessionId: session.id });
    }
    await closeSession(session.id, operation);
  }

  const isOpen = session !== null && session.closedAt === null;
  const canRetry = pending !== null && !busy && !blocked
    && (pending.kind === 'open'
      ? session === null
      : session !== null && session.id === pending.sessionId && mayCloseCashSession(session, actor));

  return (
    <section className="terminal-cash" aria-labelledby="cash-title">
      <header className="cash-page-header">
        <div>
          <h1 id="cash-title">Corte y Sesión de Caja</h1>
          <p className="field-hint">Sesión de efectivo confirmada por el servidor. Aquí no se cobra ni se emite QR.</p>
        </div>
      </header>

      {loading && <p className="cash-notice" role="status">Consultando estado de caja…</p>}
      {loadError !== null && (
        <div className="form-alert cash-notice" role="alert">
          <p>{loadError}</p>
          <button type="button" className="secondary-button" onClick={() => { void load(); }}>Reintentar consulta</button>
        </div>
      )}
      {!loading && loadError === null && session === null && !blocked && (
        <section className="auth-card" aria-labelledby="cash-open-title">
          <p className="cash-eyebrow">Estado de caja del turno · API</p>
          <h2 id="cash-open-title">Caja cerrada</h2>
          <p>No hay una sesión abierta. Registra el fondo inicial para abrirla.</p>
          <div className="form-field">
            <label htmlFor="cash-open-amount">Fondo inicial (MXN)</label>
            <input
              id="cash-open-amount"
              type="text"
              inputMode="decimal"
              maxLength={22}
              value={openingAmount}
              disabled={busy || blocked}
              onChange={(event) => { setOpeningAmount(event.target.value); }}
            />
          </div>
          <button type="button" disabled={busy || blocked} onClick={() => { void handleOpen(); }}>
            {busy && pending?.kind === 'open' ? 'Abriendo caja…' : 'Abrir caja'}
          </button>
        </section>
      )}

      {!loading && loadError === null && session === null && blocked && (
        <section className="auth-card" aria-labelledby="cash-uncertain-title">
          <p className="cash-eyebrow">Estado de caja del turno · sin confirmar</p>
          <h2 id="cash-uncertain-title">Estado no verificable</h2>
          <p role="status">
            La respuesta de la API no permite confirmar si la caja quedó abierta. No repitas la operación ni abras una caja nueva;
            concilia el estado con la cafetería.
          </p>
        </section>
      )}

      {session !== null && (
        <section className="auth-card" aria-labelledby="cash-summary-title">
          <p className="cash-eyebrow">Estado de caja del turno · API</p>
          <h2 id="cash-summary-title">{isOpen ? 'Caja abierta' : 'Última sesión cerrada'}</h2>
          <dl className="cash-summary">
            <div><dt>Sesión</dt><dd>{session.id}</dd></div>
            <div><dt>Responsable</dt><dd>{session.employeeId}</dd></div>
            <div><dt>Fondo</dt><dd>{formatMxnCents(session.openingAmountCents)}</dd></div>
            <div><dt>Ventas en efectivo</dt><dd>{formatMxnCents(session.cashSalesCents)}</dd></div>
            <div className="cash-metric-primary"><dt>Esperado calculado</dt><dd>{formatMxnCents(session.computedExpectedCashCents)}</dd></div>
            <div><dt>Contado</dt><dd>{session.countedCashCents === null ? '—' : formatMxnCents(session.countedCashCents)}</dd></div>
            <div><dt>Diferencia</dt><dd>{session.differenceCents === null ? '—' : formatMxnCents(session.differenceCents)}</dd></div>
            <div><dt>Pagos exitosos</dt><dd>{session.successfulPayments}</dd></div>
            {session.closedAt !== null && <div><dt>Cerrada</dt><dd>{new Date(session.closedAt).toLocaleString('es-MX')}</dd></div>}
            {session.exceptionalCloseReason !== null && <div><dt>Motivo excepcional</dt><dd>{session.exceptionalCloseReason}</dd></div>}
          </dl>

          {isOpen && !mayCloseCashSession(session, actor) && (
            <p className="cash-notice" role="status">Sólo el responsable de la caja puede cerrarla. Tu perfil no puede cerrar una caja ajena.</p>
          )}

          {isOpen && mayCloseCashSession(session, actor) && (
            <div className="cash-close">
              <h3>Cerrar caja</h3>
              <div className="form-field">
                <label htmlFor="cash-counted-amount">Efectivo contado (MXN)</label>
                <input
                  id="cash-counted-amount"
                  type="text"
                  inputMode="decimal"
                  maxLength={22}
                  value={countedAmount}
                  disabled={busy || blocked}
                  onChange={(event) => { setCountedAmount(event.target.value); }}
                />
              </div>
              {requiresExceptionalCloseReason(session, actor) && (
                <div className="form-field">
                  <label htmlFor="cash-close-reason">Motivo de cierre excepcional</label>
                  <textarea
                    id="cash-close-reason"
                    maxLength={500}
                    rows={3}
                    value={closeReason}
                    disabled={busy || blocked}
                    onChange={(event) => { setCloseReason(event.target.value); }}
                  />
                </div>
              )}
              <button type="button" disabled={busy || blocked} onClick={() => { void handleClose(); }}>
                {busy && pending?.kind === 'close' ? 'Cerrando caja…' : 'Cerrar caja'}
              </button>
            </div>
          )}
        </section>
      )}

      {canRetry && (
        <button type="button" className="secondary-button cash-retry" onClick={() => {
          if (pending.kind === 'open') void openSession(pending.operation);
          else if (session !== null) void closeSession(session.id, pending.operation);
        }}>
          Reintentar la misma operación de caja
        </button>
      )}
      {actionError !== null && <p ref={feedbackRef} tabIndex={-1} className="cash-notice cash-notice-error" role="alert">{actionError}</p>}
      {message !== null && <p className="cash-notice cash-notice-success" role="status">{message}</p>}
    </section>
  );
}
