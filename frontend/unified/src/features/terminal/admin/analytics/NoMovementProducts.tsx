import { useEffect, useRef, useState } from 'react';
import { BUSINESS_TIME_ZONE } from '../dashboard/periods';
import type { DashboardMethod } from '../dashboard/summaryApi';
import { formatSeriesCount } from './SalesSeries';
import {
  formatNoMovementError,
  getDashboardNoMovement,
  type DashboardNoMovement,
  type NoMovementItem,
  type NoMovementPageLimit,
  type NoMovementUniverse,
} from './noMovementApi';

type NoMovementFilterMethod = 'ALL' | DashboardMethod;
type NoMovementState = {
  key: string;
  data: DashboardNoMovement | null;
  items: NoMovementItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  moreError: string | null;
};

const PAGE_LIMITS: NoMovementPageLimit[] = ['10', '20', '50'];

const localInstant = new Intl.DateTimeFormat('es-MX', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatLocalInstant(iso: string): string {
  return localInstant.format(new Date(iso));
}

function methodLabel(method: NoMovementFilterMethod): string {
  if (method === 'CASH') return 'Efectivo';
  if (method === 'STRIPE') return 'Tarjeta';
  return 'Todos los métodos';
}

function emptyState(key: string): NoMovementState {
  return {
    key,
    data: null,
    items: [],
    nextCursor: null,
    loading: true,
    loadingMore: false,
    error: null,
    moreError: null,
  };
}

function appendUnique(
  current: NoMovementItem[],
  incoming: NoMovementItem[],
): NoMovementItem[] {
  const seen = new Set(current.map((item) => item.productId));
  const next = [...current];
  for (const item of incoming) {
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);
    next.push(item);
  }
  return next;
}

function NoMovementUniverseNote({ universe }: { universe: NoMovementUniverse }) {
  return (
    <div className="dashboard-no-movement-universe">
      <p>
        <strong>Corte del universo:</strong>{' '}
        <time dateTime={universe.asOf}>{formatLocalInstant(universe.asOf)}</time>.
      </p>
      <p>
        Incluye productos que existen (no dados de baja), pertenecen a una categoría activa y
        fueron creados antes de ese corte. Los productos agotados también aparecen: la
        disponibilidad es un dato informativo, no un filtro.
      </p>
      <p className="dashboard-no-movement-note">
        {universe.includesUnavailable
          ? 'La lista incluye productos agotados; la disponibilidad es un dato, no un filtro.'
          : 'La lista no incluye productos agotados.'}
      </p>
    </div>
  );
}

