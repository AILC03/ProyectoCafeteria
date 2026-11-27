import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IdempotentOperation } from '../../../shared/api/idempotency';
import { formatMxnCents } from '../../../shared/utils/money';
import { useSession } from '../../../shared/auth/SessionProvider';
import { clearPosDraft, getPosDraft, savePosDraft } from '../../../shared/storage';
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  formatCatalogError,
  type CatalogCategory,
  type CatalogProduct,
} from '../../clientes/catalog/catalogApi';
import {
  ProductCustomizationDialog,
  type ConfirmedCustomization,
} from '../../clientes/catalog/ProductCustomizationDialog';
import {
  UnverifiableCashierOrderResponseError,
  associateOrderCustomer,
  formatPosError,
  isOrderAssociable,
  prepareCashierOrder,
  sendCashierOrder,
  shouldKeepCashierOrderOperation,
  type PosOrder,
} from './posApi';
import {
  appendDraftLine,
  createDraftLine,
  hydrateDraftLines,
  sumDraftLines,
  toPosDraftLines,
  toPosLineInput,
  updateDraftLineQuantity,
  MAX_POS_QUANTITY,
  MIN_POS_QUANTITY,
  type DraftLine,
} from './posDraft';
import { PosCustomerDialog, type FoundCustomer } from './PosCustomerDialog';
import { PosGuestDialog } from './PosGuestDialog';
import { PosTotals } from './PosTotals';
import { PosQrDialog } from './PosQrDialog';
import { formatCashQrError, scanCashQr, type ScannedCashOrder } from '../payment/cashQrApi';
import { CashPaymentPanel } from '../payment/CashPaymentPanel';
import { targetFromPosOrder, targetFromScannedOrder } from '../payment/cashPaymentTarget';
import { getCurrentCashSession, parseMxnAmountToCents, type CashSession } from '../cash/cashApi';
import { isCashSessionOwner } from '../cash/cashSessionRules';
import { CashSessionPanel } from '../cash/CashSessionPanel';
import {
  formatPaymentError,
  getProtectedTicket,
  prepareCashPayment,
  sendCashPayment,
  shouldRetryCashPayment,
  UnverifiableCashPaymentResponseError,
  type Ticket,
} from '../payment/paymentApi';
import { ProtectedTicket } from '../payment/ProtectedTicket';
import { PosCheckoutDialog } from './PosCheckoutDialog';

type CompletedSale = {
  saleId: string;
  changeCents: string;
  ticket: Ticket | null;
  ticketError: string | null;
};

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-.8 11.1a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"
      />
    </svg>
  );
}

