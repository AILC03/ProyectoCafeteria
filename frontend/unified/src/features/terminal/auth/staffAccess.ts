/** Roles accepted by the unified terminal. GERENTE is a legacy frontend-only role. */
export const TERMINAL_ROLES = ['CAJERO', 'PREPARACION', 'ADMINISTRADOR'] as const;

export type TerminalRole = (typeof TERMINAL_ROLES)[number];

export function isTerminalRole(role: string): role is TerminalRole {
  return (TERMINAL_ROLES as readonly string[]).includes(role);
}

/** Landing destination after a successful staff login. */
export function staffDestination(role: string): string {
  if (!isTerminalRole(role)) return '/terminal';
  return role === 'PREPARACION' ? '/terminal/cocina' : '/terminal/pos';
}

/** Shortcuts shown to an already authenticated staff member, limited to allowed routes. */
export function staffHomeLinks(role: string): { label: string; to: string }[] {
  if (!isTerminalRole(role)) return [];
  if (role === 'PREPARACION') return [{ label: 'Cocina', to: '/terminal/cocina' }];
  const links = [{ label: 'Punto de venta', to: '/terminal/pos' }, { label: 'Cocina', to: '/terminal/cocina' }];
  if (role === 'ADMINISTRADOR') {
    links.push({ label: 'Caja', to: '/terminal/caja' }, { label: 'Administración', to: '/terminal/administracion' });
  } else {
    links.push({ label: 'Caja', to: '/terminal/caja' });
  }
  return links;
}
