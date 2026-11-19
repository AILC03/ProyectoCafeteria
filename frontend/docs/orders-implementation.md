# Órdenes, Checkout Stripe y Cocina / Barista (KDS)

Documenta el ciclo completo de creación, consulta y preparación de órdenes en ambas aplicaciones
del frontend (`ORD-01`, `PREP-01` y `STR-01`).

## 1. Creación de órdenes móviles (`frontend/clientes/`)

### Cómo funciona hoy

1. El cliente agrega ítems desde `ProductCard` / `ProductModal` al `CartContext`.
2. En `CartDrawer.tsx`, elige tipo de entrega visual (`Tomar aquí en salón` / `Para llevar`) y método de pago (`CASH` o `STRIPE`).
3. Al pulsar `CONFIRMAR Y ORDENAR`, `CartContext.submitOrder()` invoca `createMobileOrder()` (`src/api/orders.ts`) → `POST /api/v1/orders`:
   - Envía `paymentMethod`, `items: [{ productId, quantity, optionValueIds }]`, `guestName` (si no hay `currentUser`), `includeCashQr: true` (si es `CASH`) e `includeCheckoutToken: true` (si es `STRIPE` e invitado).
   - Adjunta `X-CSRF-Token` e `Idempotency-Key` (`crypto.randomUUID()`).
   - Si falla por `403`/`400` estando como invitado (posible cookie residual de personal), limpia cookies con `logoutCustomer()` y reintenta.
4. Al éxito (`201`), construye el objeto `Order` con `folio`, `totalCents` y `cashQr` del backend, limpia el carrito y abre `OrderConfirmationModal.tsx`.

### Qué falta en órdenes móviles

- **Checkout Stripe (`POST /api/v1/orders/{id}/checkout`)**: Si el usuario selecciona `STRIPE`, `CartContext` ni siquiera guarda `response.checkout.token` ni solicita la sesión de Checkout. En su lugar abre `OrderConfirmationModal` como si el pedido ya estuviera en preparación (`En preparación`), lo cual es incorrecto tanto para `CASH` (pendiente de cobro) como para `STRIPE`. Falta:
  1. Conservar `response.checkout.token` solo en memoria (para invitado) o usar cookies (para `CLIENTE`).
  2. Cuando Stripe esté habilitado tras revisión, llamar a `POST /orders/{id}/checkout` con `Idempotency-Key` y `X-Checkout-Token` (si es invitado) y redirigir a `url`.
  3. Crear ruta `/pago/retorno` informando que la confirmación depende del backend y consultar `GET /orders/{id}` solo si es `CLIENTE` autenticado.
- **Límites y retención de `Idempotency-Key`**: Conservar la misma clave UUID en memoria hasta recibir respuesta exitosa o rechazo definitivo; validar límites de 50 líneas, 1–99 unidades y total `<= 9999900` centavos.
- **Tracker de estado en `OrderConfirmationModal.tsx`**: Para órdenes `CASH` `PENDIENTE_PAGO`, no mostrar el paso `"Barra"` pulsando como activo hasta que caja confirme el cobro; recordar al invitado que el llamado en barra será por folio/nombre y no hay consulta de estado en celular.
- **Formulario de correo en confirmación**: El input `"Enviar comprobante a tu correo"` en `OrderConfirmationModal.tsx` es simulado localmente y no está respaldado por ningún endpoint del backend.

---

## 2. Toma de órdenes en mostrador / POS (`frontend/empleados/`)

### Cómo funciona hoy (`OrderingWorkspace.jsx` + `App.jsx`)

1. Al cargar, consulta `GET /categories` y `GET /products` (con fallback a `localStorage` via `menuData.js`).
2. Permite buscar por nombre/descripción/SKU y filtrar por categoría.
3. Los productos agregados se agrupan en `cart` (con soporte de botones `En Espera` / `heldOrders` en memoria de sesión para pausar y restaurar comandas en mostrador).
4. El operador puede seleccionar `Comer Aquí` / `Para Llevar` e ingresar `tableOrCustomer` (usado como `guestName`).
5. Al pulsar `COBRAR ORDEN →` se abre `CheckoutModal.jsx` y, al confirmar en efectivo, `App.handleConfirmPayment()` llama a:
   - `createCashierOrder()` (`POST /api/v1/cashier/orders` con `paymentMethod: 'CASH'`, `guestName` e `includeCashQr: true`).
   - `chargeCashOrder()` (`POST /api/v1/payments/cash`) inmediatamente después.

