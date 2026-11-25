import { useEffect, useRef, useState } from 'react';
import { formatMxnCents } from '../../../../shared/utils/money';
import { BUSINESS_TIME_ZONE } from '../dashboard/periods';
import { formatSeriesCount as formatRankingCount } from './SalesSeries';
import {
  formatProductRankingError,
  getProductRanking,
  type ProductRanking as ProductRankingData,
  type ProductRankingDirection,
  type ProductRankingMetric,
  type ProductRankingTop,
} from './rankingApi';

type RankingMethod = 'ALL' | 'CASH' | 'STRIPE';
type RankingState = {
  key: string;
  data: ProductRankingData | null;
  error: string | null;
  loading: boolean;
};

const localInstant = new Intl.DateTimeFormat('es-MX', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatLocalInstant(iso: string): string {
  return localInstant.format(new Date(iso));
}

function metricLabel(metric: ProductRankingMetric): string {
  return metric === 'units' ? 'unidades vendidas' : 'importe bruto';
}

function directionLabel(direction: ProductRankingDirection): string {
  return direction === 'top' ? 'descendente (más vendidos)' : 'ascendente (menos vendidos con movimiento)';
}

function methodLabel(method: RankingMethod): string {
  if (method === 'CASH') return 'Efectivo';
  if (method === 'STRIPE') return 'Tarjeta';
  return 'Todos los métodos';
}

function rankingCaption(
  metric: ProductRankingMetric,
  direction: ProductRankingDirection,
  top: ProductRankingTop,
): string {
  return `Ranking de productos por ${metricLabel(metric)} en orden ${directionLabel(direction)}; top ${top}; importe bruto en MXN`;
}

function RankingFilters({
  metric,
  direction,
  top,
  onChange,
}: {
  metric: ProductRankingMetric;
  direction: ProductRankingDirection;
  top: ProductRankingTop;
  onChange: (next: {
    metric: ProductRankingMetric;
    direction: ProductRankingDirection;
    top: ProductRankingTop;
  }) => void;
}) {
  return (
    <div className="dashboard-ranking-filters">
      <label>
        Métrica del ranking
        <select
          value={metric}
          onChange={(event) =>
            onChange({ metric: event.target.value as ProductRankingMetric, direction, top })
          }
        >
          <option value="units">Unidades</option>
          <option value="amount">Importe bruto MXN</option>
        </select>
      </label>
      <label>
        Dirección del ranking
        <select
          value={direction}
          onChange={(event) =>
            onChange({ metric, direction: event.target.value as ProductRankingDirection, top })
          }
        >
          <option value="top">Más vendidos</option>
          <option value="bottom">Menos vendidos con movimiento</option>
        </select>
      </label>
      <label>
        Cantidad de productos
        <select
          value={top}
          onChange={(event) =>
            onChange({ metric, direction, top: event.target.value as ProductRankingTop })
          }
        >
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
        </select>
      </label>
    </div>
  );
}

function RankingTable({ ranking }: { ranking: ProductRankingData }) {
  return (
    <div className="dashboard-ranking-table-wrap">
      <table className="dashboard-ranking-table">
        <caption>{rankingCaption(ranking.metric, ranking.direction, ranking.top)}</caption>
        <thead>
          <tr>
            <th scope="col">Posición</th>
            <th scope="col">Producto</th>
            <th scope="col">Unidades vendidas</th>
            <th scope="col">Importe bruto</th>
          </tr>
        </thead>
        <tbody>
          {ranking.items.map((item, index) => (
            <tr key={item.productId}>
              <td className="dashboard-ranking-number">{item.position ?? String(index + 1)}</td>
              <th scope="row">
                <span className="dashboard-ranking-name">{item.name}</span>
                <span className="dashboard-ranking-id">ID {item.productId}</span>
              </th>
              <td className="dashboard-ranking-number">{formatRankingCount(item.unitsSold)}</td>
              <td className="dashboard-ranking-number">{formatMxnCents(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductRanking({
  from,
  to,
  method,
}: {
  from: string;
  to: string;
  method: RankingMethod;
}) {
  const [metric, setMetric] = useState<ProductRankingMetric>('units');
  const [direction, setDirection] = useState<ProductRankingDirection>('top');
  const [top, setTop] = useState<ProductRankingTop>('5');
  const [refresh, setRefresh] = useState(0);
  const key = `${from}|${to}|${method}|${metric}|${direction}|${top}`;
  const [state, setState] = useState<RankingState>({
    key,
    data: null,
    error: null,
    loading: true,
  });
  const request = useRef(0);

  useEffect(() => {
    const id = request.current + 1;
    request.current = id;
    const controller = new AbortController();
    setState({ key, data: null, error: null, loading: true });
    getProductRanking({ from, to, metric, direction, top, method }, controller.signal)
      .then((data) => {
        if (request.current === id && !controller.signal.aborted) {
          setState({ key, data, error: null, loading: false });
        }
      })
      .catch((reason: unknown) => {
        if (request.current !== id || controller.signal.aborted) return;
        setState({ key, data: null, error: formatProductRankingError(reason), loading: false });
      });
    return () => controller.abort();
  }, [from, to, method, metric, direction, top, refresh, key]);

  const current = state.key === key ? state : { key, data: null, error: null, loading: true };
  const ranking = current.data;
  const zero = ranking !== null && ranking.matchedProductCount === '0';

  return (
    <section aria-labelledby="dashboard-ranking-title" className="dashboard-ranking">
      <div className="dashboard-ranking-heading">
        <div>
          <h3 id="dashboard-ranking-title">Ranking de productos</h3>
          <p>
            Agregados del backend con el mismo periodo y método. No se recalculan desde las filas
            visibles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={current.loading}
        >
          {current.loading ? 'Consultando…' : 'Actualizar ranking'}
        </button>
      </div>

      <RankingFilters
        metric={metric}
        direction={direction}
        top={top}
        onChange={(next) => {
          setMetric(next.metric);
          setDirection(next.direction);
          setTop(next.top);
        }}
      />

      {current.loading && <p role="status">Consultando ranking del periodo…</p>}

      {current.error !== null && (
        <div role="alert" className="dashboard-error">
          <p>{current.error}</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            Reintentar ranking
          </button>
        </div>
      )}

      {ranking !== null && (
        <div aria-live="polite" className="dashboard-ranking-content">
          <p className="dashboard-updated">
            Ranking actualizado:{' '}
            <time dateTime={ranking.generatedAt}>{formatLocalInstant(ranking.generatedAt)}</time>
          </p>
          <p className="dashboard-updated">
            Periodo consultado: desde {formatLocalInstant(ranking.period.from)} hasta antes de{' '}
            {formatLocalInstant(ranking.period.to)} ({ranking.period.timeZone}). Método:{' '}
            {methodLabel(ranking.method ?? 'ALL')}.
          </p>

          <p className="dashboard-ranking-meta">
            Mostrando {String(ranking.items.length)} de{' '}
            {formatRankingCount(ranking.matchedProductCount)} productos con movimiento
            {ranking.truncated ? ' (conjunto recortado por el top seleccionado)' : ''}.
          </p>
          <p className="dashboard-ranking-note">
            Totales del conjunto filtrado antes del corte; no son la suma de las filas visibles.
          </p>

          <dl className="dashboard-ranking-metrics">
            <div>
              <dt>Unidades del conjunto</dt>
              <dd>{formatRankingCount(ranking.matchedTotals.unitsSold)}</dd>
            </div>
            <div>
              <dt>Importe bruto del conjunto</dt>
              <dd>{formatMxnCents(ranking.matchedTotals.totalCents)}</dd>
            </div>
          </dl>

          {zero && (
            <p role="status">No hay productos con movimiento para el ranking de este periodo.</p>
          )}

          {!zero && <RankingTable ranking={ranking} />}
        </div>
      )}
    </section>
  );
}
