import { useSyncExternalStore } from 'react';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { clearPrivateState } from '../../../shared/storage';

export type GuestSessionState = {
  readonly isGuest: boolean;
  readonly guestName: string | null;
};

const INACTIVE_GUEST_SESSION: GuestSessionState = Object.freeze({ isGuest: false, guestName: null });
const MAX_GUEST_NAME_LENGTH = 60;

let guestState: GuestSessionState = INACTIVE_GUEST_SESSION;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

/** Normalizes an optional in-memory guest label without persisting it anywhere. */
export function normalizeGuestName(rawName?: string): string {
  const trimmed = rawName?.trim() ?? '';
  if (trimmed.length === 0) return 'Invitado';
  return trimmed.slice(0, MAX_GUEST_NAME_LENGTH);
}

/** Returns the current in-memory guest session snapshot. */
export function getGuestSessionSnapshot(): GuestSessionState {
  return guestState;
}

/** Subscribes a React store consumer to in-memory guest state updates. */
export function subscribeGuestSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Activates explicit guest browsing in memory only (no storage persistence). */
export function enterGuestSession(rawName?: string): GuestSessionState {
  guestState = Object.freeze({
    isGuest: true,
    guestName: normalizeGuestName(rawName),
  });
  notifyListeners();
  return guestState;
}

/** Clears the in-memory guest browsing state on logout, replacement, or login. */
export function clearGuestSession(): void {
  if (!guestState.isGuest && guestState.guestName === null) return;
  guestState = INACTIVE_GUEST_SESSION;
  notifyListeners();
}

/** Exits guest mode and clears actor-bound drafts and retry state. */
export function exitGuestMode(): void {
  clearPrivateState();
  clearIdempotencyOperations();
  clearGuestSession();
}

/** Reads the in-memory guest browsing state reactively. */
export function useGuestSession(): GuestSessionState {
  return useSyncExternalStore(subscribeGuestSession, getGuestSessionSnapshot, getGuestSessionSnapshot);
}
