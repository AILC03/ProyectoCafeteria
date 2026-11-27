import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatMxnCents } from '../../../../shared/utils/money';
import { CashSessionPanel } from '../../cash/CashSessionPanel';
import {
  createCustomPeriod,
  createPresetPeriod,
  defaultPeriod,
  formatInteger,
  PERIOD_OPTIONS,
  periodQuery,
  type PeriodPreset,
  type PeriodRange,
} from '../dashboard/periods';
import {
  formatAdminCashError,
  getAdminCashSessions,
  type AdminCashDifference,
  type AdminCashPage as AdminCashPageData,
  type AdminCashSession,
  type AdminCashStatus,
} from './cashAdminApi';

type StatusFilter = '' | AdminCashStatus;
type DifferenceFilter = '' | AdminCashDifference;

function dateTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Tijuana',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function differenceClass(cents: string | null): string {
  if (cents === null || BigInt(cents) === 0n) return 'admin-cash-difference-none';
  return BigInt(cents) < 0n ? 'admin-cash-difference-shortage' : 'admin-cash-difference-surplus';
}

function differenceLabel(cents: string | null): string {
  if (cents === null) return 'Pendiente';
  const value = BigInt(cents);
  if (value === 0n) return 'Sin diferencia';
  const magnitude = (value < 0n ? -value : value).toString();
  return value < 0n ? `Faltante ${formatMxnCents(magnitude)}` : `Sobrante ${formatMxnCents(magnitude)}`;
}

