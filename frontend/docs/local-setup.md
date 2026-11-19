# Guía de arranque local, PWA y Electron

Instrucciones reproducibles para ejecutar `frontend/clientes/` y `frontend/empleados/` en
desarrollo, exponer el portal móvil por HTTPS para instalación PWA y empaquetar el POS en
escritorio con Electron.

## 1. Requisitos previos

- **Node.js**: versión `22` (el backend exige `>=22.13.0 <23`).
- **Backend y PostgreSQL**: Para que las llamadas `/api/v1` funcionen, el backend debe estar corriendo en `http://localhost:3000`.
- **Docker Desktop** (opcional): requerido si se usa el lanzador automático `iniciar.bat` para levantar PostgreSQL.

## 2. Arranque completo automatizado (Windows)

Desde la raíz del monorepositorio (`c:\Trabajo\Antigravity\ProyectoCafeteria`):

```bat
iniciar.bat
```

Qué ejecuta paso a paso:
1. Verifica si Docker Desktop está corriendo (si no, lo abre y espera hasta 45 s).
2. Entra a `backend/`, ejecuta `npm.cmd run db:up` y `npx.cmd prisma migrate deploy`.
3. Abre ventanas independientes para:
   - Backend API en `http://localhost:3000` (`npm.cmd run dev`).
   - Portal de Clientes en `http://localhost:5173` (`frontend/clientes`).
   - Terminal POS Empleados en `http://localhost:5174` (`frontend/empleados`).
4. Detecta la IP local Wi-Fi (ej. `http://<IP_LOCAL>:5174` para tablet de caja y `:5173` para celulares).
5. Si existe `tunel-config.bat` en la raíz, inicia túnel HTTPS con Ngrok o Localtunnel sobre el puerto `5173`.

### Túnel HTTPS para instalación PWA en celulares

Copiar `tunel-config.example.bat` como `tunel-config.bat` en la raíz del proyecto (archivo ignorado si corresponde; no versionar tokens personales) y descomentar una de las dos opciones:
- **Ngrok**: `set "NGROK_DOMAIN=mi-cafeteria-pos.ngrok-free.app"` (requiere cuenta y CLI `ngrok` instalada).
- **Localtunnel**: `set "LOCALTUNNEL_SUBDOMAIN=coffees-pos-clientes"` (sin cuenta, usa `npx localtunnel`).

> [!IMPORTANT]
> Los navegadores móviles (Android/iOS) solo permiten registrar el Service Worker (`public/sw.js`) e
> instalar la PWA cuando el portal de clientes se abre mediante **HTTPS** (túnel) o `localhost`.
> El acceso por IP local `http://192.168.x.x:5173` funciona como web móvil normal, pero no habilita instalación PWA.

---

## 3. Arranque manual por aplicación

### Portal de clientes (`frontend/clientes/`)

```powershell
cd frontend/clientes
npm.cmd install
npm.cmd run dev        # Servidor Vite en http://localhost:5173
```

Otros scripts disponibles en `frontend/clientes/package.json`:
- `npm.cmd run build` → Ejecuta `tsc -b` y genera bundle optimizado en `dist/`.
- `npm.cmd run lint` → Ejecuta `oxlint` sobre `src/`.
- `npm.cmd run preview` → Sirve localmente la compilación de `dist/`.
- Scripts Windows: `frontend/clientes/iniciar.bat` y `frontend/clientes/ejecutar-produccion.bat`.

### Terminal POS (`frontend/empleados/`)

```powershell
cd frontend/empleados
npm.cmd install
npm.cmd run dev        # Servidor Vite en http://localhost:5174
```

Otros scripts disponibles en `frontend/empleados/package.json`:
- `npm.cmd run build` → Genera `dist/` (con `base: './'` en `vite.config.js` para rutas relativas en Electron).
- `npm.cmd run preview` → Sirve `dist/`.

---

## 4. Ejecución y empaquetado de escritorio con Electron (`frontend/empleados/`)

El proceso principal reside en `frontend/empleados/electron/main.cjs`. Configura una ventana
(`1280x800`, mínimo `1024x680`) con `nodeIntegration: false`, `contextIsolation: true`, `webSecurity: true`,
`sandbox: true` y menú de aplicación en español con acceso directo a *Pantalla Completa (Kiosco)*.

### Modos de ejecución

- **Modo empaquetado local (`npm.cmd run electron`)**:
  1. Ejecutar primero `npm.cmd run build` dentro de `frontend/empleados/`.
  2. Ejecutar `npm.cmd run electron` para cargar `dist/index.html`.
- **Modo desarrollo (`npm.cmd run electron:dev`)**:
  - **Observación actual**: `electron/main.cjs` línea 45 intenta cargar `http://localhost:3000` cuando detecta `--dev`, pero Vite de empleados corre en `5174` y `3000` corresponde al backend Express. Si falla o no corresponde, cae al fallback `dist/index.html`. Pendiente actualizar esa URL a `http://localhost:5174` y definir la URL base del backend en producción para llamadas `/api/v1` desde Electron.
- **Generar instaladores**:
  - Windows x64 (portable + NSIS): `npm.cmd run dist:win` (salida en `frontend/empleados/release/`).
  - macOS (DMG + ZIP): `npm.cmd run dist:mac`.
  - Ambos: `npm.cmd run dist:all`.

Referencias: [README de frontend](../README.md), [arquitectura](architecture.md), [persistencia local](storage/local-persistence.md).
