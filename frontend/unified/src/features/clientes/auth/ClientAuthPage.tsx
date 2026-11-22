import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useActorChange, useSession, useSessionManager, type Actor } from '../../../shared/auth/SessionProvider';
import { PinInput } from './PinInput';
import {
  formatCustomerAuthError,
  isValidCustomerIdentifier,
  isValidCustomerPin,
  normalizeCustomerIdentifier,
} from './customerAuthValidation';
import { enterGuestSession, exitGuestMode, useGuestSession } from './guestSession';

function ActiveSessionPanel({
  actor,
  guestNameInput,
  onGuestNameChange,
  onSwitchedToGuest,
}: {
  actor: Actor;
  guestNameInput: string;
  onGuestNameChange: (value: string) => void;
  onSwitchedToGuest: () => void;
}) {
  const manager = useSessionManager();
  const requestActorChange = useActorChange();
  const [confirmGuestSwitch, setConfirmGuestSwitch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isStaff = actor.accountType === 'STAFF';

  async function handleLogoutOnly(): Promise<void> {
    setBusy(true);
    setActionError(null);
    const closed = isStaff ? await manager.replaceActor('client') : await manager.logout();
    setBusy(false);
    if (!closed) {
      setActionError('No fue posible cerrar la sesión actual. Inténtalo de nuevo.');
    }
  }

  async function handleConfirmGuestSwitch(): Promise<void> {
    setBusy(true);
    setActionError(null);
    const closed = isStaff ? await manager.replaceActor('client') : await manager.logout();
    setBusy(false);
    if (!closed) {
      setActionError('No fue posible cerrar la sesión actual antes de entrar como invitado. Inténtalo de nuevo.');
      return;
    }
    enterGuestSession(guestNameInput);
    onSwitchedToGuest();
  }

  return (
    <div className="auth-card">
      {isStaff ? (
        <>
          <h2>Sesión de personal activa</h2>
          <p>
            Tienes una sesión activa como <strong>{actor.name}</strong> ({actor.role}). Para iniciar sesión como cliente o entrar como invitado debes cerrar primero la sesión actual.
          </p>
        </>
      ) : (
        <>
          <h2>Sesión de cliente activa</h2>
          <p>
            Has iniciado sesión como <strong>{actor.name}</strong>.
          </p>
          <div className="auth-actions">
            <Link to="/cliente/menu">Ir al menú</Link>
            <Link to="/cliente/cuenta">Mi cuenta</Link>
          </div>
        </>
      )}

      {actionError !== null && <p role="alert" className="form-alert">{actionError}</p>}

      <div className="auth-actions">
        <button type="button" onClick={() => requestActorChange('client')} disabled={busy}>
          {isStaff ? 'Cambiar a área de cliente' : 'Cambiar de cuenta'}
        </button>
        {!isStaff && (
          <button type="button" className="secondary-button" onClick={() => { void handleLogoutOnly(); }} disabled={busy}>
            {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        )}
        {!confirmGuestSwitch && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setActionError(null);
              setConfirmGuestSwitch(true);
            }}
            disabled={busy}
          >
            Continuar como invitado
          </button>
        )}
      </div>

      {confirmGuestSwitch && (
        <section className="auth-confirm-box" aria-labelledby="confirm-guest-switch-title">
          <h3 id="confirm-guest-switch-title">Confirmar salida de sesión</h3>
          <p>Se cerrará la sesión de {actor.name} antes de continuar como invitado.</p>
          <div className="form-field">
            <label htmlFor="active-guest-name">Nombre para tu pedido (opcional)</label>
            <input
              id="active-guest-name"
              type="text"
              maxLength={60}
              value={guestNameInput}
              onChange={(event) => onGuestNameChange(event.target.value)}
              placeholder="Ej. Ana"
              disabled={busy}
            />
          </div>
          <div className="auth-actions">
            <button type="button" className="secondary-button" onClick={() => setConfirmGuestSwitch(false)} disabled={busy}>
              Cancelar
            </button>
            <button type="button" onClick={() => { void handleConfirmGuestSwitch(); }} disabled={busy}>
              {busy ? 'Cerrando sesión…' : 'Confirmar cierre y continuar como invitado'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Client area entry supporting CUSTOMER login and explicit in-memory guest access. */
export function ClientAuthPage() {
  const session = useSession();
  const manager = useSessionManager();
  const guest = useGuestSession();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [guestNameInput, setGuestNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (session.status === 'loading') {
    return (
      <section className="client-auth" aria-labelledby="page-title" aria-live="polite">
        <h1 id="page-title">Iniciar sesión</h1>
        <p>Comprobando sesión…</p>
      </section>
    );
  }

  if (session.status === 'authenticated') {
    return (
      <section className="client-auth" aria-labelledby="page-title">
        <h1 id="page-title">Iniciar sesión</h1>
        <ActiveSessionPanel
          actor={session.actor}
          guestNameInput={guestNameInput}
          onGuestNameChange={setGuestNameInput}
          onSwitchedToGuest={() => navigate('/cliente/menu')}
        />
      </section>
    );
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedIdentifier = normalizeCustomerIdentifier(identifier);

    if (!isValidCustomerIdentifier(normalizedIdentifier)) {
      setFormError('Introduce un celular válido de 10 dígitos (ej. 5512345678) o un número de cliente (ej. C000105).');
      return;
    }
    if (!isValidCustomerPin(pin)) {
      setFormError('El NIP debe tener exactamente 4 dígitos numéricos.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const nextState = await manager.loginCustomer({ identifier: normalizedIdentifier, pin });
      if (nextState.status === 'authenticated') {
        navigate('/cliente/menu');
      }
    } catch (error) {
      setFormError(formatCustomerAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  function handleEnterGuest(): void {
    enterGuestSession(guestNameInput);
    navigate('/cliente/menu');
  }

  function handleExitGuest(): void {
    exitGuestMode();
  }

  return (
    <section className="client-auth" aria-labelledby="page-title">
      <h1 id="page-title">Iniciar sesión</h1>

      {session.status === 'recoverable-error' && (
        <div className="auth-card" role="status">
          <p>No fue posible comprobar tu sesión anterior.</p>
          <button type="button" className="secondary-button" onClick={() => { void manager.bootstrap(); }}>
            Reintentar verificación
          </button>
        </div>
      )}

      {guest.isGuest && (
        <div className="auth-card" role="status">
          <p>Modo invitado activo ({guest.guestName}).</p>
          <div className="auth-actions">
            <Link to="/cliente/menu">Ir al menú</Link>
            <button type="button" className="secondary-button" onClick={handleExitGuest}>
              Salir de invitado
            </button>
          </div>
        </div>
      )}

      <div className="client-auth-grid">
        <article className="auth-card" aria-labelledby="customer-login-heading">
          <h2 id="customer-login-heading">Acceso con cuenta de cliente</h2>
           <p>Ingresa con tu teléfono registrado o tu número de cliente y tu NIP de 4 dígitos.</p>
           <p><Link to="/cliente/registro-ticket">Alta con ticket pagado</Link></p>

          <form onSubmit={(event) => { void handleLoginSubmit(event); }} noValidate className="auth-form">
            <div className="form-field">
              <label htmlFor="customer-identifier">Teléfono o número de cliente</label>
              <input
                id="customer-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                maxLength={32}
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Ej. 5512345678 o C000105"
                aria-describedby="customer-identifier-hint"
                disabled={submitting}
              />
              <span id="customer-identifier-hint" className="field-hint">
                Celular de 10 dígitos (+52 opcional) o número de cliente (ej. C000105).
              </span>
            </div>

            <div className="form-field">
              <span id="customer-pin-label" className="field-label">NIP de 4 dígitos</span>
              <PinInput
                value={pin}
                onChange={setPin}
                disabled={submitting}
                describedBy="customer-pin-hint"
                labelledBy="customer-pin-label"
              />
              <span id="customer-pin-hint" className="field-hint">
                Ingresa los 4 dígitos secretos de tu cuenta.
              </span>
            </div>

            {formError !== null && (
              <p role="alert" className="form-alert">
                {formError}
              </p>
            )}

            <button type="submit" disabled={submitting}>
              {submitting ? 'Ingresando…' : 'Iniciar sesión como cliente'}
            </button>
          </form>
        </article>

        <article className="auth-card" aria-labelledby="guest-access-heading">
          <h2 id="guest-access-heading">Acceso como invitado</h2>
          <p>
            Consulta el menú e inicia un pedido sin crear cuenta. Este modo vive únicamente en memoria y no da acceso a perfil, favoritos ni historial.
          </p>

          <div className="auth-form">
            <div className="form-field">
              <label htmlFor="guest-name">Nombre para tu pedido (opcional)</label>
              <input
                id="guest-name"
                name="guestName"
                type="text"
                maxLength={60}
                value={guestNameInput}
                onChange={(event) => setGuestNameInput(event.target.value)}
                placeholder="Ej. Ana"
                disabled={submitting}
              />
            </div>

            <button type="button" className="secondary-button" onClick={handleEnterGuest} disabled={submitting}>
              Continuar como invitado
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
