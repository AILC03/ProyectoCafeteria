# CUS-01 — Consulta de perfil e historial propio

- Responsable: asistente por encargo de Ángel «sigue con el desarrollo del backend».
- Revisor humano: Ángel; coordinación API/frontend con Enrique antes de integrar.
- Rama base/trabajo: dev existente; se preservan cambios documentales y entregas anteriores.
- Estado: lecturas propias implementadas/verificadas localmente, pendiente revisión
  humana/integración; continuación del bloque CUS-01 del backlog vigente.

## Objetivo y fuentes

Completar las lecturas propias de CUS-01, sin cambiar reglas de negocio.
Fuentes: [backlog CUS-01](../development-tasks.md), [permisos](../permissions.md)
(perfil propio, historial personal y consultas de órdenes), BR-AUTH-001,
BR-USR-008/009, BR-CAT-005, BR-ORD-005/007/009 y BR-REG-005 de
[reglas](../business-rules.md); ADR [0005](../adr/0005-authentication.md) y
[0006](../adr/0006-http-contract.md); [arquitectura](../architecture.md).

## Alcance y exclusiones

- GET `/api/v1/customers/me`: exclusivamente CLIENTE con cookie y sesión/rol
  vigentes en PostgreSQL. DTO explícito: customerNumber, name, phone, recoveryEmail,
  recoveryEmailVerifiedAt y createdAt. No hashes, NIP, username, sesión, tokens ni ID interno.
- GET `/api/v1/customers/me/orders`: resúmenes de órdenes actualmente asociadas al
  cliente autenticado, en todos sus estados persistidos (no solo compras pagadas).
  No es informe de ventas; no presume cobro por existir una orden. No transforma
  pendientes vencidas en EXPIRADA ni implementa expiración automática.
- Orden ascendente estable (createdAt,id), limit 20 por defecto y 1–100; cursor
  conserva seis decimales PostgreSQL y se liga al recurso/cliente. Siempre WHERE
  customer_id = sesión, incluso con cursor alterado. No filtros por otro cliente.
- Para detalle se reutiliza GET `/api/v1/orders/{id}` de ORD-01, que ya comprueba
  propiedad y devuelve snapshots. No se crea endpoint redundante de detalle.
- GET sin body; perfil sin query; historial solo limit/cursor. 401 sin sesión,
  403 otro rol/cambio obligatorio de NIP/Origin indebido, 400 entrada inválida.
  No-store/no-referrer también en errores tempranos, sin renovar cookies.
- No incluye editar nombre/teléfono/correo, favoritos/repetición, recuperación,
  empleados, administración de clientes, ventas, Stripe, worker o frontend.
  CUS-01 queda completo para lecturas propias y búsqueda mínima existente;
  no se declara implementada la edición futura del perfil.

## Criterios y trazabilidad

| ID    | Requisito/fuente                                        | Implementación prevista                         | Prueba esperada                                                    | Estado                               |
| ----- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| CA-01 | Perfil propio mínimo; permisos/BR-USR-008/009           | customers ruta/controlador/servicio/repositorio | DTO conforme, correo opcional, sin secretos ni cuenta ajena        | Verificado: customers BD y HTTP      |
| CA-02 | Historial solo del propietario; permisos/BR-ORD-005/009 | consulta SQL parametrizada por sesión           | no invitado/otro cliente/empleado, ni token QR/ticket              | Verificado: customers BD y HTTP      |
| CA-03 | Sesión y permisos vigentes; ADR0005                     | middleware y actor transaccional existente      | revocada/inactiva/rol cambiado/must_change_pin sin datos           | Verificado: customers BD y HTTP      |
| CA-04 | Cursor estable y límites; ADR0006                       | paginación común, SQL (createdAt,id)            | microsegundos, BIGINT, cursor de otro cliente/recurso y manipulado | Verificado: customers BD             |
| CA-05 | Históricos/registro preservados; BR-CAT-005/BR-REG-005  | resumen propio y detalle ORD-01 existente       | snapshots tras retiro, alta QR incorpora solo su compra            | Verificado: customers BD y regresión |
| CA-06 | Sin efectos/fugas y regresión; ADR0009                  | privacidad GET y DTO explícito                  | no Set-Cookie, caché/logs, body/query extra rechazados, checks     | Verificado: customers BD y HTTP      |

## Plan e impacto

