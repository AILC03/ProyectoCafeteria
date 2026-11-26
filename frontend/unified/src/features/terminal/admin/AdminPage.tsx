import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatMxnCents } from '../../../shared/utils/money';
import { getSalesSummary, formatSalesError, type SalesSummary } from '../sales/salesApi';
import {
  deleteAdmin, formatAdminError, formatAdminMutationError, getConfiguration, isUncertainAdminMutation,
  listAdmin, putConfiguration, writeAdmin,
  type AdminConfiguration, type AdminEntity, type AdminKind, type AdminProduct,
} from './adminApi';

const LABELS: Record<AdminKind, string> = {
  categories: 'Categorías', products: 'Productos', 'option-groups': 'Grupos de opciones',
  'option-values': 'Valores de opciones', employees: 'Personal',
};
const FIELDS: Record<AdminKind, Array<{ key: string; label: string; type?: string; required?: boolean }>> = {
  categories: [{ key: 'name', label: 'Nombre', required: true }, { key: 'isActive', label: 'Activa', type: 'checkbox' }],
  products: [
    { key: 'name', label: 'Nombre', required: true }, { key: 'categoryId', label: 'ID de categoría', required: true },
    { key: 'basePriceCents', label: 'Precio en centavos', required: true }, { key: 'description', label: 'Descripción' },
    { key: 'isAvailable', label: 'Disponible', type: 'checkbox' },
  ],
  'option-groups': [{ key: 'name', label: 'Nombre', required: true }, { key: 'pricingScope', label: 'Ámbito del recargo', type: 'pricing', required: true }],
  'option-values': [
    { key: 'name', label: 'Nombre', required: true },
    { key: 'globalSurchargeCents', label: 'Recargo global en centavos (vacío si es por producto)' },
    { key: 'isAvailable', label: 'Disponible', type: 'checkbox' },
  ],
  employees: [
    { key: 'name', label: 'Nombre', required: true }, { key: 'username', label: 'Usuario', required: true },
    { key: 'password', label: 'Contraseña nueva', type: 'password', required: true },
    { key: 'role', label: 'Rol', type: 'role', required: true }, { key: 'isActive', label: 'Activo', type: 'checkbox' },
    { key: 'reason', label: 'Motivo de modificación', required: true },
  ],
};

function asForm(entity?: AdminEntity): Record<string, string | boolean> {
  if (entity === undefined) return { isActive: true, isAvailable: true, pricingScope: 'GLOBAL', role: 'CAJERO' };
  const form: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (value !== null && (typeof value === 'string' || typeof value === 'boolean')) form[key] = value;
  }
  return form;
}

function entityLabel(kind: AdminKind, entity: AdminEntity): string {
  if (kind === 'employees' && 'username' in entity) return `${entity.name} (${entity.username})`;
  return entity.name;
}

function Dashboard() {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getSalesSummary({}).then((data) => { if (active) setSummary(data); })
      .catch((reason) => { if (active) setError(formatSalesError(reason)); });
    return () => { active = false; };
  }, []);
  return <section aria-labelledby="admin-dashboard-title" className="admin-panel admin-dashboard">
    <h2 id="admin-dashboard-title">Dashboard y corte</h2>
    <p>Totales de ventas de la API, sin datos simulados. Para abrir y cerrar caja usa la vista de caja autorizada.</p>
    {summary === null && error === null && <p role="status">Consultando resumen de ventas…</p>}
    {error !== null && <p role="alert">{error}</p>}
    {summary !== null && <dl className="cash-summary">
      <div><dt>Ventas</dt><dd>{summary.count}</dd></div>
      <div><dt>Total</dt><dd>{formatMxnCents(summary.totalCents)}</dd></div>
      <div><dt>Efectivo</dt><dd>{formatMxnCents(summary.cashCents)}</dd></div>
      <div><dt>Tarjeta registrada</dt><dd>{formatMxnCents(summary.stripeCents)}</dd></div>
    </dl>}
    <div className="admin-dashboard-links"><Link to="/terminal/caja">Caja y corte</Link><Link to="/terminal/historial">Historial operativo</Link></div>
  </section>;
}

