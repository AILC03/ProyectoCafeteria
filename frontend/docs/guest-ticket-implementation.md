# Tickets térmicos, comprobante de invitado (`TKT-02`) y registro por QR (`AUTH-02`)

Documenta cómo funcionan la impresión de tickets en el POS y el registro de clientes por ticket,
así como la **brecha crítica de tokens** detectada entre `TKT-02`, `CASH-02` y `AUTH-02`.

## 1. Qué existe actualmente en el frontend

### Impresión de ticket térmico (`frontend/empleados/src/components/ReceiptModal.jsx`)

- Renderiza una vista térmica estilizada en monoespacio con:
  - Nombre de negocio configurado en `localStorage` (`coffees_pos_account`) y RFC ilustrativo estático (`CFP-260927-POS`).
  - Número de ticket / folio, tipo (`COMER AQUÍ` / `PARA LLEVAR`), fecha/hora, cliente/mesa y cajero.
  - Desglose de productos, cantidades, subtotal, IVA (si existe en objeto), método de pago, efectivo entregado y cambio.
  - Bloque opcional `REGISTRO DE CLIENTE FRECUENTE` si `order.registrationToken` está presente.
  - Pie personalizable desde `MenuModal.jsx` (`coffees_ticket_footer`) y ancho conmutable entre **80 mm** (`440px`) y **58 mm** (`360px`).
- Ejecuta la impresión mediante `window.print()` con reglas `@media print` en `src/styles/index.css`.

### Registro con token de ticket (`frontend/clientes/src/pages/AuthPage.tsx` + `src/api/registration.ts`)

- La pestaña `REGISTRAR CON TICKET` solicita:
  - `Nombre Completo` (3–60 caracteres, solo letras y espacios; el backend admite 1–120).
  - `Teléfono Móvil` (10 dígitos; `registerWithTicket` normaliza a `+52...`).
  - `PIN Secreto` (4 dígitos con `PinInput.tsx`).
  - `Código de Registro del Ticket` (validación UI de 40 a 50 caracteres).
- Envía `POST /api/v1/customer-registration/ticket` con CSRF e inmediatamente ejecuta `login(cleanPhone, regPin)` para iniciar sesión automática en la UI.

---

## 2. Brecha crítica: confusión entre token `TKT-02` y token `AUTH-02`

En el contrato [OpenAPI 0.11.0](../../backend/docs/api/openapi.yaml), existen **dos tokens distintos** tras el pago en efectivo de un invitado:

| Característica | Token de registro (`AUTH-02` / `CASH-02`) | Token de ticket digital (`TKT-02`) |
| --- | --- | --- |
| **Endpoint que lo entrega** | `GET /api/v1/sales/{id}/ticket` (`ticket.path` devuelto al cobrar) | `POST /api/v1/sales/{id}/ticket-access` |
| **Propósito (`purpose`)** | `CUSTOMER_REGISTRATION` (`data.registration.token`, `qrPayload`: `cafeteria:register:<token>`) | `GUEST_TICKET` (`data.token`) |
| **Dónde se usa** | `POST /api/v1/customer-registration/ticket` (alta de cliente) | `GET /api/v1/guest-ticket` con cabecera `X-Ticket-Token` |
| **Efecto de reemitir** | Reimprimir `GET /sales/{id}/ticket` conserva el mismo token original | Llamar a `POST /sales/{id}/ticket-access` revoca accesos digitales previos |

### Qué hace erróneamente `frontend/empleados/src/App.jsx` hoy

En `App.jsx` líneas 412–421:

```js
if (backendSaleId) {
  const ticketRes = await issueTicketAccess(backendSaleId); // Llama a POST /sales/{id}/ticket-access
  if (ticketRes?.token) {
    registrationToken = ticketRes.token; // Lo asigna como registrationToken
  }
}
```

Y luego `ReceiptModal.jsx` (líneas 145–174) imprime ese `registrationToken` bajo el título:
> *"REGISTRO DE CLIENTE FRECUENTE — Ingresa este código en la app de clientes para activar tu cuenta"*

**Consecuencia real**: Cuando un invitado intenta registrarse en `frontend/clientes/` ingresando el código impreso en su ticket de mostrador, el backend rechaza la solicitud con **`404 REGISTRATION_TOKEN_INVALID`**, porque recibió un token de propósito `GUEST_TICKET` en lugar del token de propósito `CUSTOMER_REGISTRATION`.

---

## 3. Todo lo que falta por implementar en Tickets

1. **Consumir `GET /api/v1/sales/{id}/ticket` al finalizar el cobro** (tanto en `App.handleConfirmPayment` como en `ScanQrModal.handleCharge`):
   - Obtener el comprobante JSON oficial desde snapshots del backend (`saleNumber`, `orderFolio`, `items`, `cashReceivedCents`, `changeCents`).
   - Si `ticket.data.registration !== null`, renderizar `registration.qrPayload` (`cafeteria:register:<token>`) como código QR escaneable + texto alternativo + fecha de expiración (`registration.expiresAt`, 24 h) en `ReceiptModal.jsx`.
   - Recordar las reglas de seguridad de `CASH-02`: no guardar `registration.token` en `localStorage` ni caches persistentes (actualmente `db.saveOrder(orderRecord)` lo persiste en `coffees_orders_local` en `localStorage`).
2. **Separar el flujo de comprobante digital (`TKT-02`)**:
   - Agregar un botón explícito en caja/historial para emitir acceso digital (`POST /api/v1/sales/{id}/ticket-access`) únicamente cuando se requiera entregar comprobante digital al invitado.
   - Crear una vista en `frontend/clientes/` (o ruta dedicada) capaz de consultar `GET /api/v1/guest-ticket` enviando `X-Ticket-Token` en cabecera (sin poner el token en la URL hacia el backend ni en `localStorage`).
3. **Ticket propio de cliente autenticado (`FIN-01`)**:
   - Agregar vista en `frontend/clientes/` (`OrderHistoryModal.tsx`) para consultar `GET /api/v1/customers/me/orders/{id}/ticket` en órdenes pagadas propias.
4. **Escaneo de QR de registro en `AuthPage.tsx`**:
   - Permitir escanear o pegar el payload completo `cafeteria:register:<token>`, retirando el prefijo `cafeteria:register:` antes de enviarlo a `/customer-registration/ticket` (actualmente `maxLength={43}` corta el payload si el usuario pega con el prefijo).
   - Respetar las validaciones reales del backend en `AuthPage.tsx`: el nombre en backend admite de 1 a 120 caracteres (no solo 3–60 ni restringido por regex de letras ASCII/español) y manejar errores `404` / `409` (`PHONE_ALREADY_REGISTERED`, `REGISTRATION_TOKEN_USED`, `REGISTRATION_TOKEN_EXPIRED`) y `429` (`REGISTRATION_RATE_LIMITED`).
5. **Eliminar información estática falsa del ticket**:
   - Retirar el RFC ficticio `CFP-260927-POS` en `ReceiptModal.jsx` o hacerlo configurable, y asegurar escape de texto en nombres de catálogo al imprimir.

Referencias: [TKT-02 backend](../../backend/docs/guest-ticket-implementation.md), [CASH-02 backend](../../backend/docs/cash-implementation.md), [AUTH-02 backend](../../backend/docs/tasks/AUTH-02-ticket-qr-registration.md).
