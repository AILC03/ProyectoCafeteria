import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { saveCartDraft, type CartDraftItem } from '../../../shared/storage';
import { formatMxnCents } from '../../../shared/utils/money';
import { exitGuestMode, useGuestSession } from '../auth/guestSession';
import { useSession, useSessionManager } from '../../../shared/auth/SessionProvider';
import { mobileOrderStoreFor, prepareMobileOrder, type CashQr, type PaymentMethod } from '../orders/mobileOrders';
import { cashReceipts, useCashReceipts } from '../orders/cashReceipts';
import { clientCartStore } from './clientCartStore';
import { cartEstimate, checkCart, type CheckedCartLine } from './cartValidation';

/** Prices already include IVA. The example rule is 16% over the order total. */
export function cartTotals(totalCents: string): { subtotalCents: string; ivaCents: string; totalCents: string } {
  const total = BigInt(totalCents);
  const iva = (total * 16n + 50n) / 100n;
  return { subtotalCents: (total - iva).toString(), ivaCents: iva.toString(), totalCents: total.toString() };
}

function qrExpired(qr: CashQr): boolean {
  return Date.parse(qr.expiresAt) <= Date.now();
}

function CartTotals({ totalCents }: { totalCents: string }) {
  const totals = cartTotals(totalCents);
  return (
    <dl className="cart-totals">
      <div><dt>Subtotal</dt><dd>{formatMxnCents(totals.subtotalCents)}</dd></div>
      <div><dt>IVA (16%)</dt><dd>{formatMxnCents(totals.ivaCents)}</dd></div>
      <div className="cart-totals-total"><dt>Total</dt><dd>{formatMxnCents(totals.totalCents)}</dd></div>
    </dl>
  );
}

