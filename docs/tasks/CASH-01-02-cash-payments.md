# Tarea CASH-01/CASH-02 — Caja y efectivo

- Responsable: IA por encargo de Ángel, 2026-10-26.
- Revisor: Ángel; coordinación frontend con Enrique antes de integrar.
- Estado: implementada y verificada localmente, cierre 2026-10-27; pendiente de revisión/integración y configuración operativa. Árbol inicialmente limpio. Sin commit/push/merge/despliegue.

## Fuentes, alcance y exclusiones

[Reglas](../business-rules.md): BR-CASH-001–005, BR-PAY-002, BR-REG-001–006,
BR-ORD-003/009/011 y snapshots; [permisos](../permissions.md),
[diccionario](../data-dictionary.md), [arquitectura](../architecture.md),
[OpenAPI](../api/openapi.yaml), [ORD-01](ORD-01-pending-orders.md),
[guía orders](../orders-implementation.md), [frontend](../frontend-integration.md),
[locks](../database/integrity-protocols.md), [backlog](../development-tasks.md),
ADR 0001–0012 aceptados y encargo actual.

Incluye apertura, caja actual/resumen, cierre propio/excepcional, cobro por ID de
orden CASH, payment/sale separados, ticket JSON imprimible y token de registro
de invitado preparado. No incluye consumir registro, recuperación, Stripe,
webhooks, conciliación, reembolsos, correo real, historial completo ni worker.
QR de registro no es QR de cobro ni token de acceso al ticket de ADR 0011.
La emisión/lectura del QR **de cobro** y acceso digital invitado al ticket quedan
fuera de esta entrega; no declarar completo ese subalcance del backlog original.

## Matriz requisito → código → prueba

U = [tests/cash.test.ts](../../tests/cash.test.ts),
I = [tests/integration/cash.integration.test.ts](../../tests/integration/cash.integration.test.ts).
Código bajo `src/modules/`; contratos en OpenAPI 0.5.0.

| ID  | Requisito                                        | Código                                                          | Evidencia ejecutada, correcta                                                                                                                                   |
| --- | ------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Una apertura global y auditoría                  | cash.service/repository + índice parcial existente              | I: dos aperturas concurrentes (201/409), inserción directa rechazada por UNIQUE y una auditoría                                                                 |
| C02 | Responsable y excepción admin                    | cash/payments services + actor vigente de orders                | I: cobro/cierre ajenos prohibidos, motivo obligatorio (incluso límite 500), responsable/actor conservados; admin cobra su propia sesión                         |
| C03 | Montos/esperado/cambio exactos                   | cash.validation/rules/service; payments.validation              | U/I: inválidos, insuficiente, cambio distinto, límites BIGINT, faltante de un centavo, rollback después de crear pago/venta                                     |
| C04 | Pago/venta únicos, idempotencia 48h              | payments.service; cashOperation                                 | I: 10 cobros concurrentes idénticos, distinta clave un ganador, entrada distinta 409, replay tras cierre, caducidad del registro no permite recobro; UNIQUE SQL |
| C05 | Orden de locks                                   | cash.repository + payments                                      | I: carrera determinista cobro primero/cierre primero y asociación concurrente; saldo consistente y QR según asociación final                                    |
| C06 | Rechazo de estado/método indebido y LISTO seguro | payments.service; orders.hasSuccessfulCashPayment               | I: paid/expired/overdue/STRIPE sin cobro, paidAt aislado no permite LISTO; ORD-01 conserva pruebas con fixture de pago/venta coherente                          |
| C07 | Referencias/históricos                           | sales.repository; tickets.service; sessionSummary               | I: referencias y auditoría correctas, ingreso neto para resumen/cierre; ticket conserva producto y opciones tras cambios/bajas                                  |
| C08 | QR invitado 24h, asociado ninguno                | tickets cipher/repository/service; customer_registration_tokens | I: un hash/token, reimpresión sin extensión con servicio nuevo, usado/vencido sin QR y purga de cifrado. Consumo final sigue fuera de alcance                   |
| C09 | Aislamiento y protección del token               | tickets.routes/cipher; cashOperation; migración nueva           | U/I: AES-GCM/AAD por venta y versión, manipulación rechazada, par de campos exigido por SQL, no token en idempotencia/logs; QR/Bearer no autentica compras      |
| C10 | Sin regresiones                                  | suites existentes + nuevas                                      | 19 auth/admin + 13 catálogo + 18 ORD-01 correctas, más 22 CASH y unitarias; comandos debajo                                                                     |

## Plan y riesgos

1. Contrato primero: POST /cash-sessions; GET /cash-sessions/current y /{id};
   POST /cash-sessions/{id}/close; POST /payments/cash; GET /sales/{id}/ticket.
2. Módulos cash/payments/tickets con capas; sales solo acceso a datos requerido
   por cobro, sin rutas/CRUD vacíos. Reutilizar DTO/validación de órdenes y
   transacción/revalidación de sesión, sin duplicar cálculo ni snapshots.
3. Lock global de caja (2026,2), fila de caja y después orden. Apertura se protege
   también con only_one_open_cash_session. Pago/venta con índices únicos existentes.
4. Idempotencia obligatoria en apertura, cierre y cobro; resultados públicos
   persistidos 48h sin tokens. Ticket protegido se recupera aparte de la respuesta
   de cobro; reimprime el mismo token sin consumirlo ni extender su plazo.
5. Migración aditiva: cifrado temporal del token de registro y versión de clave
   para recuperar ticket tras pérdida de respuesta/reinicio. Hash SHA-256 para
   consumo futuro; original aleatorio 32 bytes solo en memoria/respuesta protegida.
   AES-256-GCM con clave exclusiva fuera de BD; sin clave, cobro de invitado 503
   sin efectos parciales. No generar ni configurar secretos reales en esta tarea.
   Limpieza explícita del cifrado usado/vencido; scheduling sigue pendiente.
