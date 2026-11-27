import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../shared/auth/SessionProvider';
import { staffHomeLinks } from './staffAccess';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

function formatWelcomeClock(now: Date): { dateText: string; timeText: string } {
  const dateText = `${DAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const rawHours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = rawHours >= 12 ? 'PM' : 'AM';
  const hours = String(rawHours % 12 || 12).padStart(2, '0');
  return { dateText, timeText: `${hours}:${minutes} ${ampm}` };
}

/** Public terminal entry: explains the area and routes staff to login or their allowed screens. */
export function TerminalWelcomePage() {
  const session = useSession();
  const [clock, setClock] = useState(() => formatWelcomeClock(new Date()));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(formatWelcomeClock(new Date()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section id="screen-welcome" className="terminal-auth" aria-labelledby="page-title">
      <div className="welcome-left">
        <div className="welcome-title-wrap">
          <h1 id="page-title" className="welcome-app-name">Terminal</h1>
          <p className="welcome-subtitle">Coffee´s Pos • Toma de Órdenes</p>
        </div>

        {session.status === 'loading' && (
          <p className="welcome-status-note" aria-live="polite">Comprobando sesión…</p>
        )}

        {session.status === 'authenticated' && (
          <>
            <p className="welcome-status-note" role="status">
              Sesión activa: {session.actor.name} ({session.actor.role}).
            </p>
            <nav className="welcome-staff-nav" aria-label="Accesos de terminal">
              <ul className="welcome-staff-links">
                {staffHomeLinks(session.actor.role).map(({ label, to }) => (
                  <li key={to}>
                    <Link className="welcome-staff-link" to={to}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}

        {session.status !== 'authenticated' && session.status !== 'loading' && (
          <>
            <p className="welcome-description">
              El acceso a la terminal está reservado al personal de la cafetería.
            </p>
            {session.status === 'recoverable-error' && (
              <p className="welcome-status-note" role="status">
                No fue posible comprobar tu sesión anterior. Puedes intentar acceder de nuevo.
              </p>
            )}
            <div className="auth-actions">
              <Link id="btn-start" className="btn-empezar" to="/terminal/acceso">Empezar</Link>
            </div>
          </>
        )}
      </div>

      <div className="welcome-right theme-nordic" id="welcome-right-panel">
        <div className="welcome-clock-box">
          <div className="welcome-date-text" id="live-date">{clock.dateText}</div>
          <div className="welcome-time-text" id="live-time">{clock.timeText}</div>
        </div>
      </div>
    </section>
  );
}
