# Guía viva de integración para frontend

## Integración vigente — FIN-01, OpenAPI 0.11.0 (2026-11-10)

**Rutas implementadas y pruebas con proveedores simulados; no despliegue.** Antes
de conectar pantallas, coordinar migraciones y configuración con Ángel. Stripe real
permanece deshabilitado en server/worker: sus rutas devuelven 503 sin proveedor
inyectado/autorizado. No mostrar tarjeta operativa por existir el contrato. Correo
requiere clave de outbox y worker/buzón local. [Operación y límites](backend-completion.md).
Las continuidades con versiones inferiores documentan el corte de cada entrega.

### Ventas y cuentas

- Caja/admin: `GET /sales?from=<ISO-UTC>&to=<ISO-UTC>&method=CASH&limit=20` y
  `GET /sales/summary` con los mismos filtros (sin limit/cursor en resumen).
  `from` inclusivo, `to` exclusivo. El resumen suma todo el conjunto filtrado,
  no la página; son ventas históricas, no ingresos netos de reembolsos. Reiniciar
  cursor al cambiar filtros. IDs, count y centavos son strings; no convertir a
  Number para sumar ni identificar recursos. Preparación y clientes no acceden.
- Cliente: `PATCH /customers/me` con `{name}` o `{phone,currentPin}` (combinables).
  NIP string de cuatro dígitos; teléfono MX único. Cambiar teléfono cierra sesiones
  y limpia cookies: vaciar estado de sesión y ofrecer login con teléfono nuevo o
  número de cliente. No enviar customerId/rol/correo por esta ruta.
- Ticket propio: `GET /customers/me/orders/{id}/ticket`, solo orden propia pagada;
  `registration=null`. Admite CASH y STRIPE; campos de efectivo son null en tarjeta.
- Admin: `GET /admin/employees` paginado, `POST /admin/employees`
  `{name,username,password,role}`, `PATCH /admin/employees/{id}` con al menos un
  cambio de name/role/isActive y `reason`. Baja con `isActive:false`, nunca DELETE.
  No enviar password en PATCH. Roles de personal: CAJERO/PREPARACION/ADMINISTRADOR.
  Cambiar acceso revoca sesiones. No desactivar/degradar la propia cuenta ni impedir
  operar al responsable de caja abierta; cerrar caja por el flujo normal primero.
- Corrección administrativa: `PATCH /admin/customers/{id}` con name/phone y reason.
  Se audita; no modifica compras. El cajero conserva exclusivamente búsqueda mínima.

### Correo, recuperación y reset presencial

1. Cliente solicita `POST /customers/me/recovery-email` con `{email}`. Responde
   202 `{data:{accepted:true}}`, nunca devuelve token. Mostrar que el correo anterior
   sigue vigente hasta verificar el nuevo; no marcar verificado localmente.
2. El enlace de pruebas termina en `/verificar-correo#token=...` o
   `/recuperar-nip#token=...`. Capturar fragmento solo en memoria y borrarlo
   inmediatamente con `history.replaceState`; no analytics, logs, cache, query ni
   localStorage. Obtener CSRF; enviar token exclusivamente en JSON al backend.
3. Verificar: `POST /auth/email-verification` `{token}`; 204. Recuperar:
   `POST /auth/pin-recovery` `{identifier}` (teléfono/número). Respuesta genérica 202,
   exista o no la cuenta/correo verificado; no mostrar mensajes de enumeración.
4. Confirmar recuperación: `POST /auth/pin-recovery/confirm` `{token,newPin}`; 204,
   sin login automático. Tokens de 30 minutos, un uso; 404 si no disponible, 429
   límite temporal. No reintentar confirmaciones automáticamente tras una pérdida
   de respuesta: ofrecer login con NIP elegido o solicitar enlace nuevo.
