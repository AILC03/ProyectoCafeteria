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

## TASK-DA-E1-02 — Shell administrativo

Estado: **shell estructural aceptado por el responsable el 2026-11-24; identidad visual/DA-D08 diferida a una tarea posterior; commit `mismo commit`**.

### Archivos

- `frontend/unified/src/features/terminal/admin/AdminPage.tsx`: navegación lateral con enlaces a rutas existentes, foco del título y etiquetas de grupo sin `h2` antes del `h1`.
- `frontend/unified/src/styles/base.css`: shell de dos columnas, estado activo y colapso a una columna.
- `frontend/unified/src/features/terminal/admin/AdminPage.component.test.tsx`: navegación, `aria-current`, un solo `main`, foco inicial y foco tras navegar.
- `frontend/unified/src/App.component.test.tsx`: regresión de la ruta administrativa existente.
- `frontend/unified/e2e/admin.spec.ts`: enlaces laterales y flujo por teclado.
- No se añadió un alias de ruta nuevo: la revisión retiró `/terminal/administracion/dashboard` para no introducir una decisión DA-D01 no aprobada.

### Comandos ejecutados en `frontend/unified/`

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run test` | 285/285 en 32 archivos. |
| `npm run test:e2e` | 59/59 Chromium, incluida Electron y axe de administración. |
| `npm run build` | Correcto; advertencia existente de chunk >500 kB, no bloqueante. |
| `git diff --check` | Correcto. |

### Cobertura

- ADMINISTRADOR entra; CAJERO/PREPARACION siguen bloqueados por guarda y pruebas existentes.
- Navegación lateral con `aria-current="page"`, enlaces a Inicio, Ventas, Caja, Catálogo, Categorías, Grupos, Valores y Personal.
- Un solo `main`; foco en el título al entrar y después de navegar por el menú.
- Sin rutas nuevas ni enlaces a rutas inexistentes; catálogo, personal, caja e historial conservan sus rutas.
- Axe WCAG 2.1 A/AA de administración y prueba E2E por teclado pasan.

### Revisión independiente

- Sin bloqueantes de código, permisos, rutas ni doble `main`.
- Se retiró el alias de Inicio no aprobado y se corrigió el orden de encabezados; se añadió prueba de foco tras navegación.
- Riesgos residuales: el enlace «Saltar al contenido» apunta al `main` que contiene el sidebar; la validación manual de teclado debe confirmarlo. Una subruta administrativa desconocida sigue mostrando Inicio, comportamiento preexistente.

### Aceptación y evidencia visual

- El responsable revisó capturas a 1280, 768 y 390 px y aceptó el shell estructural el 2026-11-24.
- Las capturas se generaron con API simulada en archivos temporales, no versionados: `admin-shell-1280.png`, `admin-shell-768.png`, `admin-shell-390.png`.
- La identidad visual café/crema del PDF, la comparación formal contra el wireframe y DA-D08 quedan diferidas a una tarea posterior. No se declaran aplicadas.
- Revisión independiente: sin bloqueantes de código. Se retiró el alias no aprobado y se corrigió la jerarquía de encabezados.
- Commit: `mismo commit`.

## TASK-DA-E1-03 — Periodos de negocio y presentación exacta

Estado: **terminada técnicamente; re-revisión final realizada sin bloqueantes; commit `mismo commit`**.

### Archivos

- `frontend/unified/src/features/terminal/admin/dashboard/periods.ts`: reloj inyectable, `America/Tijuana`, presets, custom inclusivo, límites UTC semiabiertos, máximo 366 días, conteos/porcentajes exactos.
- `frontend/unified/src/features/terminal/admin/dashboard/periods.unit.test.ts`: 12 pruebas unitarias.

### Comandos ejecutados en `frontend/unified/`

| Comando | Resultado |
| --- | --- |
| `npm run test` | 297/297 en 33 archivos. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run build` | Correcto; advertencia existente de chunk >500 kB, no bloqueante. |
| `git diff --check` | Correcto. |

### Cobertura ejecutada

- Hoy por defecto, incluida medianoche local antes de medianoche UTC.
- Últimos 7 y 30 días incluyendo hoy; cambio de mes/año y febrero bisiesto.
- DST de Tijuana: 23 h en primavera, 25 h en otoño y 30 días con desplazamiento de una hora.
- Custom con fecha final inclusiva convertida a fin exclusivo.
- Rechazo de fechas inexistentes, inicio posterior al fin, más de 366 días y límites no UTC.
- Límite exacto de 366 días aceptado.
- Conteos con BigInt y porcentajes `0.00`, `0.50`, `-0.50`, `10.00`, `-10.00`; rechazo de `-0.00` y formatos inválidos.

### Revisión independiente

- Revisión inicial: sin bloqueante de código; solicitó casos de medianoche local, fin de mes/año, límite exacto, entero grande, `0.50` e inválidos, y validación UTC en `periodQuery`.
- Correcciones aplicadas: pruebas añadidas, validación UTC y comprobación final de convergencia de medianoche.
- Re-revisión final: sin bloqueantes de código ni prueba. Se alineó el patrón UTC con el contrato (1–6 decimales) y se probó un límite con microsegundos.
- Commit: `mismo commit`.

