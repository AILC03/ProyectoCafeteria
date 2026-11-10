# FAV-01 — Favoritos propios y repetición revisable

- Responsable: asistente por continuación del backlog solicitada por Ángel.
- Revisor humano: Ángel; coordinar contrato/frontend con Enrique antes de integrar.
- Rama base/trabajo: dev existente; preservar CUS-01, CASH-03, TKT-02 y documentos previos.
- Estado: implementada/verificada localmente, pendiente revisión humana/integración.

## Objetivo y fuentes

[BR-FAV-001](../business-rules.md), BR-CAT-002/003/005/006, BR-ORD-005/009/010,
AC-19/21 de [criterios](../planning-readiness.md), FAV-01 del
[backlog](../development-tasks.md), [permisos](../permissions.md) y ADR 0005/0006/0009.
Favoritos guardan únicamente producto, no configuración. Repetir usa catálogo/
precios actuales y advierte diferencias, conservando snapshots históricos.

## Alcance y contrato

- GET `/api/v1/customers/me/favorites`: CLIENTE con sesión/rol vigentes, limit
  20 por defecto/1–100 y cursor propio con microsegundos. Datos actuales del
  producto y favoritedAt; sin configuración ni cliente ajeno. Misma visibilidad
  del catálogo: retirados/categoría inactiva no aparecen, agotados sí con false.
  Las filas ocultas no se borran automáticamente.
- PUT `/api/v1/customers/me/favorites/{productId}`: fija favorito, body ausente
  o `{}`, sesión CLIENTE + Origin/CSRF. 204 repetible sin duplicar ni cambiar
  fecha de favorito previo; PK compuesta existente protege concurrencia.
  Producto visible puede estar agotado; ausente/retirado/categoría oculta: 404.
- DELETE misma ruta y acceso: retira solo favorito propio, 204 también si ausente
  o retirado. Nunca afecta favoritos ajenos, productos o históricos.
- POST `/api/v1/customers/me/orders/{id}/repeat-preview`, JSON `{}`, mismo acceso
  y CSRF. Solo orden propia (cualquier estado persistido). Devuelve selección
  revisable, precio actual por línea y total solo si toda la selección es válida,
  canCreateOrder y avisos por línea/globales. No acepta precios ni configuración
  del cliente, no crea carrito persistente/orden/pago ni exige Idempotency-Key.
- IDs/opciones originales se conservan en la propuesta, sin sustituir ni retirar
  silenciosamente. Producto/opción no disponible o selección actualmente inválida
  bloquea canCreateOrder; precio y nombres cambiados generan avisos no bloqueantes.
  Total superior a 9999900 bloquea y deja total null. Confirmación explícita mediante
  POST `/orders` existente con método elegido y nueva Idempotency-Key; revalida
  catálogo/precio/límites. Preview no reserva precio/disponibilidad.

## Persistencia, seguridad y exclusiones

Tabla favorites existente (PK customer_id/product_id), sin migración. Owner de
sesión, nunca body/query/cursor. Actor transaccional de ORD-01 antes de catálogo
(lock global existente 2026,1) para alta/preview; preview toma después lock de
orden existente, conforme a docs/database/integrity-protocols.md. Borrado solo por PK propia;
PUT/DELETE idempotentes por semántica, sin registros de idempotencia nuevos.
Los previews no escriben ni cambian snapshots; no-store/no-referrer y errores
sin datos/credenciales. Sin privilegios para personal/admin sobre favoritos privados.

Fuera: frontend, favoritos de configuraciones, nueva ruta de creación/cobro,
edición perfil, ventas, correo/Stripe/worker, nuevas dependencias/secretos o bases reales.
No se modifica ninguna decisión aceptada. El encargo continúa FAV-01 del plan,
no equivale a revisión humana/integración/despliegue.

## Criterios y trazabilidad

| ID    | Fuente/requisito                               | Implementación prevista                       | Prueba esperada                                                       | Estado                              |
| ----- | ---------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| CA-01 | Favorito producto/no configuración, BR-FAV-001 | customers validación/repositorio              | PUT repetido/concurrente una fila y fecha, DELETE ausente 204         | Verificado: customers BD            |
| CA-02 | Privacidad/roles, permisos/ADR0005             | rutas, actor y WHERE owner                    | 401/403, CSRF, sesión revocada/NIP obligatorio, sin datos ajenos      | Verificado: customers BD            |
| CA-03 | Visibilidad/paginación, CAT-01/ADR0006         | SQL favoritos + cursor propio                 | agotados, retirados ocultos conservados, microsegundos/cursor cruzado | Verificado: customers BD            |
| CA-04 | Repetición actual y avisos, AC-21              | customers.repeat y priceOrder existente       | precio/nombres cambiados, opciones retiradas, min/max/límites         | Verificado: 12 unitarias + BD       |
| CA-05 | Históricos/efectos, BR-CAT-005/AC-19           | preview sin escritura y POST orders existente | original intacto, confirmar nueva orden con precios vigentes          | Verificado: customers BD            |
| CA-06 | Regresión/operación, flujo                     | HTTP/PostgreSQL, OpenAPI/docs                 | checks completos, sin proveedor ni datos reales                       | Verificado: suites y checks locales |