function NoMovementTable({ items }: { items: NoMovementItem[] }) {
  return (
    <div
      className="dashboard-no-movement-table-wrap"
      role="region"
      aria-label="Tabla desplazable de activos sin movimiento"
      tabIndex={0}
    >
      <table className="dashboard-no-movement-table">
        <caption>
          Productos sin movimiento en el rango y método seleccionados, en el orden del catálogo por
          nombre y ID
        </caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Categoría</th>
            <th scope="col">Disponibilidad</th>
            <th scope="col">Alta</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.productId}>
              <th scope="row">
                <span className="dashboard-no-movement-name">{item.name}</span>
                <span className="dashboard-no-movement-id">ID {item.productId}</span>
              </th>
              <td>
                <span className="dashboard-no-movement-category">{item.category.name}</span>
                <span className="dashboard-no-movement-id">ID {item.category.id}</span>
              </td>
              <td>
                <span
                  className={
                    item.isAvailable
                      ? 'dashboard-no-movement-available'
                      : 'dashboard-no-movement-unavailable'
                  }
                >
                  {item.isAvailable ? 'Disponible' : 'No disponible'}
                </span>
              </td>
              <td>
                <time dateTime={item.createdAt}>{formatLocalInstant(item.createdAt)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NoMovementProducts({
  from,
  to,
  method,
}: {
  from: string;
  to: string;
  method: NoMovementFilterMethod;
}) {
  const [limit, setLimit] = useState<NoMovementPageLimit>('20');
  const [refresh, setRefresh] = useState(0);
  const key = `${from}|${to}|${method}|${limit}|${refresh}`;
  const [state, setState] = useState<NoMovementState>(() => emptyState(key));
  const request = useRef(0);
  const moreController = useRef<AbortController | null>(null);
  const refreshPending = useRef(false);

  useEffect(() => {
    const id = request.current + 1;
    request.current = id;
    moreController.current?.abort();
    moreController.current = null;
    const controller = new AbortController();
    setState(emptyState(key));
    getDashboardNoMovement({ from, to, method, limit }, controller.signal)
      .then((data) => {
        if (request.current !== id || controller.signal.aborted) return;
        setState({
          key,
          data,
          items: data.items,
          nextCursor: data.page.nextCursor,
          loading: false,
          loadingMore: false,
          error: null,
          moreError: null,
        });
      })
      .catch((reason: unknown) => {
        if (request.current !== id || controller.signal.aborted) return;
        setState({
          key,
          data: null,
          items: [],
          nextCursor: null,
          loading: false,
          loadingMore: false,
          error: formatNoMovementError(reason),
          moreError: null,
        });
      })
      .finally(() => {
        if (request.current === id && !controller.signal.aborted) refreshPending.current = false;
      });
    return () => {
      controller.abort();
      moreController.current?.abort();
      moreController.current = null;
    };
  }, [from, to, method, limit, refresh, key]);

  const current = state.key === key ? state : emptyState(key);
  const data = current.data;
  const zero = data !== null && current.items.length === 0;

  function refreshList(): void {
    // aria-disabled preserves keyboard focus; the synchronous latch also blocks
    // repeated activation before React commits the loading state.
    if (current.loading || refreshPending.current) return;
    refreshPending.current = true;
    setRefresh((value) => value + 1);
  }

  function loadMore(): void {
    const cursor = current.nextCursor;
    if (cursor === null || current.loading || current.loadingMore) return;
    const id = request.current + 1;
    request.current = id;
    const controller = new AbortController();
    moreController.current?.abort();
    moreController.current = controller;
    setState((previous) =>
      previous.key === key
        ? { ...previous, loadingMore: true, moreError: null }
        : previous,
    );
    getDashboardNoMovement({ from, to, method, limit, cursor }, controller.signal)
      .then((page) => {
        if (request.current !== id || controller.signal.aborted) return;
        setState((previous) => {
          if (previous.key !== key) return previous;
          return {
            ...previous,
            data: page,
            items: appendUnique(previous.items, page.items),
            nextCursor: page.page.nextCursor,
            loadingMore: false,
            moreError: null,
          };
        });
      })
      .catch((reason: unknown) => {
        if (request.current !== id || controller.signal.aborted) return;
        setState((previous) =>
          previous.key === key
            ? {
                ...previous,
                loadingMore: false,
                moreError: formatNoMovementError(reason),
              }
            : previous,
        );
      });
  }

  return (
    <section aria-labelledby="dashboard-no-movement-title" className="dashboard-no-movement">
      <div className="dashboard-no-movement-heading">
        <div>
          <h3 id="dashboard-no-movement-title">Activos sin movimiento</h3>
          <p>
            Lista separada del ranking y de los menos vendidos. No se calcula descargando ventas ni
            catálogo en el navegador.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshList}
          aria-disabled={current.loading}
        >
          {current.loading ? 'Consultando…' : 'Actualizar lista'}
        </button>
      </div>

      <p className="dashboard-no-movement-label">
        <strong>Sin movimiento en el rango y método seleccionados</strong>
      </p>
      <p className="dashboard-no-movement-note">
        No afirma ausencia global de ventas: un producto puede haberse vendido fuera de este rango o
        con otro método.
      </p>

      <div className="dashboard-no-movement-filters">
        <label>
          Productos por página
          <select
            value={limit}
            onChange={(event) => setLimit(event.target.value as NoMovementPageLimit)}
          >
            {PAGE_LIMITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {current.loading && <p role="status">Consultando activos sin movimiento…</p>}

      {current.error !== null && (
        <div role="alert" className="dashboard-error">
          <p>{current.error}</p>
          <button type="button" onClick={refreshList}>
            Reintentar lista
          </button>
        </div>
      )}

      {data !== null && (
        <div aria-live="polite" className="dashboard-no-movement-content" aria-busy={current.loadingMore}>
          <p className="dashboard-updated">
            Lista actualizada:{' '}
            <time dateTime={data.generatedAt}>{formatLocalInstant(data.generatedAt)}</time>
          </p>
          <p className="dashboard-updated">
            Periodo consultado: desde {formatLocalInstant(data.period.from)} hasta antes de{' '}
            {formatLocalInstant(data.period.to)} ({data.period.timeZone}). Método:{' '}
            {methodLabel(data.method ?? 'ALL')}.
          </p>

          <NoMovementUniverseNote universe={data.universe} />

          <p className="dashboard-no-movement-meta">
            Total del conjunto sin movimiento en este rango y método:{' '}
            <strong>{formatSeriesCount(data.totalNoMovementProducts)}</strong>. Mostrando{' '}
            {formatSeriesCount(String(current.items.length))} de{' '}
            {formatSeriesCount(data.totalNoMovementProducts)}.
          </p>
          <p className="dashboard-no-movement-note">
            El total es del conjunto completo antes de paginar; no es el total de productos activos
            del catálogo ni el tamaño de la página.
          </p>

          {zero ? (
            <p role="status">
              No hay productos sin movimiento en el rango y método seleccionados. No es una
              afirmación de ausencia global de ventas.
            </p>
          ) : (
            <NoMovementTable items={current.items} />
          )}

          {current.moreError !== null && (
            <div role="alert" className="dashboard-error">
              <p>{current.moreError}</p>
              <button type="button" onClick={loadMore} disabled={current.loadingMore}>
                Reintentar carga
              </button>
            </div>
          )}

          {current.nextCursor !== null ? (
            <div className="dashboard-no-movement-pagination">
              <button type="button" onClick={loadMore} disabled={current.loadingMore}>
                {current.loadingMore ? 'Cargando más…' : 'Cargar más'}
              </button>
            </div>
          ) : (
            current.items.length > 0 && <p role="status">No hay más productos.</p>
          )}
        </div>
      )}
    </section>
  );
}
