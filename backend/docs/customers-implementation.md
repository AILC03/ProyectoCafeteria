# CUS-01 — Lecturas propias de perfil e historial

Entrega local del 2026-11-09, verificada en PostgreSQL 17 aislado; pendiente revisión humana/integración.
OpenAPI 0.9.0. [Alcance, archivos y evidencia](tasks/CUS-01-customer-profile-history.md).
La búsqueda mínima para caja sigue en ORD-01, sin ampliar sus datos/permisos.

## Perfil

`GET /api/v1/customers/me`, sin query ni body. Solo CLIENTE autenticado mediante
cookie y sesión vigente; ADMINISTRADOR no hereda permisos personales de CLIENTE.
Respuesta `{data:{customerNumber,name,phone,recoveryEmail,recoveryEmailVerifiedAt,createdAt}}`.
Correo/fecha de verificación pueden ser null y reflejan metadatos existentes:
esta entrega no implementa envío, verificación ni recuperación por correo.
No devuelve ID interno de usuario, NIP/hash, contraseña, username ni sesiones/tokens.

## Historial de órdenes

`GET /api/v1/customers/me/orders?limit=20&cursor=<cursor>`. Siempre solo órdenes
actualmente asociadas a la identidad de sesión. Incluye todos los estados
persistidos y métodos CASH/STRIPE; es historial de órdenes, no reporte de ventas
ni lista exclusiva de compras pagadas. Una pendiente con plazo pasado se muestra
con el estado persistido: no se implementa expiración automática al leer.

Respuesta `{data:[{id,folio,status,paymentMethod,totalCents,createdAt,
paymentExpiresAt,paidAt,readyAt}],page:{limit,nextCursor}}`. Sin customerId,
empleados, pagos/proveedores, tokens o payloads cifrados. IDs e importes como
cadenas decimales y fechas UTC. Sin resultados: `data:[]`, nextCursor null.

Detalle/snapshots: reutilizar `GET /api/v1/orders/{id}` existente, que limita
CLIENTE a su orden propia y devuelve históricos incluso si se retiró o cambió
el catálogo. No se creó un endpoint redundante de detalle ni se alteró ORD-01.

### Paginación y propiedad

Orden ascendente `(createdAt,id)`, 20 por defecto y 1–100. Cursor conserva seis
decimales PostgreSQL aunque las fechas del DTO usen precisión de JavaScript.
El cursor está ligado al recurso/cliente mediante scope y hash del identificador
del cliente autenticado; nunca incluye teléfono/correo. No es credencial ni cursor firmado:
incluso modificado, la consulta siempre filtra por customer_id de sesión, no por
datos del cursor. Cursor de otro cliente/recurso: 400.

La paginación no congela el conjunto. Por ejemplo, un alta QR puede incorporar
una compra histórica anterior al cursor; refrescar primera página para verla.
Solo la compra del token de registro se incorpora a la cuenta, no otras compras
de invitado, ni compras ajenas por teléfono/folio. No hay historial de invitados.

## Autorización, errores y efectos

Lecturas sin CSRF ni mutación de cookies. Comprobar cookie/sesión vigente y rol
actual en middleware, y revalidar usuario/sesión bajo locks SHARE dentro de la
transacción. Reutiliza el mecanismo de actor de ORD-01: revocada, vencida o
inactiva no accede; must_change_pin exige primero cambio obligatorio/logout.

401 sin sesión válida, 403 rol/cambio obligatorio/Origin, 400 query/body/cursor
inválido, 429 límite público por IP/proceso, 503 dependencia no disponible.
Perfil no acepta query; historial solo limit/cursor, sin filtros de identidad,
estado, fecha u ordenación. Ambos rechazan body, incluidos `{}` y campos extra.
Sin datos sensibles en errores/logs, no-store/no-referrer incluso en fallos
tempranos, y sin Set-Cookie. Frontend usa `credentials: include`; no almacenar
respuestas personales en cachés, analítica o logs.

No hay consultas públicas por customerNumber/ID/teléfono ni acceso mediante QR
de cobro, registro o X-Ticket-Token. Esos tokens no sustituyen la sesión CLIENTE.

## Operación y límites

Nuevo módulo `src/modules/customers`, capas de validación/rutas/controlador/
servicio/repositorio. Usa tablas e índice de customer_id existentes y consultas
parametrizadas; sin migración, dependencia, secreto o proveedor nuevo. No cambia
datos, snapshots, pagos, ventas, jobs, auditoría o sesiones al consultar.

No incluye edición de nombre/teléfono/correo, perfil administrativo, favoritos,
repetición, recuperación/reset, CRUD empleados, Stripe o worker. La consulta de
STRIPE pendiente no significa que el procesamiento de Stripe esté implementado.
No se tocó frontend, configuración real ni bases del proyecto. Migraciones de
entregas previas y despliegue siguen sujetos a autorización/revisión humana.