function CashQrPanel({ qr, lines, totalCents }: { qr: CashQr; lines: CheckedCartLine[]; totalCents: string }) {
  const [expired, setExpired] = useState(() => qrExpired(qr));
  useEffect(() => {
    setExpired(qrExpired(qr));
    const timer = window.setInterval(() => setExpired(qrExpired(qr)), 5_000);
    return () => window.clearInterval(timer);
  }, [qr]);
  if (expired) {
    return (
      <section className="cash-qr-panel" aria-labelledby="cash-qr-title">
        <h3 id="cash-qr-title">QR de cobro vencido</h3>
        <p role="status">El código venció. Solicita apoyo en caja para revisar el estado de tu pedido.</p>
      </section>
    );
  }
  return (
    <section className="cash-qr-panel" aria-labelledby="cash-qr-title">
      <h3 id="cash-qr-title">Muestra este QR en caja</h3>
      {lines.length > 0 && (
        <ul className="cash-qr-summary" aria-label="Resumen del pedido">
          {lines.map((line, index) => (
            <li key={`${line.name}-${index}`}>
              <span>{line.item.quantity} × {line.name}</span>
              {line.selectedLabels.length > 0 && <span>{line.selectedLabels.join(', ')}</span>}
              <span>{formatMxnCents(line.estimateCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <CartTotals totalCents={totalCents} />
      <QRCodeSVG
        value={qr.qrPayload}
        size={192}
        level="M"
        role="img"
        aria-label="Código QR para pagar el pedido en caja"
      />
      <p>Escanearlo no confirma el pago. El pedido pasa a preparación cuando caja confirma el efectivo.</p>
      <p>Vence: {new Date(qr.expiresAt).toLocaleString('es-MX')}</p>
      <p className="field-hint">El código sólo vive en esta pantalla; recargar o cerrar la pestaña lo elimina.</p>
    </section>
  );
}

export function ClientCart({ items, onChange, catalogRevision, onLockChange, onContinueShopping }: {
  items: CartDraftItem[];
  onChange: (items: CartDraftItem[]) => void;
  catalogRevision: number;
  onLockChange: (locked: boolean) => void;
  onContinueShopping?: () => void;
}) {
  const guest = useGuestSession();
  const session = useSession();
  const manager = useSessionManager();
  const store = mobileOrderStoreFor(manager);
  const attempt = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const receipts = useCashReceipts();
  const receipt = receipts[receipts.length - 1] ?? null;
  const [lines, setLines] = useState<CheckedCartLine[]>([]);
  const [checking, setChecking] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [verificationRevision, setVerificationRevision] = useState(0);
  const [reviewChanged, setReviewChanged] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const submittedLines = useRef<CheckedCartLine[]>([]);
  const lastReceiptId = useRef<string | null>(null);
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

  useEffect(() => {
    if (attempt.confirmed === null || lastReceiptId.current === attempt.confirmed.id) return;
    lastReceiptId.current = attempt.confirmed.id;
    cashReceipts.add({ order: attempt.confirmed, lines: submittedLines.current });
    if (guest.isGuest) {
      // The QR remains in the in-memory receipt; leaving guest mode must not
      // destroy the only payment reference for the order just created.
      exitGuestMode();
      clientCartStore.open();
    }
  }, [attempt.confirmed, guest.isGuest]);

  useEffect(() => onLockChange(attempt.paused || attempt.blocked || attempt.sending || attempt.pending !== null || busy.current),
    [attempt.paused, attempt.blocked, attempt.sending, attempt.pending, onLockChange]);

  useEffect(() => () => { preflight.current?.abort(); }, []);

  function update(next: CartDraftItem[]): void {
    store.dismissConfirmation();
    cashReceipts.clear();
    lastReceiptId.current = null;
    saveCartDraft({ version: 1, items: next });
    onChange(next);
    setReviewChanged(false);
    setReviewMessage(null);
  }

  function setQuantity(index: number, quantity: number): void {
    const next = items.map((item, position) => position === index
      ? { ...item, quantity: Math.min(99, Math.max(1, quantity)) }
      : item);
    update(next);
  }

  async function submit(): Promise<void> {
    if (paymentMethod !== 'CASH') return;
    if (manager.getSnapshot() !== session || busy.current || attempt.paused || attempt.blocked || attempt.pending !== null
      || attempt.sending || items.length === 0 || checking
      || lines.length !== items.length || lines.some((line) => line.issue !== null)) return;
    busy.current = true;
    cashReceipts.clear();
    lastReceiptId.current = null;
    store.protectActorResolution();
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
      submittedLines.current = checked;
      const operation = prepareMobileOrder(items, 'CASH',
        session.status === 'authenticated' ? undefined : guest.isGuest ? guest.guestName ?? undefined : undefined,
        true);
      await store.send(operation);
    } catch {
      if (!controller.signal.aborted) setReviewMessage('No se pudo verificar el carrito. Revalida antes de ordenar.');
    } finally {
      if (preflight.current === controller) preflight.current = null;
      store.releaseActorResolution();
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
    {items.length === 0 && !receipt && <p>Tu carrito está vacío. Personaliza un producto para empezar.</p>}
    {items.length === 0 && onContinueShopping && !receipt && <button type="button" className="secondary-button" onClick={onContinueShopping}>Seguir viendo el menú</button>}
    {checking && items.length > 0 && <p role="status">Verificando el catálogo actual…</p>}
    {items.length > 0 && !checking && <>
      <ul>{items.map((item, index) => {
        const line = lines[index];
        const name = line?.name ?? `producto ${item.productId}`;
        return <li key={`${item.productId}-${item.optionValueIds.join('-')}-${index}`}>
          <div className="client-cart-line-main">
            <span>{item.quantity} × {name}</span>
            {line && line.selectedLabels.length > 0 && <span>Opciones: {line.selectedLabels.join(', ')}</span>}
            {line?.issue ? <p role="alert">{line.issue}</p> : line && <span> — Estimado {formatMxnCents(line.estimateCents)}</span>}
          </div>
          <div className="client-cart-line-actions">
            <div className="client-cart-quantity" role="group" aria-label={`Cantidad de ${name}`}>
              <button type="button" className="secondary-button" disabled={locked || item.quantity <= 1}
                aria-label={`Disminuir cantidad de ${name}`} onClick={() => setQuantity(index, item.quantity - 1)}>−</button>
              <span aria-live="polite">{item.quantity}</span>
              <button type="button" className="secondary-button" disabled={locked || item.quantity >= 99}
                aria-label={`Aumentar cantidad de ${name}`} onClick={() => setQuantity(index, item.quantity + 1)}>+</button>
            </div>
            <button type="button" className="secondary-button client-cart-remove" disabled={locked}
              aria-label={`Eliminar ${name}`} onClick={() => update(items.filter((_, position) => position !== index))}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </li>;
      })}</ul>
      {lines.length === items.length && !hasIssues &&
        <CartTotals totalCents={cartEstimate(lines)} />}
      <fieldset className="client-payment-methods" disabled={locked}>
        <legend>Método de pago</legend>
        <label><input type="radio" name="cart-payment" checked={paymentMethod === 'CASH'} onChange={() => setPaymentMethod('CASH')} /> Efectivo (QR para caja)</label>
        <label><input type="radio" name="cart-payment" checked={paymentMethod === 'STRIPE'} onChange={() => setPaymentMethod('STRIPE')} /> Tarjeta</label>
      </fieldset>
      {paymentMethod === 'STRIPE'
        ? <p className="field-hint">El pago con tarjeta estará disponible próximamente. Selecciona efectivo para generar el QR y pagar en caja.</p>
        : <p className="field-hint">Al confirmar se genera un QR para que caja cargue y cobre tu pedido.</p>}
      <button type="button" disabled={paymentMethod !== 'CASH' || locked || checking || lines.length !== items.length || hasIssues} onClick={() => { void submit(); }}>
        {paymentMethod === 'STRIPE' ? 'Pago con tarjeta próximamente' : reviewChanged ? 'Confirmar cambios y generar QR' : 'Confirmar pedido y generar QR'}
      </button>
      {!locked && hasIssues && <button type="button" className="secondary-button" onClick={() => setVerificationRevision((n) => n + 1)}>Revalidar carrito</button>}
    </>}
    {attempt.pending !== null && !attempt.sending && !attempt.confirmed && (
      <div className="order-retry" role="status">
        <p>El envío anterior quedó sin confirmar. Reintenta la misma orden; no crees una nueva.</p>
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
    {receipt && (
      <section className="order-confirmation" role="status" aria-labelledby="order-confirmation-title">
        <h3 id="order-confirmation-title">Orden creada</h3>
        <p><strong>Folio:</strong> {receipt.order.folio}</p>
        <p><strong>Estado:</strong> pendiente de pago</p>
        <CartTotals totalCents={receipt.order.totalCents} />
        {receipt.order.cashQr !== null ? (
          <CashQrPanel qr={receipt.order.cashQr} lines={receipt.lines} totalCents={receipt.order.totalCents} />
        ) : (
          <p role="alert">La orden se creó, pero no se recibió un QR de cobro. No pagues con este comprobante; solicita apoyo en caja.</p>
        )}
        {onContinueShopping && <button type="button" className="secondary-button" onClick={onContinueShopping}>Seguir comprando</button>}
      </section>
    )}
  </section>;
}
