import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IdempotentOperation } from '../../../shared/api/idempotency';
import { formatMxnCents } from '../../../shared/utils/money';
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
  isValidCustomerIdentifier,
  normalizeCustomerIdentifier,
  prepareCashierOrder,
  searchOrderCustomer,
  sendCashierOrder,
  shouldKeepCashierOrderOperation,
  type OrderCustomerMinimum,
  type PosLineInput,
  type PosOrder,
} from './posApi';

type DraftLine = PosLineInput & {
  label: string;
  estimateCents: string;
};

type FoundCustomer = OrderCustomerMinimum & { identifier: string };

/** POS draft only: the catalog and the API remain the source of truth. */
export function PosPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [customizing, setCustomizing] = useState<CatalogProduct | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [identifier, setIdentifier] = useState('');
  const [candidate, setCandidate] = useState<FoundCustomer | null>(null);
  const [confirmedName, setConfirmedName] = useState('');
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [order, setOrder] = useState<PosOrder | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<IdempotentOperation | null>(null);

  const [associationOrderId, setAssociationOrderId] = useState('');
  const [associationError, setAssociationError] = useState<string | null>(null);
  const [associationMessage, setAssociationMessage] = useState<string | null>(null);
  const [associating, setAssociating] = useState(false);

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
    if (blocked || order !== null) return;
    setLines((current) => [...current, {
      productId: summary.productId,
      quantity: summary.quantity,
      optionValueIds: summary.optionValueIds,
      label: `${summary.quantity} × ${summary.productName}${summary.selectedLabels.length > 0 ? ` (${summary.selectedLabels.join(', ')})` : ''}`,
      estimateCents: summary.estimatedTotalCents,
    }]);
    setCustomizing(null);
  }

  async function handleCustomerSearch(): Promise<void> {
    if (!isValidCustomerIdentifier(identifier)) {
      setCustomerError('Introduce un teléfono MX de 10 dígitos o un número de cliente válido.');
      setCandidate(null);
      setCustomerConfirmed(false);
      return;
    }
    setSearching(true);
    setCustomerError(null);
    setCustomerMessage(null);
    setCandidate(null);
    setCustomerConfirmed(false);
    const controller = new AbortController();
    try {
      const found = await searchOrderCustomer(identifier, controller.signal);
      setCandidate({ ...found, identifier: normalizeCustomerIdentifier(identifier) });
      setConfirmedName(found.name);
      setCustomerMessage(`Cliente encontrado: ${found.name} (${found.customerNumber}). Confirma el nombre antes de usarlo.`);
    } catch (error) {
      setCustomerError(formatPosError(error));
    } finally {
      setSearching(false);
    }
  }

  function handleUseCustomer(): void {
    if (candidate === null || confirmedName.trim().length < 1) {
      setCustomerError('Confirma el nombre del cliente antes de continuar.');
      return;
    }
    setCustomerError(null);
    setCustomerConfirmed(true);
    setCustomerMessage(`Cliente ${candidate.name} (${candidate.customerNumber}) listo para la orden.`);
  }

  function handleClearCustomer(): void {
    setCandidate(null);
    setConfirmedName('');
    setCustomerConfirmed(false);
    setCustomerError(null);
    setCustomerMessage(null);
  }

  async function createOrder(operation: IdempotentOperation): Promise<void> {
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
    } catch (error) {
      if (error instanceof UnverifiableCashierOrderResponseError) {
        setBlocked(true);
        setPendingOrder(null);
      } else if (!shouldKeepCashierOrderOperation(error)) {
        setPendingOrder(null);
      }
      setOrderError(formatPosError(error));
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateOrder(): Promise<void> {
    if (creating || blocked || lines.length === 0 || order !== null) return;
    if (candidate !== null && !customerConfirmed) {
      setOrderError('Confirma el nombre del cliente antes de crear la orden.');
      return;
    }
    setOrderError(null);
    let operation = pendingOrder;
    if (operation === null) {
      try {
        operation = prepareCashierOrder(
          lines,
          candidate === null ? undefined : { identifier: candidate.identifier, confirmedName },
          candidate === null ? guestName : undefined,
        );
      } catch (error) {
        setOrderError(formatPosError(error));
        return;
      }
      setPendingOrder(operation);
    }
    await createOrder(operation);
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
  }

  const totalEstimate = lines.reduce((total, line) => {
    const value = BigInt(line.estimateCents);
    return (total + value).toString();
  }, '0');
  const filteredProducts = products.filter((product) =>
    (selectedCategory === '' || product.categoryId === selectedCategory)
      && product.name.toLocaleLowerCase('es-MX').includes(searchQuery.trim().toLocaleLowerCase('es-MX')),
  );

  return (
    <section className="terminal-pos" aria-labelledby="pos-title">
      <h1 id="pos-title">Punto de venta</h1>
      <p className="field-hint">Toma de orden en efectivo. Crear la orden no abre caja, no cobra ni genera QR.</p>

      {catalogError !== null && (
        <div className="form-alert" role="alert">
          <p>{catalogError}</p>
          <button type="button" className="secondary-button" onClick={() => { setCatalogRevision((value) => value + 1); }}>Reintentar catálogo</button>
        </div>
      )}
      {catalogLoading && <p role="status">Cargando productos disponibles…</p>}

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
                disabled={!product.isAvailable || blocked || order !== null}
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
                  <span className="product-add-badge" aria-hidden="true">{product.isAvailable ? '+' : 'Agotado'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="auth-card" aria-labelledby="pos-lines-title">
          <h2 id="pos-lines-title">Líneas de la orden</h2>
          {lines.length === 0 && <p>Agrega productos para preparar la orden.</p>}
          {lines.length > 0 && (
            <>
              <ul className="pos-lines">
                {lines.map((line, index) => (
                  <li key={`${line.productId}-${line.optionValueIds?.join('-') ?? ''}-${index}`}>
                    <span>{line.label}</span>
                    <span>{formatMxnCents(line.estimateCents)}</span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={order !== null || blocked || creating}
                      aria-label={`Quitar ${line.label}`}
                      onClick={() => { setLines((current) => current.filter((_, position) => position !== index)); }}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
              <p>Estimado informativo: {formatMxnCents(totalEstimate)}. El servidor confirma el total.</p>
            </>
          )}
        </section>

        <section className="auth-card" aria-labelledby="pos-customer-title">
          <h2 id="pos-customer-title">Cliente de la orden (opcional)</h2>
          <div className="form-field">
            <label htmlFor="pos-customer-identifier">Teléfono o número de cliente</label>
            <input
              id="pos-customer-identifier"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={20}
              value={identifier}
              disabled={searching || blocked}
              onChange={(event) => { setIdentifier(event.target.value); }}
            />
          </div>
          <button type="button" disabled={searching || blocked} onClick={() => { void handleCustomerSearch(); }}>
            {searching ? 'Buscando…' : 'Buscar cliente'}
          </button>
          {customerError !== null && <p role="alert">{customerError}</p>}
          {customerMessage !== null && <p role="status">{customerMessage}</p>}
          {candidate !== null && (
            <>
              <div className="auth-confirm-box">
                <p><strong>{candidate.name}</strong> — {candidate.customerNumber}</p>
                <div className="form-field">
                  <label htmlFor="pos-confirmed-name">Nombre confirmado por el cliente</label>
                  <input
                    id="pos-confirmed-name"
                    type="text"
                    maxLength={120}
                    value={confirmedName}
                    disabled={blocked}
                    onChange={(event) => { setConfirmedName(event.target.value); }}
                  />
                </div>
                <button type="button" className="secondary-button" disabled={blocked} onClick={handleUseCustomer}>
                  Confirmar cliente
                </button>
                {customerConfirmed && <button type="button" className="secondary-button" disabled={blocked} onClick={handleClearCustomer}>Quitar cliente</button>}
              </div>
              <p className="field-hint">También puedes asociar este cliente a una orden pendiente con el botón «Asociar cliente».</p>
            </>
          )}
          {candidate === null && (
            <div className="form-field">
              <label htmlFor="pos-guest-name">Nombre de invitado (opcional)</label>
              <input
                id="pos-guest-name"
                type="text"
                maxLength={120}
                value={guestName}
                disabled={blocked}
                onChange={(event) => { setGuestName(event.target.value); }}
              />
            </div>
          )}
        </section>

        <section className="auth-card" aria-labelledby="pos-order-title">
          <h2 id="pos-order-title">Orden pendiente</h2>
          <button
            type="button"
            disabled={creating || blocked || lines.length === 0 || order !== null}
            onClick={() => { void handleCreateOrder(); }}
          >
            {creating ? 'Creando orden…' : 'Crear orden pendiente'}
          </button>
          {pendingOrder !== null && !creating && !blocked && (
            <button type="button" className="secondary-button" onClick={() => { void createOrder(pendingOrder); }}>
              Reintentar la misma orden
            </button>
          )}
          {orderError !== null && <p role="alert">{orderError}</p>}

          {order !== null && (
            <div className="auth-confirm-box" role="status">
              <p>Orden {order.folio} creada. Estado: {order.status === 'PENDIENTE_PAGO' ? 'pendiente de pago' : order.status}.</p>
              <p>Total confirmado por el servidor: {formatMxnCents(order.totalCents)}.</p>
               <p>Crear la orden no confirma el pago ni genera un QR.</p>
               {order.paymentMethod === 'CASH' && isOrderAssociable(order) && <Link className="secondary-button payment-link" to="/terminal/cobro" state={order}>Cobrar efectivo</Link>}
               <button type="button" className="secondary-button" onClick={startNewOrder}>Nueva orden</button>
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
    </section>
  );
}