function ConfigurationEditor({ product }: { product: AdminProduct }) {
  const [draft, setDraft] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDraft('');
    getConfiguration(product.id, controller.signal)
      .then((config) => { if (!controller.signal.aborted) { setDraft(JSON.stringify(config, null, 2)); setUncertain(false); } })
      .catch((reason) => { if (!controller.signal.aborted) setError(formatAdminError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [product.id, refresh]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || uncertain) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(draft);
      const config = await putConfiguration(product.id, parsed as AdminConfiguration);
      setDraft(JSON.stringify(config, null, 2));
      setNotice('Configuración guardada y verificada.');
    } catch (reason) {
      if (isUncertainAdminMutation(reason)) setUncertain(true);
      setError(reason instanceof SyntaxError ? 'La configuración debe ser JSON válido.' : formatAdminMutationError(reason));
    } finally { setBusy(false); }
  }

  return <section className="admin-panel admin-config-editor" aria-labelledby="configuration-title">
    <h3 id="configuration-title">Opciones de {product.name}</h3>
    <p>Configuración completa por grupos y valores. Usa IDs existentes; guardar reemplaza la configuración completa del producto.</p>
    {loading && <p role="status">Cargando configuración…</p>}
    {error !== null && <p role="alert">{error}</p>}
    {notice !== null && <p role="status">{notice}</p>}
    {uncertain && <button type="button" disabled={loading || busy} onClick={() => setRefresh((value) => value + 1)}>Consultar configuración antes de continuar</button>}
    {!loading && draft !== '' && <form onSubmit={(event) => { void save(event); }}>
      <label htmlFor="admin-configuration">Grupos, límites y valores (JSON)</label>
      <textarea id="admin-configuration" rows={12} value={draft} onChange={(event) => setDraft(event.target.value)} required spellCheck={false} />
      <button type="submit" disabled={busy || uncertain}>Guardar configuración</button>
    </form>}
  </section>;
}