1. Contrato OpenAPI 0.9.0 y escenarios de autorización/paginación antes del código.
2. Nuevo módulo customers según capas existentes; reusar revalidación de actor
   y transacciones de órdenes, paginación y errores comunes. Consultas con owner
   derivado de sesión, nunca de body/query/cursor.
3. Pruebas HTTP y PostgreSQL aislado; docs/estado, checks y revisión del diff.

API aditiva, sin migración, dependencia, secreto ni proveedor nuevo. No se
modifican tablas ni snapshots desde estas rutas. Perfil se consulta de la cuenta
vigente; las órdenes conservan sus snapshots y no se unen al catálogo actual.
Cursor no es autorización ni snapshot congelado del listado: refrescar primera
página para ver asociaciones históricas nuevas, por ejemplo tras alta QR.
No hay nuevo acuerdo de negocio/seguridad; no se amplían privilegios administrativos.
La continuación del backlog no equivale a aprobación de integración/despliegue.

## Evidencia de entrega — 2026-11-09

- `npm test`: **97 aprobadas, 115 omitidas** (integraciones; no se cuentan como aprobadas).
- `npm run test:integration`: **115 aprobadas** en PostgreSQL **17.11** efímero:
  auth/admin 19, cash/TKT-02/CASH-03 34, catálogo 13, registro QR 20,
  customers 11 y órdenes 18.
- Se agregaron 7 pruebas HTTP/unitarias en `tests/customers.test.ts` y 11 pruebas
  reales en `tests/integration/customers.integration.test.ts`: contrato, roles,
  propiedad, cuerpo/query estrictos, correo opcional, todos los estados, cursor
  microsegundos/empates, BIGINT exacto, aislamiento incluso con cursor alterado,
  retiro de catálogo con snapshots, alta QR/login reales y compras ajenas,
  revocación/vencimiento/baja/cambio de rol/NIP obligatorio y ausencia de efectos/logs.
- Primer intento de integración: 1 fallo de fixture de sesión vencida por CHECK
  `absolute_expires_at > created_at`. Se corrigió el fixture con creación anterior
  al vencimiento, sin debilitar checks, expectativas ni código de autorización.
  La segunda ejecución completa pasó las seis suites, incluidos los 11 casos CUS-01.
- `npm run db:verify`: **22 comprobaciones correctas y mutantes C01–C04 detectados**;
  migración/repetición/diff/smoke de esquema completo en bases propias, eliminadas
  al terminar. Informe nuevo con DB_REVIEW_OUTPUT_DIR:
  `C:\Users\angel\AppData\Local\Temp\opencode\cafeteria-cus01-final-6624aa4e\corrections-results.json`.
  No se reescribieron informes históricos.
- Contenedores efímeros con tmpfs, credencial aleatoria no impresa y puerto aleatorio
  ligado solo a loopback. Eliminados al finalizar ambas ejecuciones.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:validate`: correctos.
- `npm run api:validate`: OpenAPI válido y **60 ejemplos conformes**.
- `npm run format:check` y `git diff --check`: correctos. Revisados diff y archivos
  nuevos; sin cambios en informes históricos, auth/admin o migraciones en CUS-01.

### Archivos de la entrega

- `src/modules/customers/customers.{routes,controller,validation,service,repository}.ts`:
  nuevo módulo de lecturas propias, DTO de perfil explícito y SQL de resúmenes acotado.
- `src/shared/http/pagination.ts`: scope customer-orders; sin alterar scopes anteriores.
- `src/app.ts` y `src/server.ts`: montaje/inyección y cabeceras de privacidad tempranas.
- `tests/customers.test.ts` y `tests/integration/customers.integration.test.ts`.
- `docs/api/openapi.yaml`, esta tarea, `docs/customers-implementation.md`, índice,
  backlog, progreso, arquitectura, permisos, contrato pendiente y guía frontend.

Sin migraciones, dependencias, secretos ni proveedores nuevos. No se ejecutaron
operaciones contra datos reales ni se cambió frontend. Se conservaron TKT-02,
CASH-03, migraciones previas, módulos auth/admin y trabajo documental existente.
Pendientes: revisión humana Ángel/Enrique, integración frontend y edición de perfil/
favoritos/repetición/ventas en encargos separados. Sin commit/push/merge/despliegue.
No existe PR/revisión humana de esta entrega.