6. El runner de integración es el único responsable de cargar `.env.docker` para
   uso local normal. Cuando ya existe `TEST_DATABASE_URL` explícita no carga
   `.env.docker`, `.env` ni otro archivo de entorno; los checks usan esa URL
   aislada explícita.

Importes individuales caben en BIGINT positivo; el fondo más ventas debe caber
también antes de cobrar. Diferencia de cierre admite negativos. Nunca confiar en
total/cambio/expectedCashCents enviados por cliente; changeCents opcional solo
como aserción que debe coincidir con el cálculo backend.

## Decisiones/aprobaciones

No cambia ADR aceptado ni se activa proveedor externo. QR/token de registro se
entrega como dato para renderizar en frontend, sin inventar endpoint de registro.
Clave de tickets será configuración operativa posterior, no un secreto de respaldo.
La revisión/aceptación humana de la entrega no se presume.

## Evidencia de cierre

### Archivos

- Nuevos: `src/modules/cash/{cash.routes,cash.validation,cash.controller,cash.service,cash.repository,cash.rules}.ts`;
  `src/modules/payments/{payments.routes,payments.validation,payments.controller,payments.service,payments.repository}.ts`;
  `src/modules/sales/sales.repository.ts`;
  `src/modules/tickets/{tickets.routes,tickets.validation,tickets.controller,tickets.service,tickets.repository,tickets.cipher}.ts`.
- Reutilización: `src/shared/database/transaction.ts` extraído de orders;
  `src/modules/orders/orders.repository.ts` y `orders.service.ts` para exigir pago
  CASH/venta antes de LISTO; `tests/integration/orders.integration.test.ts` actualiza
  solo la fixture de pago, sin eliminar ni debilitar sus casos de seguridad.
- Integración: `src/app.ts`, `src/server.ts`; esquema y migración aditiva
  `prisma/migrations/20261026_cash_ticket_delivery/migration.sql`.
- Scripts: `scripts/update-cash-contract.mjs`, `scripts/cleanup-ticket-secrets.ts`,
  `scripts/run-integration.mjs` y comandos en package.json; sin dependencias nuevas.
- Tests: U/I citados. Guías: `docs/cash-implementation.md`, frontend-integration,
  PROJECT-CONTEXT, backend-progress, development-tasks, permissions, data-dictionary,
  architecture, testing, orders-implementation, api/contract-plan y README.
- Contrato: `docs/api/openapi.yaml`, actualizado antes del código. Evidencia SQL
  regenerada: `docs/database/review-evidence/corrections-results.json`.

### Comandos y resultados reales

| Comando                  | Resultado                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| npm run typecheck        | Correcto                                                                                                        |
| npm run lint             | Correcto                                                                                                        |
| npm run format:check     | Correcto globalmente                                                                                            |
| npm test                 | 69 correctas; 72 integraciones omitidas aquí y ejecutadas por runner dedicado                                   |
| npm run build            | Correcto                                                                                                        |
| npm run api:validate     | OpenAPI válido, 49 ejemplos conformes                                                                           |
| npm run db:validate      | Esquema válido                                                                                                  |
| npm run test:integration | 72 correctas: auth/admin 19, CASH 22, catálogo 13, ORD-01 18                                                    |
| npm run db:verify        | PostgreSQL 17.10: 22 comprobaciones correctas, mutantes C01–C04 detectados; migraciones repetibles y diff vacío |

Todos los checks requeridos fueron ejecutados. El runner usó TEST_DATABASE_URL
explícita aislada y no leyó archivos de entorno. Ningún archivo de entorno o secreto
real fue leído/modificado. La rama automática Docker de TEST-01 se conserva en el
wrapper, pero no se ejecutó leyendo `.env.docker` por esta restricción.

Durante desarrollo se corrigió una conversión BigInt de entradas inválidas de Zod
(ahora pipe antes de convertir) y un volcado BigInt exclusivo de test. Se detectó
que el PostgreSQL temporal antiguo tenía template1 incompleto (58P01) y faltaban
archivos auxiliares de sus binarios; se detuvo y preparó una **instancia nueva**
con binarios PG17 fuera del repo, sin resetear bases existentes. La ejecución final
usa esa instancia nueva en localhost:56440 y bases propias eliminadas por runners.
Se comprobó que no quedaron bases de runners y se detuvo la instancia temporal
al terminar. El contrato previo fue comparado semánticamente: se conserva salvo
el endurecimiento documentado de LISTO; 78 enlaces locales verificados. Código y
pruebas de auth/catalog y migraciones anteriores permanecen sin cambios.

### Pendientes reales, no confundir con comprobaciones pasadas

- Revisión humana, coordinación frontend e integración no realizadas.
- Migración no aplicada a desarrollo/shadow/producción; solo bases temporales propias.
- No se generó/configuró clave real: antes de invitados, configurar externamente
  TICKET_ENCRYPTION_KEY exclusiva y conservar su versión mientras sus tickets vivan.
  Sin ella, invitado 503 con rollback (asociado y caja funcionan, comprobados).
- Limpieza de payload disponible como comando; scheduling/worker no instalado.
- Ticket es JSON protegido para impresión; renderizador/impresión frontend y QR de
  cobro/escaneo pendientes. El registro final y su consumo transaccional/un uso no
  están implementados ni se declaran probados. No hay ticket público de invitado.
- Stripe, webhooks, conciliación, reembolsos, correo real, favoritos, historial
  completo y worker/expiración automática fuera del alcance. Cloudinary simulado.
- Sin commit, push, merge ni despliegue.
