import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionProvider } from './SessionProvider';
import { RefreshCoordinator, SessionManager } from './session';
import { ActorChangeDialog } from './ActorChangeDialog';
import { server } from '../../test/server';

const user = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
const originalLocks = (navigator as Navigator & { locks?: unknown }).locks;

function setLocks(locks: unknown): void {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
}

afterEach(() => {
  setLocks(originalLocks);
  vi.unstubAllGlobals();
});

it('traps focus, closes on Escape, and restores the invoking focus for actor replacement', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const cancel = vi.fn();
  const actor = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
  const { unmount } = render(<ActorChangeDialog actor={actor} destination="terminal" onCancel={cancel} onConfirm={async () => false} />);
  const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
  const confirmButton = screen.getByRole('button', { name: 'Cerrar sesión y continuar' });
  expect(cancelButton).toHaveFocus();
  confirmButton.focus();
  fireEvent.keyDown(confirmButton, { key: 'Tab' });
  expect(cancelButton).toHaveFocus();
  fireEvent.keyDown(cancelButton, { key: 'Escape' });
  expect(cancel).toHaveBeenCalledOnce();
  unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it('keeps refresh coordination usable after the StrictMode effect remount', async () => {
  let closed = false;
  let requiresRefresh = false;
  let refreshes = 0;
  class TestBroadcastChannel {
    constructor(_name: string) {}
    addEventListener(): void {}
    removeEventListener(): void {}
    postMessage(): void {
      if (closed) throw new DOMException('closed', 'InvalidStateError');
    }
    close(): void { closed = true; }
  }
  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
  setLocks({ request: <T,>(_name: string, _options: unknown, callback: () => Promise<T>) => callback() });
  server.use(
    http.get('/api/v1/auth/me', () => requiresRefresh
      ? HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })
      : HttpResponse.json({ data: user })),
    http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'initial' } })),
    http.post('/api/v1/auth/refresh', () => {
      refreshes += 1;
      return HttpResponse.json({ data: { user, csrfToken: 'refreshed' } });
    }),
  );
  const manager = new SessionManager(new RefreshCoordinator('strict-mode-test'));
  const { unmount } = render(<StrictMode><SessionProvider manager={manager}><p>content</p></SessionProvider></StrictMode>);
  await waitFor(() => expect(manager.getSnapshot().status).toBe('authenticated'));
  requiresRefresh = true;
  await expect(manager.refresh()).resolves.toEqual({ status: 'authenticated', actor: user });
  expect(refreshes).toBe(1);
  expect(closed).toBe(false);
  unmount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(closed).toBe(true);
});