5. Admin presencial: `POST /admin/customers/{id}/pin-reset`
   `{temporaryPin,reason,verificationSummary,recentSaleId}`. Contrastar identidad
   presencialmente y seleccionar la **última** venta pagada asociada. 204 sin devolver
   NIP. Mostrar/entregar el valor introducido solo por canal presencial seguro,
   nunca registrarlo. Login posterior obliga cambio con `/auth/pin`; resto bloqueado
   con `PIN_CHANGE_REQUIRED`. Cajero no tiene este permiso.

Todas las mutaciones anteriores requieren Origin/CSRF y cookie cuando sean privadas.
No usan Idempotency-Key. Reenviar una solicitud de enlace revoca enlaces anteriores.

### Stripe y tickets (proveedor simulado en pruebas)

1. Crear orden con `paymentMethod:'STRIPE'`. Si es invitado, añadir
   `includeCheckoutToken:true`; respuesta añade `checkout:{purpose,token,expiresAt}`.
   Solo en memoria, distinto de QR CASH, registro y X-Ticket-Token. El opt-in requiere
   cifrado de tickets; cliente autenticado no debe enviarlo.
2. `POST /orders/{id}/checkout`, body `{}`, Origin/CSRF e Idempotency-Key UUID v4.
   Cliente: cookies de propietario. Invitado: `X-Checkout-Token:<token>` sin cookies
   de acceso/refresh. Reintentar la misma operación con la misma clave; no abrir otra
   orden por timeout. Respuesta `{data:{paymentId,checkoutSessionId,url,expiresAt}}`.
3. Redirigir a URL retornada solo cuando el proveedor haya sido habilitado tras
   revisión. La vuelta a `/pago/retorno` **no confirma pago**, ni implica cancelación.
   El backend confirma por webhook/reconciliación; nunca enviar paidAt/total/estado.
   Cliente puede releer su orden con cookies. Invitado no consulta estado/folio.
4. Caja/admin conserva impresión y emisión de acceso digital vía ventas/tickets,
   ahora también para Stripe pagado. El acceso digital usa X-Ticket-Token y conserva
   el límite exclusivo al comprobante, sin QR de registro. Para registro, usar el
   QR correspondiente del ticket protegido; no confundir permisos. El canal remoto
   de entrega al invitado corresponde a frontend y aún debe coordinarse.
5. Nunca enviar datos de tarjeta al backend. Webhook es exclusivo de Stripe:
   frontend no lo llama. Worker expira efectivo y reconcilia Stripe; no simular
   EXPIRADA solo por el contador visual. Un 503 es indisponibilidad, no un pago.

### Checklist de integración

- Confirmar OpenAPI 0.11.0 y entorno/migraciones disponibles con Ángel.
- Probar sesión/refresh coordinado entre pestañas, CSRF renovado y 401/403/429/503.
- Cubrir éxito, vacío, validación, red incierta, reintentos y rol incorrecto por pantalla.
- Separar claramente simulación de proveedor y flujo habilitado; nunca presentar
  mocks como cobros, envío de correo o despliegue reales.
- Escapar texto de catálogo/snapshots antes de imprimir y no persistir secretos.

### Continuidad FAV-01 — OpenAPI 0.10.0

Favoritos propios: GET `/api/v1/customers/me/favorites?limit=20&cursor=<cursor>`;
PUT/DELETE `/api/v1/customers/me/favorites/{productId}` con body ausente o `{}`.
Solo CLIENTE con cookie/sesión vigente; PUT/DELETE llevan Origin y CSRF, devuelven
204 y no usan Idempotency-Key. Guardan producto, nunca configuración. Lista con
catálogo actual: agotados visibles, retirados/categoría oculta no aparecen aunque
la fila se conserva. No habilitar favoritos personales para personal/administrador.

Repetir: POST `/api/v1/customers/me/orders/{id}/repeat-preview`, `{}`, con sesión
CLIENTE/propiedad, Origin y CSRF. Mostrar selección y todos los avisos; no quitar
ni sustituir IDs/opciones silenciosamente. Con bloqueo: canCreateOrder=false y
totalCents=null; permitir corrección/reselección mediante catálogo vigente. Si se
confirma, POST `/api/v1/orders` existente con nueva Idempotency-Key, método elegido
y solo IDs/cantidad/opciones por línea. Preview no crea orden ni reserva precio;
la creación revalida todo. [Guía y códigos de avisos](favorites-implementation.md).

