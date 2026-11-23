import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/client';
import { formatMxnCents } from '../../../shared/utils/money';
import {
  formatKitchenError,
  getKitchenOrder,
  listPreparationOrders,
  markOrderReady,
  type KitchenOrder,
  type KitchenOrderSummary,
  type KitchenPageData,
} from './kitchenApi';

type QueueQuery = { cursors: Array<string | null>; index: number };

const INITIAL_QUERY: QueueQuery = { cursors: [null], index: 0 };

function createdLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-MX') : value;
}

export function KitchenPage() {
  const [query, setQuery] = useState<QueueQuery>(INITIAL_QUERY);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<KitchenPageData | null>(null);
  const [details, setDetails] = useState<Record<string, KitchenOrder>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const paging = useRef(false);
  const marking = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    paging.current = false;
    const current = ++request.current;
    setLoading(true);
    setError(null);
    setDetailErrors({});
    setPage(null);
    setDetails({});
    const cursor = query.cursors[query.index] ?? undefined;

    listPreparationOrders(20, cursor, controller.signal)
      .then(async (result) => {
        if (cancelled || current !== request.current) return;
        setPage(result);
        const resolved = await Promise.all(result.items.map(async (item) => {
          try {
            return [item.id, await getKitchenOrder(item.id, controller.signal)] as const;
          } catch (reason) {
            if (!cancelled && current === request.current) {
              setDetailErrors((previous) => ({ ...previous, [item.id]: formatKitchenError(reason) }));
            }
            return null;
          }
        }));
        if (!cancelled && current === request.current) {
          setDetails(Object.fromEntries(resolved.filter((entry): entry is readonly [string, KitchenOrder] => entry !== null)));
        }
      })
      .catch((reason) => {
        if (!cancelled && current === request.current) setError(formatKitchenError(reason));
      })
      .finally(() => {
        if (!cancelled && current === request.current) setLoading(false);
      });

    return () => { cancelled = true; controller.abort(); };
  }, [query.index, refresh]);

  function nextPage(): void {
    if (loading || paging.current || page?.nextCursor == null) return;
    paging.current = true;
    setNotice(null);
    setActionError(null);
    setQuery((previous) => ({
      cursors: [...previous.cursors.slice(0, previous.index + 1), page.nextCursor],
      index: previous.index + 1,
    }));
  }

  function previousPage(): void {
    if (loading || paging.current || query.index === 0) return;
    paging.current = true;
    setNotice(null);
    setActionError(null);
    setQuery((previous) => ({ ...previous, index: previous.index - 1 }));
  }

  function reload(): void {
    if (loading || paging.current) return;
    paging.current = true;
    setNotice(null);
    setActionError(null);
    setRefresh((value) => value + 1);
  }

  async function markReady(order: KitchenOrderSummary): Promise<void> {
    if (marking.current.has(order.id) || details[order.id] === undefined) return;
    marking.current.add(order.id);
    setBusy((previous) => ({ ...previous, [order.id]: true }));
    setNotice(null);
    setActionError(null);
    try {
      await markOrderReady(order.id);
      setPage((previous) => previous === null ? previous
        : { ...previous, items: previous.items.filter((item) => item.id !== order.id) });
      setDetails((previous) => {
        const next = { ...previous };
        delete next[order.id];
        return next;
      });
      setNotice(`Orden ${order.folio} marcada como LISTO.`);
    } catch (reason) {
      setActionError(formatKitchenError(reason));
      // A 409 is a final state conflict: refresh the queue once, never replay the mutation.
      if (reason instanceof ApiError && reason.status === 409) setRefresh((value) => value + 1);
    } finally {
      marking.current.delete(order.id);
      setBusy((previous) => ({ ...previous, [order.id]: false }));
      setTimeout(() => feedback.current?.focus(), 0);
    }
  }

  return (
    <section className="terminal-kitchen" aria-labelledby="kitchen-title">
      <h1 id="kitchen-title" tabIndex={-1}>Cola de cocina</h1>
      <button type="button" className="secondary-button" onClick={reload} disabled={loading}>Actualizar cola</button>

      <div className="kitchen-feedback" ref={feedback} tabIndex={-1}>
        {notice !== null && <p role="status">{notice}</p>}
        {actionError !== null && <p role="alert">{actionError}</p>}
      </div>
      {error !== null && <p role="alert">{error}</p>}

      {!loading && page !== null && page.items.length === 0 && (
        <p role="status">No hay órdenes en preparación.</p>
      )}

      {!loading && page !== null && page.items.length > 0 && (
        <div className="kitchen-cards">
          {page.items.map((order) => {
            const detail = details[order.id];
            return (
              <article className="kitchen-card" key={order.id} aria-labelledby={`kitchen-order-${order.id}`}>
                <h2 id={`kitchen-order-${order.id}`}>Orden {order.folio}</h2>
                <p>{order.guestName ?? 'Cliente invitado'}</p>
                <p>Creada: {createdLabel(order.createdAt)}</p>
                {detail === undefined
                  ? detailErrors[order.id] !== undefined
                    ? <p role="alert">Detalle no disponible: {detailErrors[order.id]}. Actualiza la cola para reintentar.</p>
                    : <p>Cargando detalle…</p>
                  : <>
                    <ul className="kitchen-items">
                      {detail.items.map((item) => (
                        <li key={item.id}>
                          <span>{item.quantity} × {item.productName}</span>
                          {item.options.length > 0 && (
                            <small>{item.options.map((option) => option.optionName).join(', ')}</small>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p>Total: <strong>{formatMxnCents(detail.totalCents)}</strong></p>
                  </>}
                <button
                  type="button"
                  className="primary-button"
                  aria-label={`Marcar orden ${order.folio} como LISTO`}
                  disabled={loading || detail === undefined || busy[order.id] === true}
                  onClick={() => { void markReady(order); }}
                >
                  {busy[order.id] === true ? 'Marcando…' : 'Marcar como LISTO'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <nav className="kitchen-pagination" aria-label="Paginación de la cola">
        <button type="button" className="secondary-button" onClick={previousPage} disabled={loading || query.index === 0}>Página anterior</button>
        <span>Página {query.index + 1}</span>
        <button type="button" className="secondary-button" onClick={nextPage} disabled={loading || page?.nextCursor == null}>Página siguiente</button>
      </nav>
    </section>
  );
}
