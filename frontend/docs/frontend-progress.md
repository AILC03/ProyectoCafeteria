# Avance del frontend — historial evolutivo

Este documento conserva la cronología técnica de cómo evolucionó el frontend de **Coffee's POS**
hasta su estado actual integrado en el monorepositorio. Para el estado operativo actual y los
pendientes vigentes consultar [índice vigente](README.md) y [completitud](frontend-completion.md).

## Etapa 4 — Auditoría documental e integración en monorepositorio (2026-11-16 a 2026-11-18)

- **Unificación del repositorio ([ADR 0013](../../backend/docs/adr/0013-application-repository-layout.md))**: Los repositorios independientes de frontend y backend quedaron integrados bajo `ProyectoCafeteria/` en `backend/`, `frontend/clientes/` y `frontend/empleados/`.
- **Orquestación conjunta**: `iniciar.bat` en la raíz automatiza el arranque de Docker/PostgreSQL, migraciones Prisma, API en `:3000`, portal de clientes en `:5173`, terminal de empleados en `:5174` y túnel HTTPS opcional (`tunel-config.bat`) para instalar la PWA en dispositivos móviles.
- **Documentación y auditoría (`FE-GAP-01`)**: Creación de `frontend/docs/` espejando la estructura de `backend/docs/`, contrastando cada pantalla contra `OpenAPI 0.11.0` (`FIN-01`) y documentando brechas de integración y seguridad.

## Etapa 3 — Integración HTTP con `/api/v1` (2026-10 a 2026-11)

- **Clientes HTTP en ambas aplicaciones**:
  - `frontend/clientes/src/api/`: creación de `client.ts`, `auth.ts`, `catalog.ts`, `orders.ts`, `favorites.ts` y `registration.ts`.
  - `frontend/empleados/src/api/`: creación de `client.js`, `auth.js`, `cash.js`, `catalog.js`, `employees.js`, `kitchen.js` y `sales.js`.
- **Proxies Vite**: Configuración de `/api` → `http://localhost:3000` en `clientes/vite.config.ts` y `empleados/vite.config.js` inyectando `Origin: http://localhost:5173`.
- **Nuevas capacidades conectadas**:
  - Catálogo dinámico y personalización por grupos/valores (`ProductModal.tsx`).
  - Login por cookies `HttpOnly` para clientes y personal, más formulario de registro con ticket (`AUTH-02`) en `AuthPage.tsx`.
  - Creación de órdenes móviles (`POST /orders`) y en mostrador (`POST /cashier/orders`), apertura/cierre de caja (`ShiftWorkspace.jsx`), cobro efectivo (`POST /payments/cash`) y escaneo QR CASH (`ScanQrModal.jsx`).
  - Pantalla de Cocina / Barista (`KitchenWorkspace.jsx`) conectada a `GET /preparation/orders` y `POST /orders/{id}/ready`.
  - Panel de administración (`AdminDashboardWorkspace.jsx`) con CRUD básico de categorías, productos, disponibilidad y empleados.
- **Limpieza de datos demo**: Se eliminaron arreglos precargados de muestra en `clientes/src/data/products.ts` e `initialOrders.ts`, y filtros en `empleados/src/data/db.js` y `menuData.js` purgan automáticamente registros antiguos con prefijos demo (`ord_demo_`, `p1`, `DES-`, `CAF-`).

## Etapa 2 — Migración a React 19 y simplificación a Venta Rápida

- **Reescritura de POS a React 19 + Vite**: Migración desde HTML/Vanilla JS (`index.vanilla.html`, `js/app.js`) hacia componentes modulares en `frontend/empleados/src/`.
- **Retiro del modo Restaurante / Salón de Mesas**: Para alinear el sistema con el alcance de cafetería en mostrador, se retiraron los componentes `TablesWorkspace.jsx`, `AdminTablesManager.jsx` y `tablesData.js`, archivándose en `frontend/empleados/respaldo/` junto con `LEEME_RESTAURACION.md`.
- **Creación del portal de clientes (`frontend/clientes/`)**: Construcción desde cero con React 19, TypeScript, Tailwind CSS (paleta café tostado / crema), React Router DOM y soporte PWA instalable (`manifest.json`, `sw.js`).
- **Empaquetado de escritorio**: Incorporación de `electron/main.cjs` y `electron-builder` para generar instaladores Windows (`dist:win`) y macOS (`dist:mac`) del POS.

## Etapa 1 — Prototipo inicial Vanilla JS (`frontend/empleados/` legado)

- **Archivos conservados como referencia**: `index.vanilla.html`, `css/style.css`, `js/app.js`, `js/db.js`, `js/employees.js`, `js/menuData.js` y `AGENTS.md` (documentando la etapa 100% offline previa a la API).
- **Características de aquella etapa**: Numpad numérico de 4 dígitos para PIN, almacenamiento exclusivo en `localStorage`, cálculo de descuentos/propinas/IVA en navegador y gestión multi-tenant local (`utils/tenant.js`, `utils/crypto.js`). Varios residuos de esa etapa (como el cálculo del 16% de IVA en POS y `AGENTS.md` desactualizado en `empleados/`) siguen presentes y están identificados en [FE-GAP-01](tasks/FE-GAP-01-integration-audit.md).
