# Guía viva de integración para frontend

Actualizada: 2026-10-31. Responsable de coordinación: Ángel. Esta guía sirve al
frontend para consumir el backend actual y debe actualizarse en la misma entrega
que cambie un contrato, permiso, flujo o estado de implementación.

La fuente técnica exacta de cada petición es [OpenAPI](api/openapi.yaml). Esta guía
explica cómo usarla; no sustituye los esquemas, ejemplos ni códigos de error del contrato.

## 1. Estado actual del backend

| Área                                               | Estado                                                                  | Qué puede construir frontend ahora                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Catálogo público                                   | Implementado                                                            | Menú, categorías, detalle de producto y selección de opciones.                                         |
| Autenticación                                      | Implementada                                                            | Login de cliente/personal, sesión actual, refresh, logout y cambio de NIP/contraseña.                  |
| Administración                                     | Implementada                                                            | Catálogo, disponibilidad, configuraciones y flujo de carga de imágenes.                                |
| Órdenes ORD-01                                     | Implementado y verificado en `dev`; pendiente de fusionar a `main`      | Crear órdenes pendientes, consultar según rol, asociar cliente en caja y vista de preparación/LISTO.   |
| Caja y cobro efectivo                              | Implementado y verificado localmente; pendiente de revisión/integración | Apertura/resumen/cierre y cobro por ID, ticket JSON y QR de registro preparado. QR de cobro pendiente. |
| Stripe                                             | Pendiente                                                               | No iniciar Checkout ni interpretar una orden Stripe como pagada.                                       |
| Registro QR AUTH-02                                | Implementado/verificado localmente; pendiente revisión/integración      | Formulario con token de ticket pagado, CSRF y login posterior; sin sesión automática.                  |
| Recuperación de NIP, correo, favoritos e historial | Pendiente                                                               | No crear pantallas finales conectadas a endpoints inexistentes.                                        |
| Cloudinary                                         | Flujo backend implementado; proveedor real pendiente                    | Preparar interfaz de imagen; validar con el equipo antes de habilitarla contra una cuenta real.        |

## 2. Archivos que se deben leer antes de implementar una pantalla

Leerlos en este orden:

1. [OpenAPI](api/openapi.yaml): rutas, entradas, respuestas, ejemplos, seguridad y errores.
2. [Reglas de negocio](business-rules.md): estados de órdenes, pagos, QR, históricos y límites.
3. [Matriz de permisos](permissions.md): qué puede hacer cada rol.
4. [Estado vigente](PROJECT-CONTEXT.md) y [avance](backend-progress.md): qué existe y qué sigue pendiente.
5. [Órdenes ORD-01](orders-implementation.md): flujo actual de órdenes y sus exclusiones.
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

| Rol           | Área principal | Lo que ya puede consumir                                                                                            |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Invitado      | Móvil          | Catálogo y creación de orden pendiente. No consulta órdenes por folio ni historial.                                 |
| CLIENTE       | Móvil          | Catálogo, login, cambio de NIP y sus propias órdenes por ID.                                                        |
| CAJERO        | Caja           | Lo anterior más caja propia, cobro CASH y ticket protegido de esta entrega local. No cobra/cierra caja ajena.       |
| PREPARACION   | Preparación    | Consulta de órdenes `EN_PREPARACION` y acción `LISTO`.                                                              |
| ADMINISTRADOR | Administración | Hereda caja y administra catálogo/opciones/imágenes. CRUD de empleados y recuperación de cuentas siguen pendientes. |

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
`CASH` o `STRIPE` todavía no cobra, no abre caja, no genera QR y no inicia Stripe.

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
pagada y en ese estado; CASH exige pago exitoso y venta coherente. Al confirmarse,
retirar la orden de la lista sin borrarla del historial. No enviar estado/paidAt:
el cobro CASH ahora hace la transición a preparación transaccionalmente.

## Caja y efectivo — entrega local CASH-01/CASH-02

Consultar [guía de caja](cash-implementation.md) y OpenAPI 0.6.0. Pendiente revisión
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
   es null, renderizar su `qrPayload` como QR de **registro futuro**, junto con su
   vencimiento. No es QR de pago, no URL navegable y no hay alta final conectada aún.
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

## 10. Flujos pendientes: comportamiento esperado para diseño

Estas reglas ya están acordadas, pero aún no tienen endpoints de frontend:

- Efectivo pendiente: emisión/escaneo del QR de cobro; apertura/cierre, cobro por ID,
  venta y datos del ticket imprimible están implementados localmente en CASH-01/02.
- Stripe: Checkout, webhook confirmado solo por backend, reconciliación antes de
  expirar y reembolso excepcional si se cobra después de expiración definitiva.
- Invitados: compra pagada genera QR de registro de un uso y 24 horas; compra ya
  asociada no imprime QR de registro. Emisión y consumo/alta AUTH-02 implementados
  localmente; acceso digital de invitado al ticket continúa pendiente.
- Recuperación: cambio de NIP desde perfil; recuperación por correo verificado;
  reset presencial por administrador con NIP temporal, cambio obligatorio y auditoría.
- Clientes: perfil, historial, favoritos y repetición del pedido con catálogo actual.

El diseño visual puede anticipar estas pantallas, pero usar datos simulados claramente
separados y no añadir rutas falsas al cliente HTTP compartido.

## 11. Errores, carga y accesibilidad

### Registro QR de ticket — AUTH-02 (local, pendiente revisión/integración)

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

## 12. Cómo actualizar esta guía

Al terminar una tarea backend que cambie integración:

1. Actualizar OpenAPI y validarlo antes de dar por disponible una ruta.
2. Cambiar la tabla de estado, las rutas y los flujos de esta guía.
3. Indicar si la función está propuesta, implementada en `dev`, verificada o integrada en `main`.
4. Añadir una entrada al historial con fecha, tarea, rutas afectadas y acción necesaria
   para frontend.
5. Avisar al responsable de frontend antes de romper o cambiar un contrato existente.

### Historial de cambios

| Fecha      | Cambio                                          | Impacto para frontend                                                                                                  |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-10-31 | AUTH-02 registro QR local; OpenAPI 0.6.0.       | Integrar formulario con CSRF, token solo en memoria y login posterior; no sesión automática.                           |
| 2026-10-27 | CASH-01/02 local, OpenAPI 0.5.0.                | Integrar caja/cobro por ID y ticket protegido tras revisión; conservar claves de idempotencia y no almacenar QR/token. |
| 2026-10-26 | Primera versión: catálogo, auth/admin y ORD-01. | Ya puede comenzar menú, sesión, administración y flujos de orden pendiente.                                            |
