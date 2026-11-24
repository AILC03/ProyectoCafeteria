import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEV_TERMINAL_URL,
  decideNavigation,
  resolveTerminalUrl,
} from './security.cjs';

describe('resolveTerminalUrl', () => {
  it('uses the Vite development URL when nothing is configured and the app is not packaged', () => {
    expect(resolveTerminalUrl({ env: {}, isPackaged: false })).toBe(DEFAULT_DEV_TERMINAL_URL);
    expect(DEFAULT_DEV_TERMINAL_URL).toBe('http://localhost:5173/terminal');
  });

  it('accepts FRONTEND_ORIGIN and always targets /terminal', () => {
    expect(
      resolveTerminalUrl({ env: { FRONTEND_ORIGIN: 'http://localhost:5173' }, isPackaged: false }),
    ).toBe('http://localhost:5173/terminal');
    expect(
      resolveTerminalUrl({
        env: { FRONTEND_ORIGIN: 'https://pos.example.com/some/path?x=1#hash' },
        isPackaged: true,
      }),
    ).toBe('https://pos.example.com/terminal');
  });

  it('accepts a full terminal URL and strips query and hash', () => {
    expect(
      resolveTerminalUrl({
        env: { CAFETERIA_TERMINAL_URL: 'https://pos.example.com/terminal/?token=ignored#x' },
        isPackaged: true,
      }),
    ).toBe('https://pos.example.com/terminal');
  });

  it('prefers CAFETERIA_TERMINAL_URL over FRONTEND_ORIGIN', () => {
    expect(
      resolveTerminalUrl({
        env: {
          CAFETERIA_TERMINAL_URL: 'https://other.example.com/terminal',
          FRONTEND_ORIGIN: 'https://pos.example.com',
        },
        isPackaged: true,
      }),
    ).toBe('https://other.example.com/terminal');
  });

  it('requires an explicit URL in packaged builds', () => {
    expect(() => resolveTerminalUrl({ env: {}, isPackaged: true })).toThrow(
      /FRONTEND_ORIGIN|CAFETERIA_TERMINAL_URL/,
    );
  });

  it('rejects HTTP in packaged builds and accepts HTTPS', () => {
    expect(() =>
      resolveTerminalUrl({ env: { FRONTEND_ORIGIN: 'http://pos.example.com' }, isPackaged: true }),
    ).toThrow(/HTTPS/);
  });

  it.each([
    'file:///C:/app/dist/index.html',
    'javascript:alert(1)',
    'ftp://pos.example.com/terminal',
    'not-a-url',
    'https://pos.example.com/otra-ruta',
    'https://user:secret@pos.example.com/terminal',
  ])('rejects prohibited or malformed configuration %s', (value) => {
    expect(() =>
      resolveTerminalUrl({ env: { CAFETERIA_TERMINAL_URL: value }, isPackaged: false }),
    ).toThrow();
  });

  it.each([
    'file://pos.example.com/terminal',
    'javascript:alert(1)',
    'ftp://pos.example.com',
  ])('rejects prohibited FRONTEND_ORIGIN %s', (value) => {
    expect(() => resolveTerminalUrl({ env: { FRONTEND_ORIGIN: value }, isPackaged: false })).toThrow();
  });

  it('treats blank configuration as absent in development', () => {
    expect(resolveTerminalUrl({ env: { FRONTEND_ORIGIN: '   ' }, isPackaged: false })).toBe(
      DEFAULT_DEV_TERMINAL_URL,
    );
  });
});

describe('decideNavigation', () => {
  const terminalUrl = 'http://localhost:5173/terminal';

  it('allows same-origin terminal navigation', () => {
    expect(decideNavigation('http://localhost:5173/terminal/pos', terminalUrl)).toEqual({
      action: 'allow',
    });
  });

  it('redirects client routes to /terminal', () => {
    expect(decideNavigation('http://localhost:5173/cliente', terminalUrl)).toEqual({
      action: 'redirect',
      url: 'http://localhost:5173/terminal',
    });
    expect(decideNavigation('http://localhost:5173/cliente/menu', terminalUrl)).toEqual({
      action: 'redirect',
      url: 'http://localhost:5173/terminal',
    });
  });

  it('does not treat lookalike client paths as client routes', () => {
    expect(decideNavigation('http://localhost:5173/clientes', terminalUrl)).toEqual({
      action: 'allow',
    });
  });

  it('opens other http(s) origins in the system browser', () => {
    expect(decideNavigation('https://example.com/help', terminalUrl)).toEqual({
      action: 'external',
      url: 'https://example.com/help',
    });
    expect(decideNavigation('http://localhost:5174/terminal', terminalUrl)).toEqual({
      action: 'external',
      url: 'http://localhost:5174/terminal',
    });
  });

  it.each(['file:///C:/app/index.html', 'javascript:alert(1)', 'mailto:staff@example.com'])(
    'denies non-HTTP navigation %s',
    (url) => {
      expect(decideNavigation(url, terminalUrl)).toEqual({ action: 'deny' });
    },
  );

  it('denies a malformed allowed URL', () => {
    expect(decideNavigation('http://localhost:5173/terminal', 'file:///C:/app')).toEqual({
      action: 'deny',
    });
  });

  it('resolves relative URLs against the allowed terminal URL', () => {
    expect(decideNavigation('/terminal/acceso', terminalUrl)).toEqual({ action: 'allow' });
    expect(decideNavigation('/cliente/menu', terminalUrl)).toEqual({
      action: 'redirect',
      url: 'http://localhost:5173/terminal',
    });
  });
});
