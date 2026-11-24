import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Actor, ActorDestination } from './session';

export function ActorChangeDialog({
  actor,
  destination,
  onCancel,
  onConfirm,
}: {
  actor: Actor;
  destination: ActorDestination;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = destination === 'client' ? 'el inicio de sesión de cliente' : 'la terminal';

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !submitting) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (focusable === undefined || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function confirm(): Promise<void> {
    setSubmitting(true);
    setError(null);
    const replaced = await onConfirm();
    if (!replaced) {
      setError('No fue posible cerrar la sesión actual. Inténtalo de nuevo antes de cambiar de área.');
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="actor-change-title" aria-describedby="actor-change-description" onKeyDown={handleKeyDown}>
        <h2 id="actor-change-title">Cambiar de sesión</h2>
        <p id="actor-change-description">Se cerrará la sesión de {actor.name} para abrir {area}.</p>
        {error !== null && <p role="alert">{error}</p>}
        <div className="auth-dialog-actions">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={submitting}>Cancelar</button>
          <button type="button" onClick={() => { void confirm(); }} disabled={submitting}>{submitting ? 'Cerrando sesión…' : 'Cerrar sesión y continuar'}</button>
        </div>
      </section>
    </div>
  );
}
