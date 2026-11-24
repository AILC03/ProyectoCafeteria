import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../shared/api/client';
import { useSession, useSessionManager } from '../../../shared/auth/SessionProvider';
import { formatMxnCents } from '../../../shared/utils/money';
import type { PaymentMethod } from '../orders/mobileOrders';
import { changeFavorite, checkedPreview, getFavorites, getOrder, getOrders, getPreview, getProfile, patchProfile, type Favorite, type OrderDetail, type OrderSummary, type Page, type Preview, type Profile } from './accountApi';
import { repeatAttemptFor } from './repeatAttempt';

const message = (error: unknown) => error instanceof ApiError && error.status === 404
  ? 'No se encontró este recurso propio o ya no está disponible.'
  : error instanceof ApiError && error.status === 403 ? 'No tienes permiso para esta operación.'
  : error instanceof ApiError && error.status === 401 ? 'Sesión vencida. Inicia sesión nuevamente.'
  : 'No fue posible completar la solicitud. Inténtalo de nuevo.';
const validId = (id: string) => /^[1-9][0-9]{0,18}$/.test(id);

export function ClientAccountPage() {
  const manager = useSessionManager();
  const session = useSession();
  const navigate = useNavigate();
  const store = repeatAttemptFor(manager);
  const attempt = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const actorId = session.status === 'authenticated' ? session.actor.id : null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoritesCursor, setFavoritesCursor] = useState<string | null>(null);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [favoriteId, setFavoriteId] = useState('');
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersCursor, setOrdersCursor] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const clear = () => {
      epoch.current++;
      active.current?.abort();
      setProfile(null); setName(''); setPhone(''); setPin(''); setFavorites([]); setOrders([]);
      setDetail(null); setPreview(null); setProfileNotice(null); setFavoriteNotice(null);
    };
    const unregister = manager.registerPrivateStateCleaner(clear);
    // Actor replacement via refresh-complete can bypass private-state cleaners.
    const initial = actorId;
    const unsubscribe = manager.subscribe((state) => {
      if (state.status === 'recoverable-error' || state.status === 'authenticated' && state.actor.id !== initial) clear();
    });
    const profile = navigator.userAgent.includes('Electron') ? 'electron' : 'browser';
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`cafeteria:auth-refresh:${profile}`);
    channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === null || typeof event.data !== 'object' || (event.data as { type?: unknown }).type !== 'refresh-complete') return;
      clear();
      void manager.bootstrap().then((resolved) => {
        if (resolved.status === 'authenticated' && resolved.actor.id === initial) setReload((value) => value + 1);
      });
    });
    return () => { unregister(); unsubscribe(); channel?.close(); epoch.current++; active.current?.abort(); };
  }, [manager, actorId]);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    const revision = epoch.current;
    const valid = () => !controller.signal.aborted && revision === epoch.current;
    setProfileError(null); setFavoritesError(null); setOrdersError(null);
    setProfileLoading(true); setFavoritesLoading(true); setOrdersLoading(true);
    void getProfile(controller.signal).then((value) => { if (valid()) { setProfile(value); setName(value.name); setPhone(value.phone); } })
      .catch((e: unknown) => { if (valid()) setProfileError(message(e)); }).finally(() => { if (valid()) setProfileLoading(false); });
    void getFavorites(undefined, controller.signal).then((value) => { if (valid()) { setFavorites(value.data); setFavoritesCursor(value.page.nextCursor); } })
      .catch((e: unknown) => { if (valid()) setFavoritesError(message(e)); }).finally(() => { if (valid()) setFavoritesLoading(false); });
    void getOrders(undefined, controller.signal).then((value) => { if (valid()) { setOrders(value.data); setOrdersCursor(value.page.nextCursor); } })
      .catch((e: unknown) => { if (valid()) setOrdersError(message(e)); }).finally(() => { if (valid()) setOrdersLoading(false); });
    return () => controller.abort();
  }, [actorId, reload]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !profile) return;
    const newName = name.trim();
    const changingPhone = phone !== profile.phone;
    if (newName.length < 1 || newName.length > 120 || changingPhone && (!/^\+52[0-9]{10}$/.test(phone) || !/^[0-9]{4}$/.test(pin))) {
      setProfileError('Nombre de 1 a 120 caracteres; para cambiar teléfono usa +52 y 10 dígitos, y NIP actual de 4 dígitos.'); return;
    }
    if (newName === profile.name && !changingPhone) return;
    busy.current = true; setProfileSaving(true); setProfileError(null); setProfileNotice(null);
    const revision = epoch.current;
    try {
      const result = await patchProfile({ ...(newName !== profile.name ? { name: newName } : {}), ...(changingPhone ? { phone, currentPin: pin } : {}) });
      if (revision !== epoch.current) return;
      setPin('');
      if (changingPhone) {
        // The server revokes the cookie. Resolve the actor before showing any
        // other private information; logout would fail on an already revoked cookie.
        active.current?.abort();
        setProfile(null); setFavorites([]); setOrders([]); setDetail(null); setPreview(null);
        await manager.bootstrap();
        if (revision === epoch.current && manager.getSnapshot().status !== 'authenticated') navigate('/cliente/iniciar-sesion', { replace: true });
      } else {
        setProfile({ ...profile, name: result.data.name }); setProfileNotice('Perfil actualizado.');
      }
    } catch (error) {
      if (revision === epoch.current) {
        if (changingPhone && error instanceof ApiError && (error.status === 0 || error.status === 503)) {
          active.current?.abort();
          setProfile(null); setFavorites([]); setOrders([]); setDetail(null); setPreview(null);
          setProfileError('No se pudo confirmar el cambio de teléfono. Comprobando la sesión antes de continuar.');
          await manager.bootstrap();
        } else setProfileError(message(error));
      }
    }
    finally { setPin(''); busy.current = false; setProfileSaving(false); }
  }

  async function loadPage<T>(cursor: string | null, fetcher: (cursor: string) => Promise<Page<T>>,
    setItems: (update: (items: T[]) => T[]) => void, setCursor: (cursor: string | null) => void,
    setLoading: (loading: boolean) => void, setError: (error: string | null) => void) {
    if (!cursor) return;
    const revision = epoch.current;
    setLoading(true); setError(null);
    try {
      const page = await fetcher(cursor);
      if (revision === epoch.current) { setItems((items) => [...items, ...page.data]); setCursor(page.page.nextCursor); }
    } catch (error) { if (revision === epoch.current) setError(message(error)); }
    finally { if (revision === epoch.current) setLoading(false); }
  }

  async function favorite(id: string, add: boolean) {
    if (favoriteBusy || !validId(id)) { setFavoritesError('Ingresa un ID de producto válido.'); return; }
    const revision = epoch.current;
    const before = favorites;
    setFavoriteBusy(true); setPendingFavoriteId(add ? id : null); setFavoritesError(null); setFavoriteNotice(null);
    if (!add) setFavorites((items) => items.filter((item) => item.productId !== id));
    try {
      await changeFavorite(id, add);
      if (revision !== epoch.current) return;
      setFavoriteNotice(add ? 'Favorito agregado.' : 'Favorito retirado.');
      if (add) {
        setFavoriteId('');
        try {
          const page = await getFavorites();
          if (revision === epoch.current) { setFavorites(page.data); setFavoritesCursor(page.page.nextCursor); }
        } catch {
          if (revision === epoch.current) setFavoritesError('Favorito guardado, pero no se pudo actualizar la lista. Reintenta la carga.');
        }
      }
    } catch (error) { if (revision === epoch.current) { setFavorites(before); setFavoritesError(message(error)); setFavoriteNotice(null); } }
    finally { setFavoriteBusy(false); setPendingFavoriteId(null); }
  }

  async function openOrder(id: string) {
    const revision = epoch.current;
    setDetail(null); setPreview(null); setDetailError(null); setPreviewError(null); setDetailLoading(true);
    try { const result = await getOrder(id); if (revision === epoch.current) setDetail(result); }
    catch (error) { if (revision === epoch.current) setDetailError(message(error)); }
    finally { if (revision === epoch.current) setDetailLoading(false); }
  }
  async function requestPreview() {
    if (!detail || previewLoading || attempt.pending || attempt.sending || attempt.blocked) return;
    const revision = epoch.current;
    const id = detail.id;
    setPreview(null); setPreviewError(null); setPreviewLoading(true);
    try { const result = await getPreview(id); if (revision === epoch.current && result.sourceOrderId === id) setPreview(result); else if (revision === epoch.current) setPreviewError('Vista previa inválida.'); }
    catch (error) { if (revision === epoch.current) setPreviewError(message(error)); }
    finally { if (revision === epoch.current) setPreviewLoading(false); }
  }
  function confirmRepeat() {
    if (!preview || !detail || preview.sourceOrderId !== detail.id) return;
    try { checkedPreview(preview, detail.id); if (store.confirm(preview, detail.id, payment)) { setPreview(null); setPreviewError(null); } }
    catch { setPreviewError('Esta selección no se puede confirmar. Actualiza la vista previa.'); }
  }

  return <section aria-labelledby="account-title">
    <h1 id="account-title">Cuenta</h1>
    <section aria-labelledby="profile-title"><h2 id="profile-title">Perfil propio</h2>
      {profileLoading && <p role="status">Cargando perfil…</p>}
      {profileError && <p aria-live="assertive">{profileError}</p>}
      {profileError && !profile && <button type="button" onClick={() => setReload((value) => value + 1)}>Reintentar carga de cuenta</button>}
      {profileNotice && <p role="status">{profileNotice}</p>}
      {profile && <><p>Número de cliente: {profile.customerNumber}</p><form onSubmit={(e) => { void saveProfile(e); }}>
        <label>Nombre <input value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
        <label>Teléfono (+52 y 10 dígitos) <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        {phone !== profile.phone && <><label>NIP actual <input type="password" value={pin} inputMode="numeric" maxLength={4} autoComplete="off" onChange={(e) => setPin(e.target.value)} /></label><p>Cambiar el teléfono revoca la sesión y requiere iniciar sesión de nuevo.</p></>}
        <button disabled={profileSaving || name.trim() === profile.name && phone === profile.phone}>Guardar perfil</button>
      </form></>}
      {!profileLoading && !profile && !profileError && <p>No hay perfil disponible.</p>}
    </section>
    <section aria-labelledby="favorites-title"><h2 id="favorites-title">Favoritos</h2>
      <form onSubmit={(e) => { e.preventDefault(); void favorite(favoriteId, true); }}><label>ID de producto <input value={favoriteId} inputMode="numeric" onChange={(e) => setFavoriteId(e.target.value)} /></label><button disabled={favoriteBusy}>Agregar favorito</button></form>
      {favoritesLoading && <p role="status">Cargando favoritos…</p>}
      {favoritesError && <p aria-live="assertive">{favoritesError}</p>}{favoriteNotice && <p role="status">{favoriteNotice}</p>}
      {favoritesError && favorites.length === 0 && <button type="button" onClick={() => setReload((value) => value + 1)}>Reintentar favoritos</button>}
      {!favoritesLoading && !favoritesError && favorites.length === 0 && <p>Aún no tienes favoritos visibles.</p>}
      <ul>{favorites.map((item) => <li key={item.productId}>{item.name} — {formatMxnCents(item.basePriceCents)} {item.isAvailable ? '' : '(agotado)'} <button type="button" disabled={favoriteBusy} onClick={() => { void favorite(item.productId, false); }}>Quitar {item.name}</button></li>)}
        {pendingFavoriteId && <li role="status">Agregando producto {pendingFavoriteId} a favoritos…</li>}</ul>
      {favoritesCursor && <button type="button" disabled={favoritesLoading || favoriteBusy} onClick={() => { void loadPage(favoritesCursor, getFavorites, setFavorites, setFavoritesCursor, setFavoritesLoading, setFavoritesError); }}>Más favoritos</button>}
    </section>
    <section aria-labelledby="orders-title"><h2 id="orders-title">Historial de órdenes</h2>
      {ordersLoading && <p role="status">Cargando historial…</p>}{ordersError && <p aria-live="assertive">{ordersError}</p>}
      {ordersError && orders.length === 0 && <button type="button" onClick={() => setReload((value) => value + 1)}>Reintentar historial</button>}
      {!ordersLoading && !ordersError && orders.length === 0 && <p>No tienes órdenes registradas.</p>}
      <ul>{orders.map((order) => <li key={order.id}>{order.folio} — {order.status} — {order.paidAt ? 'Pagada' : 'Sin pago confirmado'} — {formatMxnCents(order.totalCents)} <button type="button" onClick={() => { void openOrder(order.id); }}>Ver orden {order.folio}</button></li>)}</ul>
      {ordersCursor && <button type="button" disabled={ordersLoading} onClick={() => { void loadPage(ordersCursor, getOrders, setOrders, setOrdersCursor, setOrdersLoading, setOrdersError); }}>Más órdenes</button>}
      {detailLoading && <p role="status">Cargando detalle…</p>}{detailError && <p role="alert">{detailError}</p>}
      {detail && <section aria-labelledby="detail-title"><h3 id="detail-title">Orden {detail.folio}</h3>
        <p>Estado: {detail.status}. {detail.paidAt ? 'Pagada' : 'Sin pago confirmado'}. Total: {formatMxnCents(detail.totalCents)}</p>
        <ul>{detail.items.map((item, index) => <li key={index}>{item.quantity} × {item.productName} — {formatMxnCents(item.lineTotalCents)}</li>)}</ul>
        <button type="button" disabled={previewLoading || !!attempt.pending || attempt.sending || attempt.blocked || attempt.paused} onClick={() => { void requestPreview(); }}>Preparar repetición</button>
      </section>}
      {previewLoading && <p role="status">Consultando catálogo actual…</p>}{previewError && <p role="alert">{previewError}</p>}
      {preview && <section aria-labelledby="preview-title"><h3 id="preview-title">Vista previa de repetición</h3>
        <p>Precios y disponibilidad actuales; esta vista no reserva ni crea una orden.</p>
        <ul>{preview.items.map((item, index) => <li key={index}>{item.quantity} × {item.productName} — {item.currentLineTotalCents === null ? 'Sin precio actual' : formatMxnCents(item.currentLineTotalCents)}</li>)}</ul>
        {preview.warnings.length > 0 && <div role="alert"><p>Avisos de la repetición:</p><ul>{preview.warnings.map((warning, index) => <li key={index}>{warning.blocking ? 'Bloqueante' : 'Informativo'}: {warning.code}{warning.line !== null ? `, línea ${warning.line}` : ''}{warning.optionValueId !== null ? `, opción ${warning.optionValueId}` : ''}</li>)}</ul></div>}
        <p>Total actual: {preview.totalCents === null ? 'No disponible' : formatMxnCents(preview.totalCents)}</p>
        {!preview.canCreateOrder || preview.warnings.some((warning) => warning.blocking) ? <p role="alert">Esta selección no se puede ordenar. Solicita otra vista previa después de revisar el catálogo.</p> : <>
          <fieldset><legend>Método de pago de la nueva orden pendiente</legend><label><input type="radio" name="repeat-payment" checked={payment === 'CASH'} onChange={() => setPayment('CASH')} /> Efectivo</label><label><input type="radio" name="repeat-payment" checked={payment === 'STRIPE'} onChange={() => setPayment('STRIPE')} /> Stripe (sin iniciar pago)</label></fieldset>
          <button type="button" disabled={attempt.sending || attempt.paused || !!attempt.pending || attempt.blocked} onClick={confirmRepeat}>Confirmar y crear nueva orden pendiente</button>
        </>}
      </section>}
      {attempt.paused && <p role="status">Comprobando sesión antes de continuar…</p>}
      {attempt.sending && <p role="status">Enviando nueva orden…</p>}
      {attempt.message && <p role="alert">{attempt.message}</p>}
      {attempt.pending && !attempt.sending && !attempt.paused && <button type="button" onClick={() => { void store.send(); }}>Reintentar la misma orden</button>}
      {attempt.confirmed && <p role="status">Nueva orden {attempt.confirmed.folio} creada, pendiente de pago. Total confirmado por el servidor: {formatMxnCents(attempt.confirmed.totalCents)}. La orden original no cambió; no hay pago confirmado.</p>}
    </section>
  </section>;
}
