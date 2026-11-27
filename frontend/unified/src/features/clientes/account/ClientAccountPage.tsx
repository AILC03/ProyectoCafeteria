import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../shared/api/client';
import { useSession, useSessionManager } from '../../../shared/auth/SessionProvider';
import { formatMxnCents } from '../../../shared/utils/money';
import { changeFavorite, checkedPreview, getFavorites, getOrder, getOrders, getPreview, getProfile, patchProfile, type Favorite, type OrderDetail, type OrderSummary, type Page, type Profile } from './accountApi';
import { clientCartStore } from '../cart/clientCartStore';

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
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersCursor, setOrdersCursor] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [repeatBusyId, setRepeatBusyId] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const clear = () => {
      epoch.current++;
      active.current?.abort();
      setProfile(null); setName(''); setPhone(''); setPin(''); setFavorites([]); setOrders([]);
      setDetail(null); setRepeatError(null); setProfileNotice(null); setFavoriteNotice(null);
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
        setProfile(null); setFavorites([]); setOrders([]); setDetail(null); setRepeatError(null);
        await manager.bootstrap();
        if (revision === epoch.current && manager.getSnapshot().status !== 'authenticated') navigate('/cliente/iniciar-sesion', { replace: true });
      } else {
        setProfile({ ...profile, name: result.data.name }); setProfileNotice('Perfil actualizado.');
      }
    } catch (error) {
      if (revision === epoch.current) {
        if (changingPhone && error instanceof ApiError && (error.status === 0 || error.status === 503)) {
          active.current?.abort();
          setProfile(null); setFavorites([]); setOrders([]); setDetail(null); setRepeatError(null);
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

  async function removeFavorite(id: string) {
    if (favoriteBusy || !validId(id)) return;
    const revision = epoch.current;
    const before = favorites;
    setFavoriteBusy(true); setFavoritesError(null); setFavoriteNotice(null);
    setFavorites((items) => items.filter((item) => item.productId !== id));
    try {
      await changeFavorite(id, false);
      if (revision === epoch.current) setFavoriteNotice('Favorito retirado.');
    } catch (error) { if (revision === epoch.current) { setFavorites(before); setFavoritesError(message(error)); setFavoriteNotice(null); } }
    finally { setFavoriteBusy(false); }
  }

  async function openOrder(id: string) {
    const revision = epoch.current;
    setDetail(null); setDetailError(null); setDetailLoading(true);
    try { const result = await getOrder(id); if (revision === epoch.current) setDetail(result); }
    catch (error) { if (revision === epoch.current) setDetailError(message(error)); }
    finally { if (revision === epoch.current) setDetailLoading(false); }
  }

  async function repeatOrder(id: string) {
    if (repeatBusyId !== null) return;
    const revision = epoch.current;
    setRepeatBusyId(id); setRepeatError(null);
    try {
      const preview = await getPreview(id);
      const items = checkedPreview(preview, id);
      if (revision !== epoch.current) return;
      clientCartStore.replaceItems(items);
      clientCartStore.open();
      navigate('/cliente/menu');
    } catch (error) {
      if (revision === epoch.current) setRepeatError(error instanceof ApiError && error.status === 0 ? error.message : message(error));
    } finally {
      if (revision === epoch.current) setRepeatBusyId(null);
    }
  }

  return <section aria-labelledby="account-title" className="client-account">
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
      <p className="field-hint">Marca productos con la estrella desde el menú. Aquí puedes revisarlos o quitarlos.</p>
      {favoritesLoading && <p role="status">Cargando favoritos…</p>}
      {favoritesError && <p aria-live="assertive">{favoritesError}</p>}{favoriteNotice && <p role="status">{favoriteNotice}</p>}
      {favoritesError && favorites.length === 0 && <button type="button" onClick={() => setReload((value) => value + 1)}>Reintentar favoritos</button>}
      {!favoritesLoading && !favoritesError && favorites.length === 0 && <p>Aún no tienes favoritos visibles.</p>}
      <ul>{favorites.map((item) => <li key={item.productId}>{item.name} — {formatMxnCents(item.basePriceCents)} {item.isAvailable ? '' : '(agotado)'} <button type="button" disabled={favoriteBusy} onClick={() => { void removeFavorite(item.productId); }}>Quitar {item.name}</button></li>)}</ul>
      {favoritesCursor && <button type="button" disabled={favoritesLoading || favoriteBusy} onClick={() => { void loadPage(favoritesCursor, getFavorites, setFavorites, setFavoritesCursor, setFavoritesLoading, setFavoritesError); }}>Más favoritos</button>}
    </section>
    <section aria-labelledby="orders-title"><h2 id="orders-title">Historial de órdenes</h2>
      {ordersLoading && <p role="status">Cargando historial…</p>}{ordersError && <p aria-live="assertive">{ordersError}</p>}
      {ordersError && orders.length === 0 && <button type="button" onClick={() => setReload((value) => value + 1)}>Reintentar historial</button>}
      {!ordersLoading && !ordersError && orders.length === 0 && <p>No tienes órdenes registradas.</p>}
      <ul>{orders.map((order) => <li key={order.id}>{order.folio} — {order.status} — {order.paidAt ? 'Pagada' : 'Sin pago confirmado'} — {formatMxnCents(order.totalCents)} <button type="button" disabled={repeatBusyId !== null} onClick={() => { void repeatOrder(order.id); }}>{repeatBusyId === order.id ? 'Preparando carrito…' : `Repetir pedido ${order.folio}`}</button> <button type="button" onClick={() => { void openOrder(order.id); }}>Ver orden {order.folio}</button></li>)}</ul>
      {ordersCursor && <button type="button" disabled={ordersLoading} onClick={() => { void loadPage(ordersCursor, getOrders, setOrders, setOrdersCursor, setOrdersLoading, setOrdersError); }}>Más órdenes</button>}
      {repeatError && <p role="alert">{repeatError}</p>}
      {detailLoading && <p role="status">Cargando detalle…</p>}{detailError && <p role="alert">{detailError}</p>}
      {detail && <section aria-labelledby="detail-title"><h3 id="detail-title">Orden {detail.folio}</h3>
        <p>Estado: {detail.status}. {detail.paidAt ? 'Pagada' : 'Sin pago confirmado'}. Total: {formatMxnCents(detail.totalCents)}</p>
        <ul>{detail.items.map((item, index) => <li key={index}>{item.quantity} × {item.productName} — {formatMxnCents(item.lineTotalCents)}</li>)}</ul>
      </section>}
    </section>
  </section>;
}