### Continuidad CUS-01 — OpenAPI 0.9.0

Lecturas propias: GET `/api/v1/customers/me` y GET
`/api/v1/customers/me/orders?limit=20&cursor=<cursor>` con cookie CLIENTE
(`credentials: include`), sin body ni CSRF. Perfil: número visible, nombre,
teléfono, correo/fecha de verificación opcionales y creación; no edición todavía.
Historial: resúmenes de todas sus órdenes asociadas, no solo pagadas, sin simular
expiración al leer. Ascendente por (createdAt,id), limit 1–100 y cursor opaco;
respetar nextCursor y refrescar primera página para nuevas asociaciones históricas.
Para detalle/snapshots usar GET `/api/v1/orders/{id}` existente. No hay consulta
de estado/historial para invitados, QR ni acceso de personal a estas rutas propias.
ADMINISTRADOR no hereda CLIENTE. No mostrar verificación/recuperación como flujo
disponible por recibir metadatos de correo. [Guía y errores](customers-implementation.md).

### Continuidad CASH-03 — OpenAPI 0.8.0

QR efectivo: al crear orden CASH se puede enviar `includeCashQr: true`; el resultado
añade `cashQr` junto a `data`, con purpose/token/qrPayload/expiresAt. Ausente/false
mantiene respuesta anterior. Renderizar `cafeteria:cash:<token>` solo en memoria.
Reintentos de creación conservan QR/plazo originales 48h, no consultan estado actual.

Caja puede emitir/reimprimir con POST `/api/v1/cashier/orders/{id}/cash-qr`, `{}`.
Escaneo: POST `/api/v1/cashier/orders/scan-cash-qr`, `{token}` sin prefijo, con
sesión CAJERO/ADMINISTRADOR, Origin y CSRF; no URL/query. Devuelve datos mínimos
de cobro/snapshots. Confirmar recibido/cambio y usar `/payments/cash` existente
con Idempotency-Key; escanear no confirma pago ni sustituye caja/responsable.
No confundir QR CASH con registro ni con X-Ticket-Token. Antes de activar,
coordinar migración y clave de cifrado, que debe conservarse 48h para reintentos.
[Guía completa](cash-qr-implementation.md). Cámara/renderizado y revisión humana
no se implementan/configuran desde este backend.

Actualizada: 2026-11-10 (FIN-01). Responsable de coordinación: Ángel. Esta guía sirve al
frontend para consumir el backend actual y debe actualizarse en la misma entrega
que cambie un contrato, permiso, flujo o estado de implementación.

La fuente técnica exacta de cada petición es [OpenAPI](api/openapi.yaml). Esta guía
explica cómo usarla; no sustituye los esquemas, ejemplos ni códigos de error del contrato.

### Continuidad TKT-02 — OpenAPI 0.7.0

API local de comprobante digital CASH implementada/verificada, pendiente revisión
humana e integración frontend. Caja (CAJERO/ADMINISTRADOR) solicita
`POST /api/v1/sales/{id}/ticket-access` con body `{}`, sesión, Origin y CSRF.
Devuelve `{data:{purpose,token,expiresAt,path}}`; cada éxito rota el permiso y revoca
anteriores, sin prolongar las 24h desde el pago. No reintentar automáticamente:
una respuesta perdida requiere reemisión consciente desde caja.

Enviar `GET /api/v1/guest-ticket` con `X-Ticket-Token: <token>` exclusivamente,
sin query/body. Lectura repetible del comprobante, nunca estado, historial, cuenta
ni QR de registro. Conservar original solo en memoria; sin URL, QR/enlace,
localStorage, caché, logs o analítica. No se implementa canal de entrega remota
ni impresión. QR de cobro/escaneo quedó implementado en CASH-03; FIN-01 amplía
comprobantes a STRIPE pagado. [Detalles y errores](guest-ticket-implementation.md).

## 1. Estado actual del backend

