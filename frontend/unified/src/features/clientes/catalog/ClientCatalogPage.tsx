import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { formatMxnCents } from '../../../shared/utils/money';
import { getCartDraft, saveCartDraft, type CartDraftItem } from '../../../shared/storage';
import { ClientCart } from '../cart/ClientCart';
import { useSessionManager } from '../../../shared/auth/SessionProvider';
import { mobileOrderStoreFor } from '../orders/mobileOrders';
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  formatCatalogError,
  type CatalogCategory,
  type CatalogProduct,
} from './catalogApi';
import {
  ProductCustomizationDialog,
  type ConfirmedCustomization,
} from './ProductCustomizationDialog';

const ALL_CATEGORIES_ID = '__all__';

function isSafeImageUrl(url: string | null): url is string {
  return url !== null && /^https?:\/\//i.test(url);
}

/** Public and customer catalog browsing page backed exclusively by API responses. */
export function ClientCatalogPage() {
  const manager = useSessionManager();
  const orderStore = mobileOrderStoreFor(manager);
  const orderAttempt = useSyncExternalStore(orderStore.subscribe, orderStore.getSnapshot, orderStore.getSnapshot);
  const lastOrderClearRevision = useRef(orderStore.getClearRevision());
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>(ALL_CATEGORIES_ID);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [lastConfirmed, setLastConfirmed] = useState<ConfirmedCustomization | null>(null);
  const [cartItems, setCartItems] = useState<CartDraftItem[]>(() => getCartDraft().items);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [cartLocked, setCartLocked] = useState(false);
  const categoryButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => manager.registerPrivateStateCleaner(() => {
    setCartItems([]);
    setLastConfirmed(null);
    setCartNotice(null);
    setCartLocked(false);
  }), [manager]);

  useEffect(() => {
    const revision = orderStore.getClearRevision();
    if (revision === lastOrderClearRevision.current) return;
    lastOrderClearRevision.current = revision;
    setCartItems([]);
    setLastConfirmed(null);
    setSelectedProduct(null);
    setCartNotice(null);
    setCartLocked(false);
  }, [orderAttempt, orderStore]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetchCatalogCategories(controller.signal),
      fetchCatalogProducts({ signal: controller.signal }),
    ])
      .then(([fetchedCategories, fetchedProducts]) => {
        if (controller.signal.aborted) return;
        setCategories(fetchedCategories);
        setProducts(fetchedProducts);
        setActiveCategoryId((prev) =>
          prev === ALL_CATEGORIES_ID || fetchedCategories.some((c) => c.id === prev)
            ? prev
            : ALL_CATEGORIES_ID,
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(formatCatalogError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [retryCount]);

  const categoryTabs = useMemo(
    () => [{ id: ALL_CATEGORIES_ID, name: 'Todas' }, ...categories],
    [categories],
  );

  const filteredProducts = useMemo(() => {
    if (activeCategoryId === ALL_CATEGORIES_ID) return products;
    return products.filter((product) => product.categoryId === activeCategoryId);
  }, [activeCategoryId, products]);

  function handleCategoryKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>): void {
    const total = categoryTabs.length;
    if (total === 0) return;

    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') targetIndex = (index + 1) % total;
    else if (event.key === 'ArrowLeft') targetIndex = (index - 1 + total) % total;
    else if (event.key === 'Home') targetIndex = 0;
    else if (event.key === 'End') targetIndex = total - 1;

    if (targetIndex === null) return;
    event.preventDefault();
    categoryButtonRefs.current[targetIndex]?.focus();
  }

  return (
    <section className="catalog-page" aria-labelledby="page-title">
      <div className="catalog-header">
        <h1 id="page-title">Menú</h1>
        <p className="field-hint">
          Consulta productos, disponibilidad y personalizaciones vigentes directamente del catálogo.
        </p>
      </div>

      {lastConfirmed !== null && (
        <div className="auth-card catalog-confirmation" role="status">
          <p>
            Selección preparada: <strong>{lastConfirmed.quantity} × {lastConfirmed.productName}</strong>{' '}
            ({lastConfirmed.selectedLabels.length > 0 ? lastConfirmed.selectedLabels.join(', ') : 'Sin extras'}) —{' '}
            Estimado {formatMxnCents(lastConfirmed.estimatedTotalCents)}.
          </p>
          <button type="button" disabled={cartLocked} onClick={() => {
            if (cartLocked) return;
            if (cartItems.length >= 50) {
              setCartNotice('El carrito admite hasta 50 líneas. Quita una antes de añadir otra.');
              return;
            }
            const next = [...cartItems, { productId: lastConfirmed.productId, quantity: lastConfirmed.quantity, optionValueIds: lastConfirmed.optionValueIds }];
            mobileOrderStoreFor(manager).dismissConfirmation();
            saveCartDraft({ version: 1, items: next });
            setCartItems(next);
            setLastConfirmed(null);
            setCartNotice('Producto añadido al carrito borrador. Comprueba el catálogo antes de ordenar.');
          }}>Añadir al carrito</button>
        </div>
      )}
      {cartNotice !== null && <p role="status">{cartNotice}</p>}

      <ClientCart items={cartItems} onChange={setCartItems} catalogRevision={retryCount} onLockChange={setCartLocked} />

      {loading && (
        <p role="status" aria-live="polite">
          Cargando catálogo…
        </p>
      )}

      {!loading && error !== null && (
        <div className="auth-card" role="alert">
          <p>{error}</p>
          <div className="auth-actions">
            <button type="button" onClick={() => setRetryCount((c) => c + 1)}>
              Reintentar carga
            </button>
          </div>
        </div>
      )}

      {!loading && error === null && (
        <>
          {categories.length > 0 && (
            <div className="catalog-categories" role="group" aria-label="Categorías del menú">
              {categoryTabs.map((category, index) => {
                const isSelected = activeCategoryId === category.id;
                return (
                  <button
                    key={category.id}
                    ref={(element) => { categoryButtonRefs.current[index] = element; }}
                    type="button"
                    className={isSelected ? 'category-pill category-pill-active' : 'secondary-button category-pill'}
                    aria-pressed={isSelected}
                    onClick={() => setActiveCategoryId(category.id)}
                    onKeyDown={(event) => handleCategoryKeyDown(index, event)}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          )}

          {products.length === 0 ? (
            <div className="auth-card" role="status">
              <h2>Menú vacío</h2>
              <p>No hay productos disponibles en el catálogo en este momento.</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="auth-card" role="status">
              <h2>Sin productos en esta categoría</h2>
              <p>Prueba seleccionando otra categoría para ver las especialidades disponibles.</p>
              <div className="auth-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveCategoryId(ALL_CATEGORIES_ID)}
                >
                  Ver todas las categorías
                </button>
              </div>
            </div>
          ) : (
            <div className="catalog-grid">
              {filteredProducts.map((product) => (
                <article
                  key={product.id}
                  className={`auth-card product-card${!product.isAvailable ? ' product-card-unavailable' : ''}`}
                >
                  {isSafeImageUrl(product.imageUrl) && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="product-image"
                      loading="lazy"
                    />
                  )}
                  {!isSafeImageUrl(product.imageUrl) && <div className="client-product-placeholder" aria-label="Producto sin imagen">Sin imagen</div>}
                  <div className="product-card-header">
                    <h2>{product.name}</h2>
                    <span className={product.isAvailable ? 'availability-badge' : 'availability-badge availability-badge-soldout'}>
                      {product.isAvailable ? 'Disponible' : 'Agotado'}
                    </span>
                  </div>
                  <p className="field-hint">
                    {product.description ?? 'Especialidad de la cafetería.'}
                  </p>
                  <p className="product-price">{formatMxnCents(product.basePriceCents)}</p>
                  <div className="auth-actions">
                    {product.isAvailable ? (
                      <button
                        type="button"
                        aria-label={`Personalizar ${product.name}`}
                        onClick={() => setSelectedProduct(product)}
                      >
                        Personalizar
                      </button>
                    ) : (
                      <button type="button" disabled aria-label={`${product.name} agotado`}>
                        Agotado
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {selectedProduct !== null && (
        <ProductCustomizationDialog
          key={selectedProduct.id}
          productId={selectedProduct.id}
          fallbackProduct={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onConfirm={(summary) => {
            setLastConfirmed(summary);
            setSelectedProduct(null);
          }}
        />
      )}
    </section>
  );
}