/** POS draft only: the catalog and the API remain the source of truth. */
export function PosPage() {
  const actorState = useSession();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [customizing, setCustomizing] = useState<CatalogProduct | null>(null);
  const [lines, setLines] = useState<DraftLine[]>(() => hydrateDraftLines(getPosDraft().lines));
  const [cashGate, setCashGate] = useState<CashSession | null | undefined>(undefined);
  const handleCashSession = useCallback((next: CashSession | null) => { setCashGate(next); }, []);

  const [candidate, setCandidate] = useState<FoundCustomer | null>(null);
  const [confirmedName, setConfirmedName] = useState('');
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);

  const [order, setOrder] = useState<PosOrder | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<IdempotentOperation | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTotalCents, setCheckoutTotalCents] = useState('0');
  const [checkoutSource, setCheckoutSource] = useState<'estimate' | 'server'>('estimate');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBlocked, setCheckoutBlocked] = useState(false);
  const [cashSession, setCashSession] = useState<CashSession | null | undefined>(undefined);
  const [paymentOperation, setPaymentOperation] = useState<IdempotentOperation | null>(null);
  const [completed, setCompleted] = useState<CompletedSale | null>(null);

  const [scanned, setScanned] = useState<ScannedCashOrder | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [qrDialog, setQrDialog] = useState<'scan' | 'token' | null>(null);
  const [qrPaid, setQrPaid] = useState(false);

  const [associationOrderId, setAssociationOrderId] = useState('');
  const [associationError, setAssociationError] = useState<string | null>(null);
  const [associationMessage, setAssociationMessage] = useState<string | null>(null);
  const [associating, setAssociating] = useState(false);

  const cashReady = cashGate !== undefined
    && cashGate !== null
    && cashGate.closedAt === null
    && actorState.status === 'authenticated'
    && isCashSessionOwner(cashGate, actorState.actor);

  useEffect(() => {
    // A created order is owned by the server: never replay its draft later.
    if (order !== null || lines.length === 0) clearPosDraft();
    else savePosDraft({ version: 1, lines: toPosDraftLines(lines) });
  }, [lines, order]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError(null);
    setCategoryError(null);
    fetchCatalogCategories(controller.signal)
      .then((nextCategories) => { if (!controller.signal.aborted) setCategories(nextCategories); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setCategoryError(formatCatalogError(error)); });
    fetchCatalogProducts({ signal: controller.signal })
      .then((nextProducts) => { if (!controller.signal.aborted) setProducts(nextProducts); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setCatalogError(formatCatalogError(error)); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [catalogRevision]);

  function handleCustomizationConfirm(summary: ConfirmedCustomization): void {
    if (!cashReady || blocked || order !== null || scanned !== null) return;
    setLines((current) => appendDraftLine(current, createDraftLine(summary)));
    setCustomizing(null);
  }

  function handleCustomerAccept(customer: FoundCustomer, name: string): void {
    setCandidate(customer);
    setConfirmedName(name);
    setCustomerConfirmed(true);
    setGuestName('');
    setCustomerDialogOpen(false);
  }

  function handleGuestAccept(name: string): void {
    setGuestName(name);
    setCandidate(null);
    setConfirmedName('');
    setCustomerConfirmed(false);
    setGuestDialogOpen(false);
  }

  function clearCustomerSelection(): void {
    setCandidate(null);
    setConfirmedName('');
    setCustomerConfirmed(false);
    setGuestName('');
  }

  async function createOrder(operation: IdempotentOperation): Promise<{ kind: 'created'; order: PosOrder } | { kind: 'failed'; message: string; blocked: boolean }> {
    setCreating(true);
    setOrderError(null);
    try {
      const created = await sendCashierOrder(operation);
      setOrder(created);
      setPendingOrder(null);
      setGuestName('');
      setAssociationOrderId(created.id);
      setAssociationMessage(null);
      setAssociationError(null);
      return { kind: 'created', order: created };
    } catch (error) {
      const message = formatPosError(error);
      const unverifiable = error instanceof UnverifiableCashierOrderResponseError;
      const keepOperation = shouldKeepCashierOrderOperation(error);
      if (unverifiable) {
        setBlocked(true);
        setPendingOrder(null);
      } else if (!keepOperation) {
        setPendingOrder(null);
      }
      setOrderError(message);
      return { kind: 'failed', message, blocked: unverifiable || keepOperation };
    } finally {
      setCreating(false);
    }
  }

  async function ensureCashierOrder(): Promise<{ kind: 'created'; order: PosOrder } | { kind: 'failed'; message: string; blocked: boolean }> {
    if (order !== null) return { kind: 'created', order };
    if (!cashReady) {
      return { kind: 'failed', message: 'Abre tu caja del turno antes de tomar órdenes.', blocked: false };
    }
    if (blocked) {
      return { kind: 'failed', message: 'No vuelvas a crear otra orden; confirma con la cafetería si se registró.', blocked: true };
    }
    if (candidate !== null && !customerConfirmed) {
      return { kind: 'failed', message: 'Confirma el nombre del cliente antes de crear la orden.', blocked: false };
    }
    let operation = pendingOrder;
    if (operation === null) {
      try {
        operation = prepareCashierOrder(
          lines.map(toPosLineInput),
          candidate === null ? undefined : { identifier: candidate.identifier, confirmedName },
          candidate === null ? guestName : undefined,
        );
      } catch (error) {
        return { kind: 'failed', message: formatPosError(error), blocked: false };
      }
      setPendingOrder(operation);
    }
    return createOrder(operation);
  }

  function openCheckout(): void {
    if (creating || blocked || lines.length === 0 || order !== null || scanned !== null) return;
    if (!cashReady) {
      setOrderError('Abre tu caja del turno antes de tomar órdenes.');
      return;
    }
    if (candidate !== null && !customerConfirmed) {
      setOrderError('Confirma el nombre del cliente antes de crear la orden.');
      return;
    }
    setCheckoutTotalCents(totalEstimate);
    setCheckoutSource('estimate');
    setCheckoutError(null);
    setCheckoutBlocked(false);
    setCheckoutBusy(false);
    setCashSession(undefined);
    setPaymentOperation(null);
    setCheckoutOpen(true);
  }

  function closeCheckout(): void {
    if (checkoutBusy || checkoutBlocked) return;
    setCheckoutOpen(false);
    setPaymentOperation(null);
    setCheckoutError(null);
  }

  async function handleCheckoutConfirm(receivedText: string): Promise<void> {
    if (checkoutBusy) return;
    let receivedCents: string;
    try {
      receivedCents = parseMxnAmountToCents(receivedText);
    } catch (error) {
      setCheckoutError(formatPaymentError(error));
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const ensured = await ensureCashierOrder();
      if (ensured.kind === 'failed') {
        setCheckoutError(ensured.message);
        if (ensured.blocked) setCheckoutBlocked(true);
        return;
      }
      const activeOrder = ensured.order;
      setCheckoutTotalCents(activeOrder.totalCents);
      setCheckoutSource('server');
      if (BigInt(receivedCents) < BigInt(activeOrder.totalCents)) {
        setCheckoutError(`El efectivo no cubre el total confirmado de ${formatMxnCents(activeOrder.totalCents)}.`);
        return;
      }
      if (actorState.status !== 'authenticated') {
        setCheckoutError('Tu sesión no está disponible. Vuelve a iniciar sesión.');
        return;
      }

      let session = cashSession;
      if (session === undefined) {
        try {
          session = await getCurrentCashSession();
          setCashSession(session);
        } catch {
          setCheckoutError('No se pudo consultar la caja abierta. Reintenta.');
          return;
        }
      }
      if (session === null || session.closedAt !== null || !isCashSessionOwner(session, actorState.actor)) {
        setCheckoutError('Sólo el responsable de la caja abierta puede cobrar. La API confirmará esta regla.');
        return;
      }

      let operation = paymentOperation;
      if (operation === null) {
        operation = prepareCashPayment(session.id, activeOrder.id, receivedCents);
        setPaymentOperation(operation);
      }
      const paid = await sendCashPayment(operation);
      setPaymentOperation(null);
      setCheckoutOpen(false);
      setCheckoutBlocked(false);

      let ticket: Ticket | null = null;
      let ticketError: string | null = null;
      try {
        ticket = await getProtectedTicket(paid.saleId);
      } catch {
        ticketError = 'Pago confirmado; el ticket está pendiente. Reintenta sólo obtener el ticket.';
      }
      setCompleted({ saleId: paid.saleId, changeCents: paid.changeCents, ticket, ticketError });
    } catch (error) {
      if (error instanceof UnverifiableCashPaymentResponseError) {
        setPaymentOperation(null);
        setCheckoutBlocked(true);
      } else if (shouldRetryCashPayment(error)) {
        setCheckoutBlocked(true);
      } else {
        setPaymentOperation(null);
      }
      setCheckoutError(formatPaymentError(error));
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function retryCompletedTicket(): Promise<void> {
    if (completed === null) return;
    try {
      const ticket = await getProtectedTicket(completed.saleId);
      setCompleted({ ...completed, ticket, ticketError: null });
    } catch {
      setCompleted({ ...completed, ticketError: 'El ticket sigue pendiente. Reintenta sólo obtener el ticket.' });
    }
  }

  async function loadScanned(token: string): Promise<void> {
    if (scanBusy || creating || blocked || order !== null) return;
    setScanBusy(true);
    setScanError(null);
    try {
      setScanned(await scanCashQr(token));
      setQrPaid(false);
    } catch (error) {
      setScanError(formatCashQrError(error));
    } finally {
      setScanBusy(false);
    }
  }

  function closeScanned(): void {
    setScanned(null);
    setQrPaid(false);
    setScanError(null);
  }

  async function handleAssociateCustomer(): Promise<void> {
    if (associating || candidate === null || !customerConfirmed || confirmedName.trim().length < 1) return;
    if (order !== null && !isOrderAssociable(order)) {
      setAssociationError('La orden ya fue pagada, expiró o cambió de estado; no se puede asociar un cliente.');
      return;
    }
    const id = associationOrderId.trim() || order?.id || '';
    if (id.length === 0) {
      setAssociationError('Indica el ID de la orden pendiente.');
      return;
    }
    setAssociating(true);
    setAssociationError(null);
    setAssociationMessage(null);
    try {
      const updated = await associateOrderCustomer(id, { identifier: candidate.identifier, confirmedName });
      // An association result is the only supported way to select another
      // pending POS order; do not add an order lookup/list for payment.
      if (updated.source === 'CASHIER' && isOrderAssociable(updated)) setOrder(updated);
      setAssociationMessage(`Cliente asociado a la orden ${updated.folio}.`);
    } catch (error) {
      setAssociationError(formatPosError(error));
    } finally {
      setAssociating(false);
    }
  }

  function startNewOrder(): void {
    setLines([]);
    setOrder(null);
    setOrderError(null);
    setAssociationMessage(null);
    setAssociationError(null);
    setPendingOrder(null);
    setGuestName('');
    clearCustomerSelection();
    setScanned(null);
    setQrPaid(false);
    setQrDialog(null);
    setCheckoutOpen(false);
    setCheckoutError(null);
    setCheckoutBlocked(false);
    setCheckoutBusy(false);
    setCashSession(undefined);
    setPaymentOperation(null);
    setCompleted(null);
  }

  const totalEstimate = sumDraftLines(lines);
  const filteredProducts = products.filter((product) =>
    (selectedCategory === '' || product.categoryId === selectedCategory)
      && product.name.toLocaleLowerCase('es-MX').includes(searchQuery.trim().toLocaleLowerCase('es-MX')),
  );
  const qrTarget = scanned === null ? null : targetFromScannedOrder(scanned);
  const orderTarget = order === null ? null : targetFromPosOrder(order);
  const draftFrozen = order !== null || blocked || creating || scanned !== null || !cashReady;
  const customerSummary = candidate !== null
    ? `Cliente: ${candidate.name} (${candidate.customerNumber})`
    : guestName.trim().length > 0 ? `Invitado: ${guestName.trim()}` : 'Sin cliente asignado (opcional).';

  return (
    <section className="terminal-pos" aria-labelledby="pos-title">
      <header className="pos-header">
        <div className="pos-header-copy">
          <h1 id="pos-title">Punto de venta</h1>
          <p className="field-hint">Toma de orden en efectivo. Crear la orden no abre caja, no cobra ni genera QR.</p>
        </div>
      </header>

      {catalogError !== null && (
        <div className="form-alert" role="alert">
          <p>{catalogError}</p>
          <button type="button" className="secondary-button" onClick={() => { setCatalogRevision((value) => value + 1); }}>Reintentar catálogo</button>
        </div>
      )}
      {catalogLoading && <p role="status">Cargando productos disponibles…</p>}

      <div className="pos-top-grid">
        <section className="pos-customer-bar" aria-labelledby="pos-customer-title">
          <div className="pos-customer-summary">
            <h2 id="pos-customer-title">Cliente de la orden (opcional)</h2>
            <p>{customerSummary}</p>
          </div>
          <div className="pos-customer-actions">
            <button type="button" disabled={blocked || customerDialogOpen || guestDialogOpen} onClick={() => setCustomerDialogOpen(true)}>
              Buscar cliente
            </button>
            <button type="button" className="secondary-button" disabled={blocked || customerDialogOpen || guestDialogOpen} onClick={() => setGuestDialogOpen(true)}>
              Invitado
            </button>
          </div>
        </section>

        <section className="pos-qr-card" aria-labelledby="pos-qr-title">
          <div className="pos-qr-copy">
            <h2 id="pos-qr-title">Cobrar pedido con QR</h2>
            <p className="field-hint">Escanea el QR del cliente o ingresa su token. Escanear no cobra ni envía el pedido a preparación.</p>
          </div>
          <div className="pos-qr-actions">
            <button
              type="button"
              disabled={scanBusy || blocked || creating || order !== null || scanned !== null}
              onClick={() => setQrDialog('scan')}
            >
              Escanear QR
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={scanBusy || blocked || creating || order !== null || scanned !== null}
              onClick={() => setQrDialog('token')}
            >
              Ingresar token
            </button>
          </div>
          {scanError !== null && <p role="alert" className="payment-notice payment-notice-error">{scanError}</p>}
        </section>

        <section className="pos-cash-card" aria-labelledby="pos-cash-close-title">
          <div className="pos-cash-copy">
            <h2 id="pos-cash-close-title">Cerrar caja</h2>
            <p className="field-hint">Finaliza el turno cuando termines de cobrar.</p>
          </div>
          <CashSessionPanel mode="close-only" onSessionChange={handleCashSession} />
        </section>
      </div>

      {cashGate !== undefined && !cashReady && (
        <p className="form-alert" role="status">
          La toma de órdenes está bloqueada hasta que haya una caja abierta confirmada por el servidor.
        </p>
      )}

      <div className="pos-layout">
        <section className="auth-card pos-catalog-panel" aria-labelledby="pos-catalog-title">
          <h2 id="pos-catalog-title">Productos disponibles</h2>
          <div className="pos-catalog-search">
            <input
              type="search"
              aria-label="Buscar productos"
              placeholder="Buscar producto por nombre..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <span className="pos-catalog-count">{filteredProducts.length} productos</span>
          </div>
          {categoryError !== null && (
            <p role="status">No se pudieron cargar las categorías. Puedes buscar productos por nombre. <button type="button" className="secondary-button" onClick={() => setCatalogRevision((value) => value + 1)}>Reintentar categorías</button></p>
          )}
          {categories.length > 0 && (
            <nav className="pos-categories-bar" aria-label="Categorías de menú">
              {[{ id: '', name: 'Todas' }, ...categories].map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`pos-category-tab${selectedCategory === category.id ? ' active' : ''}`}
                  aria-pressed={selectedCategory === category.id}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </nav>
          )}
          {!catalogLoading && catalogError === null && products.length === 0 && <p>No hay productos disponibles en este momento.</p>}
          {!catalogLoading && catalogError === null && products.length > 0 && filteredProducts.length === 0 && <p>No se encontraron productos</p>}
          <div className="pos-product-grid pos-products-grid">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="pos-product-button pos-product-card"
                disabled={!product.isAvailable || draftFrozen}
                onClick={() => { setCustomizing(product); }}
              >
                <span className="pos-visually-hidden">Personalizar </span>
                <span className="pos-product-copy">
                  {product.imageUrl === null && <span className="pos-product-placeholder">Sin imagen</span>}
                  <strong className="product-title">{product.name}</strong>
                  {product.description && <span className="product-desc">{product.description}</span>}
                </span>
                <span className="product-price-row">
                  <span className="product-price-val">{formatMxnCents(product.basePriceCents)}</span>
                  <span className="product-add-badge" aria-hidden={product.isAvailable ? true : undefined}>{product.isAvailable ? '+' : 'Agotado'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {completed !== null ? (
          <section className="auth-card pos-completed" aria-labelledby="pos-completed-title">
            <h2 id="pos-completed-title">Venta completada</h2>
            <div className="payment-notice payment-notice-success" role="status">
              <p>Pago confirmado por la API. La orden pasó a preparación.</p>
              <p>Cambio: {formatMxnCents(completed.changeCents)}</p>
            </div>
            {completed.ticket !== null && <ProtectedTicket ticket={completed.ticket} />}
            {completed.ticketError !== null && (
              <>
                <p role="alert" className="payment-notice payment-notice-error">{completed.ticketError}</p>
                <button type="button" className="secondary-button" onClick={() => { void retryCompletedTicket(); }}>
                  Reintentar ticket
                </button>
              </>
            )}
            <button type="button" onClick={startNewOrder}>Nueva orden</button>
          </section>
        ) : qrTarget !== null ? (
          <section className="auth-card pos-qr-order" aria-labelledby="pos-qr-order-title">
            <h2 id="pos-qr-order-title">Pedido cargado por QR</h2>
            <p className="field-hint">El pedido ya fue creado por el cliente. Escanear no cobra; confirma el cobro para enviarlo a preparación.</p>
            <CashPaymentPanel
              target={qrTarget}
              onConfirmed={() => { setQrPaid(true); }}
            />
            <button type="button" className="secondary-button" onClick={qrPaid ? startNewOrder : closeScanned}>
              {qrPaid ? 'Nueva venta' : 'Cerrar pedido QR'}
            </button>
          </section>
        ) : (
          <>
            <section className="auth-card" aria-labelledby="pos-lines-title">
              <h2 id="pos-lines-title">Líneas de la orden</h2>
              {lines.length === 0 && <p>Agrega productos para preparar la orden.</p>}
              {lines.length > 0 && (
                <>
                  <ul className="pos-lines">
                    {lines.map((line, index) => (
                      <li key={line.localId} className="pos-order-line">
                        <div className="pos-line-copy">
                          <strong>{line.label}</strong>
                          <span className="pos-line-price">{formatMxnCents(line.estimateCents)}</span>
                        </div>
                        <div className="pos-line-controls">
                          <div className="pos-quantity-control" role="group" aria-label={`Cantidad de ${line.productName}`}>
                            <button
                              type="button"
                              className="secondary-button"
                              aria-label={`Disminuir cantidad de ${line.productName}`}
                              disabled={draftFrozen || line.quantity <= MIN_POS_QUANTITY}
                              onClick={() => {
                                setLines((current) => current.map((item, position) =>
                                  position === index ? updateDraftLineQuantity(item, item.quantity - 1) : item));
                              }}
                            >
                              −
                            </button>
                            <span className="pos-quantity-value" aria-live="polite">{line.quantity}</span>
                            <button
                              type="button"
                              className="secondary-button"
                              aria-label={`Aumentar cantidad de ${line.productName}`}
                              disabled={draftFrozen || line.quantity >= MAX_POS_QUANTITY}
                              onClick={() => {
                                setLines((current) => current.map((item, position) =>
                                  position === index ? updateDraftLineQuantity(item, item.quantity + 1) : item));
                              }}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            className="pos-line-remove"
                            disabled={draftFrozen}
                            aria-label={`Eliminar ${line.productName}`}
                            onClick={() => { setLines((current) => current.filter((_, position) => position !== index)); }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <PosTotals totalCents={totalEstimate} source="estimate" />
                </>
              )}
            </section>

            <section className="auth-card" aria-labelledby="pos-order-title">
              <h2 id="pos-order-title">Orden pendiente</h2>
              <button
                type="button"
                disabled={creating || blocked || !cashReady || lines.length === 0 || order !== null}
                onClick={openCheckout}
              >
                Crear orden pendiente
              </button>
              {pendingOrder !== null && !creating && !blocked && (
                <button type="button" className="secondary-button" onClick={() => { void createOrder(pendingOrder); }}>
                  Reintentar la misma orden
                </button>
              )}
              {orderError !== null && <p role="alert">{orderError}</p>}

              {order !== null && (
                <div className="auth-confirm-box">
                  <p role="status">Orden {order.folio} creada. Estado: {order.status === 'PENDIENTE_PAGO' ? 'pendiente de pago' : order.status}.</p>
                  <p>Total confirmado por el servidor: {formatMxnCents(order.totalCents)}.</p>
                  <p>Crear la orden no confirma el pago ni genera un QR.</p>
                  <PosTotals totalCents={order.totalCents} source="server" />
                  {order.paymentMethod === 'CASH' && orderTarget !== null && (
                    <CashPaymentPanel target={orderTarget} />
                  )}
                  <div className="pos-order-actions">
                    <button type="button" className="secondary-button" onClick={startNewOrder}>
                      Nueva orden
                    </button>
                    <Link className="secondary-button payment-link" to="/terminal/cobro" state={order}>
                      Abrir cobro en pantalla completa
                    </Link>
                  </div>
                </div>
              )}

              {candidate !== null && (
                <div className="pos-association">
                  <h3>Asociar cliente a una orden pendiente</h3>
                  <div className="form-field">
                    <label htmlFor="pos-association-order">ID de orden pendiente</label>
                    <input
                      id="pos-association-order"
                      type="text"
                      inputMode="numeric"
                      maxLength={19}
                      value={associationOrderId}
                      disabled={associating}
                      onChange={(event) => { setAssociationOrderId(event.target.value); }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={associating || !customerConfirmed || confirmedName.trim().length < 1}
                    onClick={() => { void handleAssociateCustomer(); }}
                  >
                    {associating ? 'Asociando…' : 'Asociar cliente'}
                  </button>
                  {associationError !== null && <p role="alert">{associationError}</p>}
                  {associationMessage !== null && <p role="status">{associationMessage}</p>}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {customizing !== null && (
        <ProductCustomizationDialog
          productId={customizing.id}
          fallbackProduct={customizing}
          presentation="pos"
          onClose={() => { setCustomizing(null); }}
          onConfirm={handleCustomizationConfirm}
        />
      )}
      {customerDialogOpen && (
        <PosCustomerDialog
          initialCustomer={candidate}
          initialConfirmedName={confirmedName}
          onAccept={handleCustomerAccept}
          onClose={() => { setCustomerDialogOpen(false); }}
        />
      )}
      {guestDialogOpen && (
        <PosGuestDialog
          initialName={guestName}
          onAccept={handleGuestAccept}
          onClose={() => { setGuestDialogOpen(false); }}
        />
      )}
      {qrDialog !== null && (
        <PosQrDialog
          mode={qrDialog}
          busy={scanBusy}
          onToken={(token) => { void loadScanned(token); }}
          onClose={() => { setQrDialog(null); }}
        />
      )}
      {checkoutOpen && (
        <PosCheckoutDialog
          totalCents={checkoutTotalCents}
          totalSource={checkoutSource}
          busy={checkoutBusy}
          blocked={checkoutBlocked}
          error={checkoutError}
          onConfirm={(received) => { void handleCheckoutConfirm(received); }}
          onClose={closeCheckout}
        />
      )}
    </section>
  );
}