| Área                    | Estado                                                              | Qué puede construir frontend ahora                                                                   |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Catálogo público        | Implementado                                                        | Menú, categorías, detalle de producto y selección de opciones.                                       |
| Autenticación           | Implementada                                                        | Login de cliente/personal, sesión actual, refresh, logout y cambio de NIP/contraseña.                |
| Administración          | Implementada                                                        | Catálogo, disponibilidad, configuraciones y flujo de carga de imágenes.                              |
| Órdenes ORD-01          | Implementado y verificado en `dev`; pendiente de fusionar a `main`  | Crear órdenes pendientes, consultar según rol, asociar cliente en caja y vista de preparación/LISTO. |
| Caja y cobro efectivo   | Implementado; pendiente revisión/integración                        | Caja, cobro, QR CASH/escaneo, ticket y registro QR.                                                  |
| Stripe                  | Implementado con pruebas simuladas; proveedor runtime deshabilitado | Preparar flujo contra contrato; no habilitar cobro hasta prueba externa autorizada.                  |
| Registro QR AUTH-02     | Implementado/verificado localmente; pendiente revisión/integración  | Formulario con token de ticket pagado, CSRF y login posterior; sin sesión automática.                |
| Clientes y recuperación | Implementados; correo exige outbox/worker configurados              | Perfil/edición, historial, favoritos/repetición, verificación y recuperación; ver FIN-01.            |
| Ventas y empleados      | Implementados                                                       | Ventas/resumen para caja/admin; empleados y reset presencial solo admin.                             |
| Cloudinary              | Flujo backend implementado; proveedor real pendiente                | Preparar interfaz de imagen; validar con el equipo antes de habilitarla contra una cuenta real.      |

## 2. Archivos que se deben leer antes de implementar una pantalla

Leerlos en este orden:

1. [OpenAPI](api/openapi.yaml): rutas, entradas, respuestas, ejemplos, seguridad y errores.
2. [Reglas de negocio](business-rules.md): estados de órdenes, pagos, QR, históricos y límites.
3. [Matriz de permisos](permissions.md): qué puede hacer cada rol.
4. [Estado vigente](PROJECT-CONTEXT.md) y [avance](backend-progress.md): qué existe y qué sigue pendiente.
5. [Órdenes ORD-01](orders-implementation.md), [caja CASH](cash-implementation.md) y
   [registro QR AUTH-02](tasks/AUTH-02-ticket-qr-registration.md): alcance y límites por entrega.
6. [Autenticación y administración](auth-admin-implementation.md): cookies, CSRF, roles y catálogo administrativo.
7. [Guía de desarrollo](development-guide.md) y [flujo de trabajo](workflow/README.md): cómo proponer y validar cambios que afecten el contrato.

Si una pantalla necesita una ruta que no aparece en OpenAPI, se debe acordar y
documentar primero. No crear una integración que dependa de campos o endpoints supuestos.

## 3. Configuración de comunicación

- La API usa el prefijo `/api/v1`.
- En desarrollo el origen frontend esperado es `http://localhost:5173`; debe configurarse
  en el backend mediante `FRONTEND_ORIGIN` para cada entorno.
- El backend permite credenciales, por lo que las solicitudes del frontend deben incluir
  cookies con `credentials: 'include'`.
- IDs e importes se reciben y envían como **cadenas decimales**, no como `number`.
  Ejemplos: `"15"`, `"6500"`. El frontend convierte `"6500"` a `$65.00` solo para mostrarlo.
- Las fechas son ISO 8601 UTC. Convertirlas únicamente en la capa de presentación.
- Las listas usan `{ data, page: { limit, nextCursor } }`. El cursor es opaco: conservarlo
  y enviarlo tal cual; nunca intentar modificarlo o calcularlo.

