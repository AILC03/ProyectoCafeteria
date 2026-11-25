import { useSession } from '../../../shared/auth/SessionProvider';
import { isDesktopTerminalOnly } from '../../../app/desktop';

const ROLE_LABELS: Record<string, string> = {
  CAJERO: 'Cajero',
  PREPARACION: 'Preparación',
  ADMINISTRADOR: 'Administrador',
};

export function SessionSettings() {
  const session = useSession();
  if (session.status !== 'authenticated') {
    return <p role="status">La sesión no está disponible.</p>;
  }
  const actor = session.actor;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

  return (
    <section aria-labelledby="admin-settings-title" className="admin-settings">
      <h2 id="admin-settings-title">Configuración de sesión</h2>
      <p>
        Datos de la sesión resueltos por la API. Esta vista no cambia contraseña, NIP ni permisos.
        Para salir usa «Cerrar sesión» en la cabecera de la terminal.
      </p>
      <dl className="dashboard-cash">
        <div>
          <dt>Nombre</dt>
          <dd>{actor.name}</dd>
        </div>
        <div>
          <dt>Usuario</dt>
          <dd>{actor.username ?? 'No disponible'}</dd>
        </div>
        <div>
          <dt>Rol</dt>
          <dd>{ROLE_LABELS[actor.role] ?? actor.role}</dd>
        </div>
        <div>
          <dt>Tipo de cuenta</dt>
          <dd>{actor.accountType === 'STAFF' ? 'Personal' : 'Cliente'}</dd>
        </div>
        <div>
          <dt>Entorno</dt>
          <dd>{isDesktopTerminalOnly() ? 'Electron (terminal)' : 'Navegador'}</dd>
        </div>
        <div>
          <dt>API</dt>
          <dd>{apiBase}</dd>
        </div>
      </dl>
    </section>
  );
}
