'use strict';

/**
 * Pure helpers for the Electron wrapper. They are intentionally free of
 * Electron imports so they can be unit-tested under Vitest.
 */

const DEFAULT_DEV_TERMINAL_URL = 'http://localhost:5173/terminal';
const TERMINAL_PATH = '/terminal';
const CLIENT_PATH = '/cliente';

/** @param {unknown} value */
function readEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parse a value that must be an absolute http(s) URL.
 * @param {string} value
 * @returns {URL | null}
 */
function parseHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url;
}

/**
 * Build the terminal URL from an origin-style value, discarding any path.
 * @param {string} value
 * @returns {string | null}
 */
function terminalUrlFromOrigin(value) {
  const url = parseHttpUrl(value);
  if (url === null) return null;
  url.pathname = TERMINAL_PATH;
  url.search = '';
  url.hash = '';
  return url.toString();
}

/**
 * Resolve the URL loaded by the Electron window.
 *
 * Precedence: `CAFETERIA_TERMINAL_URL`, then `FRONTEND_ORIGIN`, then the
 * development default. Packaged builds require an explicit value and HTTPS;
 * they never fall back to a bundled SPA or `file://`.
 *
 * @param {{ env?: Record<string, string | undefined>, isPackaged?: boolean }} [options]
 * @returns {string}
 */
function resolveTerminalUrl({ env = process.env, isPackaged = false } = {}) {
  const configuredTerminalUrl = readEnv(env.CAFETERIA_TERMINAL_URL);
  const configuredOrigin = readEnv(env.FRONTEND_ORIGIN);

  let candidate;
  let fromOrigin = false;

  if (configuredTerminalUrl !== '') {
    candidate = configuredTerminalUrl;
  } else if (configuredOrigin !== '') {
    candidate = terminalUrlFromOrigin(configuredOrigin);
    fromOrigin = true;
    if (candidate === null) {
      throw new Error('FRONTEND_ORIGIN debe ser una URL HTTP(S) absoluta.');
    }
  } else if (isPackaged) {
    throw new Error(
      'La aplicación empaquetada requiere FRONTEND_ORIGIN o CAFETERIA_TERMINAL_URL con HTTPS.',
    );
  } else {
    candidate = DEFAULT_DEV_TERMINAL_URL;
  }

  const url = parseHttpUrl(candidate);
  if (url === null) {
    throw new Error(
      'La URL de la terminal debe ser una URL HTTP(S) absoluta; se prohíben file:// y otros esquemas.',
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('La URL de la terminal no debe incluir credenciales.');
  }

  if (!fromOrigin) {
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (url.pathname !== TERMINAL_PATH) {
      throw new Error('La URL de la terminal debe apuntar a la ruta /terminal.');
    }
    url.pathname = TERMINAL_PATH;
  }

  if (isPackaged && url.protocol !== 'https:') {
    throw new Error('La aplicación empaquetada exige una URL HTTPS.');
  }

  url.search = '';
  url.hash = '';
  return url.toString();
}

/**
 * Decide what to do with a navigation attempt.
 *
 * - Same-origin requests are allowed, except `/cliente/**`, which is sent back
 *   to `/terminal`.
 * - Other http(s) URLs open in the OS browser.
 * - Everything else (file:, javascript:, mailto:, malformed values) is denied.
 *
 * @param {string} rawUrl
 * @param {string} terminalUrl
 * @returns {{ action: 'allow' } | { action: 'external' | 'redirect' | 'deny', url?: string }}
 */
function decideNavigation(rawUrl, terminalUrl) {
  if (typeof rawUrl !== 'string') return { action: 'deny' };
  const allowed = parseHttpUrl(terminalUrl);
  if (allowed === null) return { action: 'deny' };

  let target;
  try {
    target = new URL(rawUrl, allowed);
  } catch {
    return { action: 'deny' };
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { action: 'deny' };
  }

  if (target.origin !== allowed.origin) {
    return { action: 'external', url: target.toString() };
  }

  if (
    target.pathname === CLIENT_PATH ||
    target.pathname.startsWith(`${CLIENT_PATH}/`)
  ) {
    return { action: 'redirect', url: `${allowed.origin}${TERMINAL_PATH}` };
  }

  return { action: 'allow' };
}

module.exports = {
  DEFAULT_DEV_TERMINAL_URL,
  TERMINAL_PATH,
  decideNavigation,
  resolveTerminalUrl,
};
