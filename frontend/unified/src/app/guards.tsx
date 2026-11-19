import { Outlet } from 'react-router-dom';

/**
 * Placeholder only: TASK-05 will decide client access from the API session.
 * This guard intentionally does not infer access from local state or storage.
 */
export function ClientAccessGuard() {
  return <Outlet />;
}

/**
 * Placeholder only: TASK-05 will decide terminal access from the API session.
 * This guard intentionally does not infer roles from local state or storage.
 */
export function TerminalAccessGuard() {
  return <Outlet />;
}
