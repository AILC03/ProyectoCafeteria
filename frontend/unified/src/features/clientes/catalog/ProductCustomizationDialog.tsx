import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMxnCents, parseCentsBigInt } from '../../../shared/utils/money';
import {
  fetchCatalogProductDetail,
  fetchCatalogProductOptions,
  formatCatalogError,
  type CatalogOptionGroup,
  type CatalogProduct,
} from './catalogApi';
import {
  calculateEstimatedCustomizationPrice,
  createInitialSelections,
  toggleOptionValue,
  validateOptionSelections,
  type OptionSelectionMap,
} from './customization';

export interface ConfirmedCustomization {
  productId: string;
  productName: string;
  quantity: number;
  optionValueIds: string[];
  selectedLabels: string[];
  estimatedTotalCents: string;
}

export interface ProductCustomizationDialogProps {
  productId: string;
  fallbackProduct: CatalogProduct;
  onClose: () => void;
  onConfirm: (summary: ConfirmedCustomization) => void;
}

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal for inspecting product details and choosing valid option combinations. */
export function ProductCustomizationDialog({
  productId,
  fallbackProduct,
  onClose,
  onConfirm,
}: ProductCustomizationDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [product, setProduct] = useState<CatalogProduct>(fallbackProduct);
  const [groups, setGroups] = useState<CatalogOptionGroup[]>([]);
  const [selections, setSelections] = useState<OptionSelectionMap>({});
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const sessionContent = document.querySelector<HTMLElement>('.session-content');
    const appliedInert = sessionContent !== null && !sessionContent.hasAttribute('inert');
    if (appliedInert) {
      sessionContent.setAttribute('inert', '');
      sessionContent.setAttribute('aria-hidden', 'true');
    }

    return () => {
      if (appliedInert) {
        sessionContent.removeAttribute('inert');
        sessionContent.removeAttribute('aria-hidden');
      }
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    function handleDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialogElement = dialogRef.current;
      if (dialogElement === null) return;

      const focusable = Array.from(dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const insideDialog = active !== null && dialogElement.contains(active);

      if (event.shiftKey) {
        if (!insideDialog || active === first || active === dialogElement) {
          event.preventDefault();
          last.focus();
        }
      } else if (!insideDialog || active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetchCatalogProductDetail(productId, controller.signal),
      fetchCatalogProductOptions(productId, controller.signal),
    ])
      .then(([detail, fetchedGroups]) => {
        if (controller.signal.aborted) return;
        setProduct(detail);
        setGroups(fetchedGroups);
        setSelections(createInitialSelections(fetchedGroups));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(formatCatalogError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [productId, retryCount]);

  const validation = validateOptionSelections(groups, selections);
  const estimate = calculateEstimatedCustomizationPrice(product.basePriceCents, groups, selections, quantity);
  const canConfirm = !loading && error === null && product.isAvailable && validation.valid;
  const decreaseDisabled = quantity <= MIN_QUANTITY || loading;
  const increaseDisabled = quantity >= MAX_QUANTITY || loading;

  function handleConfirm(): void {
    if (!canConfirm) return;
    onConfirm({
      productId: product.id,
      productName: product.name,
      quantity,
      optionValueIds: validation.selectedOptionValueIds,
      selectedLabels: estimate.selectedLabels,
      estimatedTotalCents: estimate.totalPriceCents,
    });
  }

  function handleRetry(): void {
    // Move focus before the retry button unmounts so keyboard interaction never leaks to body.
    closeButtonRef.current?.focus();
    setRetryCount((count) => count + 1);
  }

  const dialogNode = (
    <div
      className="auth-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="auth-dialog catalog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customizer-title"
        aria-describedby="customizer-description"
      >
        <div className="catalog-dialog-header">
          <div>
            <h2 id="customizer-title">{product.name}</h2>
            <p id="customizer-description" className="field-hint">
              {product.description ?? 'Especialidad preparada al momento.'}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" className="secondary-button" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error === null && (
          <p className="product-price">Precio base: {formatMxnCents(product.basePriceCents)}</p>
        )}

        {!loading && error === null && !product.isAvailable && (
          <p role="alert" className="form-alert">
            Este producto está agotado actualmente y no puede seleccionarse.
          </p>
        )}

        {loading && (
          <p role="status" aria-live="polite">
            Cargando detalle y opciones…
          </p>
        )}

        {error !== null && (
          <div className="auth-confirm-box" role="alert">
            <p>{error}</p>
            <button type="button" className="secondary-button" onClick={handleRetry}>
              Reintentar
            </button>
          </div>
        )}

        {!loading && error === null && groups.length === 0 && (
          <p className="field-hint">Este producto no tiene opciones adicionales de personalización.</p>
        )}

        {!loading && error === null && groups.length > 0 && (
          <div className="catalog-options-list">
            {groups.map((group) => {
              const selectedIds = selections[group.id] ?? [];
              const groupError = validation.errorsByGroup[group.id];
              const requirementLabel = group.minSelections > 0 ? 'Obligatorio' : 'Opcional';
              return (
                <fieldset key={group.id} className="option-group">
                  <legend>
                    {group.name} — {requirementLabel} (mín. {group.minSelections}, máx. {group.maxSelections})
                  </legend>
                  <div className="option-grid">
                    {group.values.map((value) => {
                      const isSelected = selectedIds.includes(value.id);
                      const hasSurcharge = parseCentsBigInt(value.surchargeCents) > 0n;
                      return (
                        <button
                          key={value.id}
                          type="button"
                          className={`option-button${isSelected ? ' option-button-selected' : ''}`}
                          aria-pressed={isSelected}
                          disabled={!value.isAvailable || !product.isAvailable}
                          onClick={() => setSelections((prev) => toggleOptionValue(group, prev, value))}
                        >
                          <span>{value.name}</span>
                          <span className="field-hint">
                            {!value.isAvailable
                              ? 'Agotado'
                              : hasSurcharge
                              ? `+${formatMxnCents(value.surchargeCents)}`
                              : 'Incluido'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {groupError !== undefined && (
                    <p role="alert" className="form-alert">
                      {groupError}
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}

        {error === null && (
          <div className="catalog-dialog-footer">
            <div className="quantity-control" role="group" aria-label="Cantidad">
              <button
                type="button"
                className="secondary-button"
                aria-label="Disminuir cantidad"
                aria-disabled={decreaseDisabled}
                onClick={() => {
                  if (!decreaseDisabled) setQuantity((q) => Math.max(MIN_QUANTITY, q - 1));
                }}
              >
                -
              </button>
              <span aria-live="polite" data-testid="customizer-quantity">
                {quantity}
              </span>
              <button
                type="button"
                className="secondary-button"
                aria-label="Aumentar cantidad"
                aria-disabled={increaseDisabled}
                onClick={() => {
                  if (!increaseDisabled) setQuantity((q) => Math.min(MAX_QUANTITY, q + 1));
                }}
              >
                +
              </button>
            </div>

            <div className="catalog-estimate">
              <p>
                Precio estimado: <strong>{formatMxnCents(estimate.totalPriceCents)}</strong>
              </p>
              <p className="field-hint">Estimación informativa; el importe final lo confirma el servidor al ordenar.</p>
            </div>
          </div>
        )}

        <div className="auth-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" disabled={!canConfirm} onClick={handleConfirm}>
            Confirmar personalización
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined' ? dialogNode : createPortal(dialogNode, document.body);
}
