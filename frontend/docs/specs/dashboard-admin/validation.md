# Validación DA-001

Registro de evidencia de las tareas del dashboard. No sustituye la revisión independiente ni convierte pruebas omitidas en aprobadas.

## TASK-DA-E1-00 — Contrato del resumen

Estado: **contrato aprobado por el responsable el 2026-11-24; revisión inicial y re-revisión independientes realizadas; B1 cerrado; commit `mismo commit`**.

- Contrato: [contracts/E1-summary-contract.md](./contracts/E1-summary-contract.md).
- OpenAPI: `GET /api/v1/admin/dashboard/summary` con `x-contract-status: approved-2026-11-24`.
- `backend/`: `npm run api:validate` → OpenAPI válido, 66 ejemplos conformes.
- `backend/`: `npx --no-install prettier --check docs/api/openapi.yaml` → correcto.
- Raíz: `git diff --check` → correcto.
- No se implementó runtime en esta tarea.
- La revisión independiente detectó B1 (patrón `changePercent`) y la re-revisión confirmó su corrección.
- Pendiente: aceptación formal de cierre y autorización de commit.

## TASK-DA-E1-01 — Backend del resumen

Estado: **implementación y verificación ejecutadas; integración PostgreSQL y `db:verify` verdes; revisión final sin bloqueantes; commit `mismo commit`**.

### Archivos

- `backend/src/modules/sales/sales.validation.ts`: query estricta, UTC y rango máximo de 366 días.
- `backend/src/modules/sales/sales.read.repository.ts`: agregación de periodo actual/anterior, ventas y unidades.
- `backend/src/modules/sales/sales.service.ts`: promedio y comparación con BigInt, sin Number.
- `backend/src/modules/sales/sales.routes.ts`: ruta solo ADMINISTRADOR, no-store/no-referrer y rechazo de body.
- `backend/tests/dashboard-summary.test.ts`: pruebas unitarias del cálculo.
- `backend/tests/completion.test.ts`: validación del query.
- `backend/tests/integration/completion.integration.test.ts`: escenarios HTTP/BD de resumen, permisos, mezcla, unidades y conciliación con `/sales/summary`.
- `backend/docs/api/openapi.yaml`: contrato aprobado, descripción actualizada a implementación presente.

### Comandos ejecutados en `backend/`

| Comando | Resultado |
| --- | --- |
| `npm run format:check` | Correcto. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm test` | 120 pruebas correctas; 146 omitidas (incluye integraciones). |
| `npm test -- --run tests/completion.test.ts tests/dashboard-summary.test.ts` | 11 pruebas correctas. |
| `npm run api:validate` | OpenAPI válido, 66 ejemplos conformes. |
| `npm run db:validate` | Esquema Prisma válido. |
| `npm run build` | Correcto. |
| `npm run test:integration` | **Correcto**: 146 pruebas en 7 suites, incluidas 22 de `completion.integration.test.ts`. |
| `node --env-file=.env.docker scripts/verify-database.mjs` | **Correcto**: PostgreSQL 17.11, 22 comprobaciones, mutantes C01–C04 detectados. |

### Cobertura probada sin PostgreSQL (Vitest)

- Rango obligatorio, UTC con `Z`, `from<to`, límite exacto de 366 días y rechazo de 366 días + 1 ms.
- Query extra rechazado; `limit` no aceptado; offset horario rechazado.
- Promedio y comparación con base cero → `null`.
- Variaciones `0.00`, `0.50`, `-0.50` y caída minúscula que redondea a `0.00`; sin `-0.00`.
- Periodo anterior por duración absoluta de 23 h alrededor de un cambio DST.
- Importes grandes conservados como cadenas; sin conversión a Number.

### Cobertura de integración ejecutada (PostgreSQL 17.11)

`completion.integration.test.ts` pasó 22/22 dentro de 146/146 totales:

- ADMINISTRADOR 200; CLIENTE/CAJERO/PREPARACION 403; sin sesión 401.
- Cabeceras `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.
- Conciliación de totales/tickets contra `/sales/summary` con `method=CASH` y `method=STRIPE`; CASH usa una venta fixture directa con dos unidades.
- Unidades contra suma SQL de `OrderItem.quantity`; mezcla suma al total.
- Base anterior cero → `changePercent: null`.
- Reembolso registrado no reduce el total bruto.
- Periodo anterior con una venta CASH y una STRIPE: `method=CASH` y `method=STRIPE` comparan solo su método.
- Periodo de 23 h alrededor de DST: 200, límites y `previousFrom` correctos.
- Body, query extra, rango inválido y `from` faltante → 400.

### Cobertura por construcción, sin fixture dedicado

- Órdenes pendientes/fallidas/expiradas quedan fuera porque el universo parte de `Sale`.
- Opciones no multiplican unidades porque la suma solo une `OrderItem`, no `OrderItemOption`.
- Reembolsos no se consultan; la venta se conserva.
- `roundedDivide` no se invoca con denominador cero porque el servicio resuelve antes el caso sin tickets/base cero; no produce `Infinity`/`NaN`.
- `db:validate` (Prisma) y `db:verify` (PostgreSQL 17.11) se ejecutaron correctamente.

### Revisión independiente

- La revisión inicial encontró B1: el patrón OpenAPI de `changePercent` rechazaba `0.00`, `0.50` y `-0.50`. Se corrigió el patrón y se añadieron pruebas unitarias.
- La re-revisión confirmó B1 cerrado y no encontró un nuevo bloqueante de código/contrato.
- Señaló que la evidencia debía separar implementado/probado/ejecutado; esta sección se corrigió.
- La fixture CASH inicial no respetaba `orders_check_2`/`payments_check_2`; se corrigió con token QR CASH, cajero y sesión abierta válidos, y la conciliación CASH se calcula desde la base.
- Tras la corrección, `test:integration` pasó 146/146 y `db:verify` 22 comprobaciones.
- Revisión final de cierre: confirmada sin bloqueantes de código, contrato o prueba; solo señaló dos frases documentales obsoletas, ya corregidas.

### Cierre

- Aceptación formal del responsable registrada.
- Commit atómico de la tarea: `mismo commit`.
- Sin push ni despliegue.

## Siguiente puerta

`TASK-DA-E1-02` (shell), `TASK-DA-E1-04` (adaptador) y el resto de E1 no se inician automáticamente. E1-01 está verificada técnica y funcionalmente; solo queda la aceptación formal y la autorización de commit. La integración real ya se ejecutó (146/146) y `db:verify` pasó (22 comprobaciones).
