# Persistencia local, Service Worker y código archivado

Analiza los módulos de datos locales en `frontend/empleados/src/data/`, el Service Worker de
`frontend/clientes/`, los artefactos heredados del prototipo inicial y su impacto en la operación
real contra la API.

## 1. Módulos locales en `frontend/empleados/src/data/`

Aunque la documentación interna de estos archivos dice *"Totalmente desacoplada de backend"*
(comentario heredado de la etapa previa a la API), actualmente funcionan como **caché de respaldo
y fallback** junto a las llamadas a `/api/v1`:

| Archivo | Clave principal (`localStorage`) | Función actual | Problemas / advertencias |
| --- | --- | --- | --- |
| `db.js` | `coffees_orders_local` | Guarda historial local de órdenes cobradas y calcula `getDailySummary()` si falla `/sales/summary` | Almacena `registrationToken` en `localStorage` cuando `App.jsx` llama a `db.saveOrder()`. El nombre interno de funciones habla de "IndexedDB" pero usa exclusivamente `localStorage` |
| `employees.js` | `coffees_employees_local` | Mantiene lista local de empleados, valida credenciales offline (`verifyEmployeeCredentials`) y expone helpers de roles (`isEmployeeAdmin`, `isEmployeeCashier`, `isEmployeeKitchen`, `isEmployeeGerente`) | Contiene `DEFAULT_EMPLOYEES` con usuario `AngelAdmin` y contraseña de prueba embebida (`Admin1234`), más comprobación dura contra ese valor. Incluye rol `GERENTE` ajeno al backend |
| `menuData.js` | `coffees_menu_products_local`, `coffees_menu_categories_local` | Almacena categorías y productos cacheados tras consultar la API; limpia prefijos demo antiguos (`p1`, `DES-`, `CAF-`, `(demo)`) | Si se edita en local sin API, los cambios no existen en PostgreSQL; comparte claves con `clientes/MenuPage.tsx` cuando ambos corren en `localhost` |

## 2. Utilidades heredadas (`tenant.js`, `crypto.js`) y prototipo Vanilla (`js/`)

- **`src/utils/tenant.js` y `src/utils/crypto.js`**: Implementan un registro multi-tenant local (`coffees_accounts_registry`) y hashing SHA-256 iterado (1024 rondas) pensado para operar en modo 100% offline/Electron sin backend. Actualmente `App.jsx` solo importa `DEFAULT_TEST_EMPLOYEES` de `tenant.js` (sin usarlo en `App.jsx`) y la pantalla `setup` de vinculación fue reemplazada por configuración fija en `localStorage`.
- **Prototipo legado (`frontend/empleados/index.vanilla.html`, `js/`, `css/`)**: Versión inicial sin React (con 1462 líneas en `js/app.js`, menú hardcoded, cálculo de propinas/descuentos e `innerHTML`). No se compila ni se sirve en Vite (`index.html` apunta a `src/main.jsx`), pero permanece en el directorio como referencia histórica.

## 3. Código archivado del modo Restaurante (`frontend/empleados/respaldo/`)

Antes de simplificar la terminal a **Venta Rápida (Cafetería / Mostrador)**, se archivaron en
`frontend/empleados/respaldo/` los archivos del modo restaurante:
- `App.jsx`, `components/AdminDashboardWorkspace.jsx`, `AdminTablesManager.jsx`, `MenuModal.jsx`, `OrderingWorkspace.jsx`, `PosHeader.jsx`, `TablesWorkspace.jsx`, `data/tablesData.js` y `LEEME_RESTAURACION.md`.
- Estos archivos **no** deben importarse en el flujo activo y carecen de integración con `/api/v1`.

## 4. Service Worker PWA (`frontend/clientes/public/sw.js`)

- Registrado en `frontend/clientes/src/main.tsx` siempre que `window.location.protocol.startsWith('http')`.
- Caché: `coffees-pos-v1`.
- **Regla clave**: `if (event.request.url.includes('/api/')) return;` — Todas las peticiones a la API pasan directo a la red sin cachearse en el Service Worker, cumpliendo la exigencia de no cachear respuestas privadas (`Cache-Control: no-store`).
- Para recursos estáticos (HTML/JS/CSS/iconos) usa estrategia **Network-first con fallback a caché**.

## 5. Limpieza y migración recomendada

1. Retirar almacenamiento de `pin`, `password` y `registrationToken` de `localStorage` (`EmployeePinScreen.jsx`, `App.jsx`, `db.js`, `employees.js`).
2. Eliminar credenciales por defecto embebidas (`Admin1234`) en `employees.js`, `tenant.js` y `client.js`.
3. Separar claramente un estado `"API sin conexión"` en las pantallas de caja/historial en lugar de mostrar resultados simulados como si fueran ventas reales en PostgreSQL.
4. Actualizar o archivar `frontend/empleados/AGENTS.md` (que aún describe la versión antigua desacoplada del backend en puerto `3000`).

Referencias: [diccionario de datos](../data-dictionary.md), [FE-ADR 0003](../adr/0003-local-fallback-pwa-electron.md).
