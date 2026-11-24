import { Link, type LinkProps } from 'react-router-dom';
import { useActorChange, useSession } from './SessionProvider';
import type { ActorDestination } from './session';

function isCompatible(destination: ActorDestination, actor: NonNullable<ReturnType<typeof useSession>['actor']>): boolean {
  return destination === 'client'
    ? actor.accountType === 'CUSTOMER' && actor.role === 'CLIENTE'
    : actor.accountType === 'STAFF';
}

/** Prevents cross-area navigation from showing a different actor's UI. */
export function ActorAreaLink({ destination, onClick, ...props }: LinkProps & { destination: ActorDestination }) {
  const session = useSession();
  const requestActorChange = useActorChange();
  return <Link {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || session.status !== 'authenticated' || isCompatible(destination, session.actor)) return;
    event.preventDefault();
    requestActorChange(destination);
  }} />;
}
