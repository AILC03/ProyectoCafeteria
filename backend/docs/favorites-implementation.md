# FAV-01 — Favoritos privados y repetición revisable

Entrega local del 2026-11-09, verificada en PostgreSQL 17 aislado. OpenAPI 0.10.0. Pendiente revisión
humana/integración frontend. [Criterios y evidencia](tasks/FAV-01-favorites-repeat.md).
No cambia el perfil/historial CUS-01 ni los snapshots de ORD-01.

## Favoritos de producto

- GET `/api/v1/customers/me/favorites`: solo CLIENTE con cookie/sesión/rol vigentes,
  sin body. Query limit (20 por defecto, 1–100) y cursor. Devuelve `{data,page}`.
- Cada favorito muestra productId, categoryId, name, description, basePriceCents,
  imageUrl, isAvailable y favoritedAt actuales. No guarda opciones/configuración,
  cantidad, precios históricos ni datos de otro cliente.
- PUT `/api/v1/customers/me/favorites/{productId}`: body ausente o JSON `{}`, sin
  query, con sesión CLIENTE, Origin exacto y CSRF. Devuelve 204 sin body ni cookies.
  Repetir/concurrir no duplica ni modifica la fecha original. Producto agotado
  visible se puede guardar; producto retirado/categoría oculta no (404).
- DELETE misma ruta y acceso: 204 incluso si no existía, también permite quitar
  un favorito cuyo producto fue retirado. Solo borra la fila del cliente actual.
  No necesita Idempotency-Key: PUT/DELETE fijan un estado idempotente por semántica.

La lista aplica la visibilidad del catálogo público: productos retirados o con
categoría retirada/inactiva no aparecen, pero no se borran sus favoritos por eso.
Los agotados permanecen visibles con isAvailable=false. Precio/nombre corresponden
al catálogo actual, no a snapshots. No es autorización para comprar un producto agotado.

Orden ascendente por (favoritedAt,productId), seis decimales PostgreSQL para cursor,
scope customer-favorites y hash del ID de cliente. Cursor no es credencial ni
snapshot congelado; incluso alterado, SQL siempre filtra customer_id de sesión.
Cursor de historial/otro cliente se rechaza. Cambios de catálogo pueden requerir
refrescar la lista para ver el conjunto actual.

## Repetición: revisar antes de crear

POST `/api/v1/customers/me/orders/{id}/repeat-preview`, JSON `{}`, sin query.
Solo CLIENTE/propietario de la orden, con sesión vigente, Origin y CSRF. Se puede
usar sobre cualquier estado persistido. Otro propietario/invitado no obtiene
selecciones históricas por ID/folio/token.

Devuelve `{data:{sourceOrderId,canCreateOrder,items,warnings,totalCents}}`:

- items conserva productId, cantidad y todos los optionValueIds originales;
  incluye productName y currentUnitPriceCents/currentLineTotalCents. Precios
  actuales null si la línea no es válida. No sustituye ni elimina opciones.
- warnings incluye line (1-based, null para global), code, blocking y optionValueId
  (null salvo aviso de opción). Códigos:
  - PRODUCT_UNAVAILABLE / OPTION_UNAVAILABLE: bloquea producto/categoría agotado,
    retirado, inactivo u opción retirada/agotada/no asignada al producto.
  - SELECTION_INVALID: bloquea límites/selección o configuración de precios
    actualmente incompatible, incluido nuevo grupo obligatorio sin selección.
  - TOTAL_LIMIT_EXCEEDED: bloquea suma actual superior a 9999900 centavos.
  - PRICE_CHANGED / PRODUCT_CHANGED / OPTION_CHANGED: avisa diferencias de
    precio unitario o nombres vigentes, sin invalidar por sí mismas la selección.
- Cualquier bloqueo deja canCreateOrder=false y totalCents=null: no devuelve un
  total parcial engañoso. Sin bloqueos, total es exacto, usando precios y recargos
  GLOBAL/PER_PRODUCT vigentes mediante el mismo priceOrder de ORD-01.

Preview no crea orden, carrito persistente, favorito, pago, venta, auditoría o job;
no modifica snapshots ni necesita Idempotency-Key. **No reserva precio ni disponibilidad.**
Mostrar avisos al cliente para revisión explícita. Confirmar con POST `/api/v1/orders`
existente, nueva Idempotency-Key, método elegido y solo `{productId,quantity,optionValueIds}`
por línea (más campos ordinarios de creación si aplican). No enviar nombres,
precios, warnings o todo el DTO de preview como body de orden. Esa ruta vuelve a
validar catálogo/precios/límites y genera una orden nueva; la original queda intacta.

## Integridad, seguridad y operación

Tabla favorites/PK compuesta existentes; sin migración, secreto ni dependencia.
Alta: actor/usuario/sesión → lock catálogo 2026,1 → favorito. Preview: actor →
catálogo → orden existente → lectura de catálogo, conforme al protocolo aprobado.
Así no mezcla precios/configuraciones mientras cambia catálogo y no invierte
orden de locks. DELETE solo bloquea filas propias; PK protege duplicados incluso
ante escritores fuera del servicio. Fallo transaccional no deja filas parciales.

Todas las rutas son personales de CLIENTE; ADMINISTRADOR no hereda este permiso.
Sesiones revocadas/inactivas, rol cambiado o must_change_pin no acceden. Entradas
estrictas, IDs/dinero como cadenas decimales, no-store/no-referrer también en errores
tempranos y sin Set-Cookie. Renderizar etiquetas como texto escapado, no HTML.
Sin tokens ni datos personales en logs. No se aceptan
customerId, configuración, precio o total enviados a estos endpoints.

401 sin sesión; 403 rol/CSRF/Origin/NIP obligatorio; 400 entrada/body/query/cursor;
404 producto no visible u orden ajena/ausente; 503 dependencia. Avisos de repetición
son 200 con canCreateOrder=false cuando corresponde, no orden creada ni cobro fallido.
Límite público por IP/proceso existente; no se agregan cuotas de favoritos ni proveedores.

Fuera: frontend/renderizado, checkout/cobro nuevo, edición de perfil, ventas,
Stripe, correo y worker. No se configuró infraestructura remota, tocaron bases
reales ni aplicaron migraciones. Revisión/aceptación humana siguen pendientes.
