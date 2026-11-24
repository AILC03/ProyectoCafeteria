import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatMxnCents } from '../../../shared/utils/money';
import { ProtectedTicket } from '../payment/ProtectedTicket';
import type { Ticket } from '../payment/paymentApi';
import {
  formatSalesError,
  formatTicketError,
  getSalesSummary,
  listSales,
  reprintSaleTicket,
  type Sale,
  type SalesFilter,
  type SalesMethod,
  type SalesPage,
  type SalesSummary,
} from '../sales/salesApi';

type HistoryQuery = {
  filter: SalesFilter;
  cursors: Array<string | null>;
  index: number;
};

const INITIAL_QUERY: HistoryQuery = { filter: { limit: 20 }, cursors: [null], index: 0 };

function toUtcDate(value: string, exclusiveEnd: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Introduce una fecha válida.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Introduce una fecha válida.');
  }
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function soldAtLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-MX') : value;
}

export function HistoryPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState<'' | SalesMethod>('');
  const [limit, setLimit] = useState(20);
  const [query, setQuery] = useState<HistoryQuery>(INITIAL_QUERY);
  const [page, setPage] = useState<SalesPage | null>(null);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const ticketHeading = useRef<HTMLHeadingElement>(null);
  const focusReturn = useRef<HTMLButtonElement | null>(null);
  const ticketRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    ticketRequest.current += 1;
    setLoading(true);
    setError(null);
    setPage(null);
    setSummary(null);
    setTicket(null);
    setTicketError(null);
    const cursor = query.cursors[query.index] ?? undefined;
    Promise.all([listSales(query.filter, cursor), getSalesSummary(query.filter)])
      .then(([sales, totals]) => {
        if (cancelled) return;
        setPage(sales);
        setSummary(totals);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(formatSalesError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query]);

  useEffect(() => {
    if (ticket !== null) ticketHeading.current?.focus();
  }, [ticket]);

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const filter: SalesFilter = { limit };
      if (from !== '') filter.from = toUtcDate(from, false);
      if (to !== '') filter.to = toUtcDate(to, true);
      if (method !== '') filter.method = method;
      if (filter.from !== undefined && filter.to !== undefined && Date.parse(filter.from) >= Date.parse(filter.to)) {
        throw new TypeError('El rango de fechas no es válido.');
      }
      setQuery({ filter, cursors: [null], index: 0 });
    } catch (reason) {
      setError(reason instanceof TypeError ? reason.message : 'Los filtros de ventas no son válidos.');
    }
  }

  function nextPage(): void {
    if (loading) return;
    const next = page?.nextCursor;
    if (next === null || next === undefined) return;
    setQuery((previous) => ({
      ...previous,
      cursors: [...previous.cursors.slice(0, previous.index + 1), next],
      index: previous.index + 1,
    }));
  }

  function previousPage(): void {
    if (loading) return;
    setQuery((previous) => previous.index === 0 ? previous : { ...previous, index: previous.index - 1 });
  }

  async function reprint(sale: Sale, trigger: HTMLButtonElement): Promise<void> {
    const request = ++ticketRequest.current;
    focusReturn.current = trigger;
    setTicket(null);
    setTicketError(null);
    setTicketBusy(true);
    try {
      const result = await reprintSaleTicket(sale.id);
      if (request === ticketRequest.current) setTicket(result);
    } catch (reason) {
      if (request === ticketRequest.current) setTicketError(formatTicketError(reason));
    } finally {
      if (request === ticketRequest.current) setTicketBusy(false);
    }
  }

  function closeTicket(): void {
    const trigger = focusReturn.current;
    focusReturn.current = null;
    setTicket(null);
    setTimeout(() => { if (trigger?.isConnected) trigger.focus(); }, 0);
  }

  const rows: Sale[] = page?.items ?? [];

  return (
    <section className="terminal-history" aria-labelledby="history-title">
      <h1 id="history-title">Historial y ventas</h1>
      <p>Consulta operativa de ventas. No se muestra ni consulta el historial personal de clientes.</p>
      <form className="history-filters" onSubmit={applyFilters}>
        <div className="form-field">
          <label htmlFor="history-from">Desde</label>
          <input id="history-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="history-to">Hasta</label>
          <input id="history-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="history-method">Método</label>
          <select id="history-method" value={method} onChange={(event) => setMethod(event.target.value as '' | SalesMethod)}>
            <option value="">Todos</option>
            <option value="CASH">Efectivo</option>
            <option value="STRIPE">Tarjeta</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="history-limit">Por página</label>
          <select id="history-limit" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <button type="submit">Aplicar filtros</button>
      </form>

      {error !== null && <p role="alert" className="form-alert">{error}</p>}

      {summary !== null && (
        <dl className="cash-summary" aria-label="Resumen de ventas del período">
          <div><dt>Ventas</dt><dd>{summary.count}</dd></div>
          <div><dt>Total</dt><dd>{formatMxnCents(summary.totalCents)}</dd></div>
          <div><dt>Efectivo</dt><dd>{formatMxnCents(summary.cashCents)}</dd></div>
          <div><dt>Tarjeta</dt><dd>{formatMxnCents(summary.stripeCents)}</dd></div>
        </dl>
      )}

      {loading && <p role="status">Consultando ventas…</p>}

      {!loading && page !== null && rows.length === 0 && (
        <p role="status">No hay ventas en el rango seleccionado.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="history-table-wrap">
          <table>
            <caption>Ventas operativas</caption>
            <thead><tr><th scope="col">Venta</th><th scope="col">Orden</th><th scope="col">Fecha</th><th scope="col">Método</th><th scope="col">Importe</th><th scope="col">Ticket</th></tr></thead>
            <tbody>
              {rows.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.saleNumber}</td>
                  <td>{sale.orderId}</td>
                  <td>{soldAtLabel(sale.soldAt)}</td>
                  <td>{sale.method === 'CASH' ? 'Efectivo' : 'Tarjeta'}</td>
                  <td>{formatMxnCents(sale.totalCents)}</td>
                  <td><button type="button" className="secondary-button" aria-label={`Reimprimir ticket ${sale.saleNumber}`} onClick={(event) => { void reprint(sale, event.currentTarget); }}>Ver ticket</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="history-pagination" aria-label="Paginación de ventas">
        <button type="button" className="secondary-button" onClick={previousPage} disabled={loading || query.index === 0}>Página anterior</button>
        <span>Página {query.index + 1}</span>
        <button type="button" className="secondary-button" onClick={nextPage} disabled={loading || page?.nextCursor == null}>Página siguiente</button>
      </nav>

      {ticketBusy && <p role="status">Recuperando ticket…</p>}
      {ticketError !== null && <p role="alert" className="form-alert">{ticketError}</p>}
      {ticket !== null && (
        <section className="history-ticket" aria-labelledby="reprinted-ticket-title">
          <h2 id="reprinted-ticket-title" ref={ticketHeading} tabIndex={-1}>Ticket reimpreso</h2>
          <p>Reimpresión de lectura: no se realizó ningún cobro ni se emitió un nuevo acceso.</p>
          <ProtectedTicket ticket={ticket} />
          <button type="button" className="secondary-button" onClick={closeTicket}>Cerrar ticket</button>
        </section>
      )}
    </section>
  );
}