Ejemplo mínimo de cliente HTTP:

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });
  return response;
}
```

No guardar JWT, refresh token, NIP, contraseña ni cookie en `localStorage`.
`localStorage` puede guardar datos no sensibles como el carrito temporal de un invitado,
preferencias de interfaz o filtros de catálogo.

## 4. Sesión, cookies y CSRF

El backend usa cookies `HttpOnly`: el navegador las envía, pero JavaScript no debe
leerlas ni intentar guardarlas. El frontend conserva solamente el dato CSRF actual en
memoria y el usuario mostrado por `/auth/me` o por la respuesta de login.

### Flujo inicial

1. Al iniciar la aplicación, llamar `GET /auth/csrf`.
2. Guardar `data.csrfToken` en memoria de la aplicación.
3. Enviar ese valor en la cabecera `X-CSRF-Token` de cada `POST`, `PATCH`, `PUT` o
   `DELETE`, incluso si la acción es de invitado.
4. Enviar `Origin` desde el navegador normal y `credentials: 'include'`.
5. Después de login o refresh, reemplazar el token en memoria por el
   `data.csrfToken` nuevo que responda el backend.

```ts
let csrfToken: string | undefined;

async function bootstrapCsrf() {
  const response = await api('/auth/csrf');
  const body = await response.json();
  csrfToken = body.data.csrfToken;
}

