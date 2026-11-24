import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatMxnCents } from '../../../../shared/utils/money';
import {
  BUSINESS_TIME_ZONE,
  createCustomPeriod,
  createPresetPeriod,
  defaultPeriod,
  formatInteger,
  formatPercentChange,
  formatSignedInteger,
  PERIOD_OPTIONS,
  type PeriodRange,
} from './periods';
import {
  formatDashboardSummaryError,
  getDashboardSummary,
  type DashboardMethod,
  type DashboardSummary as DashboardSummaryData,
} from './summaryApi';

type SummaryMethod = 'ALL' | DashboardMethod;

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'medium',
  }).format(new Date(iso));
}

function dateTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function rangeLabel(period: PeriodRange): string {
  const end = new Date(Date.parse(period.to) - 1).toISOString();
  return `${dateLabel(period.from)} – ${dateLabel(end)}`;
}

export function DashboardSummary({ now = () => new Date() }: { now?: () => Date } = {}) {
  const [period, setPeriod] = useState<PeriodRange>(() => defaultPeriod(now()));
  const [method, setMethod] = useState<SummaryMethod>('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = request.current + 1;
    request.current = id;
    const controller = new AbortController();
    setSummary(null);
    setLoadError(null);
    setLoading(true);
    const filter = {
      from: period.from,
      to: period.to,
      ...(method === 'ALL' ? {} : { method }),
    };
    getDashboardSummary(filter, controller.signal)
      .then((data) => {
        if (request.current === id && !controller.signal.aborted) {
          setSummary(data);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (request.current !== id || controller.signal.aborted) return;
        setLoadError(formatDashboardSummaryError(reason));
        setLoading(false);
      });
    return () => controller.abort();
  }, [period, method, refresh]);

  function choosePreset(preset: Exclude<PeriodRange['preset'], 'custom'>): void {
    setFilterError(null);
    setSummary(null);
    setLoading(true);
    setPeriod(createPresetPeriod(preset, now()));
  }

  function changeMethod(next: SummaryMethod): void {
    setFilterError(null);
    setSummary(null);
    setLoading(true);
    setMethod(next);
  }

  function applyCustom(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const next = createCustomPeriod(customStart, customEnd);
      setFilterError(null);
      setSummary(null);
      setLoading(true);
      setPeriod(next);
    } catch (reason) {
      setFilterError(reason instanceof TypeError ? reason.message : 'El rango no es válido.');
    }
  }

  return (
    <section aria-labelledby="admin-dashboard-title" className="admin-dashboard">
      <div className="dashboard-heading">
        <div>
          <h2 id="admin-dashboard-title">Resumen del periodo</h2>
          <p>Ventas registradas de la API. Importe bruto; no descuenta reembolsos.</p>
        </div>
        <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>
          {loading ? 'Consultando…' : 'Actualizar resumen'}
        </button>
      </div>

      <form className="dashboard-filters" onSubmit={applyCustom}>
        <fieldset>
          <legend>Periodo</legend>
          <div className="dashboard-presets">
            {PERIOD_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.id}
                aria-pressed={period.preset === option.id}
                onClick={() => choosePreset(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="dashboard-custom">
          <label>
            Desde
            <input
              type="date"
              value={customStart}
              onChange={(event) => {
                setFilterError(null);
                setCustomStart(event.target.value);
              }}
              required
              aria-invalid={filterError !== null}
              aria-describedby={filterError !== null ? 'dashboard-filter-error' : undefined}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={customEnd}
              onChange={(event) => {
                setFilterError(null);
                setCustomEnd(event.target.value);
              }}
              required
              aria-invalid={filterError !== null}
              aria-describedby={filterError !== null ? 'dashboard-filter-error' : undefined}
            />
          </label>
          <button type="submit">Aplicar rango</button>
          <label>
            Método de pago
            <select
              value={method}
              onChange={(event) => changeMethod(event.target.value as SummaryMethod)}
            >
              <option value="ALL">Todos</option>
              <option value="CASH">Efectivo</option>
              <option value="STRIPE">Tarjeta</option>
            </select>
          </label>
        </div>
        <p className="dashboard-period-label">
          <strong>{period.label}</strong> · {rangeLabel(period)}
        </p>
        {filterError !== null && (
          <p id="dashboard-filter-error" role="alert">
            {filterError}
          </p>
        )}
      </form>

      {loadError !== null && (
        <div role="alert" className="dashboard-error">
          <p>{loadError}</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {loading && <p role="status">Consultando resumen del periodo…</p>}

      {!loading && summary !== null && (
        <div aria-live="polite">
          <p className="dashboard-updated">
            Actualizado:{' '}
            <time dateTime={summary.generatedAt}>{dateTimeLabel(summary.generatedAt)}</time>
          </p>
          {summary.ticketCount === '0' && (
            <p role="status">No hay ventas registradas en este periodo.</p>
          )}
          <dl className="dashboard-cards">
            <div className="dashboard-card">
              <dt>Ventas registradas</dt>
              <dd>
                {formatMxnCents(summary.totalCents)}
                <span className="dashboard-comparison">
                  vs periodo anterior: {formatMxnCents(summary.comparison.totalCents.change)} (
                  {formatPercentChange(summary.comparison.totalCents.changePercent)})
                </span>
              </dd>
            </div>
            <div className="dashboard-card">
              <dt>Tickets</dt>
              <dd>
                {formatInteger(summary.ticketCount)}
                <span className="dashboard-comparison">
                  vs periodo anterior: {formatSignedInteger(summary.comparison.ticketCount.change)} (
                  {formatPercentChange(summary.comparison.ticketCount.changePercent)})
                </span>
              </dd>
            </div>
            <div className="dashboard-card">
              <dt>Ticket promedio</dt>
              <dd>
                {formatMxnCents(summary.averageTicketCents)}
                <span className="dashboard-comparison">
                  vs periodo anterior:{' '}
                  {formatMxnCents(summary.comparison.averageTicketCents.change)} (
                  {formatPercentChange(summary.comparison.averageTicketCents.changePercent)})
                </span>
              </dd>
            </div>
            <div className="dashboard-card">
              <dt>Unidades vendidas</dt>
              <dd>
                {formatInteger(summary.unitsSold)}
                <span className="dashboard-comparison">
                  vs periodo anterior: {formatSignedInteger(summary.comparison.unitsSold.change)} (
                  {formatPercentChange(summary.comparison.unitsSold.changePercent)})
                </span>
              </dd>
            </div>
          </dl>

          <section aria-labelledby="dashboard-mix-title" className="dashboard-mix-section">
            <h3 id="dashboard-mix-title">Mezcla por importe</h3>
            <dl className="dashboard-mix">
              <div>
                <dt>Efectivo</dt>
                <dd>{formatMxnCents(summary.paymentMix.cashCents)}</dd>
              </div>
              <div>
                <dt>Tarjeta registrada</dt>
                <dd>{formatMxnCents(summary.paymentMix.stripeCents)}</dd>
              </div>
            </dl>
          </section>

          <p className="dashboard-links">
            <Link to="/terminal/caja">Caja y corte</Link> ·{' '}
            <Link to="/terminal/historial">Historial operativo</Link>
          </p>
        </div>
      )}
    </section>
  );
}
