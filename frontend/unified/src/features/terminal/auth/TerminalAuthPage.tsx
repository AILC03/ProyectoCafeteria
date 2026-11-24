import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession, useSessionManager } from '../../../shared/auth/SessionProvider';
import { staffDestination } from './staffAccess';
import {
  formatStaffAuthError,
  isValidStaffPassword,
  isValidStaffUsername,
  normalizeStaffUsername,
} from './staffAuthValidation';

/** Staff-only terminal login. No guest access, no local credentials and no payment flow. */
export function TerminalAuthPage() {
  const session = useSession();
  const manager = useSessionManager();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (session.status === 'loading') {
    return (
      <section className="terminal-auth" aria-labelledby="page-title" aria-live="polite">
        <h1 id="page-title">Acceso a terminal</h1>
        <p>Comprobando sesión…</p>
      </section>
    );
  }

  async function handleSwitchActor(): Promise<void> {
    setSwitching(true);
    setFormError(null);
    const replaced = await manager.replaceActor('terminal');
    setSwitching(false);
    if (replaced) {
      navigate('/terminal/acceso');
    } else {
      setFormError('No fue posible cerrar la sesión actual. Inténtalo de nuevo.');
    }
  }

  if (session.status === 'authenticated') {
    return (
      <section className="terminal-auth" aria-labelledby="page-title">
        <h1 id="page-title">Acceso a terminal</h1>
        <div className="auth-card">
          <h2>Sesión de personal activa</h2>
          <p>
            Has iniciado sesión como <strong>{session.actor.name}</strong> ({session.actor.role}).
          </p>
          {formError !== null && <p role="alert" className="form-alert">{formError}</p>}
          <div className="auth-actions">
            <Link to={staffDestination(session.actor.role)}>Continuar en la terminal</Link>
            <button type="button" disabled={switching} onClick={() => { void handleSwitchActor(); }}>
              {switching ? 'Cerrando sesión…' : 'Cambiar de usuario'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedUsername = normalizeStaffUsername(username);

    if (!isValidStaffUsername(normalizedUsername)) {
      setFormError('Introduce un usuario válido de hasta 24 caracteres.');
      return;
    }
    if (!isValidStaffPassword(password)) {
      setFormError('La contraseña debe tener entre 8 y 24 caracteres.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const nextState = await manager.loginStaff({ username: normalizedUsername, password });
      if (nextState.status === 'authenticated') {
        navigate(staffDestination(nextState.actor.role));
      }
      // A pin-change-required state is restricted globally by PinChangeGate.
    } catch (error) {
      setFormError(formatStaffAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="terminal-auth" aria-labelledby="page-title">
      <h1 id="page-title">Acceso a terminal</h1>

      {session.status === 'recoverable-error' && (
        <div className="auth-card" role="status">
          <p>No fue posible comprobar tu sesión anterior.</p>
          <button type="button" className="secondary-button" onClick={() => { void manager.bootstrap(); }}>
            Reintentar verificación
          </button>
        </div>
      )}

      <div className="auth-card">
        <h2>Acceso con cuenta de personal</h2>
        <p>Ingresa con tu usuario y contraseña asignados por la cafetería.</p>

        <form onSubmit={(event) => { void handleLoginSubmit(event); }} noValidate className="auth-form">
          <div className="form-field">
            <label htmlFor="staff-username">Usuario</label>
            <input
              id="staff-username"
              name="username"
              type="text"
              autoComplete="username"
              maxLength={24}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="staff-password">Contraseña</label>
            <input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={24}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
            />
          </div>

          {formError !== null && (
            <p role="alert" className="form-alert">
              {formError}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Ingresando…' : 'Iniciar sesión como personal'}
          </button>
        </form>

        <div className="auth-actions">
          <Link to="/terminal">Volver al inicio de terminal</Link>
        </div>
      </div>
    </section>
  );
}
