# Caja, cobro efectivo y ventas (`frontend/empleados`)

Documenta el manejo de sesiones de caja (`CASH-01`), cobro en efectivo (`CASH-02`) y consulta
de ventas (`SALES-01`) en la terminal POS (`frontend/empleados/`).

## 1. Sesión de caja y corte de turno (`ShiftWorkspace.jsx` + `src/api/cash.js`)

### Cómo funciona hoy

1. Al abrir la pestaña *Corte de Caja*, `ShiftWorkspace.jsx` consulta en paralelo:
   - `getCurrentCashSession()` → `GET /api/v1/cash-sessions/current`.
   - `getSalesSummary({ from, to })` → `GET /api/v1/sales/summary` para el día local actual. Si falla la API, recurre al resumen local de `db.getDailySummary()`.
2. **Si no hay caja abierta** (`activeSession === null`):
   - `CAJERO` y `ADMINISTRADOR` ven el formulario para capturar el fondo inicial (por defecto `500`, máximo UI `$50,000.00`) y llamar a `openCashSession(numberToCents(cashNum))` (`POST /api/v1/cash-sessions` con `Idempotency-Key`).
   - El rol local `GERENTE` ve aviso de solo lectura.
3. **Si hay caja abierta**:
   - Muestra tarjetas con ID de sesión, fondo inicial, ventas en efectivo y estado.
   - Permite ingresar el efectivo contado (`countedCashInput`) y llamar a `closeCashSession(activeSession.id, numberToCents(cashNum))` (`POST /api/v1/cash-sessions/{id}/close`).
4. Incluye botones para exportar respaldo JSON de órdenes locales (`db.exportBackupJSON()`) e imprimir el reporte (`window.print()`).

### Qué falta y discrepancias con el contrato OpenAPI

| Discrepancia / Pendiente | Ubicación actual | Detalle según OpenAPI 0.11.0 |
| --- | --- | --- |
| Nombres de campos en `activeSession` | `ShiftWorkspace.jsx` línea 282 | Lee `activeSession.startingCashCents`; en OpenAPI/CASH-01 el campo real debe verificarse (`openingAmountCents` vs `startingCashCents`) y falta mostrar `openedByEmployeeId`/responsable, `computedExpectedCashCents` y `successfulPayments` |
| Cierre excepcional de administrador | `ShiftWorkspace.jsx` líneas 128, 299–332 | `closeCashSession` en `cash.js` acepta parámetro `reason` para enviar `exceptionalCloseReason`, pero `ShiftWorkspace.jsx` no muestra un campo de motivo cuando la caja abierta pertenece a otro empleado |
| Campos de `getSalesSummary` | `ShiftWorkspace.jsx` líneas 47–55 | Lee `apiSummary.totalCents`, `count`, `cashTotalCents`, `stripeTotalCents`. Debe validarse contra el esquema real de `GET /sales/summary` y usar `formatCents()` sin perder precisión en `parseInt`/división para totales grandes |
| Ventas por personal | `ShiftWorkspace.jsx` líneas 180–200 | La tabla `"Ventas por Personal"` solo se llena cuando el resumen proviene de `db.getDailySummary()` (local); con datos de la API queda siempre en `$0.00` |
| Respuesta de cierre | `ShiftWorkspace.jsx` línea 128 | Descarta el objeto `res` devuelto por `closeCashSession` sin mostrar al cajero el resumen final de esperado vs. contado y la diferencia calculada por el backend |

---

## 2. Cobro en efectivo (`CheckoutModal.jsx`, `App.jsx`, `cash.js`)

### Cómo funciona hoy

- **Desde toma de orden en mostrador**:
  1. `App.handleConfirmPayment` crea la orden (`POST /cashier/orders`) y de inmediato llama a `chargeCashOrder(backendOrder.id, numberToCents(cashReceived))`.
  2. `chargeCashOrder()` (`src/api/cash.js`) llama a `getOrEnsureCashSession()`: si no hay una caja abierta en el backend, **abre automáticamente una caja con fondo por defecto de `$500.00` (`50000` centavos)** sin pedir confirmación al cajero.
  3. Envía `POST /api/v1/payments/cash` con `{ cashSessionId, orderId, cashReceivedCents }`.
  4. Calcula el cambio a partir de `paymentRes.payment.changeCents`.
- **Desde pedido móvil con QR**:
  1. `ScanQrModal.jsx` resuelve el token con `scanCashPaymentQr` y luego llama igualmente a `chargeCashOrder`.

### Brechas y riesgos operativos en cobro

1. **Apertura automática silenciosa de caja (`getOrEnsureCashSession`)**: Abrir una sesión de caja de `$500.00` automáticamente cuando el cajero cobra su primer pedido evade el arqueo real del fondo inicial y puede provocar un `403` si un segundo cajero intenta cobrar sobre una caja que otro abrió sin darse cuenta. Debe exigirse apertura explícita en `ShiftWorkspace` o en un modal dedicado.
2. **Desfase de totales por IVA 16%**: Al sumar `16%` local en el carrito del POS, `CheckoutModal.jsx` muestra un `totalAmount` mayor al `totalCents` de la orden en PostgreSQL.
3. **Respaldo silencioso ante error de cobro**: En `App.jsx` líneas 424–429, si `createCashierOrder` o `chargeCashOrder` falla (ej. `409 CASH_CONFLICT`, caja abierta por otro empleado o `503`), solo muestra un toast de advertencia y **continúa guardando la venta en `localStorage` y mostrando `ReceiptModal` como si se hubiera cobrado**, violando la regla de no simular cobros fallidos.
4. **Falta aserción `changeCents`**: No envía `changeCents` opcional al backend para proteger contra discrepancias visuales.

---

## 3. Historial y reporte de ventas (`HistoryWorkspace.jsx` + `src/api/sales.js`)

- **Implementado**:
  - `sales.js` define `getSales({ from, to, method, limit, cursor })` y `getSalesSummary({ from, to, method })`.
  - `HistoryWorkspace.jsx` llama a `getSales({ limit: 50 })` al montar y mapea `saleNumber`, `totalCents`, `method` y `soldAt`. Si la lista viene vacía o falla, cae al arreglo local de `db.getAllOrders()`.
- **Qué falta**:
  - **Bug de `loading` en `HistoryWorkspace.jsx`**: Si `salesRes.data.length > 0`, ejecuta `return` en la línea 33 **sin pasar por `finally { setLoading(false) }`**, dejando el indicador `"Cargando pedidos..."` congelado en pantalla cuando la API sí devuelve ventas.
  - **Filtros y paginación**: No envía filtros `from`, `to` ni `method` a `GET /sales` (filtra solo en cliente sobre los primeros 50), ni utiliza `page.nextCursor` para cargar más páginas.
  - **Reimpresión desde ventas reales**: Los objetos mapeados desde `/sales` tienen `items: []`, por lo que al pulsar `"Reimprimir Ticket"` no muestran líneas de productos hasta consultar `GET /api/v1/sales/{id}/ticket`.

Referencias: [guía caja CASH-01/02](../../backend/docs/cash-implementation.md), [guía frontend FIN-01](../../backend/docs/frontend-integration.md), [auditoría FE-GAP-01](tasks/FE-GAP-01-integration-audit.md).
