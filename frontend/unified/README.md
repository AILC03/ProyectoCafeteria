# Frontend unificado

El servidor de desarrollo se limita a `localhost` por defecto y escucha en el puerto `5173`.

## Requisitos

- Node.js `>=22.13.0 <23`.

Se recomienda usar la versión fijada en `.nvmrc`: ejecuta `nvm use` si ya está instalada o
`nvm install` para instalarla.

## Proxy de API local

Las siguientes variables Vite no contienen secretos y son opcionales. Defínelas en un archivo
`.env.local` no versionado cuando necesites cambiar la integración local:

```dotenv
VITE_API_PROXY_TARGET=http://localhost:3000
VITE_API_PROXY_ORIGIN=http://localhost:5173
VITE_API_PROXY_REFERER=http://localhost:5173/
```

Si no se definen, esos valores locales seguros son los predeterminados. No versionar archivos
`.env` con configuraciones específicas del entorno.

## Pruebas

- `npm run test`: ejecuta todas las pruebas unitarias (`*.unit.test.ts(x)`) y de componentes
  (`*.component.test.tsx`).
- `npm run test:unit`: descubre únicamente pruebas `*.unit.test.ts(x)`.
- `npm run test:components`: descubre únicamente pruebas `*.component.test.tsx` con Vitest,
  jsdom y React Testing Library.
- `npm run test:coverage`: cobertura V8 sin umbrales configurados.
- `npm run test:e2e`: Playwright para pruebas ubicadas en `e2e/` con Chromium y Electron. No instala navegadores.

El servidor MSW de pruebas se inicia sin handlers y falla ante solicitudes no gestionadas, por lo
que las pruebas no llaman a la API real de forma predeterminada.

## Escritorio Electron (terminal)

El contenedor de escritorio vive en `electron/` y carga siempre una URL HTTP(S) remota que apunta a
`/terminal`. No usa `file://`, no empaqueta el SPA como respaldo y no admite modo offline.

### Desarrollo

```powershell
# Terminal 1
npm run dev

# Terminal 2
npm run electron:dev
```

Sin configuración adicional usa `http://localhost:5173/terminal`. Para apuntar a otro origen en
desarrollo define `FRONTEND_ORIGIN` (se normaliza a `/terminal`) o `CAFETERIA_TERMINAL_URL` (debe
terminar en `/terminal`):

```powershell
$env:FRONTEND_ORIGIN = 'http://localhost:5173'
npm run electron:dev
```

### Producción

La app empaquetada exige `FRONTEND_ORIGIN` o `CAFETERIA_TERMINAL_URL`, y la URL debe ser `https:`.
El host debe servir la SPA con fallback History API para `/terminal/**`, permitir ese origen en el
backend (incluido `FRONTEND_ORIGIN` para cookies/CSRF) y mantener HTTPS. Si falta la configuración
o no es válida, la aplicación muestra un error y se cierra: no hay respaldo local.

La navegación queda limitada al mismo origen. Los enlaces externos `http(s)` se abren en el
navegador del sistema y cualquier otro esquema (`file:`, `javascript:`, etc.) se deniega. Las rutas
`/cliente/**` se bloquean tanto en el proceso principal como en el router de la SPA mediante el
indicador no sensible `window.cafeteriaDesktop.terminalOnly` expuesto por el preload. Se conservan
`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` y `webSecurity: true`.

### Empaquetado

```powershell
npm run dist:win
```

Genera `portable` y `nsis` x64 sin firma en `release/` (ignorado por Git). La configuración macOS
(`dmg`/`zip`, `identity: null`) está en `package.json`, pero solo puede construirse en macOS; no es
construible desde Windows. El `app.asar` incluye únicamente `electron/main.cjs`,
`electron/preload.cjs`, `electron/security.cjs` y `package.json`: no contiene `node_modules`,
`dist/`, pruebas ni ningún fallback local.

La suite `npm run test:e2e` ejecuta las pruebas Chromium existentes y las de Electron:
`e2e/electron.spec.ts` arranca Electron contra el servidor Vite de Playwright y verifica URL,
aislamiento, indicador de escritorio y bloqueo del área cliente. Requiere el binario de Electron
descargado por `npm install`.

## Coordinación de refresh

`SessionProvider` coordina `POST /auth/refresh` por perfil exclusivamente con Web Locks. Si el
navegador no ofrece esa API, no intenta el refresh automático y expone un error recuperable para
que un flujo de sesión posterior decida cómo continuar. No se usa `localStorage` como lock.
`BroadcastChannel` difunde únicamente el evento fijo `refresh-complete`; cada contexto vuelve a
consultar `/auth/me` con sus cookies HttpOnly.
