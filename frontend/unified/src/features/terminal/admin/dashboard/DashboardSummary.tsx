import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../../shared/api/client';
import { formatMxnCents } from '../../../../shared/utils/money';
import {
  getCurrentCashSession,
  UnverifiableCashSessionResponseError,
  type CashSession,
} from '../../cash/cashApi';
import {
  formatSalesError,
  formatTicketError,
  listSales,
  reprintSaleTicket,
  type Sale,
} from '../../sales/salesApi';
import { ProtectedTicket } from '../../payment/ProtectedTicket';
import type { Ticket } from '../../payment/paymentApi';
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
import { SalesSeries } from '../analytics/SalesSeries';

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

function formatCashStatusError(error: unknown): string {
  if (error instanceof UnverifiableCashSessionResponseError) {
    return 'La respuesta de caja no se puede verificar.';
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
    if (error.status === 403) return 'No tienes permiso para consultar la caja.';
    if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
    if (error.status === 0 || error.status >= 500) {
      return 'No fue posible consultar la caja. El resumen de ventas sigue disponible.';
    }
  }
  return 'No fue posible consultar la caja.';
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
  const [cash, setCash] = useState<CashSession | null>(null);
  const [cashLoading, setCashLoading] = useState(true);
  const [cashError, setCashError] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const request = useRef(0);
  const cashRequest = useRef(0);
  const salesRequest = useRef(0);
  const ticketRequest = useRef(0);
  const focusReturn = useRef<HTMLButtonElement | null>(null);
  const ticketHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const id = cashRequest.current + 1;
    cashRequest.current = id;
    const controller = new AbortController();
    setCash(null);
    setCashLoading(true);
    setCashError(null);
    getCurrentCashSession(controller.signal)
      .then((data) => {
        if (cashRequest.current === id && !controller.signal.aborted) {
          setCash(data);
          setCashLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (cashRequest.current !== id || controller.signal.aborted) return;
        setCashError(formatCashStatusError(reason));
        setCashLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const id = salesRequest.current + 1;
    salesRequest.current = id;
    const controller = new AbortController();
    setSales(null);
    setSalesLoading(true);
    setSalesError(null);
    const filter = {
      from: period.from,
      to: period.to,
      order: 'desc' as const,
      limit: 5,
      ...(method === 'ALL' ? {} : { method }),
    };
    listSales(filter, undefined, controller.signal)
      .then((page) => {
        if (salesRequest.current === id && !controller.signal.aborted) {
          setSales(page.items);
          setSalesLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (salesRequest.current !== id || controller.signal.aborted) return;
        setSalesError(formatSalesError(reason));
        setSalesLoading(false);
      });
    return () => controller.abort();
  }, [period, method, refresh]);

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

  useEffect(() => {
    if (ticket !== null) ticketHeading.current?.focus();
  }, [ticket]);

  async function openTicket(sale: Sale, trigger: HTMLButtonElement): Promise<void> {
    const id = ticketRequest.current + 1;
    ticketRequest.current = id;
    focusReturn.current = trigger;
    setTicket(null);
    setTicketError(null);
    setTicketBusy(true);
    try {
      const result = await reprintSaleTicket(sale.id);
      if (ticketRequest.current === id) setTicket(result);
    } catch (reason) {
      if (ticketRequest.current === id) setTicketError(formatTicketError(reason));
    } finally {
      if (ticketRequest.current === id) setTicketBusy(false);
    }
  }

  function closeTicket(): void {
    const trigger = focusReturn.current;
    focusReturn.current = null;
    ticketRequest.current += 1;
    setTicket(null);
    setTicketError(null);
    setTicketBusy(false);
    setTimeout(() => {
      if (trigger?.isConnected) trigger.focus();
    }, 0);
  }

  function resetTicket(): void {
    ticketRequest.current += 1;
    focusReturn.current = null;
    setTicket(null);
    setTicketError(null);
    setTicketBusy(false);
  }

  function choosePreset(preset: Exclude<PeriodRange['preset'], 'custom'>): void {
    setFilterError(null);
    resetTicket();
    setSummary(null);
    setSales(null);
    setLoading(true);
    setSalesLoading(true);
    setPeriod(createPresetPeriod(preset, now()));
  }

  function changeMethod(next: SummaryMethod): void {
    setFilterError(null);
    resetTicket();
    setSummary(null);
    setSales(null);
    setLoading(true);
    setSalesLoading(true);
    setMethod(next);
  }

  function applyCustom(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const next = createCustomPeriod(customStart, customEnd);
      setFilterError(null);
      resetTicket();
      setSummary(null);
      setSales(null);
      setLoading(true);
      setSalesLoading(true);
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

        </div>
      )}

      <SalesSeries from={period.from} to={period.to} method={method} />

      <div className="dashboard-operational">
        <section aria-labelledby="dashboard-cash-title" className="dashboard-operational-card">
          <h3 id="dashboard-cash-title">Caja actual</h3>
          <p className="dashboard-updated">Consulta independiente del periodo y método seleccionados.</p>
          {cashLoading && <p role="status">Consultando caja…</p>}
          {cashError !== null && <p role="alert">{cashError}</p>}
          {!cashLoading && cashError === null && cash === null && (
            <p role="status">Sin caja abierta.</p>
          )}
          {!cashLoading && cash !== null && (
            <dl className="dashboard-cash">
              <div>
                <dt>Estado</dt>
                <dd>Abierta</dd>
              </div>
              <div>
                <dt>Responsable</dt>
                <dd>Empleado #{cash.employeeId}</dd>
              </div>
              <div>
                <dt>Fondo inicial</dt>
                <dd>{formatMxnCents(cash.openingAmountCents)}</dd>
              </div>
              <div>
                <dt>Ventas en efectivo</dt>
                <dd>{formatMxnCents(cash.cashSalesCents)}</dd>
              </div>
              <div>
                <dt>Esperado</dt>
                <dd>{formatMxnCents(cash.computedExpectedCashCents)}</dd>
              </div>
            </dl>
          )}
          <p><Link to="/terminal/caja">Ir a caja y corte</Link></p>
        </section>

        <section aria-labelledby="dashboard-sales-title" className="dashboard-operational-card">
          <h3 id="dashboard-sales-title">Últimas ventas</h3>
          <p className="dashboard-updated">Máximo 5 ventas del periodo y método seleccionados.</p>
          {salesLoading && <p role="status">Consultando últimas ventas…</p>}
          {salesError !== null && <p role="alert">{salesError}</p>}
          {!salesLoading && sales !== null && sales.length === 0 && (
            <p role="status">No hay ventas en este periodo.</p>
          )}
          {!salesLoading && sales !== null && sales.length > 0 && (
            <div className="dashboard-sales-wrap">
              <table className="dashboard-sales">
                <caption>Últimas ventas</caption>
                <thead>
                  <tr>
                    <th scope="col">Venta</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Método</th>
                    <th scope="col">Total</th>
                    <th scope="col">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{sale.saleNumber}</td>
                      <td>{dateTimeLabel(sale.soldAt)}</td>
                      <td>{sale.method === 'CASH' ? 'Efectivo' : 'Tarjeta'}</td>
                      <td>{formatMxnCents(sale.totalCents)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          aria-label={`Ver ticket ${sale.saleNumber}`}
                          onClick={(event) => {
                            void openTicket(sale, event.currentTarget);
                          }}
                        >
                          Ver ticket
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p><Link to="/terminal/historial">Ver historial completo</Link></p>
        </section>
      </div>

      {ticketBusy && <p role="status">Recuperando ticket…</p>}
      {ticketError !== null && <p role="alert">{ticketError}</p>}
      {ticket !== null && (
        <section className="history-ticket" aria-labelledby="dashboard-ticket-title">
          <h2 id="dashboard-ticket-title" ref={ticketHeading} tabIndex={-1}>
            Ticket reimpreso
          </h2>
          <p>Lectura autorizada: no se realizó ningún cobro ni se emitió un nuevo acceso.</p>
          <ProtectedTicket ticket={ticket} />
          <button type="button" className="secondary-button" onClick={closeTicket}>
            Cerrar ticket
          </button>
        </section>
      )}
    </section>
  );
}
