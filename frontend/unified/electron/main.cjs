'use strict';

const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');
const path = require('node:path');
const { decideNavigation, resolveTerminalUrl } = require('./security.cjs');

const APP_TITLE = 'Cafetería Terminal';
const isMac = process.platform === 'darwin';

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let terminalUrl = null;

function handleNavigation(event, url) {
  const decision = decideNavigation(url, terminalUrl);

  if (decision.action === 'allow') return;

  event.preventDefault();

  if (decision.action === 'external' && decision.url) {
    void shell.openExternal(decision.url);
    return;
  }

  if (decision.action === 'redirect' && decision.url && mainWindow !== null) {
    void mainWindow.loadURL(decision.url).catch((error) => {
      dialog.showErrorBox(
        'No se pudo redirigir la terminal',
        `No fue posible cargar ${decision.url}.\n\n${String(error)}`,
      );
    });
  }
}

function buildMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: APP_TITLE,
            submenu: [
              { role: 'about', label: `Acerca de ${APP_TITLE}` },
              { type: 'separator' },
              { role: 'hide', label: `Ocultar ${APP_TITLE}` },
              { role: 'hideOthers', label: 'Ocultar otros' },
              { role: 'unhide', label: 'Mostrar todo' },
              { type: 'separator' },
              { role: 'quit', label: `Salir de ${APP_TITLE}` },
            ],
          },
        ]
      : []),
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar terminal' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        ...(isMac
          ? [{ role: 'front', label: 'Traer al frente' }]
          : [{ role: 'close', label: 'Cerrar' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: APP_TITLE,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Keep a stable title even if the remote SPA changes document.title.
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const window = mainWindow;

  window.webContents.on('will-navigate', handleNavigation);
  window.webContents.on('will-redirect', handleNavigation);

  // Subframes may only navigate inside the approved origin; external targets
  // are denied instead of handing them to the OS browser.
  window.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return;
    if (decideNavigation(event.url, terminalUrl).action === 'allow') return;
    event.preventDefault();
  });

  // External http(s) links go to the OS browser; any new Electron window is denied.
  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideNavigation(url, terminalUrl);
    if (decision.action === 'external' && decision.url) {
      void shell.openExternal(decision.url);
    }
    return { action: 'deny' };
  });

  // The wrapper never embeds webviews.
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  void window.loadURL(terminalUrl).catch((error) => {
    window.show();
    dialog.showErrorBox(
      'No se pudo cargar la terminal',
      `No fue posible cargar ${terminalUrl}.\n\n${String(error)}`,
    );
  });

  window.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    terminalUrl = resolveTerminalUrl({ env: process.env, isPackaged: app.isPackaged });
  } catch (error) {
    dialog.showErrorBox(
      'Configuración de terminal inválida',
      `${error instanceof Error ? error.message : String(error)}\n\nLa aplicación no admite file:// ni modo offline.`,
    );
    app.quit();
    return;
  }

  // The wrapper needs no Chromium permissions (no camera, notifications, etc.).
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
