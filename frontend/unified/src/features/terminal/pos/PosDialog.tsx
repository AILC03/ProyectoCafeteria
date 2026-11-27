import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type PosDialogProps = {
  titleId: string;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/** Accessible modal shell for POS dialogs: focus trap, Escape and backdrop close. */
export function PosDialog({ titleId, title, description, onClose, children, className }: PosDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialFocus = dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])')
      ?? dialogRef.current;
    initialFocus?.focus();

    const sessionContent = document.querySelector<HTMLElement>('.session-content');
    const appliedInert = sessionContent !== null && !sessionContent.hasAttribute('inert');
    if (appliedInert) {
      sessionContent.setAttribute('inert', '');
      sessionContent.setAttribute('aria-hidden', 'true');
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inside = active !== null && dialog.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first || active === dialog) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (appliedInert) {
        sessionContent.removeAttribute('inert');
        sessionContent.removeAttribute('aria-hidden');
      }
      previouslyFocused?.focus();
    };
  }, []);

  const node = (
    <div
      className="auth-dialog-backdrop pos-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={`auth-dialog catalog-dialog pos-dialog${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : `${titleId}-description`}
      >
        <div className="catalog-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description !== undefined && <p id={`${titleId}-description`} className="field-hint">{description}</p>}
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
        </div>
        {children}
      </section>
    </div>
  );

  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
