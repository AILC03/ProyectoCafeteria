# Tarea: ORD-01 — Órdenes pendientes y operación mínima

- Responsable: IA por encargo explícito de Ángel, 2026-10-26.
- Revisor humano: Ángel; coordinación de contrato con Enrique antes de integrar.
- Rama base: dev. Se conserva la rama actual y todo cambio previo.
- Estado: implementada y verificada en `dev`; pendiente de revisión humana y fusión a `main`.

## Objetivo y fuentes

Primera entrega de orders sobre auth/catalog existentes. Fuentes:
[reglas](../business-rules.md), BR-CAT-001–006, BR-ORD-001–011;
[permisos](../permissions.md), filas creación/consulta/asociación/LISTO;
[arquitectura](../architecture.md), capas del módulo;
ADR 0001–0012, especialmente 0004/0006/0011 y
[locks e identificadores](../database/integrity-protocols.md);
[OpenAPI](../api/openapi.yaml) y encargo de Ángel del 2026-10-26.

## Alcance y exclusiones

- Crear móvil (invitado/cliente) y caja (cajero/admin); consultar por ID con propiedad/rol.
- Búsqueda exacta mínima de cliente y asociación confirmada antes del pago.
- Lista paginada de preparación y transición EN_PREPARACION → LISTO con actor/fecha.
- No incluye caja, cobros, Stripe, webhooks, tickets/QR, registro, correo, worker,
  expiración automática ni reembolsos. No modificar seguridad auth/admin ni ADR.
- Conservar pruebas existentes y Cloudinary simulado. No leer secretos ni tocar
  desarrollo/shadow/producción. Sin commit/push/merge/despliegue.

## Criterios y trazabilidad

Código bajo `src/modules/orders/`; contrato `docs/api/openapi.yaml`.
U = [unitarias/HTTP](../../tests/orders.test.ts),
I = [HTTP + PostgreSQL](../../tests/integration/orders.integration.test.ts).
Todos los escenarios citados pasaron en la ejecución de cierre, no son solo propuestas.

| ID    | Requisito y fuente                                    | Código                                         | Prueba / evidencia verificada                                                                                                   |
| ----- | ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | Creación canal/rol y método fijo; BR-ORD-001/003      | orders.routes/controller/service/validation.ts | I: «crea invitado CASH y STRIPE», «cliente se asocia desde sesión», «roles»; no endpoint de cambio de método                    |
| CA-02 | Catálogo vigente y cálculo backend; BR-CAT-001–006    | orders.validation/pricing/repository.ts        | U: límites/selecciones/alcance; I: «backend calcula GLOBAL/PER_PRODUCT» y «agotado, retirado» con rollback                      |
| CA-03 | 50 líneas, 1–99 unidades, total <=9999900; BR-ORD-010 | orders.validation/pricing.ts                   | U: límites y exceso de un centavo; I: 50 líneas x 99 unidades, BIGINT amplio y máximo exacto                                    |
| CA-04 | Snapshots inmutables; BR-CAT-005/006                  | orders.repository/service.ts                   | I: «snapshots y replay» tras editar/retirar producto y opción                                                                   |
| CA-05 | Folio y plazo; ADR 0011/0007                          | orders.repository/service.ts                   | I: 50 folios concurrentes únicos, plazo 30 min, sin pagos/ventas/jobs                                                           |
| CA-06 | Idempotencia 48h; ADR 0006                            | orders.repository/service.ts                   | I: 12 reintentos concurrentes = una orden/respuesta; distinta entrada 409, actor distinto independiente, vencida crea nueva     |
| CA-07 | Consulta propia/operativa; BR-ORD-005 y permisos      | orders.routes/service.ts; orderDto             | I: ajena 404, invitado 401, preparación solo EN_PREPARACION; respuestas reales validadas con OpenAPI                            |
| CA-08 | Asociación mínima antes de pago; BR-ORD-006/008/009   | orders.validation/service/repository.ts        | I: DTO exacto id/name/customerNumber, confirmación de nombre, pago/vencimiento y carrera con pago bloquean reasociación         |
| CA-09 | Preparación y LISTO; BR-ORD-007/011                   | orders.service/repository.ts                   | I: tres roles, exclusión LISTO, un ganador concurrente, actor/fecha/auditoría única; sin pago/estado indebido 409               |
| CA-10 | CSRF, sesión vigente y locks; ADR 0005/0009/0011      | orders.routes/repository.ts                    | U/I: CSRF/Origin, sesión inválida/revocada/inactiva, rol revalidado, sin degradación a invitado; catálogo coherente concurrente |

## Plan e impacto

