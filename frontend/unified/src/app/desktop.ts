export interface CafeteriaDesktopBridge {
  readonly terminalOnly: true;
}

declare global {
  interface Window {
    cafeteriaDesktop?: CafeteriaDesktopBridge;
  }
}

/**
 * Detects the non-sensitive bridge exposed by the Electron preload. The web
 * build never defines it, so browsers keep both areas available.
 */
export function isDesktopTerminalOnly(): boolean {
  return typeof window !== 'undefined' && window.cafeteriaDesktop?.terminalOnly === true;
}
