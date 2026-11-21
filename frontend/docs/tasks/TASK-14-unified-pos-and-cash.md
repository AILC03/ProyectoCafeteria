# Tarea: TASK-14 — POS y sesión de caja en frontend unificado

- Responsable: Leonel (implementación coordinada con IA)
- Revisor humano: Equipo frontend, pendiente de PR
- Aplicación afectada: `frontend/unified/` (área terminal)
- Rama base: `feat/frontend-task-13` (PR #14 TASK-13; se actualizará a `main` tras su integración)
- Rama de trabajo: `feat/frontend-task-14`
- Estado: implementada y verificada; pendiente de revisión humana y PR

## Objetivo y fuentes

Migrar la toma de orden de caja, la búsqueda/asociación mínima de cliente y la
apertura/consulta/cierre de caja conforme a
[TASK-14](../specs/frontend-unification/FRONTEND-UNIFICATION-TASKS.md),
[SPEC-FE-001](../specs/frontend-unification/FRONTEND-UNIFICATION-SPEC.md),
[PLAN-FE-001](../specs/frontend-unification/FRONTEND-UNIFICATION-PLAN.md),
[integración](../specs/frontend-unification/FRONTEND-UNIFICATION-INTEGRATION.md),
[OpenAPI](../../../backend/docs/api/openapi.yaml),
[permisos](../permissions.md) y [reglas](../business-rules.md).

## Alcance y exclusiones

- Incluye: creación de orden `CASHIER`/`CASH` pendiente con claves idempotentes;
  líneas y opciones leídas del catálogo API; búsqueda exacta de cliente y
  confirmación de nombre; asociación de cliente por PATCH antes de pago o
  vencimiento; consulta de caja activa y apertura/cierre con idempotencia.
- No incluye: cobro, `POST /payments/cash`, ticket, QR CASH, reemisión/escaneo de
  QR, Stripe, menú/empleados/órdenes locales como autoridad, PIN/reset, cocina,
  administración, cambios de contrato/backend ni servicios reales.

## Criterios de aceptación y trazabilidad

| ID | Requisito y fuente | Archivo / componente afectado | Verificación esperada | Estado |
| --- | --- | --- | --- | --- |
| CA-01 | `POST /cashier/orders` con `Idempotency-Key`; sin precios, QR, `customerId`, `source` ni estado en la solicitud (OpenAPI `createCashierOrder`) | `features/terminal/pos/posApi.ts`, `PosPage.tsx` | Cuerpo exacto, misma clave en reintento, respuesta verificada; 201 ilegible bloquea | Verificado |
| CA-02 | Búsqueda exacta por teléfono MX/`customer_number` y asociación con `confirmedName`; 404 sin coincidencia (OpenAPI `searchOrderCustomer`, `associateOrderCustomer`) | `posApi.ts`, `PosPage.tsx` | MSW/componente y E2E de búsqueda, asociación y error | Verificado |
| CA-03 | Asociación sólo con `PENDIENTE_PAGO`, `paidAt` nulo y antes de `paymentExpiresAt`; se respeta al servidor como autoridad | `posApi.ts`, `PosPage.tsx` | Comprobación local y mensaje ante 409; ningún cobro | Verificado |
| CA-04 | Caja activa global, apertura/cierre idempotentes y estado calculado por API (OpenAPI `openCashSession`, `currentCashSession`, `getCashSession`, `closeCashSession`) | `features/terminal/cash/cashApi.ts`, `CashSessionsPage.tsx` | MSW/componente y E2E de caja cerrada/abierta/cerrada; 401/403/404/409 | Verificado |
| CA-05 | Sólo el responsable cierra; ADMINISTRADOR puede cerrar ajena con `exceptionalCloseReason` no vacío (BR-CASH-001/003/004) | `cash/cashSessionRules.ts`, `CashSessionsPage.tsx` | Pruebas unitarias y E2E con ambos roles | Verificado |
| CA-06 | Accesibilidad táctil/teclado y rutas protegidas para CAJERO/ADMINISTRADOR (TASK-13, SPEC-FE-001) | `app/router.tsx`, componentes y pruebas E2E | Foco, etiquetas, 320 px y guardas de terminal | Verificado |

## Impacto técnico

- API: sólo rutas y esquemas existentes en OpenAPI; no se agregaron endpoints ni
  campos al contrato. `includeCashQr` nunca se envía.
- Estado local: borrador de líneas y claves idempotentes viven en memoria de la
  página; no hay menú, precios, empleados ni órdenes como autoridad local.
- Interfaz: `/terminal/pos` y `/terminal/caja` dejan de ser placeholders y
  mantienen `TerminalAccessGuard` para `CAJERO`/`ADMINISTRADOR`.
- Dinero: importes se envían como cadenas enteras de centavos; la conversión
  desde MXN es explícita y sin coma flotante.

## Decisiones aplicadas (propuestas, pendientes de ratificación formal)

1. El POS reutiliza el diálogo de personalización del catálogo para construir
   líneas; el precio mostrado es una estimación visual y el total definitivo lo
   devuelve `POST /cashier/orders`.
2. La asociación expone un campo de ID de orden pendiente para permitir también
   órdenes móviles no pagas, incluidas las de `STRIPE`; la verificación local de
   la respuesta de `PATCH` admite `CASH` y `STRIPE`, mientras la creación desde
   caja sigue exigiendo `CASHIER`/`CASH`. El backend valida el estado.
3. Una respuesta `201` no verificable bloquea nuevas órdenes y reintentos con el
   mismo mensaje de seguridad usado en TASK-11; un fallo incierto de red permite
   reintentar únicamente la misma clave/cuerpo.
4. La caja ajena sólo se ofrece a ADMINISTRADOR con motivo; al responsable se le
   oculta el campo de motivo porque el contrato lo rechaza.

## Evidencia de entrega

- Archivos nuevos: `features/terminal/pos/{posApi.ts,PosPage.tsx,posApi.unit.test.ts,PosPage.component.test.tsx}`,
  `features/terminal/cash/{cashApi.ts,cashSessionRules.ts,CashSessionsPage.tsx,cashApi.unit.test.ts,CashSessionsPage.component.test.tsx}`,
  `e2e/pos-and-cash.spec.ts`.
- Archivos modificados: `app/router.tsx`, `styles/base.css`, pruebas de ruta y
  mocks E2E existentes para incluir `/cash-sessions/current`.
- Comandos y resultados (perfil V-TERMINAL): `npm.cmd run lint` ✅,
  `npm.cmd run typecheck` ✅, `npm.cmd run test` **184/184 en 20 archivos** ✅,
  `npm.cmd run test:e2e` **15/15 en Chromium** ✅, `npm.cmd run build` ✅ y
  `git diff --check` ✅. La revisión independiente señaló que `PATCH` debía
  aceptar respuestas `MOBILE`/`STRIPE` pendientes y que el reintento de cierre
  debía fijar la sesión original; ambos puntos quedaron corregidos y cubiertos.
  La carga inicial de caja ignora la cancelación de StrictMode para no mostrar
  un falso error de red.
- Entorno: Node v26.13.0 detectado, fuera del rango declarado
  `>=22.13.0 <23`; queda repetir la matriz con Node 22 en el pipeline del equipo.
- Pruebas manuales con API real: no previstas; URL y estados simulados con
  MSW/Playwright.
- Pendientes conocidos: revisión humana y ratificación de las decisiones
  propuestas; registro de cierre incluido en `FRONTEND-UNIFICATION-STATUS.md`.

## Referencias

- [TASK-14 — Migrar POS y sesión de caja](../specs/frontend-unification/FRONTEND-UNIFICATION-TASKS.md)
- [SPEC-FE-001 — Unificación frontend](../specs/frontend-unification/FRONTEND-UNIFICATION-SPEC.md)
- [PLAN-FE-001 — Unificación frontend](../specs/frontend-unification/FRONTEND-UNIFICATION-PLAN.md)
- [Cobertura de endpoints](../api/endpoints-coverage.md)
- [Backlog](../development-tasks.md)