async function mutation(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) {
  return api(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken ?? '',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
```

El frontend debe tratar estos resultados así:

| Resultado                           | Comportamiento de interfaz                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `401`                               | Sesión ausente, vencida o revocada. Limpiar estado visual no sensible y volver a login.                                 |
| `403` con `CSRF_INVALID`            | Solicitar CSRF de nuevo y permitir que la persona repita la acción.                                                     |
| `403` con `PIN_CHANGE_REQUIRED`     | Llevar solo a cambio de NIP o cierre de sesión.                                                                         |
| `409` con `REFRESH_ALREADY_ROTATED` | Esperar/reintentar refresh una vez con la cookie actual; no cerrar sesión de inmediato.                                 |
| `429`                               | Informar límite temporal y evitar reintentos automáticos agresivos.                                                     |
| `application/problem+json`          | Mostrar un mensaje humano y usar `code` para el comportamiento de la pantalla. No mostrar detalles técnicos al usuario. |

## 5. Roles y áreas de interfaz

| Rol           | Área principal | Lo que ya puede consumir                                                                                                                         |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invitado      | Móvil          | Catálogo y creación de orden pendiente. No consulta órdenes por folio ni historial.                                                              |
| CLIENTE       | Móvil          | Catálogo, login, cambio de NIP y sus propias órdenes por ID.                                                                                     |
| CAJERO        | Caja           | Órdenes operativas, búsqueda/asociación mínima, preparación, disponibilidad, caja propia, cobro CASH y ticket protegido. Sin historial personal. |
| PREPARACION   | Preparación    | Consulta de órdenes `EN_PREPARACION` y acción `LISTO`.                                                                                           |
| ADMINISTRADOR | Administración | Hereda caja; catálogo/opciones/imágenes, empleados, correcciones y reset presencial auditado.                                                    |

El frontend puede ocultar o mostrar navegación por rol, pero nunca debe interpretar
eso como autorización suficiente: el backend siempre vuelve a validar rol, sesión y
estado actual.

## 6. Catálogo público

| Ruta                                                    | Uso en frontend                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /categories`                                       | Navegación de categorías visibles.                                       |
| `GET /products?categoryId=&isAvailable=&limit=&cursor=` | Lista de productos, filtros y paginación.                                |
| `GET /products/{productId}`                             | Detalle de un producto.                                                  |
| `GET /products/{productId}/options`                     | Personalización: grupos, mínimos, máximos, valores y recargos efectivos. |

Reglas de interfaz:

- Un producto agotado puede mostrarse, pero no debe poder agregarse al carrito.
- No calcular el precio definitivo solo con el frontend. Puede mostrarse una estimación,
  pero el backend vuelve a calcular al crear la orden.
- Para cada grupo, controlar mínimo/máximo de selecciones y no permitir valores repetidos.
- Si el backend rechaza una creación porque catálogo, disponibilidad o precio cambió,
  actualizar catálogo/carrito y mostrar la causa sin intentar forzar la orden.

## 7. Autenticación disponible

| Ruta                        | Uso                                                                          |
| --------------------------- | ---------------------------------------------------------------------------- |
| `GET /auth/csrf`            | Obtener token CSRF antes de mutaciones.                                      |
| `POST /auth/login/staff`    | Inicio de sesión de cajero, preparación o administrador.                     |
| `POST /auth/login/customer` | Inicio de sesión de cliente con teléfono o `customerNumber` y NIP.           |
| `POST /auth/refresh`        | Renovar sesión; usar control de una sola solicitud simultánea por navegador. |
| `POST /auth/logout`         | Cerrar sesión.                                                               |
| `GET /auth/me`              | Recuperar persona/rol de la sesión actual.                                   |
| `PATCH /auth/pin`           | Cliente cambia NIP con el NIP actual.                                        |
| `PATCH /auth/password`      | Personal cambia contraseña con la contraseña actual.                         |

El frontend debe tener un único gestor de sesión. Cuando varias solicitudes reciban
`401`, ese gestor intenta un refresh; no debe abrir varios refresh en paralelo. Si el
refresh falla definitivamente, redirige una sola vez al login.

No existe todavía registro público, recuperación por correo ni recuperación manual
por administrador. Esas pantallas pueden diseñarse, pero no deben conectarse a una
ruta inventada.

## 8. Administración y disponibilidad

Las rutas bajo `/admin` requieren ADMINISTRADOR, sesión y CSRF en mutaciones. El
cajero solo puede cambiar disponibilidad mediante:

```text
PATCH /products/{id}/availability
```

La administración ya puede gestionar categorías, productos, grupos de opciones,
valores, configuración de un producto e imágenes. Antes de implementar cada pantalla,
usar el esquema exacto de OpenAPI para crear, editar o eliminar.

Para imágenes, el flujo es de dos pasos: solicitar autorización de carga y finalizar
la asociación. El navegador no recibe ni utiliza `CLOUDINARY_API_SECRET`. Mientras no
se confirme la cuenta real de Cloudinary, tratar esta función como disponible para
desarrollo/pruebas y coordinar su activación con backend.

## 9. Órdenes actuales (ORD-01)

### Crear orden móvil

```text
POST /orders
```

Disponible para invitado y cliente. Requiere CSRF e `Idempotency-Key` UUID v4. El
cliente autenticado se asocia desde la sesión; un invitado puede mandar `guestName`.
No enviar precio, total, estado, fuente, `customerId` ni snapshots.

```json
{
  "paymentMethod": "CASH",
  "guestName": "Ana",
  "items": [
    {
      "productId": "1",
      "quantity": 2,
      "optionValueIds": ["9"]
    }
  ]
}
```

Una acción de crear orden debe generar una clave de idempotencia y conservarla hasta
recibir resultado. Si hay problema de red, repetir con la **misma** clave y el mismo
cuerpo. Para una orden nueva, generar una clave distinta.

La respuesta crea una orden `PENDIENTE_PAGO` con vencimiento de 30 minutos. Elegir
`CASH` o `STRIPE` no cobra ni abre caja por sí solo. Opt-ins permiten QR CASH o
permiso Checkout de invitado; Checkout se solicita por separado según FIN-01.

### Caja y asociación de cliente

```text
POST  /cashier/customers/search
POST  /cashier/orders
PATCH /cashier/orders/{id}/customer
```

La búsqueda es exacta por teléfono México o `customerNumber`. Solo devuelve ID, nombre
y número de cliente. El cajero debe pedir confirmación del nombre antes de asociar.
La asociación funciona únicamente antes del pago y vencimiento; después no se intenta
modificar desde frontend.

### Preparación

```text
GET  /preparation/orders
POST /orders/{id}/ready
```

La lista contiene solo `EN_PREPARACION`. La acción `ready` solo sirve para una orden
pagada y en ese estado; CASH y STRIPE exigen pago exitoso y venta coherente. Al confirmarse,
retirar la orden de la lista sin borrarla del historial. No enviar estado/paidAt:
el cobro CASH o confirmación Stripe hacen la transición a preparación transaccionalmente.

## Caja y efectivo — entrega local CASH-01/CASH-02

Consultar [guía de caja](cash-implementation.md) y OpenAPI 0.11.0. Pendiente revisión
e integración; no confundir implementación local con despliegue activo.

1. `GET /cash-sessions/current`: data=null significa sin caja abierta. Mostrar
   responsable y resumen; ver caja ajena no concede permiso para cobrar/cerrar.
2. `POST /cash-sessions` con `{openingAmountCents}`. Requiere CSRF y clave UUID v4
   de idempotencia, como crear orden. Una carrera de apertura produce 409 para el perdedor.
3. `POST /payments/cash` con `{cashSessionId,orderId,cashReceivedCents}`. Solo responsable
   de sesión abierta. El backend calcula cambio desde snapshots; no enviar total.
   `changeCents` opcional es solo aserción: si difiere, el backend rechaza 409.
4. Ante red incierta, repetir mismo cuerpo/clave. No generar otra clave ni simular
   pago en UI. El resultado incluye pago, venta, orden y `ticket.path`, sin token.
5. Recuperar el ticket mediante GET a `ticket.path` con sesión de cajero/admin.
   Renderizar/imprimir JSON de snapshots con texto escapado. Si `registration` no
   es null, renderizar su `qrPayload` como QR de **registro AUTH-02**, junto con su
   vencimiento. No es QR de pago ni URL navegable. El alta backend está disponible
   localmente; conectar el formulario según la sección de registro QR tras revisión.
   Nunca registrar/cachear token/QR, ponerlo en URL backend ni guardarlo en localStorage.
   Reimpresión conserva token y plazo; usado/vencido o cliente asociado no lleva QR.
6. `POST /cash-sessions/{id}/close` con `{countedCashCents}`: backend calcula
   esperado/diferencia. Admin solo cierra ajena con `exceptionalCloseReason` no vacío;
   esa excepción no le permite cobrar por otro responsable.

Apertura, cierre y cobro exigen Idempotency-Key y CSRF. Después de un replay,
refrescar caja actual/resumen: la respuesta idempotente es la original, no estado vivo.
Un 409 CASH_CONFLICT exige revisar caja/orden/importe, no forzar el estado.
503 al cobrar invitado puede indicar falta de configuración segura de tickets;
no confirmar venta visualmente ni intentar sortearlo. La impresión/renderizador
frontend y el manejo final del QR de registro siguen por implementar fuera de este repo.
Si el cobro ya respondió 201 pero falla el GET del ticket, conservar referencias
de pago/venta y reintentar solo la impresión tras resolver configuración; nunca
iniciar otro cobro con una clave nueva por un fallo de impresión.

## 10. Pendientes reales de integración

No faltan las APIs funcionales enumeradas en FIN-01; sí su revisión humana y
configuración de entorno. Restan proveedor Stripe test autorizado, buzón/correo,
Cloudinary real, canal de entrega/impresión de tickets y frontend. Mantener simulación
separada; no añadir rutas supuestas ni asumir servicios remotos activos.

## 11. Registro QR de ticket — AUTH-02 (local, pendiente revisión/integración)

1. Escanear `cafeteria:register:<token>` del ticket; enviar solo `<token>` original.
   No confundir con QR de cobro ni ticket digital. No ponerlo en URL, logs,
   analytics, localStorage ni mensajes de error; conservarlo solo en memoria.
2. El flujo es de invitado: sin cookies de acceso/refresh. Si hay sesión, cerrar
   sesión mediante auth normal antes de registrar otra cuenta. Obtener CSRF con
   `GET /api/v1/auth/csrf`, enviar credentials/include, Origin permitido y X-CSRF-Token.
3. `POST /api/v1/customer-registration/ticket`, JSON estricto:
   `{token,name,phone,pin}`. Nombre trim 1–120, teléfono MX de 10 dígitos o +52,
   sin separadores; NIP **string** de exactamente cuatro dígitos, incluidos ceros.
4. 201 `{data:{customer:{customerNumber:"C000123",name:"Ana López",phone:"+526641234567"}}}`.
   Número con prefijo C según ADR0011, no CLI-. Sin IDs internos, cookies ni JWT.
   Mostrar confirmación y ofrecer login normal; no considerar autenticado al cliente.
5. 400 `VALIDATION_ERROR`; 404 `REGISTRATION_TOKEN_INVALID`; 409
   `REGISTRATION_TOKEN_EXPIRED`, `REGISTRATION_TOKEN_USED`,
   `REGISTRATION_PURCHASE_INELIGIBLE`, `PHONE_ALREADY_REGISTERED`.
   Teléfono existente no consume el QR: ofrecer login, no un segundo registro.
   Token usado no reentrega identidad. Ante respuesta perdida no repetir el alta
   automáticamente ni asumir sesión; ofrecer login/asistencia sin revelar otra cuenta.
6. Límite propio 20 intentos/minuto/IP (por proceso), 429
   `REGISTRATION_RATE_LIMITED`, además del límite global. Respetar Retry-After.
   Deshabilitar envío concurrente en UI; no se requiere Idempotency-Key.

El backend consume el QR y asocia solo su compra en una transacción. Se conserva
histórico y se elimina la copia cifrada del token, no su hash. Caduca como máximo
24h tras pago; un QR no permite consultar órdenes/historial ni asociar otras compras.
Sin verificación SMS ni recuperación de NIP en esta entrega. Contrato exacto:
[OpenAPI](api/openapi.yaml); evidencia [AUTH-02](tasks/AUTH-02-ticket-qr-registration.md).

## 12. Errores, carga y accesibilidad

- Todas las peticiones pueden devolver `application/problem+json`. Crear una función
  común que convierta `code`, `status` y `requestId` en estado de interfaz.
- Para errores de validación, mostrar los campos relevantes sin exponer el objeto técnico
  completo ni inventar reglas que el contrato no define.
- Deshabilitar el botón mientras se procesa una mutación, pero mantener la clave de
  idempotencia para reintentar ante red inestable.
- Usar estados de carga, vacío, error y éxito en cada pantalla. Preparación y caja deben
  ser legibles en tableta; menú y carrito deben priorizar móvil.
- Mantener etiquetas, foco visible, navegación por teclado, contraste y mensajes de error
  accesibles. Un QR debe tener texto alternativo y una alternativa cuando no se pueda escanear.

## 13. Cómo actualizar esta guía

Al terminar una tarea backend que cambie integración:

1. Actualizar OpenAPI y validarlo antes de dar por disponible una ruta.
2. Cambiar la tabla de estado, las rutas y los flujos de esta guía.
3. Indicar si la función está propuesta, implementada en `dev`, verificada o integrada en `main`.
4. Añadir una entrada al historial con fecha, tarea, rutas afectadas y acción necesaria
   para frontend.
5. Avisar al responsable de frontend antes de romper o cambiar un contrato existente.

### Historial de cambios

| Fecha      | Cambio                                           | Impacto para frontend                                                                                                                |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-10 | FIN-01, OpenAPI 0.11.0                           | Ventas/cuentas/correo/Stripe/worker y tickets Stripe/propios; checklist e instrucciones vigentes, proveedores reales deshabilitados. |
| 2026-11-09 | Conciliación documental, sin cambio de contrato. | Registro QR final ya disponible localmente; preparación existente y permisos de cajero aclarados.                                    |
| 2026-10-31 | AUTH-02 registro QR local; OpenAPI 0.6.0.        | Integrar formulario con CSRF, token solo en memoria y login posterior; no sesión automática.                                         |
| 2026-10-27 | CASH-01/02 local, OpenAPI 0.5.0.                 | Integrar caja/cobro por ID y ticket protegido tras revisión; conservar claves de idempotencia y no almacenar QR/token.               |
| 2026-10-26 | Primera versión: catálogo, auth/admin y ORD-01.  | Ya puede comenzar menú, sesión, administración y flujos de orden pendiente.                                                          |