## TASK-DA-E1-04 — Adaptador frontend del resumen

Estado: **terminada técnicamente; revisión y re-revisión sin bloqueantes; commit `mismo commit`**.

### Archivos

- `frontend/unified/src/features/terminal/admin/dashboard/summaryApi.ts`: query builder estricto, DTO, parser semántico, errores y `apiFetch` compartido.
- `frontend/unified/src/features/terminal/admin/dashboard/summaryApi.unit.test.ts`: 18 pruebas con MSW.

### Comandos ejecutados en `frontend/unified/`

| Comando | Resultado |
| --- | --- |
| `npm run test` | 315/315 en 34 archivos. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run build` | Correcto; advertencia existente de chunk >500 kB, no bloqueante. |
| `git diff --check` | Correcto. |

### Cobertura ejecutada

- Query builder con `from`, `to`, `method` CASH/STRIPE, orden estable, rechazo de extras, offsets, fechas inexistentes, rango invertido y >366 días.
- DTO de éxito y cero con base anterior cero → `changePercent: null`.
- Rechazo de claves extra, moneda/zona incorrectas, mezcla que no suma, comparación inconsistente, periodo anterior incorrecto, porcentaje `-0.00`, promedio sin tickets, base ausente/base cero con porcentaje y respuesta de otro periodo.
- Errores 400/401/403/429/503; mensajes específicos para `PIN_CHANGE_REQUIRED` y `ORIGIN_NOT_ALLOWED`, y respuesta no verificable; sin reintento automático.
- Prueba de aborto con `AbortController`: la cancelación se presenta como `AbortError`, no como error de red; el formateador devuelve “consulta cancelada”.
- Uso de `apiFetch`, `AbortSignal` y cliente HTTP compartido; sin segundo cliente.

### Revisión independiente

- Revisión inicial: sin bloqueante de código/contrato; señaló cancelación no probada, evidencia imprecisa, fechas inexistentes, límite de enteros y mensaje 403 genérico.
- Corregido: prueba real de aborto, validación estricta de fechas UTC, límite alineado al contrato, mensajes 403 por código y casos adicionales.
- Re-revisión final: sin bloqueantes de código/contrato. Se corrigió la cifra de pruebas y se añadieron pruebas de los mensajes 403 y del formateador de aborto.
- Commit: `mismo commit`.

## TASK-DA-E1-05 — Tarjetas de Inicio

Estado: **terminada técnicamente; revisión inicial aplicada; commit `mismo commit`; identidad visual DA-D08 diferida**.

### Archivos

- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.tsx`: periodos, método, tarjetas, comparaciones, mezcla, carga/error/vacío y actualización manual.
- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.component.test.tsx`: 7 pruebas de componente.
- `frontend/unified/src/features/terminal/admin/AdminPage.tsx`: Inicio usa el componente integrado.
- `frontend/unified/src/styles/base.css`: estilos de tarjetas/filtros responsive.
- `frontend/unified/e2e/admin.spec.ts` y `e2e/accessibility.spec.ts`: fixtures del nuevo endpoint.

### Comandos ejecutados en `frontend/unified/`

| Comando | Resultado |
| --- | --- |
| `npm run test` | 322/322 en 35 archivos. |
| `npm run test:e2e` | 59/59 Chromium, incluida Electron y axe. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run build` | Correcto; advertencia existente de chunk >500 kB. |
| `git diff --check` | Correcto. |

### Cobertura ejecutada

- Tarjetas de ventas, tickets, promedio y unidades con variación absoluta/porcentual.
- Mezcla por importe CASH/STRIPE y nota de importe bruto.
- Periodo Hoy por defecto, presets 7/30 días, custom inclusivo y método CASH/STRIPE.
- Estado de carga, vacío con cero, error API, DTO no verificable y reintento.
- Respuesta antigua descartada tras cambiar de periodo; estado de carga visible antes del resultado.
- Actualización manual: una consulta inicial, otra solo al pulsar «Actualizar resumen», sin polling.
- Axe WCAG 2.1 A/AA de administración y prueba E2E de teclado.
- Identidad visual final del PDF sigue diferida por DA-D08; no se declara aplicada.

### Revisión independiente

- Revisión inicial: sin bloqueante funcional de producción; B1 exigió prueba real de respuestas fuera de orden y corrección de la evidencia.
- Corregido: prueba con respuesta lenta/antigua descartada, prueba de actualización manual sin polling, limpieza anticipada del resumen al cambiar filtros, `aria-invalid`/`aria-describedby` y limpieza de errores de filtro.
- No se declara aprobada la identidad visual; DA-D08 sigue diferida.
- Commit: `mismo commit`.

## Siguiente puerta

`TASK-DA-E1-02` (shell), `TASK-DA-E1-04` (adaptador) y el resto de E1 no se inician automáticamente. E1-01 está verificada técnica y funcionalmente; solo queda la aceptación formal y la autorización de commit. La integración real ya se ejecutó (146/146) y `db:verify` pasó (22 comprobaciones).