function Collection({ kind }: { kind: AdminKind }) {
  const [items, setItems] = useState<AdminEntity[]>([]);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [index, setIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [editing, setEditing] = useState<AdminEntity | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(asForm());
  const [groupId, setGroupId] = useState('');
  const [configuration, setConfiguration] = useState<AdminProduct | null>(null);
  const paging = useRef(false);
  const action = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    paging.current = false;
    setLoading(true);
    setError(null);
    setItems([]);
    listAdmin(kind, cursors[index] ?? undefined, includeDeleted, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setItems(result.items); setNextCursor(result.nextCursor); setUncertain(false); } })
      .catch((reason) => { if (!controller.signal.aborted) setError(formatAdminError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, index, includeDeleted, refresh]);

  function reload(): void {
    if (paging.current || loading) return;
    paging.current = true;
    if (uncertain) { setCursors([null]); setIndex(0); }
    setRefresh((value) => value + 1);
  }

  function changePage(next: boolean): void {
    if (paging.current || loading || (next ? nextCursor === null : index === 0)) return;
    paging.current = true;
    if (next && nextCursor !== null) {
      setCursors((previous) => [...previous.slice(0, index + 1), nextCursor]);
      setIndex((value) => value + 1);
    } else setIndex((value) => value - 1);
  }

  function edit(entity: AdminEntity | null): void {
    setEditing(entity);
    setForm(asForm(entity ?? undefined));
    if (!uncertain) setActionError(null);
  }

  function resetAfterMutation(): void {
    setCursors([null]);
    setIndex(0);
    setRefresh((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (action.current || uncertain || loading) return;
    action.current = true;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    const input: Record<string, unknown> = {};
    for (const field of FIELDS[kind]) {
      if (editing !== null && ['password', 'username'].includes(field.key)) continue;
      if (editing === null && field.key === 'reason') continue;
      if (kind === 'employees' && editing === null && field.key === 'isActive') continue;
      if (kind === 'employees' && editing !== null && field.key === 'role' && form.role === 'GERENTE') continue;
      const value = form[field.key];
      if (field.type === 'checkbox') input[field.key] = value === true;
      else if (field.key === 'password' && typeof value === 'string') input[field.key] = value;
      else if (typeof value === 'string' && value.trim() !== '') input[field.key] = value.trim();
      else if (field.key === 'description' || field.key === 'globalSurchargeCents') input[field.key] = null;
    }
    if (editing !== null) {
      for (const key of Object.keys(input)) {
        if (key !== 'reason' && input[key] === (editing as unknown as Record<string, unknown>)[key]) delete input[key];
      }
    }
    try {
      const saved = await writeAdmin(kind, input, editing?.id, kind === 'option-values' && editing === null ? groupId : undefined);
      setNotice(`${saved.name} guardado en el servidor.`);
      edit(null);
      resetAfterMutation();
    } catch (reason) {
      if (isUncertainAdminMutation(reason)) setUncertain(true);
      setActionError(formatAdminMutationError(reason));
    }
    finally { setBusy(false); action.current = false; }
  }

  async function remove(entity: AdminEntity): Promise<void> {
    if (kind === 'employees' || action.current || uncertain || !window.confirm(`¿Eliminar ${entity.name}?`)) return;
    action.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await deleteAdmin(kind, entity.id);
      setNotice(`${entity.name} dado de baja en el servidor.`);
      resetAfterMutation();
    } catch (reason) {
      if (isUncertainAdminMutation(reason)) setUncertain(true);
      setActionError(formatAdminMutationError(reason));
    }
    finally { setBusy(false); action.current = false; }
  }

  return <section aria-labelledby="admin-collection-title" className={`admin-panel admin-collection admin-collection-${kind}`}>
    <h2 id="admin-collection-title">{LABELS[kind]}</h2>
    <p>Los cambios se confirman únicamente con la respuesta de la API. No se habilitan servicios externos ni restablecimiento de NIP.</p>
    {kind !== 'employees' && <label className="admin-inline"><input type="checkbox" checked={includeDeleted}
      onChange={(event) => { setIncludeDeleted(event.target.checked); setIndex(0); setCursors([null]); }} /> Mostrar dados de baja</label>}
    <button type="button" disabled={busy || loading} onClick={reload}>{uncertain ? 'Consultar lista antes de continuar' : 'Actualizar lista'}</button>
    {error !== null && <p role="alert">{error}</p>}
    {actionError !== null && <p role="alert">{actionError}</p>}
    {notice !== null && <p role="status">{notice}</p>}
    {!loading && items.length === 0 && error === null && <p role="status">No hay registros en esta página.</p>}
    <ul className="admin-list">
      {items.map((item) => <li key={item.id}>
        <strong>{entityLabel(kind, item)}</strong> <span>ID {item.id}</span>
        {kind === 'products' && 'imageUrl' in item && item.imageUrl === null && <span className="admin-no-image">Sin imagen</span>}
        {'basePriceCents' in item && <span>{formatMxnCents(item.basePriceCents)}</span>}
        {kind === 'products' && 'isAvailable' in item && <span className={`admin-product-state${item.isAvailable ? '' : ' admin-product-state-soldout'}`}>{item.isAvailable ? 'Disponible' : 'Agotado'}</span>}
        {'role' in item && <><span className="admin-employee-role">{item.role}</span><span className={`admin-employee-state${item.isActive ? '' : ' admin-employee-state-inactive'}`}>{item.isActive ? 'Activo' : 'Inactivo'}</span></>}
        {'deletedAt' in item && item.deletedAt !== null && <span> · Baja registrada</span>}
        <button type="button" disabled={busy || uncertain || 'deletedAt' in item && item.deletedAt !== null}
          onClick={() => edit(item)}>Editar</button>
        {kind === 'products' && 'basePriceCents' in item && <button type="button" disabled={busy}
          onClick={() => setConfiguration(item)}>Opciones de {item.name}</button>}
        {kind !== 'employees' && <button type="button" disabled={busy || uncertain || 'deletedAt' in item && item.deletedAt !== null}
          onClick={() => { void remove(item); }}>Dar de baja</button>}
      </li>)}
    </ul>
    <nav aria-label={`Páginas de ${LABELS[kind]}`} className="kitchen-pagination">
      <button type="button" disabled={loading || index === 0} onClick={() => changePage(false)}>Página anterior</button>
      <span>Página {index + 1}</span>
      <button type="button" disabled={loading || nextCursor === null} onClick={() => changePage(true)}>Página siguiente</button>
    </nav>
    <form className="admin-form" onSubmit={(event) => { void submit(event); }}>
      <h3>{editing === null ? `Crear ${LABELS[kind].toLowerCase()}` : `Editar ${editing.name}`}</h3>
      {kind === 'option-values' && editing === null && <label>ID del grupo de opciones
        <input value={groupId} onChange={(event) => setGroupId(event.target.value)} required inputMode="numeric" />
      </label>}
      {FIELDS[kind].filter((field) => editing === null ? field.key !== 'reason' : field.key !== 'password' && field.key !== 'username')
        .map((field) => <label key={field.key}>{field.label}
          {field.type === 'checkbox' ? <input type="checkbox" checked={form[field.key] === true}
            onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.checked }))} />
            : field.type === 'pricing' || field.type === 'role' ? <select value={String(form[field.key] ?? '')}
              onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.value }))}>
              {field.type === 'role' && form.role === 'GERENTE' && <option value="GERENTE" disabled>GERENTE (legado, no asignable)</option>}
              {(field.type === 'role' ? ['CAJERO', 'PREPARACION', 'ADMINISTRADOR'] : ['GLOBAL', 'PER_PRODUCT'])
                .map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
              : <input type={field.type ?? 'text'} value={String(form[field.key] ?? '')}
                required={field.required} maxLength={field.key === 'description' ? 1500 : field.key === 'reason' ? 500 : undefined}
                onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.value }))} />}
        </label>)}
      <button type="submit" disabled={busy || uncertain || loading}>{busy ? 'Guardando…' : 'Guardar'}</button>
      {editing !== null && <button type="button" disabled={busy} onClick={() => edit(null)}>Cancelar edición</button>}
    </form>
    {configuration !== null && <ConfigurationEditor key={configuration.id} product={configuration} />}
  </section>;
}