1. OpenAPI primero: POST /orders, POST /cashier/orders, GET /orders/{id},
   GET /preparation/orders, POST /orders/{id}/ready;
   POST /cashier/customers/search y PATCH /cashier/orders/{id}/customer.
2. Capas separadas, DTO explícitos, validación estricta; sin nuevas dependencias.
3. Pruebas HTTP/unitarias e integración aislada; documentación y comandos del encargo.

- API: contrato aditivo, revisión de Enrique pendiente; no cambia auth/catalog.
- BD: esquema existente soporta la entrega; solo crear migración si aparece necesidad real.
- Seguridad: CSRF también en creación invitada; cookie inválida se rechaza, no se ignora.
- Creación usa lock de catálogo (2026,1); idempotencia con advisory lock por actor/alcance/clave.
- Riesgo de carreras con sesión/asociación: revalidar usuario/sesión y bloquear orden dentro de transacción.
- Paginación conserva microsegundos; sin historiales/listado general fuera del alcance mínimo.
- Folio secuencial conforme ADR 0011, nunca credencial. CASH reserva hash aleatorio
  interno exigido por CHECK existente; no entrega token ni QR, ni implementa cobro.
- Creación no exige caja abierta: esa condición corresponde al futuro cobro efectivo.
- Mantener fuente/método explícitos: móvil permite CASH/STRIPE; caja crea CASH,
  sin iniciar intentos Stripe ni asociar cajero/sesión a pagos Stripe.

## Decisiones que requieren aprobación

No se cambia ninguna decisión aceptada. Detenerse si aparece contradicción con
las fuentes; no inventar aprobación. Activar proveedores o pago queda fuera del encargo.

## Evidencia de entrega

- Archivos nuevos: seis capas `src/modules/orders/orders.{routes,validation,controller,service,repository,pricing}.ts`,
  dos suites U/I, generador `scripts/update-orders-contract.mjs`, esta tarea y
  `docs/orders-implementation.md`.
- Integración mínima: `src/app.ts`, `src/server.ts` y scope de cursor en
  `src/shared/http/pagination.ts`. Sin cambios en código/pruebas de auth/admin.
- Contrato/estado: OpenAPI 0.4.0, README, PROJECT-CONTEXT, backend-progress,
  contract-plan y nota de continuidad en auth-admin-implementation.
- `db:verify` regeneró `docs/database/review-evidence/corrections-results.json`
  con la ejecución actual. No se editó esquema ni migraciones.
- Cambios previos de aceptación ADR 0012/Cloudinary y archivo ajeno
  `RUTA_DESARROLLO_BACKEND_ACTUAL.md` conservados; no pertenecen a ORD-01.

| Comando ejecutado        | Resultado real de cierre                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| npm run typecheck        | Correcto                                                                         |
| npm run lint             | Correcto                                                                         |
| npm test                 | 56 correctas, 50 integraciones omitidas aquí y ejecutadas por el runner dedicado |
| npm run api:validate     | OpenAPI válido, 40 ejemplos conformes                                            |
| npm run db:validate      | Esquema válido; no prueba migración ni conexión por sí solo                      |
| npm run test:integration | 50 correctas: 19 auth/admin, 13 catálogo, 18 orders                              |
| npm run db:verify        | PostgreSQL 17.10: 22 comprobaciones correctas y mutantes C01–C04 detectados      |
| npm run build            | Correcto                                                                         |
| npm run format:check     | Correcto tras formatear la documentación previa que lo bloqueaba                 |

- Formato global comprobado correctamente; el bloqueo documental anterior quedó resuelto.
- Durante desarrollo se corrigieron errores de tipos de helpers de tests y una
  diferencia de orden de claves JSON entre respuesta inicial/replay. La respuesta
  inicial ahora procede de la misma representación JSONB persistida. La suite final pasa.
- Entorno: PostgreSQL 17 temporal en puerto 56440 y bases propias por runner,
  sin migrar/resetear desarrollo, shadow ni producción. DOTENV_CONFIG_PATH apuntó
  a ruta inexistente temporal para que los comandos no cargaran `.env` local.
- No se ejecutó ninguna prueba real de Cloudinary/Stripe ni se generaron tickets.
- Se comprobó que no quedaron bases temporales de los runners; PostgreSQL temporal
  quedó detenido al cierre. El contrato anterior se comparó semánticamente: rutas,
  esquemas y mecanismos de seguridad previos intactos; 48 enlaces locales válidos.
- Pruebas unitarias adicionales verifican reintento de conflictos Prisma/SQL
  reconocidos, máximo tres intentos y ausencia de reintento para errores de integridad.
- Revisión humana e integración: pendientes; no hay autorización de publicación.
