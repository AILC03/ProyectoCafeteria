import { useEffect, useRef, useState } from 'react';
import { formatMxnCents } from '../../../shared/utils/money';
import {
  formatAvailabilityError,
  listAvailabilityProducts,
  setProductAvailability,
  type AvailabilityProduct,
} from './availabilityApi';

export function AvailabilityPage() {
  const [products, setProducts] = useState<AvailabilityProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const current = ++request.current;
    setLoading(true);
    setError(null);
    setProducts([]);
    listAvailabilityProducts(controller.signal)
      .then((result) => {
        if (!cancelled && current === request.current) setProducts(result);
      })
      .catch((reason) => {
        if (!cancelled && current === request.current) setError(formatAvailabilityError(reason));
      })
      .finally(() => {
        if (!cancelled && current === request.current) setLoading(false);
      });
    return () => { cancelled = true; controller.abort(); };
  }, [refresh]);

  async function toggle(product: AvailabilityProduct): Promise<void> {
    if (pending.current.has(product.id)) return;
    pending.current.add(product.id);
    const next = !product.isAvailable;
    setBusy((previous) => ({ ...previous, [product.id]: true }));
    setNotice(null);
    setActionError(null);
    try {
      // Local state changes only after the API's verified response, never optimistically.
      const updated = await setProductAvailability(product.id, next);
      setProducts((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${updated.name}: ${updated.isAvailable ? 'disponible' : 'agotado'}.`);
    } catch (reason) {
      setActionError(formatAvailabilityError(reason));
    } finally {
      pending.current.delete(product.id);
      setBusy((previous) => ({ ...previous, [product.id]: false }));
      setTimeout(() => feedback.current?.focus(), 0);
    }
  }

  return (
    <section className="terminal-availability" aria-labelledby="availability-title">
      <h1 id="availability-title" tabIndex={-1}>Disponibilidad de productos</h1>
      <p>Cambios permitidos para caja y administración. El catálogo de la API es la fuente de verdad.</p>
      <button type="button" className="secondary-button" disabled={loading || pending.current.size > 0} onClick={() => { setNotice(null); setActionError(null); setRefresh((value) => value + 1); }}>Actualizar productos</button>
      <div className="kitchen-feedback" ref={feedback} tabIndex={-1}>
        {notice !== null && <p role="status">{notice}</p>}
        {actionError !== null && <p role="alert">{actionError}</p>}
      </div>
      {error !== null && <p role="alert">{error}</p>}
      {!loading && products.length === 0 && <p role="status">No hay productos en el catálogo.</p>}
      {!loading && products.length > 0 && (
        <ul className="availability-list">
          {products.map((product) => (
            <li key={product.id} className="availability-item">
              <span className="availability-name">{product.name}</span>
              <span className="availability-price">{formatMxnCents(product.basePriceCents)}</span>
              <button
                type="button"
                className="secondary-button"
                aria-label={`${product.isAvailable ? 'Agotar' : 'Habilitar'} ${product.name}`}
                disabled={busy[product.id] === true}
                onClick={() => { void toggle(product); }}
              >
                {busy[product.id] === true ? 'Actualizando…' : product.isAvailable ? 'Agotar' : 'Disponible'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
