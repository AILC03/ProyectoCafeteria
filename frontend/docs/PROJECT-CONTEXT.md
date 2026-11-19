# Contexto y continuidad del proyecto — Frontend Cafetería

## Estado vigente — 2026-11-18

El frontend de **Coffee's POS** se integra en el monorepositorio común en `frontend/` mediante dos aplicaciones React 19 independientes: el portal móvil/web para clientes ([`frontend/clientes/`](../clientes)) y la terminal POS/administración para personal ([`frontend/empleados/`](../empleados)). Ambas consumen el backend Express/PostgreSQL bajo `/api/v1` mediante proxy de desarrollo en Vite, cookies `HttpOnly` y token CSRF, conservando capas de respaldo en `localStorage` cuando la API no responde.

La auditoría contra `OpenAPI 0.11.0` (`FIN-01`) confirma que los flujos base de catálogo, login, registro con ticket, creación de órdenes, caja, cobro en efectivo, escaneo QR CASH, cocina (KDS) y CRUD básico de menú/empleados tienen integración implementada, mientras permanecen brechas concretas y módulos pendientes documentados en [completitud y límites](frontend-completion.md) y [FE-GAP-01](tasks/FE-GAP-01-integration-audit.md).

## 1. Ubicación y responsabilidades

Sistema web y de escritorio para la gestión de órdenes de cafetería, equipo **ESMAOS**:

- **Enrique**: responsable del frontend (`frontend/clientes/` y `frontend/empleados/`).
- **Ángel**: responsable del backend (`backend/`).
- **Leonel**: responsable de base de datos (`backend/prisma/` y modelado).
- Todos colaboran y revisan cambios entre sí.

Conforme a [ADR 0013](../../backend/docs/adr/0013-application-repository-layout.md), aceptado el 2026-11-16, las aplicaciones residen en un mismo repositorio Git (`ProyectoCafeteria/`) manteniendo manifiestos y dependencias separados por carpeta:

- `frontend/clientes/` — Portal de autoservicio para clientes (puerto `5173`).
- `frontend/empleados/` — Terminal POS, cocina (KDS) y administración (puerto `5174`, empaquetable con Electron).
- `backend/` — API REST y worker en Node.js / Express 5 / PostgreSQL 17 (puerto `3000`).

## 2. Qué existe realmente

### Portal de clientes (`frontend/clientes/`, paquete `taffy`)

- **Stack**: React `19.2.8`, React Router DOM `7.18.4`, TypeScript `~6.0.2`, Vite `8.3.0`, Tailwind CSS `3.4.19`, PostCSS `8.5.28`, `lucide-react`, `canvas-confetti`, Oxlint `1.81.0`.
- **Capacidad PWA**: `public/manifest.json` y `public/sw.js` (estrategia Network-first para estáticos ignorando `/api/`), registrándose en `src/main.tsx`.
- **Rutas (`src/App.tsx`)**: `/iniciar-sesion` (`AuthPage.tsx`) y `/menu` (`MenuPage.tsx`); `/` y `/registro` redirigen a `/iniciar-sesion`.
- **Módulos HTTP (`src/api/`)**: `client.ts` (CSRF + RFC 7807), `auth.ts`, `catalog.ts`, `orders.ts`, `favorites.ts` y `registration.ts`.
- **Contextos (`src/context/`)**: `AuthContext.tsx`, `CartContext.tsx`, `ToastContext.tsx`.
- **Componentes (`src/components/`)**: `Header.tsx`, `ProductCard.tsx`, `ProductModal.tsx`, `CartDrawer.tsx`, `OrderConfirmationModal.tsx`, `OrderHistoryModal.tsx`, `ProfileModal.tsx`, `PinInput.tsx`.

### Terminal de empleados / POS (`frontend/empleados/`, paquete `coffees-pos` v2.0.0)

- **Stack**: React `19.3.0`, JavaScript (JSX), Vite `8.3.1`, Vanilla CSS (`src/styles/index.css`), Electron `44.4.5` y `electron-builder` `26.15.3`.
- **Modo operativo**: **Venta Rápida (Cafetería / Mostrador)**. El código anterior con salón de mesas y modo restaurante fue archivado en `frontend/empleados/respaldo/` (ver `respaldo/LEEME_RESTAURACION.md`), y el prototipo inicial sin React permanece en `index.vanilla.html`, `js/` y `css/`.
- **Módulos HTTP (`src/api/`)**: `client.js` (CSRF + RFC 7807 + auto-login fallback), `auth.js`, `cash.js`, `catalog.js`, `employees.js`, `kitchen.js`, `sales.js`.
- **Pantallas y espacios de trabajo (`src/components/`)**:
  - Acceso: `WelcomeScreen.jsx`, `EmployeeIdScreen.jsx`, `EmployeePinScreen.jsx`, `Numpad.jsx`.
  - Operación: `PosHeader.jsx`, `OrderingWorkspace.jsx`, `KitchenWorkspace.jsx`, `HistoryWorkspace.jsx`, `ShiftWorkspace.jsx`.
  - Administración: `AdminDashboardWorkspace.jsx`, `MenuManagementWorkspace.jsx`, `UserManagementWorkspace.jsx`, `AdminAuthModal.jsx`.
  - Modales y utilidades: `CheckoutModal.jsx`, `ReceiptModal.jsx`, `ScanQrModal.jsx`, `MenuModal.jsx`, `ConfirmModal.jsx`, `ToastNotification.jsx`.
