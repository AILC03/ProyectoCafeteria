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

## Arranque local con backend

Se abren dos terminales: una para la API y otra para el frontend. El proxy de Vite espera la API
en `http://localhost:3000`; si usas otro puerto, define `VITE_API_PROXY_TARGET` como se explica
arriba y arranca el backend con el mismo `PORT`.

### Terminal 1 - backend (desde la raíz del repositorio)

```powershell
cd backend
npm.cmd install
```

Después elige **un** camino:

**A. PostgreSQL con Docker (recomendado en local):**

```powershell
npm.cmd run db:up          # genera .env.docker con puerto 55432 y credenciales aleatorias
```

`db:up` escribe `.env.docker` con `DATABASE_URL`, `SHADOW_DATABASE_URL` y `TEST_DATABASE_URL`
apuntando a `127.0.0.1:55432` y base `cafeteria`. Crea un `.env` local (nunca versionado) a partir
de `.env.example`, copia esas tres URLs desde `.env.docker` y conserva las claves de auth. Después:

```powershell
npm.cmd run db:prepare
npm.cmd run db:seed        # datos demo opcionales
npm.cmd run auth:setup     # solo si faltan AUTH_JWT_SECRET o AUTH_CSRF_SECRET
npm.cmd run dev
```

`db:prepare` y `auth:setup` leen `.env`, no `.env.docker`; por eso hay que copiar las URLs.

**B. PostgreSQL ya instalado (sin Docker):**

No ejecutes `db:up`. Crea `.env` desde `.env.example` y ajusta `DATABASE_URL` (y
`SHADOW_DATABASE_URL` si aplica) a tu instancia local. La base debe llamarse `cafeteria` o
`ProyectoCafeteria` y el host debe ser `localhost`, `127.0.0.1` o `[::1]`; `db:prepare` rechaza
otras combinaciones. Después ejecuta `db:prepare`, `db:seed` (opcional), `auth:setup` (si faltan
claves) y `dev`.

- `db:prepare` aplica las migraciones versionadas con `prisma migrate deploy`, sin `reset`, **solo
  en la base local**; no equivale a aprobación para bases del proyecto.
- `auth:setup` genera claves locales sin imprimirlas ni versionarlas. No subas `.env` ni
  `.env.docker` con secretos.
- Estado de la API: `http://localhost:3000/api/v1/health`.

### Terminal 2 - frontend (desde la raíz del repositorio)

```powershell
cd frontend/unified
npm.cmd install
npm.cmd run dev
```

- Cliente: `http://localhost:5173/cliente/menu`
- Terminal: `http://localhost:5173/terminal`

Para más detalle del backend, consulta [backend/README.md](../../backend/README.md).

## Pruebas

- `npm run test`: ejecuta todas las pruebas unitarias (`*.unit.test.ts(x)`) y de componentes
  (`*.component.test.tsx`).
- `npm run test:unit`: descubre únicamente pruebas `*.unit.test.ts(x)`.
- `npm run test:components`: descubre únicamente pruebas `*.component.test.tsx` con Vitest,
  jsdom y React Testing Library.
- `npm run test:coverage`: cobertura V8 sin umbrales configurados.
- `npm run test:e2e`: Playwright para pruebas ubicadas en `e2e/` con Chromium, Electron y auditorías
  de accesibilidad con axe. No instala navegadores.

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
