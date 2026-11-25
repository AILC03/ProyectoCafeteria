import { useEffect, useRef, useState } from 'react';
import { formatMxnCents } from '../../../../shared/utils/money';
import { BUSINESS_TIME_ZONE } from '../dashboard/periods';
import {
  formatSalesSeriesError,
  getSalesSeries,
  type SalesSeries as SalesSeriesData,
  type SalesSeriesBucket,
  type SalesSeriesGranularity,
} from './seriesApi';

type SeriesMethod = 'ALL' | 'CASH' | 'STRIPE';
type SeriesState = {
  key: string;
  data: SalesSeriesData | null;
  error: string | null;
  loading: boolean;
};

const MAX_HOUR_SERIES_MS = 31 * 24 * 60 * 60 * 1000;
const SERIES_COUNT = /^(0|[1-9][0-9]*)$/;

const localInstant = new Intl.DateTimeFormat('es-MX', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatLocalInstant(iso: string): string {
  return localInstant.format(new Date(iso));
}

/** Series counts are unbounded exact integers; E1's 19-digit formatter is untouched. */
export function formatSeriesCount(value: string): string {
  if (!SERIES_COUNT.test(value)) {
    throw new TypeError('El conteo de series no es verificable.');
  }
  return BigInt(value).toLocaleString('es-MX');
}

/** Preserves seconds and milliseconds of an effective boundary instead of rounding to HH:mm. */
function formatUtcBoundary(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  if (milliseconds !== '000') return `${hours}:${minutes}:${seconds}.${milliseconds} UTC`;
  if (seconds !== '00') return `${hours}:${minutes}:${seconds} UTC`;
  return `${hours}:${minutes} UTC`;
}

function localOffsetLabel(localStart: string): string {
  const match = /(-0[78]:00)$/.exec(localStart);
  return match === null ? '' : `UTC${match[1]}`;
}

function localCivilLabel(bucket: SalesSeriesBucket): string {
  const match =
    /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):00:00(-0[78]:00)$/.exec(bucket.localStart);
  if (match === null) return bucket.localStart;
  const [, year, month, day, hour] = match;
  return `${day}/${month}/${year.slice(2)} ${hour}:00 (${localOffsetLabel(bucket.localStart)})`;
}

function bucketDurationHours(bucket: SalesSeriesBucket): number {
  return (Date.parse(bucket.end) - Date.parse(bucket.start)) / (60 * 60 * 1000);
}

function bucketDurationLabel(bucket: SalesSeriesBucket): string {
  return `${bucketDurationHours(bucket)} h`;
}

function localCivilKey(bucket: SalesSeriesBucket): string {
  return bucket.localStart.slice(0, 16);
}

/** Bounded drawing helper: never converts the full monetary string through Number. */
export function barHeightPercent(value: string, maximum: string): string {
  const max = BigInt(maximum);
  if (max <= 0n) return '0%';
  let scaled = (BigInt(value) * 10000n) / max;
  if (scaled > 10000n) scaled = 10000n;
  if (scaled < 0n) scaled = 0n;
  return `${Number(scaled) / 100}%`;
}