- **Persistencia local (`src/data/`, `src/utils/`)**: `db.js`, `employees.js`, `menuData.js`, `tenant.js`, `crypto.js`, `money.js`, `audio.js`, `notify.js`.

## 3. Decisiones técnicas clave del frontend

| ADR | Decisión |
| --- | --- |
| [FE-ADR 0001](adr/0001-dual-frontend-applications.md) | Dos aplicaciones independientes (`clientes/` en TypeScript + Tailwind y `empleados/` en JSX + Vanilla CSS/Electron) sin compartir `node_modules` |
| [FE-ADR 0002](adr/0002-http-client-csrf-cookies.md) | Comunicación `/api/v1` vía proxy Vite, cookies `HttpOnly` (`credentials: 'include'`), CSRF automático en memoria y errores RFC 7807 |
| [FE-ADR 0003](adr/0003-local-fallback-pwa-electron.md) | Respaldo local en `localStorage`, soporte PWA instalable para clientes y empaquetado Electron en modo Venta Rápida para POS |

## 4. Reglas y brechas críticas detectadas

- **Dinero en centavos**: `utils/money.ts` y `utils/money.js` convierten cadenas de centavos (`"6500"` → `$65.00`). Sin embargo, `OrderingWorkspace.jsx` y `App.jsx` en el POS aplican un `16%` de IVA adicional en el resumen visual y en el monto cobrado por `CheckoutModal.jsx`, lo cual difiere del total calculado por el backend (`base + recargos`).
- **Métodos de pago en mostrador**: `CheckoutModal.jsx` muestra `Efectivo`, `Tarjeta` y `Transferencia`, pero solo `cash` invoca la API (`createCashierOrder` + `chargeCashOrder`); tarjeta y transferencia guardan únicamente en `localStorage`.
- **Token de registro vs. token de ticket digital**: `App.jsx` llama a `issueTicketAccess` (`POST /sales/{id}/ticket-access`, cuyo token es para `GET /guest-ticket` / `TKT-02`) y lo imprime como código de registro de cliente, cuando `POST /customer-registration/ticket` (`AUTH-02`) requiere el token proveniente de `GET /sales/{id}/ticket` (`registration.token`).
- **Seguridad de credenciales locales**: `empleados/src/api/client.js` y `EmployeePinScreen.jsx` almacenan y reutilizan la contraseña del empleado en `localStorage` (`coffees_current_employee`) para auto-reautenticar en `401`, en lugar de usar `POST /auth/refresh` y redirigir a login tras fallo definitivo.
- **Historial y repetición en clientes**: `OrderHistoryModal.tsx` lee `taffy_past_orders` de `localStorage` (siempre vacío tras limpiar demos) en lugar de consumir `getCustomerOrders()` de `src/api/orders.ts` y `repeat-preview`.
- **Stripe y correo**: El selector `STRIPE` en `CartDrawer.tsx` crea la orden pendiente, pero no invoca `POST /orders/{id}/checkout` ni redirige a Checkout (en el backend Stripe real está deshabilitado hasta revisión). El formulario de recibo por email en `OrderConfirmationModal.tsx` es simulado localmente.

## 5. Configuración y comprobaciones conocidas

- **Orquestación local**: El script raíz [iniciar.bat](../../iniciar.bat) inicia Docker/PostgreSQL, ejecuta migraciones, levanta `backend` (`3000`), `frontend/clientes` (`5173`), `frontend/empleados` (`5174`) y túnel HTTPS opcional (`tunel-config.bat`).
- **Lint en `frontend/clientes`**: Ejecutado el 2026-11-18 con `npm.cmd --prefix frontend/clientes run lint` (`oxlint`): **0 errores y 5 advertencias** (`only-export-components` en los 3 contextos y `set-state-in-effect` en `AuthContext.tsx` y `ProductModal.tsx` sobre 30 archivos).
- **Pruebas automatizadas**: Ninguna de las dos aplicaciones cuenta todavía con suite de pruebas unitarias, de componentes o E2E, ni con job en `.github/workflows/`.
- **Electron en desarrollo**: `electron/main.cjs` apunta a `http://localhost:3000` cuando se pasa `--dev`, mientras Vite de empleados corre en `5174`.

## 6. Siguiente trabajo prioritario

1. Corregir la brecha de tickets (`GET /sales/{id}/ticket` para registro QR `AUTH-02` vs. `POST /sales/{id}/ticket-access` para `TKT-02`) y añadir renderizado gráfico de QR en `OrderConfirmationModal.tsx` y `ReceiptModal.jsx`.
2. Reemplazar el auto-login con contraseña en `localStorage` por `POST /auth/refresh` con bloqueo single-flight/Web Locks y soporte para `mustChangePin` (`PATCH /auth/pin`).
3. Conectar `OrderHistoryModal.tsx` a `GET /customers/me/orders`, `GET /orders/{id}` y `POST /customers/me/orders/{id}/repeat-preview`.
4. Eliminar el cálculo artificial de IVA en `OrderingWorkspace.jsx`/`App.jsx`, añadir selector de opciones de producto en caja y conectar búsqueda/asociación de cliente (`POST /cashier/customers/search`).
5. Implementar vistas administrativas faltantes (grupos/valores de opciones, Cloudinary, edición/reset de clientes) y recuperación/verificación por correo.
6. Configurar Vitest + React Testing Library y flujo CI en GitHub Actions para `frontend/clientes` y `frontend/empleados`.

Referencias: [índice vigente](README.md), [arquitectura](architecture.md), [cobertura de API](api/endpoints-coverage.md), [backlog](development-tasks.md), [guía backend](../../backend/docs/frontend-integration.md).
