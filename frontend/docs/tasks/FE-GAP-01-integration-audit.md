# FE-GAP-01 — Documentación integral y auditoría de brechas del frontend

- Responsable: asistente, por solicitud del equipo (siguiendo el estándar de Ángel en `backend/docs/`).
- Revisor humano: Enrique (frontend) / Ángel (backend).
- Aplicación afectada: `frontend/clientes`, `frontend/empleados`, `frontend/docs` y `frontend/README.md`.
- Rama base y trabajo: `dev`.
- Estado: entregada para revisión humana — 2026-11-18.

## Objetivo y fuentes

Documentar por completo qué es el frontend, cómo funcionan sus dos aplicaciones (`clientes` y
`empleados`), qué flujos operan conectados a `/api/v1` y qué brechas o pendientes existen frente al
cierre funcional `FIN-01` del backend.

Fuentes contrastadas directamente del código fuente en el repositorio:
- Backend: `backend/docs/README.md`, `PROJECT-CONTEXT.md`, `frontend-integration.md`, `business-rules.md`, `permissions.md`, `backend-completion.md`, `api/openapi.yaml` (`0.11.0`) y guías por módulo.
- Frontend clientes: `frontend/clientes/package.json`, `vite.config.ts`, `src/App.tsx`, `src/types/index.ts`, `src/api/*.ts`, `src/context/*.tsx`, `src/pages/*.tsx`, `src/components/*.tsx`, `src/utils/*.ts`, `public/manifest.json`, `public/sw.js`.
- Frontend empleados: `frontend/empleados/package.json`, `vite.config.js`, `electron/main.cjs`, `src/App.jsx`, `src/api/*.js`, `src/components/*.jsx`, `src/data/*.js`, `src/utils/*.js`, `respaldo/LEEME_RESTAURACION.md`.
- Raíz: `iniciar.bat`, `tunel-config.example.bat`.

## Alcance y exclusiones

- Incluye: suite documental completa en `frontend/docs/` (índices, arquitectura, reglas, permisos, guías por módulo, cobertura completa de endpoints OpenAPI 0.11.0, diccionario de datos/localStorage, ADRs del frontend, backlog y flujo de trabajo) y actualización de `frontend/README.md`.
- Excluye: modificación de código fuente `.ts`/`.tsx`/`.js`/`.jsx`, modificación de `backend/`, ejecución de migraciones o cambios de configuración en `.env`.

## Matriz de hallazgos principales (código real vs. OpenAPI 0.11.0)

| ID | Severidad | Hallazgo observado en código | Archivo fuente | Guía relacionada |
| --- | --- | --- | --- | --- |
| `GAP-01` | **Crítica** | `App.jsx` solicita `POST /sales/{id}/ticket-access` (`TKT-02`) en lugar de `GET /sales/{id}/ticket` (`CASH-02`) e imprime ese token como código de registro `AUTH-02`, provocando `404` al registrar cliente | `empleados/src/App.jsx`, `ReceiptModal.jsx` | [Tickets e invitado](../guest-ticket-implementation.md) |
| `GAP-02` | **Crítica** | `OrderingWorkspace.jsx` y `App.jsx` suman `16% IVA` local y envían `optionValueIds: []` sin abrir selector de opciones, desfasando el total respecto a PostgreSQL y fallando en productos con opciones obligatorias | `empleados/src/components/OrderingWorkspace.jsx`, `App.jsx` | [Órdenes y KDS](../orders-implementation.md) |
| `GAP-03` | **Alta** | `empleados/src/api/client.js` y `EmployeePinScreen.jsx` guardan la contraseña del empleado en `localStorage` y usan auto-login (con fallback `admin`/`Admin1234`) ante `401` en vez de `POST /auth/refresh` | `empleados/src/api/client.js`, `EmployeePinScreen.jsx`, `data/employees.js` | [Integración](../backend-integration.md) |
| `GAP-04` | **Alta** | `cash.js` abre automáticamente una caja de `$500` con `getOrEnsureCashSession()` al cobrar, y `App.jsx` guarda la orden como cobrada en `localStorage` aunque la API devuelva error | `empleados/src/api/cash.js`, `App.jsx` | [Caja y efectivo](../cash-implementation.md) |
| `GAP-05` | **Media** | `KitchenWorkspace.jsx` imprime `opt.optionName` en vez de `opt.valueName` del DTO de `GET /orders/{id}` | `empleados/src/components/KitchenWorkspace.jsx` | [Órdenes y KDS](../orders-implementation.md) |
| `GAP-06` | **Media** | `HistoryWorkspace.jsx` ejecuta `return` en línea 33 cuando `salesRes.data.length > 0`, omitiendo `finally { setLoading(false) }` | `empleados/src/components/HistoryWorkspace.jsx` | [Caja y efectivo](../cash-implementation.md) |
| `GAP-07` | **Media** | `OrderHistoryModal.tsx` lee `taffy_past_orders` de `localStorage` (vacío) en vez de usar `getCustomerOrders()` (`orders.ts`) y `POST /customers/me/orders/{id}/repeat-preview` | `clientes/src/components/OrderHistoryModal.tsx` | [Clientes](../customers-implementation.md), [Favoritos](../favorites-implementation.md) |
| `GAP-08` | **Media** | Falta renderizado gráfico QR en `OrderConfirmationModal` y `ReceiptModal`, lector de cámara en `ScanQrModal`, recorte del prefijo `cafeteria:register:` en `AuthPage` (`maxLength={43}`) y visor `GET /guest-ticket` | `OrderConfirmationModal.tsx`, `ScanQrModal.jsx`, `AuthPage.tsx` | [QR CASH](../cash-qr-implementation.md), [Tickets](../guest-ticket-implementation.md) |
| `GAP-09` | **Media** | `UserManagementWorkspace` incluye rol `GERENTE` no soportado por `OpenAPI 0.11.0`; `CAJERO` no tiene UI de disponibilidad; `AdminAuthModal` sustituye cookie de sesión de caja al autorizar | `UserManagementWorkspace.jsx`, `App.jsx`, `AdminAuthModal.jsx` | [Permisos](../permissions.md), [Auth y admin](../auth-admin-implementation.md) |
| `GAP-10` | **Baja** | Falta flujo `mustChangePin` (`PATCH /auth/pin`), `PATCH /auth/password`, verificación/recuperación por correo (`/verificar-correo`, `/recuperar-nip`), CRUD de opciones/Cloudinary/clientes en admin y Checkout Stripe (`/orders/{id}/checkout`) | Varias vistas en ambas apps | [Backlog](../development-tasks.md) |

## Evidencia de entrega

- Archivos creados: 31 documentos Markdown en `frontend/docs/` (incluyendo `adr/`, `api/`, `storage/`, `tasks/`, `workflow/`) y actualización de `frontend/README.md`.
- Comandos ejecutados:
  - `npm.cmd --prefix frontend/clientes run lint` (`oxlint v1.81.0`): 0 errores, 5 warnings en 30 archivos.
  - Verificación de enlaces Markdown locales sobre 32 archivos (`frontend/docs/` y `frontend/README.md`): 174 enlaces comprobados, 0 rotos.
- Pruebas no ejecutadas en esta entrega documental: `vite build`, `tsc -b`, suites de pruebas unitarias/E2E (inexistentes aún en el frontend) y ejecución contra PostgreSQL en vivo.
