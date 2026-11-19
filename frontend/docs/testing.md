# Estrategia y estado de pruebas del frontend

Documenta las herramientas de verificación estática actuales, los resultados observados y el plan de
pruebas automatizadas pendiente para `frontend/clientes/` y `frontend/empleados/`.

## 1. Estado actual de verificaciones

| Aplicación | Linter | Typecheck | Build | Tests unitarios / E2E |
| --- | --- | --- | --- | --- |
| `frontend/clientes/` | `oxlint` configurado (`npm run lint`) | `tsc -b` dentro de `npm run build` | `vite build` | **Ninguno implementado** |
| `frontend/empleados/` | **No configurado** | No aplica (JS/JSX) | `vite build` | **Ninguno implementado** |

### Última verificación observada — 2026-11-18

Ejecución de `npm.cmd --prefix frontend/clientes run lint` (`oxlint v1.81.0`):
- **Resultado**: Código de salida `0` — **0 errores, 5 advertencias** en `30` archivos analizados (`116` reglas en `33 ms`).
- **Advertencias registradas**:
  1. `react(only-export-components)` en `src/context/ToastContext.tsx` (exporta `useToast` junto con `ToastProvider`).
  2. `react(only-export-components)` en `src/context/AuthContext.tsx` (exporta `useAuth` junto con `AuthProvider`).
  3. `react(only-export-components)` en `src/context/CartContext.tsx` (exporta `useCart` junto con `CartProvider`).
  4. `react(set-state-in-effect)` en `src/context/AuthContext.tsx:62` (llamada a `refreshProfile()` dentro de `useEffect`).
  5. `react(set-state-in-effect)` en `src/components/ProductModal.tsx:26` (`setQuantity(1)` y `setCupName(...)` al cambiar `product` dentro de `useEffect`).

> [!NOTE]
> En esta sesión documental no se ejecutó `npm run build` ni pruebas en navegador contra el servidor activo; cualquier afirmación sobre comportamiento en ejecución proviene de la lectura directa del código fuente.

## 2. Casos mínimos de verificación manual E2E (con API local)

Para validar manualmente las integraciones actualmente conectadas:

1. **Catálogo y opciones**: Crear categoría y producto con grupo de opciones en backend → verificar aparición en `clientes/MenuPage` y selección/cálculo en `ProductModal` → marcar producto como agotado desde `empleados/MenuManagementWorkspace` y comprobar bloqueo visual en `ProductCard`.
2. **Compra móvil CASH + QR (`ORD-01` + `CASH-03`)**: En `clientes` (como invitado o `CLIENTE`), enviar pedido `CASH` → copiar token de `cashQr` → en `empleados` abrir caja en `ShiftWorkspace` → cobrar el token desde `ScanQrModal` → verificar entrada en `KitchenWorkspace` (`KDS`) y transición a `LISTO`.
3. **Compra en mostrador (`CASH-01/02`)**: *(Nota: probar solo con productos sin opciones obligatorias mientras no se implemente el selector en `OrderingWorkspace`)*. Cobrar efectivo y verificar apertura de `ReceiptModal`.
4. **Control de roles en POS**: Iniciar sesión con cuentas reales de `ADMINISTRADOR`, `CAJERO` y `PREPARACION` y comprobar que `PREPARACION` solo accede a `KitchenWorkspace` y `CAJERO` no accede a `admin-dashboard`.
5. **Favoritos (`FAV-01`)**: Como `CLIENTE`, marcar/desmarcar favorito en `ProductCard`, recargar página y comprobar persistencia vía `GET /customers/me/favorites`.

## 3. Plan de pruebas automatizadas pendiente (`FE-TEST-01`)

Para equiparar la calidad del frontend con la del backend (`backend-ci.yml`):

1. **Unitarias / utilidades (Vitest)**:
   - `money.ts` / `money.js`: formato de centavos grandes (`"9999900"`), nulos y redondeo seguro.
   - `client.ts` / `client.js`: bootstrap CSRF, reintento único en `403 CSRF_INVALID`, parseo de `Problem Details` y flujo single-flight de `POST /auth/refresh`.
2. **Pruebas de componentes (Vitest + React Testing Library + MSW)**:
   - `AuthPage`: validación de teléfono/número `C`, NIP de 4 dígitos con ceros iniciales (`"0007"`), registro con token retirando prefijo `cafeteria:register:`.
   - `ProductModal`: cumplimiento de `minSelections`, `maxSelections` y suma correcta de recargos.
   - `ShiftWorkspace`, `KitchenWorkspace` y `ReceiptModal`: renderizado de DTOs reales sin depender de `localStorage`.
3. **Pruebas End-to-End (Playwright)**:
   - Flujo completo entre `:5173` (`clientes`) y `:5174` (`empleados`) contra backend levantado en contenedor PostgreSQL efímero.
4. **Integración continua**:
   - Añadir `.github/workflows/frontend-ci.yml` ejecutando `lint`, `tsc -b`, tests y `vite build` para `frontend/clientes/` y `frontend/empleados/`.

Referencias: [estrategia de pruebas backend](../../backend/docs/testing.md), [CI backend](../../.github/workflows/backend-ci.yml), [flujo de trabajo](workflow/README.md).