function SeriesChart({ series }: { series: SalesSeriesData }) {
  let maximum = 0n;
  for (const bucket of series.buckets) {
    const value = BigInt(bucket.totalCents);
    if (value > maximum) maximum = value;
  }
  const basis = `${(100 / series.buckets.length).toFixed(4)}%`;
  return (
    <div className="dashboard-series-chart" aria-hidden="true">
      <div className="dashboard-series-bars">
        {series.buckets.map((bucket) => (
          <span
            key={bucket.start}
            className="dashboard-series-bar"
            style={{
              height: barHeightPercent(bucket.totalCents, maximum.toString()),
              flexBasis: `max(3px, ${basis})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SeriesTable({
  series,
  repeatedHours,
}: {
  series: SalesSeriesData;
  repeatedHours: ReadonlySet<string>;
}) {
  const byHour = series.granularity === 'hour';
  return (
    <div
      className="dashboard-series-table-wrap"
      role="region"
      aria-label="Tabla de series de ventas"
      tabIndex={0}
    >
      <table className="dashboard-series-table">
        <caption>
          Series de ventas por {byHour ? 'hora' : 'día'}; importe bruto en MXN
        </caption>
        <thead>
          <tr>
            <th scope="col">Inicio local</th>
            <th scope="col">Duración</th>
            <th scope="col">Cobertura efectiva</th>
            <th scope="col">Estado</th>
            <th scope="col">Importe</th>
            <th scope="col">Tickets</th>
            <th scope="col">Unidades</th>
          </tr>
        </thead>
        <tbody>
          {series.buckets.map((bucket) => {
            const duration = bucketDurationHours(bucket);
            const repeated = byHour && repeatedHours.has(localCivilKey(bucket));
            const notes: string[] = [];
            if (bucket.partial) notes.push('Parcial');
            if (repeated) notes.push('Hora repetida');
            if (!byHour && duration !== 24) notes.push('Cambio de horario');
            if (bucket.ticketCount === '0') notes.push('Sin ventas');
            return (
              <tr key={bucket.start}>
                <th scope="row">{localCivilLabel(bucket)}</th>
                <td>{bucketDurationLabel(bucket)}</td>
                <td className="dashboard-series-effective">
                  desde {formatUtcBoundary(bucket.effectiveFrom)}; hasta antes de{' '}
                  {formatUtcBoundary(bucket.effectiveTo)}
                </td>
                <td>{notes.length === 0 ? 'Completo' : notes.join(' · ')}</td>
                <td className="dashboard-series-number">{formatMxnCents(bucket.totalCents)}</td>
                <td className="dashboard-series-number">{formatSeriesCount(bucket.ticketCount)}</td>
                <td className="dashboard-series-number">{formatSeriesCount(bucket.unitsSold)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SalesSeries({
  from,
  to,
  method,
}: {
  from: string;
  to: string;
  method: SeriesMethod;
}) {
  const [granularity, setGranularity] = useState<SalesSeriesGranularity>('hour');
  const [refresh, setRefresh] = useState(0);
  const duration = Date.parse(to) - Date.parse(from);
  const hourAllowed = Number.isFinite(duration) && duration <= MAX_HOUR_SERIES_MS;
  // Contract limitation: hour series accept at most 31x24 h. Larger periods fall
  // back to day so the panel never sends a request the contract rejects.
  const activeGranularity: SalesSeriesGranularity = hourAllowed ? granularity : 'day';
  const key = `${from}|${to}|${method}|${activeGranularity}`;
  const [state, setState] = useState<SeriesState>({
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
    getSalesSeries(
      {
        from,
        to,
        granularity: activeGranularity,
        ...(method === 'ALL' ? {} : { method }),
      },
      controller.signal,
    )
      .then((data) => {
        if (request.current === id && !controller.signal.aborted) {
          setState({ key, data, error: null, loading: false });
        }
      })
      .catch((reason: unknown) => {
        if (request.current !== id || controller.signal.aborted) return;
        setState({ key, data: null, error: formatSalesSeriesError(reason), loading: false });
      });
    return () => controller.abort();
  }, [from, to, activeGranularity, method, refresh, key]);

  const current = state.key === key ? state : { key, data: null, error: null, loading: true };
  const series = current.data;
  const zero =
    series !== null &&
    series.totals.totalCents === '0' &&
    series.totals.ticketCount === '0' &&
    series.totals.unitsSold === '0';
  const repeatedHours = new Set<string>();
  if (series !== null && series.granularity === 'hour') {
    const seen = new Set<string>();
    for (const bucket of series.buckets) {
      const civil = localCivilKey(bucket);
      if (seen.has(civil)) repeatedHours.add(civil);
      else seen.add(civil);
    }
  }

  return (
    <section aria-labelledby="dashboard-series-title" className="dashboard-series">
      <div className="dashboard-series-heading">
        <div>
          <h3 id="dashboard-series-title">Series de ventas</h3>
          <p>
            Agregados del backend con el mismo periodo y método. Importe bruto; no descuenta
            reembolsos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={current.loading}
        >
          {current.loading ? 'Consultando…' : 'Actualizar series'}
        </button>
      </div>

      <fieldset className="dashboard-series-granularity">
        <legend>Granularidad de series</legend>
        <button
          type="button"
          aria-pressed={activeGranularity === 'hour'}
          aria-describedby={!hourAllowed ? 'dashboard-series-hour-limit' : undefined}
          disabled={!hourAllowed}
          onClick={() => setGranularity('hour')}
        >
          Hora
        </button>
        <button
          type="button"
          aria-pressed={activeGranularity === 'day'}
          onClick={() => setGranularity('day')}
        >
          Día
        </button>
      </fieldset>

      {!hourAllowed && (
        <p id="dashboard-series-hour-limit" className="dashboard-series-limit">
          El rango supera el máximo de series por hora (31 días o 744 horas). Se muestran
          series diarias; Hora no está disponible para este periodo.
        </p>
      )}

      {current.loading && <p role="status">Consultando series del periodo…</p>}

      {current.error !== null && (
        <div role="alert" className="dashboard-error">
          <p>{current.error}</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            Reintentar series
          </button>
        </div>
      )}

      {series !== null && (
        <div aria-live="polite" className="dashboard-series-content">
          <p className="dashboard-updated">
            Series actualizadas:{' '}
            <time dateTime={series.generatedAt}>{formatLocalInstant(series.generatedAt)}</time>
          </p>
          <p className="dashboard-updated">
            Periodo consultado: desde {formatLocalInstant(series.period.from)} hasta antes de{' '}
            {formatLocalInstant(series.period.to)} ({series.period.timeZone}).{' '}
            {series.method === null ? 'Todos los métodos.' : `Método ${series.method}.`}
          </p>

          <dl className="dashboard-series-metrics">
            <div>
              <dt>Importe de series</dt>
              <dd>{formatMxnCents(series.totals.totalCents)}</dd>
            </div>
            <div>
              <dt>Tickets</dt>
              <dd>{formatSeriesCount(series.totals.ticketCount)}</dd>
            </div>
            <div>
              <dt>Unidades vendidas</dt>
              <dd>{formatSeriesCount(series.totals.unitsSold)}</dd>
            </div>
            <div>
              <dt>Bloques de la serie</dt>
              <dd>{formatSeriesCount(series.bucketCount)}</dd>
            </div>
          </dl>

          {zero && (
            <p role="status">No hay ventas registradas en las series de este periodo.</p>
          )}

          <p className="dashboard-series-chart-note">
            La gráfica se desplaza horizontalmente cuando hay muchos bloques y es una referencia
            visual; la tabla siguiente contiene los mismos datos exactos del servidor.
          </p>
          <SeriesChart series={series} />
          <SeriesTable series={series} repeatedHours={repeatedHours} />
        </div>
      )}
    </section>
  );
}