export function AdminPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = location.pathname.split('/').filter(Boolean)[2];
  const kind: AdminKind | 'dashboard' = section === 'catalogo' ? 'products'
    : section === 'categorias' ? 'categories' : section === 'grupos' ? 'option-groups'
      : section === 'valores' ? 'option-values' : section === 'personal' ? 'employees' : 'dashboard';
  const routes: Record<AdminKind | 'dashboard', string> = {
    dashboard: '', categories: 'categorias', products: 'catalogo', 'option-groups': 'grupos',
    'option-values': 'valores', employees: 'personal',
  };
  return <section className="terminal-admin" aria-labelledby="admin-title">
    <h1 id="admin-title">Administración</h1>
    <nav aria-label="Secciones administrativas" className="admin-tabs">
      {(['dashboard', 'categories', 'products', 'option-groups', 'option-values', 'employees'] as const)
        .map((tab) => <button type="button" key={tab} aria-current={kind === tab ? 'page' : undefined}
          onClick={() => { void navigate(`/terminal/administracion${routes[tab] === '' ? '' : `/${routes[tab]}`}`); }}>
          {tab === 'dashboard' ? 'Dashboard y corte' : LABELS[tab]}</button>)}
    </nav>
    {kind === 'dashboard' ? <Dashboard /> : <Collection key={kind} kind={kind} />}
  </section>;
}
