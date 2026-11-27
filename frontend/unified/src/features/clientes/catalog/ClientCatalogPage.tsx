import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { formatMxnCents } from '../../../shared/utils/money';
import { clientCartStore, useClientCart } from '../cart/clientCartStore';
import { useSession, useSessionManager } from '../../../shared/auth/SessionProvider';
import { mobileOrderStoreFor } from '../orders/mobileOrders';
import { changeFavorite, getFavorites } from '../account/accountApi';
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  formatCatalogError,
  type CatalogCategory,
  type CatalogProduct,
} from './catalogApi';
import {
  ProductCustomizationDialog,
} from './ProductCustomizationDialog';

const ALL_CATEGORIES_ID = '__all__';

function isSafeImageUrl(url: string | null): url is string {
  return url !== null && /^https?:\/\//i.test(url);
}

/** Public and customer catalog browsing page backed exclusively by API responses. */
export function ClientCatalogPage() {
  const manager = useSessionManager();
  const session = useSession();
  const customerId = session.status === 'authenticated' && session.actor.accountType === 'CUSTOMER' && session.actor.role === 'CLIENTE'
    ? session.actor.id : null;
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
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const cart = useClientCart();
  const categoryButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (customerId === null) { setFavoriteIds(new Set()); return; }
    const controller = new AbortController();
    void getFavorites(undefined, controller.signal).then((page) => {
      if (!controller.signal.aborted) setFavoriteIds(new Set(page.data.map((favorite) => favorite.productId)));
    }).catch(() => { /* the star remains usable; a failed list does not block the catalog */ });
    return () => controller.abort();
  }, [customerId, retryCount]);

  async function toggleFavorite(product: CatalogProduct): Promise<void> {
    if (customerId === null) {
      setFavoriteNotice('Inicia sesión como cliente para guardar productos favoritos.');
      return;
    }
    if (favoriteBusyId !== null) return;
    const adding = !favoriteIds.has(product.id);
    const before = favoriteIds;
    setFavoriteBusyId(product.id);
    setFavoriteNotice(null);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (adding) next.add(product.id); else next.delete(product.id);
      return next;
    });
    try {
      await changeFavorite(product.id, adding);
      setFavoriteNotice(adding ? `${product.name} agregado a favoritos.` : `${product.name} retirado de favoritos.`);
    } catch {
      setFavoriteIds(before);
      setFavoriteNotice('No se pudo actualizar el favorito. Inténtalo de nuevo.');
    } finally {
      setFavoriteBusyId(null);
    }
  }

  useEffect(() => {
    const revision = orderStore.getClearRevision();
    if (revision === lastOrderClearRevision.current) return;
    lastOrderClearRevision.current = revision;
    setSelectedProduct(null);
  }, [orderAttempt, orderStore]);

  useEffect(() => {
    if (orderAttempt.confirmed !== null) clientCartStore.clearNotice();
  }, [orderAttempt.confirmed]);

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

      {cart.notice !== null && <p role="status">{cart.notice}</p>}
      {favoriteNotice !== null && <p role="status">{favoriteNotice}</p>}

      {loading && (
        <p role="status" aria-live="polite">
          Cargando catálogo…
        </p>
      )}

      {!loading && error !== null && (
        <div className="auth-card" role="alert">
          <p>{error}</p>
          <div className="auth-actions">
            <button type="button" onClick={() => { setRetryCount((c) => c + 1); clientCartStore.bumpRevision(); }}>
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
                  <button
                    type="button"
                    className="product-favorite"
                    aria-pressed={favoriteIds.has(product.id)}
                    aria-label={favoriteIds.has(product.id) ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}
                    disabled={favoriteBusyId === product.id}
                    onClick={() => { void toggleFavorite(product); }}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"
                        fill={favoriteIds.has(product.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isSafeImageUrl(product.imageUrl) && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="product-image"
                      loading="lazy"
                    />
                  )}
                  {!isSafeImageUrl(product.imageUrl) && <div className="client-product-placeholder">Sin imagen</div>}
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
          confirmLabel="Añadir al carrito"
          onConfirm={(summary) => {
            mobileOrderStoreFor(manager).dismissConfirmation();
            const added = clientCartStore.addItem({
              productId: summary.productId,
              quantity: summary.quantity,
              optionValueIds: summary.optionValueIds,
            });
            if (added) setSelectedProduct(null);
            return added;
          }}
        />
      )}
    </section>
  );
}