function absoluteCents(cents: string): string {
  const value = BigInt(cents);
  return (value < 0n ? -value : value).toString();
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`admin-cash-metric${tone === undefined ? '' : ` ${tone}`}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type CashView = 'history' | 'turn';

function CashViewTabs({ view, onChange }: { view: CashView; onChange: (view: CashView) => void }) {
  return (
    <nav className="admin-cash-tabs" aria-label="Vistas de caja">
      <button
        type="button"
        aria-pressed={view === 'history'}
        className={view === 'history' ? 'active' : ''}
        onClick={() => onChange('history')}
      >
        Historial de caja
      </button>
      <button
        type="button"
        aria-pressed={view === 'turn'}
        className={view === 'turn' ? 'active' : ''}
        onClick={() => onChange('turn')}
      >
        Caja del turno
      </button>
    </nav>
  );
}

export function AdminCashPage({ now = () => new Date() }: { now?: () => Date } = {}) {
  const [view, setView] = useState<CashView>('history');
  const [period, setPeriod] = useState<PeriodRange>(() => defaultPeriod(now()));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [difference, setDifference] = useState<DifferenceFilter>('');
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState<AdminCashPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminCashSession | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const id = request.current + 1;
    request.current = id;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      getAdminCashSessions(
        {
          ...periodQuery(period),
          ...(status === '' ? {} : { status }),
          ...(difference === '' ? {} : { difference }),
        },
        cursors[index] ?? undefined,
        20,
        controller.signal,
      )
        .then((data) => {
          if (request.current !== id || controller.signal.aborted) return;
          setPage(data);
          setLoading(false);
        })
        .catch((reason: unknown) => {
          if (request.current !== id || controller.signal.aborted) return;
          setError(formatAdminCashError(reason));
          setLoading(false);
        });
    } catch (reason) {
      setError(formatAdminCashError(reason));
      setLoading(false);
    }
    return () => controller.abort();
  }, [period, status, difference, cursors, index]);

  function resetPaging(): void {
    setCursors([null]);
    setIndex(0);
    setSelected(null);
  }

  function choosePreset(preset: Exclude<PeriodPreset, 'custom'>): void {
    setFilterError(null);
    setPeriod(createPresetPeriod(preset, now()));
    resetPaging();
  }

  function applyCustomPeriod(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      setPeriod(createCustomPeriod(customStart, customEnd));
      setFilterError(null);
      resetPaging();
    } catch (reason) {
      setFilterError(reason instanceof TypeError ? reason.message : 'El rango no es válido.');
    }
  }

  function changeStatus(value: StatusFilter): void {
    setStatus(value);
    if (value === 'OPEN') setDifference('');
    resetPaging();
  }

  function changeDifference(value: DifferenceFilter): void {
    if (value !== '') setStatus('CLOSED');
    setDifference(value);
    resetPaging();
  }

  function goNext(): void {
    if (page?.nextCursor == null || loading) return;
    setCursors((previous) => [...previous.slice(0, index + 1), page.nextCursor]);
    setIndex((value) => value + 1);
    setSelected(null);
  }

  function goPrevious(): void {
    if (index === 0 || loading) return;
    setIndex((value) => value - 1);
    setSelected(null);
  }

  if (view === 'turn') {
    return (
      <section className="admin-panel admin-cash" aria-labelledby="admin-cash-turn-title">
        <header className="admin-cash-header">
          <div>
            <p className="admin-cash-eyebrow">Supervisión de efectivo</p>
            <h2 id="admin-cash-turn-title">Caja del turno</h2>
          </div>
          <p className="admin-cash-help">
            Abre, consulta o cierra la caja activa. El servidor confirma cada importe.
          </p>
        </header>
        <CashViewTabs view={view} onChange={setView} />
        <CashSessionPanel />
      </section>
    );
  }

  const summary = page?.summary ?? null;

  return (
    <section className="admin-panel admin-cash" aria-labelledby="admin-cash-title">
      <header className="admin-cash-header">
        <div>
          <p className="admin-cash-eyebrow">Supervisión de efectivo</p>
          <h2 id="admin-cash-title">Historial de caja</h2>
        </div>
        <p className="admin-cash-help">
          Consulta cierres, faltantes y sobrantes. La operación de caja se realiza en «Caja del turno».
        </p>
      </header>

      <CashViewTabs view={view} onChange={setView} />

      <form
        className="admin-cash-filters"
        aria-label="Filtros del historial de caja"
        onSubmit={applyCustomPeriod}
      >
        <fieldset>
          <legend>Periodo por apertura</legend>
          <div className="admin-cash-presets">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={period.preset === option.id ? 'active' : ''}
                aria-pressed={period.preset === option.id}
                onClick={() => choosePreset(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="admin-cash-custom">
            <label>
              Desde
              <input
                type="date"
                value={customStart}
                required
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={customEnd}
                required
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
            <button type="submit">Aplicar fechas</button>
          </div>
          <p className="admin-cash-period-label" role="status">
            Mostrando: {period.label}
          </p>
          {filterError !== null && <p role="alert">{filterError}</p>}
        </fieldset>

        <label>
          Estado
          <select value={status} onChange={(event) => changeStatus(event.target.value as StatusFilter)}>
            <option value="">Todas</option>
            <option value="OPEN">Abiertas</option>
            <option value="CLOSED">Cerradas</option>
          </select>
        </label>

        <label>
          Diferencia
          <select
            value={difference}
            onChange={(event) => changeDifference(event.target.value as DifferenceFilter)}
          >
            <option value="">Todas</option>
            <option value="SHORTAGE">Con faltante</option>
            <option value="SURPLUS">Con sobrante</option>
            <option value="NONE">Sin diferencia</option>
          </select>
        </label>
      </form>

      {summary !== null && (
        <dl className="admin-cash-metrics" aria-label="Resumen del filtro">
          <SummaryCard label="Cajas" value={formatInteger(summary.sessionCount)} />
          <SummaryCard label="Cerradas" value={formatInteger(summary.closedCount)} />
          <SummaryCard label="Abiertas" value={formatInteger(summary.openCount)} />
          <SummaryCard
            label="Faltante total"
            value={formatMxnCents(absoluteCents(summary.shortageCents))}
            tone={summary.shortageCents === '0' ? undefined : 'admin-cash-metric-shortage'}
          />
          <SummaryCard
            label="Sobrante total"
            value={formatMxnCents(summary.surplusCents)}
            tone={summary.surplusCents === '0' ? undefined : 'admin-cash-metric-surplus'}
          />
          <SummaryCard
            label="Cierres con diferencia"
            value={formatInteger(summary.differenceCount)}
            tone={summary.differenceCount === '0' ? undefined : 'admin-cash-metric-shortage'}
          />
        </dl>
      )}

      {loading && <p role="status">Consultando historial de caja…</p>}
      {error !== null && <p role="alert">{error}</p>}
      {!loading && error === null && page !== null && page.items.length === 0 && (
        <p role="status">No hay cajas que coincidan con el periodo y los filtros.</p>
      )}

      {!loading && page !== null && page.items.length > 0 && (
        <div className="admin-cash-table-wrap">
          <table className="admin-cash-table">
            <caption className="sr-only">Historial de cajas del periodo seleccionado</caption>
            <thead>
              <tr>
                <th scope="col">Sesión</th>
                <th scope="col">Responsable</th>
                <th scope="col">Apertura</th>
                <th scope="col">Cierre</th>
                <th scope="col">Fondo</th>
                <th scope="col">Ventas en efectivo</th>
                <th scope="col">Esperado</th>
                <th scope="col">Contado</th>
                <th scope="col">Diferencia</th>
                <th scope="col"><span className="sr-only">Detalle</span></th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((session) => (
                <tr key={session.id} className={selected?.id === session.id ? 'selected' : ''}>
                  <td>#{session.id}</td>
                  <td>
                    {session.employeeName}
                    {session.employeeUsername !== null && (
                      <span className="admin-cash-username">@{session.employeeUsername}</span>
                    )}
                  </td>
                  <td>{dateTimeLabel(session.openedAt)}</td>
                  <td>{session.closedAt === null ? 'Abierta' : dateTimeLabel(session.closedAt)}</td>
                  <td>{formatMxnCents(session.openingAmountCents)}</td>
                  <td>{formatMxnCents(session.cashSalesCents)}</td>
                  <td>{formatMxnCents(session.computedExpectedCashCents)}</td>
                  <td>{session.countedCashCents === null ? '—' : formatMxnCents(session.countedCashCents)}</td>
                  <td className={differenceClass(session.differenceCents)}>
                    {differenceLabel(session.differenceCents)}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-expanded={selected?.id === session.id}
                      onClick={() => setSelected(selected?.id === session.id ? null : session)}
                    >
                      {selected?.id === session.id ? 'Ocultar' : 'Detalle'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected !== null && (
        <section className="admin-cash-detail" aria-labelledby="admin-cash-detail-title">
          <h3 id="admin-cash-detail-title">Caja #{selected.id}</h3>
          <dl>
            <div><dt>Responsable</dt><dd>{selected.employeeName}</dd></div>
            <div>
              <dt>Abrió</dt>
              <dd>{dateTimeLabel(selected.openedAt)}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{selected.closedAt === null ? 'Abierta' : 'Cerrada'}</dd>
            </div>
            <div>
              <dt>Cerró</dt>
              <dd>
                {selected.closedAt === null
                  ? '—'
                  : `${selected.closedByName ?? 'Sin registrar'} · ${dateTimeLabel(selected.closedAt)}`}
              </dd>
            </div>
            <div><dt>Fondo inicial</dt><dd>{formatMxnCents(selected.openingAmountCents)}</dd></div>
            <div><dt>Ventas en efectivo</dt><dd>{formatMxnCents(selected.cashSalesCents)}</dd></div>
            <div><dt>Pagos exitosos</dt><dd>{formatInteger(selected.successfulPayments)}</dd></div>
            <div>
              <dt>Esperado calculado (fondo + efectivo)</dt>
              <dd>{formatMxnCents(selected.computedExpectedCashCents)}</dd>
            </div>
            <div>
              <dt>Esperado registrado al cierre</dt>
              <dd>{selected.expectedCashCents === null ? '—' : formatMxnCents(selected.expectedCashCents)}</dd>
            </div>
            <div>
              <dt>Efectivo contado</dt>
              <dd>{selected.countedCashCents === null ? '—' : formatMxnCents(selected.countedCashCents)}</dd>
            </div>
            <div>
              <dt>Diferencia</dt>
              <dd className={differenceClass(selected.differenceCents)}>
                {differenceLabel(selected.differenceCents)}
              </dd>
            </div>
            {selected.exceptionalCloseReason !== null && (
              <div>
                <dt>Motivo de cierre excepcional</dt>
                <dd>{selected.exceptionalCloseReason}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <nav className="kitchen-pagination" aria-label="Páginas del historial de caja">
        <button type="button" disabled={loading || index === 0} onClick={goPrevious}>
          Página anterior
        </button>
        <span>Página {index + 1}</span>
        <button
          type="button"
          disabled={loading || page?.nextCursor == null}
          onClick={goNext}
        >
          Página siguiente
        </button>
      </nav>
    </section>
  );
}
