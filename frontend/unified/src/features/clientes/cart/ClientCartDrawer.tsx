import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clientCartStore, useClientCart } from './clientCartStore';
import { ClientCart } from './ClientCart';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal drawer: side panel on desktop, full screen on mobile. */
export function ClientCartDrawer() {
  const { items, open, revision } = useClientCart();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const main = document.querySelector<HTMLElement>('.client-layout');
    const hadInert = main?.hasAttribute('inert') ?? false;
    main?.setAttribute('inert', '');
    main?.setAttribute('aria-hidden', 'true');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        clientCartStore.close();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (event.shiftKey) {
        if (active === first || active === null || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || active === null || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!hadInert) {
        main?.removeAttribute('inert');
        main?.removeAttribute('aria-hidden');
      }
      returnFocus.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const node = (
    <div
      className="client-cart-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) clientCartStore.close();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="client-cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-cart-drawer-title"
      >
        <header className="client-cart-drawer-header">
          <h2 id="client-cart-drawer-title">Tu carrito</h2>
          <button ref={closeRef} type="button" className="secondary-button" onClick={() => clientCartStore.close()}>
            Cerrar
          </button>
        </header>
        <div className="client-cart-drawer-body">
          <ClientCart
            items={items}
            onChange={clientCartStore.replaceItems}
            catalogRevision={revision}
            onLockChange={clientCartStore.setLocked}
            onContinueShopping={() => clientCartStore.close()}
          />
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
