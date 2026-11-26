import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { saveCartDraft, type CartDraftItem } from '../../../shared/storage';
import { formatMxnCents } from '../../../shared/utils/money';
import { useGuestSession } from '../auth/guestSession';
import { useSession, useSessionManager } from '../../../shared/auth/SessionProvider';
import { mobileOrderStoreFor, prepareMobileOrder, type PaymentMethod } from '../orders/mobileOrders';
import { cartEstimate, checkCart, type CheckedCartLine } from './cartValidation';

export function ClientCart({ items, onChange, catalogRevision, onLockChange }: {
  items: CartDraftItem[];
  onChange: (items: CartDraftItem[]) => void;
  catalogRevision: number;
  onLockChange: (locked: boolean) => void;
}) {
  const guest = useGuestSession();
  const session = useSession();
  const manager = useSessionManager();
  const store = mobileOrderStoreFor(manager);
  const attempt = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [lines, setLines] = useState<CheckedCartLine[]>([]);
  const [checking, setChecking] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [verificationRevision, setVerificationRevision] = useState(0);
  const [reviewChanged, setReviewChanged] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const preflight = useRef<AbortController | null>(null);

  useEffect(() => manager.registerPrivateStateCleaner(() => {
    preflight.current?.abort();
    setLines([]);
    setReviewChanged(false);
    setReviewMessage(null);
  }), [manager]);

  useEffect(() => {
    const controller = new AbortController();
    if (items.length === 0) { setLines([]); setChecking(false); return () => controller.abort(); }
    setChecking(true);
    setLines([]);
    setReviewChanged(false);
    setReviewMessage(null);
    void checkCart(items, controller.signal).then((checked) => {
      if (!controller.signal.aborted) setLines(checked);
    }).catch(() => {
      if (!controller.signal.aborted) setLines([]);
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [items, catalogRevision, verificationRevision]);

  useEffect(() => {
    if (attempt.confirmed !== null && itemsRef.current.length > 0) onChange([]);
    // Only the transition to this confirmation clears the submitted draft;
    // subsequent additions must not retrigger the effect for the same order.
  }, [attempt.confirmed, onChange]);

  useEffect(() => onLockChange(attempt.paused || attempt.blocked || attempt.sending || attempt.pending !== null || busy.current),
    [attempt.paused, attempt.blocked, attempt.sending, attempt.pending, onLockChange]);

  useEffect(() => () => { preflight.current?.abort(); }, []);

  function update(next: CartDraftItem[]): void {
    store.dismissConfirmation();
    saveCartDraft({ version: 1, items: next });
    onChange(next);
    setReviewChanged(false);
    setReviewMessage(null);
  }

  async function submit(): Promise<void> {
    if (manager.getSnapshot() !== session || busy.current || attempt.paused || attempt.blocked || attempt.pending !== null
      || attempt.sending || items.length === 0 || checking
      || lines.length !== items.length || lines.some((line) => line.issue !== null)) return;
    busy.current = true;
    onLockChange(true);
    const controller = new AbortController();
    const generation = store.getGeneration();
    preflight.current = controller;
    setChecking(true);
    setReviewMessage(null);
    try {
      const checked = await checkCart(items, controller.signal);
      if (controller.signal.aborted || manager.getSnapshot() !== session || generation !== store.getGeneration()
        || store.getSnapshot().paused || store.getSnapshot().blocked
        || store.getSnapshot().pending !== null || store.getSnapshot().sending) return;
      setLines(checked);
      if (checked.some((line) => line.issue !== null)) {
        setReviewChanged(false);
        setReviewMessage('El catálogo cambió o no se pudo verificar. Revisa o revalida el carrito antes de ordenar.');
        return;
      }
      if (checked.some((line, index) => line.catalogSignature !== lines[index]?.catalogSignature
        || line.estimateCents !== lines[index]?.estimateCents)) {
        setReviewChanged(true);
        setReviewMessage('El precio o las opciones cambiaron. Revisa el nuevo estimado y confirma nuevamente antes de crear la orden.');
        return;
      }
      setReviewChanged(false);
      const operation = prepareMobileOrder(items, paymentMethod,
        session.status === 'authenticated' ? undefined : guest.isGuest ? guest.guestName ?? undefined : undefined);
      await store.send(operation);
    } catch {
      if (!controller.signal.aborted) setReviewMessage('No se pudo verificar el carrito. Revalida antes de ordenar.');
    } finally {
      if (preflight.current === controller) preflight.current = null;
      if (!controller.signal.aborted) setChecking(false);
      busy.current = false;
      onLockChange(store.getSnapshot().paused || store.getSnapshot().blocked
        || store.getSnapshot().sending || store.getSnapshot().pending !== null);
    }
  }

  const locked = busy.current || attempt.paused || attempt.blocked || attempt.sending || attempt.pending !== null;
  const hasIssues = lines.some((line) => line.issue !== null);
  return <section className="auth-card client-cart" aria-labelledby="cart-title">
    <h2 id="cart-title">Carrito borrador</h2>
    {items.length === 0 && <p>Tu carrito está vacío. Personaliza un producto para empezar.</p>}
    {checking && <p role="status">Verificando el catálogo actual…</p>}
    {items.length > 0 && !checking && <>
      <ul>{items.map((item, index) => {
        const line = lines[index];
        return <li key={`${item.productId}-${item.optionValueIds.join('-')}-${index}`}>
          <span>{item.quantity} × {line?.name ?? `Producto ${item.productId}`}</span>
          {line && line.selectedLabels.length > 0 && <span>Opciones: {line.selectedLabels.join(', ')}</span>}
          {line?.issue ? <p role="alert">{line.issue}</p> : line && <span> — Estimado {formatMxnCents(line.estimateCents)}</span>}
          <button type="button" className="secondary-button" disabled={locked} aria-label={`Quitar ${line?.name ?? `producto ${item.productId}`}`} onClick={() => update(items.filter((_, position) => position !== index))}>Quitar</button>
        </li>;
      })}</ul>
      {lines.length === items.length && !hasIssues &&
        <p>Subtotal estimado: {formatMxnCents(cartEstimate(lines))}. El total definitivo lo confirma la API.</p>}
      <fieldset disabled={locked}>
        <legend>Método de pago para la orden pendiente</legend>
        <label><input type="radio" name="mobile-payment" checked={paymentMethod === 'CASH'} onChange={() => setPaymentMethod('CASH')} /> Efectivo (CASH)</label>
        <label><input type="radio" name="mobile-payment" checked={paymentMethod === 'STRIPE'} onChange={() => setPaymentMethod('STRIPE')} /> STRIPE (sin iniciar checkout)</label>
      </fieldset>
      <p className="field-hint">Crear la orden no realiza un cobro. No se solicita QR ni token de checkout.</p>
      <button type="button" disabled={locked || checking || lines.length !== items.length || hasIssues} onClick={() => { void submit(); }}>
        {reviewChanged ? 'Confirmar cambios y crear orden pendiente' : 'Crear orden pendiente'}
      </button>
      {!locked && hasIssues && <button type="button" className="secondary-button" onClick={() => setVerificationRevision((n) => n + 1)}>Revalidar carrito</button>}
    </>}
    {attempt.pending !== null && !attempt.sending && !attempt.confirmed && (
      <div className="order-retry" role="status">
        <p>La orden anterior no se envió completamente. Revisa el catálogo y vuelve a intentar.</p>
        <button type="button" disabled={attempt.paused} onClick={() => { void store.send(); }}>Reintentar la misma orden</button>
      </div>
    )}
    {attempt.paused && <p role="status">Comprobando sesión antes de ordenar o reintentar…</p>}
    {attempt.sending && (
      <div className="order-sending" role="status">
        <span role="status" aria-live="polite">Enviando orden…</span>
      </div>
    )}
    {reviewMessage && <p role="alert">{reviewMessage}</p>}
    {attempt.message && <p role="alert">{attempt.message}</p>}
    {attempt.confirmed && (
      <section className="order-confirmation" role="status" aria-labelledby="order-confirmation-title">
        <h3 id="order-confirmation-title">Orden creada</h3>
        <p><strong>Folio:</strong> {attempt.confirmed.folio}</p>
        <p><strong>Estado:</strong> pendiente de pago</p>
        <p><strong>Total confirmado por el servidor:</strong> {formatMxnCents(attempt.confirmed.totalCents)}.</p>
        <p className="field-hint">Crear la orden no confirma el pago. Paga en caja para completar.</p>
      </section>
    )}
  </section>;
}