### Qué falta y desajustes en toma de órdenes POS

1. **Cálculo erróneo de IVA (`+16%`)**: `OrderingWorkspace.jsx` (líneas 162–172) y `App.jsx` (líneas 367–377) calculan `taxAmount = rawSubtotal * 0.16` y `finalTotal = rawSubtotal + taxAmount`. Sin embargo, el backend suma exclusivamente `basePriceCents * quantity` (sin IVA adicional). Esto provoca que el cajero cobre y solicite efectivo por un monto 16% superior al que espera el backend (`409` si el cliente paga menos o cambio mal calculado en pantalla respecto a `paymentRes.payment.changeCents`).
2. **Sin personalización de opciones (`optionValueIds: []`)**: Al hacer clic en un producto en `OrderingWorkspace.jsx`, se agrega directamente sin consultar `GET /api/v1/products/{id}/options`. Todo producto configurado en PostgreSQL con un grupo obligatorio (`minSelections >= 1`, como tamaño) será **rechazado con `400`** por `POST /cashier/orders`.
3. **Sin búsqueda ni asociación de cliente**: Faltan controles en `OrderingWorkspace.jsx` para:
   - Buscar cliente por teléfono o `customerNumber` (`POST /api/v1/cashier/customers/search`).
   - Confirmar nombre del cliente y enviarlo en `customer: { identifier, confirmedName }` al crear la orden, o asociarlo antes del cobro a una orden pendiente (`PATCH /api/v1/cashier/orders/{id}/customer`).
4. **Productos agotados cliqueables**: `OrderingWorkspace.jsx` no deshabilita ni marca visualmente las tarjetas con `product.isAvailable === false`.
5. **Métodos `Tarjeta` y `Transferencia` en mostrador**: `CheckoutModal.jsx` permite seleccionarlos, pero `App.jsx` solo llama al backend cuando `method === 'cash'`, guardando las demás únicamente en `localStorage` (`db.saveOrder`).

---

## 3. Cocina / Barista — KDS (`KitchenWorkspace.jsx`)

### Cómo funciona hoy

1. Accesible automáticamente para el rol `PREPARACION` y desde el menú del header para `CAJERO` y `ADMINISTRADOR`.
2. Ejecuta `fetchOrders()` al montar y cada **8 segundos** mediante `setInterval`:
   - Llama a `getPreparationOrders()` (`GET /api/v1/preparation/orders?limit=50`), que devuelve únicamente órdenes en estado `EN_PREPARACION`.
   - En paralelo, solicita `getOrderDetails(ord.id)` (`GET /api/v1/orders/{id}`) para obtener `items` y sus `options`.
3. Muestra tarjetas con folio, nombre de cliente/invitado, hora de creación y lista de bebidas/alimentos con sus opciones.
4. Al pulsar `✓ Marcar como LISTO`, llama a `markOrderReady(ord.id)` (`POST /api/v1/orders/{id}/ready` `{}`), reproduce sonido háptico (`audio.js`) y retira la orden de la vista local.

### Qué falta y bug detectado en KDS

- **Bug de nombre de opción (línea 314)**: `KitchenWorkspace.jsx` renderiza `{opt.optionName}`, pero el DTO real del backend (`BackendOrderItem.options` según OpenAPI) envía **`valueName`** (`{ groupName, valueName, surchargeCents }`). Como resultado, el barista ve el nombre del grupo (ej. `• Tamaño:`) con el valor en blanco.
- **Manejo silencioso en detalles**: Si `getOrderDetails()` falla para una orden individual, devuelve `null` y la tarjeta queda indefinidamente mostrando `"Cargando ingredientes y preparación..."`.
- **Optimización de polling**: Si una orden permanece en pantalla, vuelve a consultar `GET /orders/{id}` para todas las órdenes en cada ciclo de 8 s en vez de cachear los detalles inmutables de órdenes ya descargadas.

Referencias: [guía órdenes backend](../../backend/docs/orders-implementation.md), [cobertura de endpoints](api/endpoints-coverage.md).
