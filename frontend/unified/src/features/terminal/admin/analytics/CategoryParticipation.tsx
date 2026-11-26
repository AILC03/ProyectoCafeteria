import { useEffect, useRef, useState } from 'react';
import { formatMxnCents } from '../../../../shared/utils/money';
import { BUSINESS_TIME_ZONE } from '../dashboard/periods';
import { formatSeriesCount } from './SalesSeries';
import {
  formatCategoryParticipationError,
  getCategoryParticipation,
  type CategoryParticipationMetric,
  type DashboardCategoryParticipation,
} from './categoriesApi';
import { CsvDownloadButton } from '../downloads/CsvDownloadButton';
import { buildCategoryCsvRequest, canExportRange } from '../downloads/csvDownload';

type CategoryMethod = 'ALL' | 'CASH' | 'STRIPE';
type CategoryState = {
  key: string;
  data: DashboardCategoryParticipation | null;
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

function metricLabel(metric: CategoryParticipationMetric): string {
  return metric === 'units' ? 'unidades vendidas' : 'importe bruto';
}

function methodLabel(method: CategoryMethod): string {
  if (method === 'CASH') return 'Efectivo';
  if (method === 'STRIPE') return 'Tarjeta';
  return 'Todos los métodos';
}

function selectedDenominator(
  data: DashboardCategoryParticipation,
): { formatted: string; unit: string } {
  if (data.metric === 'units') {
    return {
      formatted: formatSeriesCount(data.denominator.unitsSold),
      unit: 'unidades vendidas',
    };
  }
  return {
    formatted: formatMxnCents(data.denominator.totalCents),
    unit: 'importe bruto MXN',
  };
}

function CategoryWarning() {
  return (
    <div
      className="dashboard-categories-warning"
      role="note"
      aria-labelledby="dashboard-categories-warning-title"
    >
      <p>
        <strong id="dashboard-categories-warning-title">
          Categoría vigente y reclasificación histórica
        </strong>
      </p>
      <p>
        Las ventas se agrupan por la categoría actual del producto. Si un producto cambió de
        categoría, su historial aparece en la categoría nueva; el total no cambia, pero la
        distribución puede diferir de la que tenía en la fecha de venta.
      </p>
    </div>
  );
}

function CategoryBars({ data, baseZero }: { data: DashboardCategoryParticipation; baseZero: boolean }) {
  return (
    <ul className="dashboard-categories-bars" aria-hidden="true">
      {data.items.map((item) => (
        <li key={item.categoryId}>
          <div className="dashboard-categories-bar-heading">
            <span className="dashboard-categories-bar-name">{item.name}</span>
            <span className="dashboard-categories-bar-share">
              {baseZero ? 'sin base' : `${item.sharePercent} %`}
            </span>
          </div>
          <span className="dashboard-categories-bar-track">
            <span
              className="dashboard-categories-bar-fill"
              style={{ width: baseZero ? '0%' : `${item.sharePercent}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function CategoryTable({
  data,
  baseZero,
}: {
  data: DashboardCategoryParticipation;
  baseZero: boolean;
}) {
  return (
    <div
      className="dashboard-categories-table-wrap"
      role="region"
      aria-label="Tabla desplazable de participación por categorías"
      tabIndex={0}
    >
      <table className="dashboard-categories-table">
        <caption>
          Participación por categoría actual según {metricLabel(data.metric)}; importe bruto en MXN;
          porcentajes calculados por el backend
        </caption>
        <thead>
          <tr>
            <th scope="col">Categoría</th>
            <th scope="col">Estado</th>
            <th scope="col">Unidades vendidas</th>
            <th scope="col">Importe bruto</th>
            <th scope="col">Participación</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.categoryId}>
              <th scope="row">
                <span className="dashboard-categories-name">{item.name}</span>
                <span className="dashboard-categories-id">ID {item.categoryId}</span>
              </th>
              <td>
                <span
                  className={
                    item.isActive
                      ? 'dashboard-categories-active'
                      : 'dashboard-categories-inactive'
                  }
                >
                  {item.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </td>
              <td className="dashboard-categories-number">
                {formatSeriesCount(item.unitsSold)}
              </td>
              <td className="dashboard-categories-number">{formatMxnCents(item.totalCents)}</td>
              <td className="dashboard-categories-number">
                {baseZero ? 'sin base' : `${item.sharePercent} %`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CategoryParticipation({
  from,
  to,
  method,
}: {
  from: string;
  to: string;
  method: CategoryMethod;
}) {
  const [metric, setMetric] = useState<CategoryParticipationMetric>('units');
  const [refresh, setRefresh] = useState(0);
  const key = `${from}|${to}|${method}|${metric}`;
  const [state, setState] = useState<CategoryState>({
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
    getCategoryParticipation({ from, to, metric, method }, controller.signal)
      .then((data) => {
        if (request.current === id && !controller.signal.aborted) {
          setState({ key, data, error: null, loading: false });
        }
      })
      .catch((reason: unknown) => {
        if (request.current !== id || controller.signal.aborted) return;
        setState({ key, data: null, error: formatCategoryParticipationError(reason), loading: false });
      });
    return () => controller.abort();
  }, [from, to, method, metric, refresh, key]);

  const current = state.key === key ? state : { key, data: null, error: null, loading: true };
  const data = current.data;
  const start = data === null ? null : selectedDenominator(data);
  const baseZero =
    data !== null &&
    data.items.length > 0 &&
    (data.metric === 'units'
      ? data.denominator.unitsSold === '0'
      : data.denominator.totalCents === '0');
  const zero = data !== null && data.items.length === 0;
  const csvRequest = canExportRange(from, to)
    ? buildCategoryCsvRequest({ from, to, metric, method })
    : null;

  return (
    <section aria-labelledby="dashboard-categories-title" className="dashboard-categories">
      <div className="dashboard-categories-heading">
        <div>
          <h3 id="dashboard-categories-title">Participación por categorías</h3>
          <p>
            Agregados del backend con el mismo periodo y método. Los porcentajes llegan calculados y
            no se recalculan en el navegador.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={current.loading}
        >
          {current.loading ? 'Consultando…' : 'Actualizar participación'}
        </button>
      </div>

      <div className="dashboard-download-row">
        <CsvDownloadButton
          request={csvRequest}
          buttonLabel="Descargar participación (CSV)"
          panelLabel="la participación por categorías"
          formatError={formatCategoryParticipationError}
        />
      </div>

      <CategoryWarning />

      <div className="dashboard-categories-filters">
        <label>
          Métrica de participación
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as CategoryParticipationMetric)}
          >
            <option value="units">Unidades vendidas</option>
            <option value="amount">Importe bruto MXN</option>
          </select>
        </label>
      </div>

      {current.loading && <p role="status">Consultando participación por categorías del periodo…</p>}

      {current.error !== null && (
        <div role="alert" className="dashboard-error">
          <p>{current.error}</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            Reintentar participación
          </button>
        </div>
      )}

      {data !== null && start !== null && (
        <div aria-live="polite" className="dashboard-categories-content">
          <p className="dashboard-updated">
            Participación actualizada:{' '}
            <time dateTime={data.generatedAt}>{formatLocalInstant(data.generatedAt)}</time>
          </p>
          <p className="dashboard-updated">
            Periodo consultado: desde {formatLocalInstant(data.period.from)} hasta antes de{' '}
            {formatLocalInstant(data.period.to)} ({data.period.timeZone}). Método:{' '}
            {methodLabel(data.method ?? 'ALL')}. Métrica: {metricLabel(data.metric)}.
          </p>

          <dl className="dashboard-categories-metrics">
            <div>
              <dt>Denominador de la métrica ({start.unit})</dt>
              <dd>{start.formatted}</dd>
            </div>
            <div>
              <dt>Unidades vendidas del conjunto completo</dt>
              <dd>{formatSeriesCount(data.denominator.unitsSold)}</dd>
            </div>
            <div>
              <dt>Importe bruto del conjunto completo</dt>
              <dd>{formatMxnCents(data.denominator.totalCents)}</dd>
            </div>
            <div>
              <dt>Categorías con movimiento</dt>
              <dd>{formatSeriesCount(data.totalCategories)}</dd>
            </div>
          </dl>

          <p className="dashboard-categories-note">
            El denominador es del conjunto completo filtrado. Las categorías inactivas con
            movimiento se incluyen y se marcan como tales; las categorías sin movimiento no se
            rellenan con cero.
          </p>

          {baseZero && (
            <p className="dashboard-categories-base-zero" role="note">
              <strong>Sin base:</strong> el denominador de la métrica seleccionada es cero. Los
              porcentajes 0.00 no representan una participación real.
            </p>
          )}

          {zero ? (
            <p role="status">
              No hay categorías con movimiento en el rango y método seleccionados.
            </p>
          ) : (
            <div className="dashboard-categories-data">
              <p className="dashboard-categories-chart-note">
                La distribución es una referencia visual; la tabla siguiente contiene los mismos
                datos exactos del servidor.
              </p>
              <CategoryBars data={data} baseZero={baseZero} />
              <CategoryTable data={data} baseZero={baseZero} />
              <p className="dashboard-categories-note">
                Los porcentajes se muestran tal como los calcula el backend; no se recalculan ni se
                normalizan a 100 %. La suma puede diferir por redondeo.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
