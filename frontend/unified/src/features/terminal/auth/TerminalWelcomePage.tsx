import { Link } from 'react-router-dom';
import { useSession } from '../../../shared/auth/SessionProvider';
import { staffHomeLinks } from './staffAccess';

/** Public terminal entry: explains the area and routes staff to login or their allowed screens. */
export function TerminalWelcomePage() {
  const session = useSession();

  return (
    <section className="terminal-auth" aria-labelledby="page-title">
      <h1 id="page-title">Terminal</h1>

      {session.status === 'loading' && <p aria-live="polite">Comprobando sesión…</p>}

      {session.status === 'authenticated' && (
        <>
          <p role="status">Sesión activa: {session.actor.name} ({session.actor.role}).</p>
          <nav aria-label="Accesos de terminal">
            <ul>
              {staffHomeLinks(session.actor.role).map(({ label, to }) => (
                <li key={to}><Link to={to}>{label}</Link></li>
              ))}
            </ul>
          </nav>
        </>
      )}

      {session.status !== 'authenticated' && session.status !== 'loading' && (
        <>
          <p>El acceso a la terminal está reservado al personal de la cafetería.</p>
          {session.status === 'recoverable-error' && (
            <p role="status">No fue posible comprobar tu sesión anterior. Puedes intentar acceder de nuevo.</p>
          )}
          <div className="auth-actions">
            <Link to="/terminal/acceso">Empezar</Link>
          </div>
        </>
      )}
    </section>
  );
}