## Plan y evidencia

1. OpenAPI 0.10.0 antes del código, escenarios de propiedad/concurrencia.
2. Extender módulo customers según capas, helper puro de preview y paginación común.
3. Pruebas HTTP y PostgreSQL 17 aislado, documentación, diff y checks del flujo.

## Evidencia de entrega — 2026-11-09

- `npm test`: **109 aprobadas, 124 omitidas** (integraciones; no se suman como aprobadas).
- `npm run test:integration`: **124 aprobadas** en PostgreSQL **17.11** efímero:
  auth/admin 19, cash/TKT-02/CASH-03 34, catálogo 13, registro QR 20,
  customers/CUS-01/FAV-01 20 y orders 18.
- 12 pruebas puras añadidas en `tests/customers-repeat.test.ts`: precios GLOBAL/
  PER_PRODUCT vigentes, cambio de nombres, productos/categorías/opciones no
  disponibles, límites/grupos, total exacto/excesivo e inmutabilidad de fuente.
- 9 casos FAV-01 en `tests/integration/customers.integration.test.ts`: PUT
  concurrente/repetido/fecha, borrado propio/ausente, visibilidad sin borrar filas,
  cursor con microsegundos/ID BIGINT y manipulado entre cliente/recurso, roles,
  CSRF/Origin/body estricto/revocación/NIP, preview sin efectos y creación nueva,
  snapshots intactos, opciones retiradas/nuevos mínimos/total acumulado y rollback
  real tras insertar favorito con error interno saneado.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:validate`: correctos.
- `npm run api:validate`: OpenAPI válido, **65 ejemplos conformes**.
- `npm run db:verify`: **22 comprobaciones correctas y mutantes C01–C04 detectados**;
  migración/repetición/diff/smoke en bases temporales propias, retiradas al finalizar.
  Evidencia nueva con DB_REVIEW_OUTPUT_DIR en
  `C:\Users\angel\AppData\Local\Temp\opencode\cafeteria-fav01-ae63851c\corrections-results.json`.
  Informes históricos intactos. Contenedor tmpfs, credencial efímera no impresa,
  puerto aleatorio en loopback; eliminado al terminar.
- Incidencias intermedias corregidas: typecheck detectó incompatibilidad de un
  mock Promise/PrismaPromise; la inyección de fallo se movió al wrapper transaccional
  tipado, sin alterar producción ni desactivar controles. Lint detectó acceso
  dinámico de método en línea ambigua; se usó variable cliente como en ORD-01.
- `npm run format:check` y `git diff --check`: correctos. Revisados diff y
  archivos nuevos; informes históricos, auth/admin, motor de precios, dependencias
  y migraciones anteriores intactos en esta entrega.

### Archivos y pendientes

- `src/modules/customers/customers.{routes,controller,validation,service,repository}.ts`:
  favoritos privados, validación, acceso, persistencia y preview sin efectos.
- `src/modules/customers/customers.repeat.ts`: helper puro que reutiliza priceOrder
  y valida selección; no modifica el motor de precios ni snapshots.
- `src/shared/http/pagination.ts`: scope customer-favorites, sin alterar anteriores.
- `tests/customers-repeat.test.ts`, `tests/integration/customers.integration.test.ts`.
- `docs/api/openapi.yaml`, esta tarea, `docs/favorites-implementation.md`, índice,
  backlog, progreso, permisos, guía frontend y estado del contrato.

Sin migración, dependencia, secreto, proveedor nuevo ni datos reales. CUS-01,
CASH-03, TKT-02, auth/admin, motor de precios y migraciones previas conservados.
Pendientes: revisión Ángel/Enrique e integración frontend con revisión explícita
de avisos/confirmación. Ventas, correo, Stripe y worker permanecen fuera de alcance.
No se hizo commit/push/merge ni despliegue; sin PR/revisión humana de esta entrega.
