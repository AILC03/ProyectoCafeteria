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

## TASK-DA-E1-06 — Caja actual y últimas ventas

Estado: **terminada técnicamente; revisión inicial aplicada; commit `mismo commit`**.

### Archivos

- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.tsx`: caja actual independiente, últimas ventas filtradas y enlaces existentes.
- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.component.test.tsx`: 10 pruebas de componente.
- `frontend/unified/e2e/admin.spec.ts` y `e2e/accessibility.spec.ts`: fixtures de caja/ventas.
- `frontend/unified/src/styles/base.css`: estilos del bloque operativo.
- `frontend/unified/src/features/terminal/sales/salesApi.ts`: `order=asc|desc` y `AbortSignal` en `listSales`.
- `backend/src/modules/sales/{sales.validation.ts,sales.read.repository.ts,sales.service.ts}` y `backend/docs/api/openapi.yaml`: orden descendente opcional, cursor ligado al orden.
- `backend/tests/completion.test.ts`, `backend/tests/integration/completion.integration.test.ts`: validación y orden descendente.

### Comandos ejecutados en `frontend/unified/`

| Comando | Resultado |
| --- | --- |
| `npm run test` (frontend) | 327/327 en 35 archivos. |
| `npm run test:e2e` | 59/59 Chromium, incluida Electron y axe. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run build` | Correcto; advertencia existente de chunk >500 kB. |
| `npm test` (backend) | 120/120; 146 integraciones omitidas en el runner normal. |
| `npm run test:integration` (backend) | 146/146 en 7 suites. |
| `npm run api:validate` | OpenAPI válido, 66 ejemplos conformes. |
| `git diff --check` | Correcto. |

### Cobertura ejecutada

- Caja abierta con fondo, ventas efectivo, esperado y responsable por ID.
- Sin caja abierta como estado normal, no como error.
- Error de caja no anula resumen ni ventas.
- Últimas 5 ventas reales mediante `order=desc`; backend ordena por `(soldAt,id)` descendente y el cursor incluye el orden.
- Periodo/método afectan ventas y no el significado de caja; caja solo se refetch con actualización manual.
- Caja éxito→error limpia datos antiguos; ventas usan `AbortSignal`; errores de caja/ventas no anulan el resumen.
- Enlaces existentes a caja e historial; sin historial de caja, cobro, ticket ni `ticket-access`.
- Identidad visual final sigue diferida por DA-D08.

### Revisión independiente

- Revisión inicial: señaló B1 (orden ascendente no permite «últimas»), caja obsoleta tras fallo y falta de aborto real de ventas.
- Corregido: `order=desc` aprobado y extendido en contrato/backend con cursor; caja se limpia al refetch; `listSales` recibe `AbortSignal`.
- Sin bloqueantes conocidos tras la corrección; la identidad visual sigue diferida.
- Commit: `mismo commit`.

## TASK-DA-E1-07 — Detalle y ticket reutilizados

Estado: **terminada técnicamente; revisión inicial aplicada; commit `mismo commit`**.

### Archivos

- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.tsx`: acción «Ver ticket» por venta, ticket protegido, foco/cierre y cierre al cambiar filtros.
- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.component.test.tsx`: 14 pruebas de componente.
- Reutilización sin cambios de `ProtectedTicket`, `reprintSaleTicket`, `formatTicketError` y `getProtectedTicket`.

### Comandos ejecutados en `frontend/unified/`

| Comando | Resultado |
| --- | --- |
| `npm run test` | 330/330 en 35 archivos. |
| `npm run test:e2e` | 60/60 Chromium, incluida Electron y axe. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run build` | Correcto; advertencia existente de chunk >500 kB. |
| `git diff --check` | Correcto. |

### Cobertura ejecutada

- Ticket abierto desde últimas ventas en una acción, con foco en el encabezado y retorno al botón al cerrar.
- Ticket CASH/STRIPE verificado por el lector existente; efectivo nulo en tarjeta.
- Error 404 de ticket sin ticket visible y sin cobro/reintento.
- Sin POST de cobro, `ticket-access` ni token nuevo.
- Ticket en vuelo se invalida al cambiar periodo/método; no reaparece ni enfoca un ticket viejo.
- E2E abre y cierra el ticket desde últimas ventas.
- Identidad visual final sigue diferida por DA-D08.

### Revisión independiente

- Revisión inicial: flujo base correcto; B1 por ticket en vuelo que podía reaparecer tras cambiar filtros y falta de E2E específico.
- Corregido: se invalida `ticketRequest`, se limpia estado y se aborta visualmente al cambiar filtros; prueba de ticket diferido y E2E de apertura/cierre.
- No se declara aprobada la identidad visual.
- Commit: `mismo commit`.

## TASK-DA-E1-08 — Configuración básica de sesión

Estado: **terminada técnicamente; revisión inicial aplicada; commit `mismo commit`**.

### Archivos

- `frontend/unified/src/features/terminal/admin/SessionSettings.tsx`: nombre, usuario, rol, cuenta, entorno y API base; logout único en la cabecera.
- `frontend/unified/src/features/terminal/admin/AdminPage.tsx`: sección Configuración y enlace lateral.
- `frontend/unified/src/features/terminal/admin/SessionSettings.component.test.tsx`: 1 prueba.
- `frontend/unified/src/shared/auth/session.ts`, backend `auth.types.ts` y OpenAPI: `username` propio del personal en `/auth/me`.
- `frontend/unified/src/App.component.test.tsx`: ruta administrativa.

### Comandos ejecutados en `frontend/unified/`

| Comando | Resultado |
| --- | --- |
| `npm run test` (frontend) | 332/332 en 36 archivos. |
| `npm run test:e2e` | 60/60 Chromium, incluida Electron y axe. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run build` | Correcto; advertencia existente de chunk >500 kB. |
| `npm test` (backend) | 120/120; 146 integraciones omitidas. |
| `npm run test:integration` (backend) | 146/146 en 7 suites. |
| `npm run api:validate` | OpenAPI válido, 66 ejemplos conformes. |
| `git diff --check` | Correcto. |

### Cobertura ejecutada

- Nombre, usuario propio, rol y tipo de cuenta resueltos por `/auth/me`; entorno navegador/Electron y API base visible.
- Logout único en la cabecera del shell; no hay segundo botón ni gestor.
- Sin cambio de contraseña/NIP, secretos, almacenamiento local ni cierre global.
- Guarda ADMINISTRADOR existente sin cambios.
- Identidad visual final diferida por DA-D08.

### Revisión independiente

- Revisión inicial: sin bloqueante de seguridad; señaló falta de usuario y doble logout.
- Corregido: `username` propio añadido a la sesión/OpenAPI y logout único conservado en la cabecera.
- Sin bloqueantes conocidos tras la corrección; la identidad visual sigue diferida.
- Commit: `mismo commit`.

## TASK-DA-E1-09 — Aceptación integrada del MVP

Estado: **CERRADA Y ACEPTADA por el responsable el 2026-11-24; E1 aceptada con las limitaciones registradas**.

### Entorno real autorizado

- El responsable autorizó Docker local como entorno real de esta validación: PostgreSQL 17.11 en contenedor `cafeteria-local-postgres-1`, backend local en `http://localhost:3000` y Vite en `http://localhost:5173`. No es staging remoto ni acredita HTTPS de distribución.
- Dataset controlado y congelado para la corrida: 2 ventas del día (CASH 2 unidades, 4 000 centavos; STRIPE 1 unidad, 4 500 centavos), 1 venta del periodo anterior (1 000 centavos) y caja abierta con fondo de 50 000 centavos. Se usaron usuarios QA temporales; no se versionaron credenciales, manifiesto ni `.env`.
- Los importes/conteos agregados que aparecen en este registro son valores sintéticos del fixture QA, sin PII ni credenciales; publicarlos no expone secretos. El manifiesto completo con contraseñas QA permanece fuera del repositorio.
- La corrida live requirió `CATALOG_RATE_LIMIT=10000` como override de entorno para no agotar el límite global; no es cambio de código ni valida el límite de producción.

### Archivos de esta tarea

- `frontend/unified/playwright.live.config.ts`: configuración aislada (`testDir: ./e2e-live`, 1 worker, sin trazas/vídeo/capturas), reutiliza Vite y no arranca backend.
- `frontend/unified/e2e-live/dashboard-acceptance.spec.ts`: 5 pruebas reales sin `page.route`/`context.route`.
- `frontend/unified/e2e-live/README.md`: variables y aislamiento, sin secretos.
- `frontend/unified/package.json`: solo añade `test:e2e:live`; sin dependencias nuevas.

### Comandos ejecutados

| Comando | Resultado |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run build` (frontend) | Correctos; `test` 332/332 y `test:e2e` 60/60 simuladas, sin descubrir `e2e-live`. |
| `npm run test:e2e:live` sin variables | 5 omitidas limpiamente, exit 0. |
| `npm run test:e2e:live` con manifiesto y backend real | **5/5 en cuatro corridas registradas**: dos del implementador y dos de la verificación independiente (`dashboard-verifier`); la corrección de B1 se revalidó con otra corrida 5/5. |
| `npm run format:check`, `typecheck`, `lint`, `test`, `build`, `api:validate`, `db:validate` (backend) | Correctos; 120/120 unitarias, OpenAPI con 66 ejemplos conformes. |
| `npm run test:integration` (backend) | 146/146 en 7 suites con bases temporales aisladas. |
| `npm run db:verify:docker` (backend) | PostgreSQL 17.11, 22 comprobaciones correctas y mutantes C01–C04 detectados. |
| `git diff --check` | Correcto; solo aviso LF→CRLF de `package.json`. |

### Cobertura real acreditada

- Navegador → Vite → backend real con cookies y auth reales; resumen conciliado con `/sales/summary` usando los mismos `from`/`to`: total 8 500, tickets 2, unidades 3, promedio 4 250 y mezcla 4 000/4 500.
- Caja actual independiente del periodo/método: su texto no cambia y no se repite la petición a `/cash-sessions/current`; fondo, ventas en efectivo y esperado coinciden con el dataset (50 000 / 4 000 / 54 000).
- Últimas ventas ≤5 y descendentes, `saleNumber` conforme a `^V[0-9]{6,}$`, y ticket reimpreso en un clic con solo `GET /sales/{id}/ticket`, sin POST de cobro ni `ticket-access`. En E1 el detalle disponible es el ticket protegido (no existe pantalla separada de detalle desde Inicio), por lo que «detalle en ≤2 acciones» se acredita con esa apertura en una acción.
- Presets 7/30 días con límites UTC de `America/Tijuana`, método persistente y filtro vigente; rango vacío con ceros y «Sin comparación».
- Roles: CAJERO/PREPARACION bloqueados en UI sin peticiones administrativas, summary 403 con su sesión y 401 sin sesión.
- `Cache-Control: no-store` y `Referrer-Policy: no-referrer` reales; `localStorage` vacío; axe WCAG 2.1 A/AA sin violaciones.
- Electron en vivo: ejecutado el 2026-11-24 por coordinación con Playwright `_electron` y script temporal no versionado, contra `http://localhost:5173/terminal/administracion` con backend real y dataset; `terminalOnly` activo y `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`; captura en la carpeta de evidencia visual. No acredita HTTPS ni distribución.

### Evidencia visual generada (no versionada)

- Capturas en `frontend/unified/test-results/da-e1-09-captures/` (ignorado por Git): `admin-1280.png`, `admin-768.png`, `admin-390.png` y `admin-electron-1280.png`, con datos reales.
- Observación V-VIS: a 768 y 390 px la tabla de últimas ventas exige desplazamiento horizontal dentro de su contenedor para alcanzar «Ver ticket»; el contenedor tiene `overflow-x: auto` y no desborda la página. **El responsable aceptó expresamente este desplazamiento horizontal** el 2026-11-24; no se abre tarea correctiva por este punto.
- No se comparó contra el PDF original porque no está accesible en el repositorio. **El responsable aprobó el diseño actual implementado como baseline visual de E1**, cerrando DA-D08 con este diseño y no con el PDF. La identidad café/crema del PDF no se declara aplicada.

### Aceptación humana y prueba guiada

- El responsable revisó las capturas 1280/768/390 y Electron y **aprobó el diseño actual** como baseline visual de E1.
- **Usabilidad:** el responsable reportó **7 segundos** para localizar las ventas del día y abrir el ticket de la última venta, por debajo del objetivo de 10 s.
- **Teclado:** recorrido del menú, navegación a Ventas/Inicio, apertura y cierre del ticket y retorno de foco: **correcto**.
- **Caja:** lectura de fondo/ventas en efectivo/esperado y cambio de periodo/método sin alterar el significado de la caja: **correcto**.

### Revisión independiente

- Verificación independiente: frontend 332/332, 60/60 simuladas, live 5/5 ×2, backend 146/146 y 22 comprobaciones de `db:verify`; sin mocks en live y sin artefactos con secretos.
- Revisión independiente inicial: B1 bloqueante (la prueba de últimas ventas/ticket podía dar verde con dataset vacío); corregido exigiendo `expected.ticketCount > 0`, `min(5, expectedTickets)`, botón por fila y `Referrer-Policy`.
- Re-revisión: B1 cerrado; suite live considerada correcta como artefacto de verificación, con residuales no bloqueantes (presets calculados con la misma función del producto, CSRF/refresh no ejercitados en live, `reuseExistingServer`, `typecheck` no cubre `e2e-live`).
- La revisión inicial condicionó la aceptación a la evidencia humana (visual, usabilidad y teclado). Esa evidencia fue aportada por el responsable el 2026-11-24: diseño actual aprobado, 7 s, teclado correcto y caja correcta; se solicita confirmación final de la revisión sobre el registro cerrado.

### Limitaciones registradas (no bloqueantes tras aceptación)

- HTTPS de distribución/fallback SPA y despliegue: no acreditados con Vite local ni build local; no se declara paridad de producción.
- Fallo parcial en runtime real y CSRF/refresh de escritura: la suite live de Inicio es de solo lectura; esos aspectos siguen cubiertos por las suites simuladas e integración, no por la corrida live.
- La comparación contra el PDF no se ejecutó; la aceptación visual se basa en el diseño actual aprobado por el responsable.
- El desplazamiento horizontal de la tabla a 768/390 fue aceptado expresamente.

### Decisión

E1-09 queda **cerrada y aceptada por el responsable el 2026-11-24**. E1 está implementada y verificada en local real (navegador→backend y Electron), con aceptación visual del diseño actual, usabilidad reportada en 7 s, teclado y caja correctos, y las limitaciones de HTTPS/distribución y cobertura live de escritura registradas. No se atribuyen resultados no ejecutados.

El cierre de DA-D08 se hace con el diseño actual aprobado por el responsable, no con el PDF. Las menciones históricas de E1-05…E1-08 sobre «identidad visual diferida» se conservan como contexto; DA-D08 quedó cerrada en esta tarea. También se acepta la interpretación de que el detalle disponible en E1 es el ticket protegido abierto en una acción.

## Siguiente puerta

E1 queda cerrada. E3/E4 no se inician automáticamente. La autorización posterior de secuencia E2/CSV se registra a continuación; no modifica el cierre E1. Commit de cierre E1 `mismo commit`; sin push ni despliegue.

## Backlog E2 — aceptación y siguiente tarea autorizada

- El responsable indicó «haz commit y empieza con las tareas»: bloque TASK-DA-E2-00…15 y dependencias CSV aceptados, con ejecución secuencial en el orden series → ranking → activos sin movimiento → categorías → CSV, una tarea a la vez, tras cierre verificado/revisado de la anterior. Cada contrato nuevo requiere aceptación explícita antes de runtime; aceptar backlog no acepta DTO ni decisiones pendientes.
- Backlog redactado en `tasks.md`; investigación y revisión sin bloqueantes reportadas. `git diff --check` reportado correcto por el implementador (aviso LF→CRLF); verificación del verificador denegada por permisos, sin rodear la denegación ni atribuirle ejecución exitosa. Esta actualización no reejecuta comandos denegados.
- Sin runtime ni suites runtime en este encargo documental. Al commit del backlog todas las tareas E2/CSV siguen no iniciadas, ningún contrato E2 queda aceptado ni tarea implementada. Commit backlog: `mismo commit`, autorizado al coordinador y no creado por este encargo; sin push/despliegue.
- Siguiente autorizada: **TASK-DA-E2-00**, solo propuesta documental de contrato de series. Autor: `dashboard-backend-implementer`; verificación: `dashboard-verifier`; revisión independiente: `dashboard-reviewer`. No se inicia el contrato en esta actualización. Persisten DA-D04/06 por capacidad, precisión temporal, límites/coste, referencia visual y autorizaciones de entorno aplicables.

## TASK-DA-E2-00 — Propuesta documental de series

Estado actual: **contrato documental aceptado por el responsable el 2026-11-24 mediante «aprobar y continuar», con dominio desde 2000; listo para commit documental, no creado en este encargo**. Autor: `dashboard-backend-implementer`; roles independientes `dashboard-verifier` / `dashboard-reviewer`. La revalidación actual del autor se registra al final, sin atribuir una nueva aprobación independiente no recibida. Encargo iniciado tras backlog `846aab6`. Se conserva abajo la evolución histórica de propuesta, F1/B1/B2 y denegaciones; el estado actual reemplaza sus pendientes de aceptación/dominio. Sin runtime; E2-01 NO iniciada.

### Archivos y RF

- `backend/docs/api/openapi.yaml`: nueva ruta GET `/api/v1/admin/dashboard/sales-series`, ahora `x-contract-status: approved-2026-11-24` por aceptación explícita del responsable; esquemas cerrados y ejemplo 200 de dos buckets parciales, dominio desde 2000. No se modifica contrato E1 ni rutas antiguas.
- [contracts/E2-series-contract.md](./contracts/E2-series-contract.md): semántica propuesta, ejemplos cero/DST, vector grande, matriz S01…S16 RF-12/RNF-02/04/06 con RF-01/03/11/19; puertas futuras de C-UI/C-VIS/REAL sin implementación ni aceptación anticipada.
- `tasks.md`: solo estado/evidencia propia E2-00. Este registro no cierra la tarea ni acredita revisión todavía no recibida.

### Decisiones propuestas, no aceptadas

Ruta/DTO con las tres métricas siempre, sin selector `metric`; método omitido=null. Entradas UTC reales solo hasta ms; preservar microsegundos de `sold_at` al filtrar/agrupar, incluyendo `to−1μs`, sin cambiar E1. Buckets naturales Tijuana, identidad UTC y offset para hora repetida, vacíos y recortes explícitos independientes del reloj. Topes hour 31×24 h/745 y day 366×24 h/368, ambos exigibles sin truncar, **no medidos**. Totals/buckets coherentes en lectura única y conciliación de resumen con mismo método/rango ms/dataset estable; generatedAt no es snapshot token entre peticiones. Límite de cabeceras privadas en errores globales previos al router documentado, no corregido mediante runtime.

### Comandos ejecutados por el autor (backend, Node 22.14.0)

| Comando / comprobación | Resultado real |
| --- | --- |
| `git status --short` desde raíz, antes de editar | Árbol limpio; no cambios ajenos detectados. |
| `npm.cmd run format:check` | **Falla (exit 1)**: únicamente `docs/api/openapi.yaml` señalado. Diagnóstico de Prettier sin escritura confirma igualdad exacta tras normalizar CRLF/LF: mezcla de finales de línea del archivo existente CRLF y adiciones por patch LF. No es aprobación de formato. |
| `npm.cmd run api:validate` | Correcto: OpenAPI válido, **67 ejemplos** conformes a esquema/ruta (66 anteriores y nuevo ejemplo singular 200). |
| Comprobación documental por Node stdin con SwaggerParser/Ajv existentes, sin archivo de prueba nuevo | Correcta: ejemplo OpenAPI y dos JSON completos del contrato (3), sumas exactas BigInt, bucketCount, identidad localStart/UTC, recortes/partial, contigüidad/extremos y vector 9007199254740993+2. Cuatro entradas temporales válidas y seis inválidas (fecha imposible, 4/5/6 decimales, offset, vacío) conformes a expectativa. No acredita HTTP/BD ni reglas cruzadas completas. |
| Diagnóstico Prettier por Node `-e` | Primer intento falló por quoting PowerShell/SyntaxError, sin edición. Repetido por stdin correctamente: contenido igual tras normalizar finales de línea, sin otras diferencias de formato. |

El fallo de formato inicial se conservó como evidencia en la tabla anterior y quedó **resuelto** en la continuación autorizada mediante el formateador local sobre la ruta explícita propia, sin cambios de contrato ni formato masivo ajeno:

| Comando posterior en backend | Resultado real |
| --- | --- |
| `npm.cmd exec -- prettier --write docs/api/openapi.yaml` | Correcto (exit 0); normalizados finales de línea del OpenAPI propio. No hubo permiso denegado para esta acción. |
| `npm.cmd run format:check` | Correcto (exit 0): todos los archivos comprobados cumplen Prettier. Sin escritura masiva. |
| `npm.cmd run api:validate` | Correcto (exit 0): OpenAPI válido, **67 ejemplos** conformes a esquema/ruta. |

`git diff --check` **no ejecutado**, por restricción expresa tras denegación previa al verificador; no se sustituyó ni rodeó esa comprobación. Verificación independiente aún pendiente; no presentar el resultado previo del backlog como verificación de este contrato. Esta corrección de formato no aprueba el contrato ni inicia E2-01 ni crea commit.

Sin suites runtime/HTTP/BD/V-BE/V-FE/V-VIS/V-REAL: no aplican a esta redacción; las pruebas de permisos, coste, concurrencia, microsegundos y DST real se especifican, no se atribuyen a ejemplos ni a Ajv. No acceso a secretos, instalación, migraciones, proveedores, UI, CSV, SQL ejecutable ni commits. La autorización de entorno E1 no se extiende.

### Siguiente puerta

Solicitar verificación y revisión independientes del contrato y de la evidencia de resolución del fallo de formato. Después, someter al responsable la aceptación agrupada de los seis puntos de la sección final del contrato (ruta/DTO, precisión, buckets/DST, límites/coste, consistencia y seguridad/errores/cabeceras). Ninguno se autoacepta por haber redactado el documento o por pasar `api:validate`; no iniciar E2-01 mientras falte aceptación explícita y cierre de las puertas pertinentes.

### Corrección documental F1 del verificador — offset histórico con segundos

- Hallazgo recibido de `dashboard-verifier`: dominio 0001–9999 incompatible con `localStart` limitado a offset ±HH:mm, pues Tijuana tiene offsets históricos LMT con segundos. Se propone conservar exactitud IANA en todo el dominio admitido, sin reducir fechas ni modificar E1.
- Patch exclusivo del contrato propuesto y OpenAPI: `localStart` admite ±HH:mm o extensión ±HH:mm:ss cuando los segundos del offset no son cero. Se elimina solo su `format: date-time`, incompatible con offsets con segundos en RFC 3339, y se define patrón acotado más validación semántica de fecha/zona/igualdad exacta. Los instantes UTC siguen ISO/RFC 3339 con ms y `start` es la identidad interoperable. Ejemplo LMT 1880-01-01T00:00:00-07:48:04 = 1880-01-01T07:48:04.000Z; ejemplos modernos conservados; escenario S04-F1 añadido.
- Revisión realizada aquí: **solo estática** de patrón, ejemplos, límites y coherencia entre documentos. No ejecución nueva de patrón, formato, esquema, enlaces, HTTP/BD o runtime. El chequeo documental anterior con `Date.parse(localStart)` solo cubría offsets modernos; no demuestra esta extensión histórica y deberá adaptarse en una verificación posterior autorizada.
- **Nueva verificación bloqueada**: el coordinador informó denegaciones al verificador de `format:check`, `api:validate` y `check-doc-links`. No se ejecutaron esos comandos ni equivalentes por otra herramienta/agente para eludirlas, ni formatter con escritura. Los resultados verdes del autor (format:check y 67 ejemplos api:validate) registrados arriba son **previos a F1**, no validación de esta revisión. Cualquier posible cambio de finales de línea por patch queda sin revalidar, no se declara formato correcto de F1.
- F1 queda corregido como **propuesta documental pendiente de revalidación/revisión**, no cerrado por autoaprobación. `dashboard-reviewer` y el responsable deben revisar/aceptar la representación extendida dentro del paquete contractual. E2-00 sigue redactada pendiente de verificación/revisión/aceptación explícita; sin runtime, E2-01, `git diff --check` ni commit.

### Revisión independiente — B1 corregido documentalmente; B2 bloqueado

- **B1 recibido:** los esquemas UTC nuevos admitían año 0000 pese al dominio 0001–9999 del contrato. Patch en `DashboardSeriesInputInstant` y `DashboardSeriesUtcInstant`: prefijo `^(?!0000)` para excluirlo en entrada y todos los instantes UTC del DTO por referencia. `localStart` ya excluía 0000. No se modifican patrones, contratos ni runtime E1.
- Añadido escenario negativo S09-B1: from/to año 0000 sin fracción/con ms → 400 propuesto; año 0000 en generatedAt, period.from/to, start/end/effectiveFrom/effectiveTo o localStart → DTO inválido. Son criterios documentales y revisión estática del patrón/referencias, **no pruebas ejecutadas** ni cierre independiente confirmado.
- Armonizada descripción OpenAPI: días 23/24/25 h y tratamiento DST ejemplificado son casos modernos, no regla exhaustiva histórica. La representación de offset con segundos permanece exacta como propuesta, pero enumerar límites durante transiciones históricas no horarias con horas/medianoches inexistentes/ambiguas **sigue como decisión bloqueante pendiente**. No se inventa normalización, offset, frontera adicional ni restricción moderna por extensión; debe acordarse política determinista y escenarios antes de completar/aceptar el contrato para todo el dominio.
- **B2 permanece BLOQUEADO:** denegaciones de permisos de `format:check`, `api:validate` y `check-doc-links` comunicadas por coordinación. En esta corrección solo patch y revisión estática; sin shell, validadores, formatter ni comprobaciones equivalentes. Los resultados previos del autor no acreditan F1/B1 ni se presentan como revalidación actual. `git diff --check` no ejecutado.
- Estado: **contrato propuesto, pendiente de decisión histórica, revalidación, revisión y aceptación explícita**. B1 tiene corrección documental pendiente de confirmación independiente; B2 no resuelto. No afirmar histórico no probado como verificado, tarea cerrada o contrato aprobado. E2-01 NO iniciada; sin runtime ni commit.

### Decisión posterior del responsable — dominio desde 2000 y aceptación contractual

El responsable indicó **«aprobar y continuar»** tras recomendar acotar series E2 a fechas desde 2000. Se acepta el contrato redactado con esta acotación, no runtime, mediciones de coste, nuevas capacidades, infraestructura ni composición visual. Se registra aceptación ajena al autor, no autoaprobación. **E2-00 queda lista para commit documental; E2-01 no se inicia en este registro.** La revisión independiente final de esta versión no detectó bloqueantes de contenido y la consideró apta para commit documental, sin certificar por sí sola el diff Git.

- Mínimo: **2000-01-01 00:00 America/Tijuana = 2000-01-01T08:00:00.000Z**. `from` anterior → 400 `VALIDATION_ERROR` explícito, sin truncar/normalizar, incluso si `to` ya está dentro. Patrones de entrada/DTO años 2000–9999; comparación semántica adicional para las primeras ocho horas UTC del 01/01/2000 y límites naturales. E1, contratos/rutas antiguas e históricos de BD intactos.
- El dominio 0001–9999 y la política histórica no horaria pendiente quedan **reemplazados/resueltos por acotación aceptada**, no por supuesta prueba del histórico excluido. Se retira la extensión de segundos de offset de localStart, ahora ISO/RFC 3339 ±HH:mm (-08:00/-07:00), conservando identidad UTC y ambas horas repetidas. Fronteras hour por ocurrencias locales alineadas a hora sobre timeline IANA, fronteras day por medianoches únicas en reglas examinadas. Se mantienen las métricas, precisión ms de entrada, microsegundos de filas y demás reglas contractuales; límites de coste aceptados pero aún no medidos.
- Fuente documental: consulta web de `northamerica`/reglas US e IANA `tzdata.zi` (enlaces en el contrato) y fragmentos de zona Tijuana: Mexico hasta 2001, US hasta 2002-02-20, Mexico hasta 2010, US después, base -08:00, SAVE 0/1 h y cambios a 02:00 local. Los cambios de conjunto de reglas en invierno no introducen salto. No se encontraron casos no horarios/medianoches ambiguas desde 2000 en esas reglas; las fechas DST Mexico 2007–2009 no se sustituyen por US. El acceso por grep a la copia gestionada de salida web fuera del workspace fue denegado (`external_directory`); no se accedió a ese archivo por otra vía. La evidencia de cálculo siguiente usa Intl local, no esa copia.

### Revalidación actual por el autor, autorizada expresamente en este nuevo encargo

Las denegaciones anteriores se conservan como evidencia histórica, no se presentan como pruebas aprobadas ni se eluden sus archivos. El nuevo encargo autoriza al autor reejecutar los comandos indicados; las llamadas siguientes se completaron sin denegación. Si hubiera sido denegado un comando se habría detenido sin equivalente alternativo. `git diff --check` continúa sin ejecutarse por la restricción vigente.

| Comando / comprobación actual | Resultado real |
| --- | --- |
| Node stdin, Intl America/Tijuana, Node 22.14.0 / ICU 76.1 / tzdb **2024b** | Mínimo UTC confirmado. **2 921 941 muestras diarias**, desde mínimo hasta 9999-12-31T23:59:59Z; **16 000 cambios detectados** localizados por bisección al segundo. Todos ±1 h en hora UTC exacta, 01:59:59 local → 03:00:00 o 01:00:00, offsets solo -08:00/-07:00; **0 cambios anómalos detectados**. Rangos DST 2026 confirmados 23/25 h y medianoches. Muestreo diario + inspección de reglas, no recorrido de cada instante ni garantía de leyes futuras; proyección futura de tzdb vigente, no histórico anterior a 2000 verificado. |
| `npm.cmd run format:check`, primera corrida actual | Falló señalando solo OpenAPI por edición de formato/finales de línea; no se ocultó como éxito. |
| `npm.cmd exec -- prettier --write docs/api/openapi.yaml` | Correcto, solo ruta explícita propia. No formato masivo ajeno ni cambios contractuales por formatter. |
| `npm.cmd run format:check`, corrida final | **Correcto**, todos los archivos comprobados cumplen Prettier. |
| `npm.cmd run api:validate` (primera y final) | **Correcto**, OpenAPI válido; **67 ejemplos** conformes a esquema/ruta en ambas corridas. |
| `node scripts/check-doc-links.mjs` (primera y final) | **286 enlaces locales, 0 inexistentes**; fragmentos no comprobados. |
| Node stdin con SwaggerParser/Ajv y ejemplos/documentos propios | **Correcto**: 3 respuestas completas existentes más ejemplo day adicional en frontera mínima; sumas BigInt, bucketCount, identidad/contigüidad/partial/extremos. 4 entradas válidas; 9 negativas sintácticas; 2 entradas 2000 anteriores a 08Z aceptadas por schema pero correctamente rechazadas por comparación semántica de ejemplo; 16 DTO negativos de años 0000/1999 y uno de offset con segundos; vector exacto grande correcto. **18 enlaces locales propios, 0 inexistentes**, sin comprobar fragmentos. No HTTP/BD/runtime ni verificación independiente. |

Resultado actual: B1 armonizado con mínimo aceptado y negativos revalidados documentalmente; la cuestión histórica F1 queda fuera del dominio, no se mantiene una política indeterminada aplicable desde 2000. B2 cuenta ahora con verificaciones actuales correctas por el autor bajo autorización expresa; las denegaciones anteriores del verificador no se convierten en ejecuciones suyas. Revisión independiente final: sin bloqueantes de contenido y apta para commit documental. `git diff --check` fue ejecutado por coordinación y resultó correcto, sin errores de espacios; no sustituye la verificación independiente de las suites. Una futura actualización tzdb/ley requerirá evaluación si cambia reglas relevantes. Commit de la tarea: `mismo commit`.

Pendientes de tareas posteriores, no cumplidos por E2-00: coste medido, HTTP/BD de permisos/precisión/concurrencia, implementación backend/frontend, V-VIS y V-REAL con entorno/dataset autorizado. No dependencias, migraciones, SQL ejecutable, secretos, proveedores reales, CSV, runtime ni commit. E2-01 NO iniciada en este encargo.

## TASK-DA-E2-01 — Backend de series (implementación y verificación local; no cerrada)

Estado: **implementación backend verificada localmente y aceptada por el responsable el 2026-11-24; commit `mismo commit`**. Incluye corrección H-01, R-03 y aceptación explícita del rendimiento actual con optimización pendiente documentada. Sin E2-02 ni CSV en este commit. Autor: `dashboard-backend-implementer`; verificación y revisión independientes realizadas.

### Alcance implementado
- Ruta `GET /api/v1/admin/dashboard/sales-series` solo `ADMINISTRADOR`, con `privateCashResponse`, validación Zod estricta y rechazo de body.
- Serie `[from,to)` UTC con zona fija America/Tijuana, buckets naturales (incluidos vacíos y parciales), DST moderno 23/25 h y hora repetida, mínimo `2000-01-01T08:00:00.000Z`, límites hour 744 h/745 y day 366×24 h/368.
- Agregación en una sola consulta parametrizada: importe bruto, tickets por `Sale` y unidades por `OrderItem.quantity`; `sold_at` conserva microsegundos en PostgreSQL (`from` incluido, `to` y `to−1 µs` probados).
- DTO cerrado con tres métricas, `method: null|CASH|STRIPE`, strings decimales exactos sin `Number`; totales = suma de buckets de la misma lectura.
- OpenAPI: solo se corrigió la nota obsoleta «runtime no implementado»; esquema y semántica aceptados intactos.

### Huecos señalados y cobertura real
| Hueco | Evidencia |
| --- | --- |
| Guarda 368 buckets `day` | Prueba unitaria directa: 368 buckets aceptados y 369 rechazados con 400; se conservan 366 días y 744/745 buckets `hour`. |
| Cabeceras privadas en 400 | Integración HTTP: todos los 400 de query/body de la ruta devuelven `Cache-Control: no-store` y `Referrer-Policy: no-referrer`; el middleware de ruta sí los cubre. |
| H-01 — 401/403 antes de la ruta | Corregido con cambio mínimo en `app.ts`: `/api/v1/admin/dashboard` se incluye en el middleware privado temprano, antes de `adminRoutes`. Integración con `createApp` y `AdminService`/`AdminRepository` reales montados: 401 sin sesión, 403 CLIENTE/CAJERO/PREPARACION y 403 `PIN_CHANGE_REQUIRED` conservan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. Sin cambiar permisos ni autenticación. |
| R-03 — fila agregada ausente | `SalesRepository.seriesAggregates` y `SalesService.salesSeries` lanzan `Agregado de serie incompleto` si falta la fila de un bucket; no se devuelven ceros silenciosos. Pruebas unitarias directas de servicio y repositorio. Con el SQL actual (`GROUP BY` sobre `buckets`) se espera una fila por bucket; el error queda saneado como 500 por el manejador existente. |
| Query con corchetes/array | `from[]=...` y `method[]=CASH` devuelven 400 `VALIDATION_ERROR`; repetidos idénticos siguen rechazados. |
| Ejemplo parcial S03 exacto | Integración: rango 08:15Z–09:15Z con CASH 4000/1/2 y STRIPE 4500/1/1; método omitido 8500/2/3, CASH 4000/1/2 (segundo bucket cero), STRIPE 4500/1/1 (primer bucket cero). |
| Concurrencia S14 | 12 ventas STRIPE insertadas en paralelo con 8 lecturas concurrentes: todas las respuestas 200, `totals` igual a la suma de buckets en cada una y sin duplicar; lectura final conciliada con la BD (12 tickets, mismo importe y unidades). No se exige total intermedio fijo. |
| Teléfono sintético | Fixture cambiada a `+520000000001` (no PII, válida para el esquema de prueba). |
| Coste con volumen | Benchmark aislado reproducible: ver abajo. |

### Comandos ejecutados (backend, Node 22.14.0)
| Comando | Resultado real |
| --- | --- |
| `npm.cmd run format:check` | Correcto; todos los archivos cumplen Prettier. |
| `npm.cmd run typecheck` | Correcto. |
| `npm.cmd run lint` | Correcto. |
| `npm.cmd test` | **139 pruebas unitarias correctas**, 155 integraciones omitidas por diseño. |
| `npm.cmd run build` | Correcto. |
| `npm.cmd run api:validate` | Correcto; OpenAPI válido, **67 ejemplos** conformes. |
| `npm.cmd run db:validate` | Correcto; esquema Prisma válido. |
| `npm.cmd run test:integration` | **155/155** en 8 archivos; archivo nuevo `dashboard-series.integration.test.ts` **9/9**. Incluye `completion.integration.test.ts` sin cambios. |
| `npm.cmd run db:verify:docker` | PostgreSQL **17.11**, **22 comprobaciones correctas**, mutantes C01–C04 detectados. Ejecutado con `DB_REVIEW_OUTPUT_DIR` temporal para no sobrescribir la evidencia versionada de la verificación independiente. |
| `git diff --check` | Sin errores; solo avisos LF→CRLF de Git. |

### Benchmark de coste (reproducible, aislado)
Script: `backend/scripts/benchmark-dashboard-series.ts` (fuera de `npm test` y del runner de integración). Crea una base temporal aislada, migra, siembra y elimina; no imprime credenciales ni parámetros.

- Comando: `node --env-file=.env.docker --import tsx scripts/benchmark-dashboard-series.ts` (desde `backend/`).
- Escenario del autor: **20 000 ventas STRIPE** en 744 h (31 días), 1 línea por venta, repartidas en intervalos de 5 min; rango desalineado para **745 buckets `hour`**.
- Semilla del autor: ~1 044 ms. Totales de la última lectura: `ticketCount=20000`, `unitsSold=40001`, `totalCents=102992000`.

**Dos mediciones reales, separadas por ejecutor; ninguna se presenta como verificación independiente de la otra:**

| Ejecutor / fecha | Volumen | ms observados | EXPLAIN de la agregación |
| --- | --- | --- | --- |
| Autor E2-01, 2026-11-24 (local del proyecto) | 20 000 ventas, 744 h, **745 buckets** | 7 corridas + 2 calentamiento: min **873.69**, mediana **878.85**, máx **890.34**, media 880.82 | ~**1 496 ms**; plan con `Nested Loop Left` `Values Scan` (745) × `Materialize` (20 000 filas) |
| Coordinador, reportada en la revisión de E2-01 (2026-11-24 local) | 20 000 ventas (misma prueba de 745 buckets; rango no detallado en el reporte recibido) | mediana **642.99**, min **608.03**, máx **652.92** | **1 282 ms** |

- Autor: consultas por corrida **1 agregación** (~846.86 ms) + 6 de revalidación de actor; sin N+1 por bucket; memoria RSS +0.9 MB.
- El plan de ambas ejecuciones muestra coste aproximado O(buckets × ventas del rango).
- **Riesgo de coste documentado, no corregido**: ~0.64–0.88 s con 20 000 ventas/745 buckets según ejecutor. Ajuste propuesto para una tarea posterior, sin cambiar contrato: asignar cada venta a un bucket una sola vez (p. ej. unión por rango con índice o cálculo de índice por hora) en lugar del nested loop actual; no se añadieron índices ni migraciones.
- **No se midió 100 000+ ventas.** Cualquier proyección a ese volumen es una extrapolación, no una medida, y no se registra como evidencia.
- **Decisión del responsable (2026-11-24):** acepta el rendimiento actual **por ahora** y deja **documentada la optimización pendiente**. No se fija SLA ni se declara el coste escalado como resuelto; la mejora propuesta (asignar cada venta a un bucket una vez) queda para una tarea posterior y no autoriza índices, migraciones ni cambio de contrato en E2-01.

### Límites y pendientes
- No se ejecutó una medición de coste con 100 000+ ventas ni un SLA; el benchmark cubre 20 000 ventas/31 días en dos ejecuciones (autor y coordinador) y deja el riesgo de escalado documentado.
- `EXPLAIN` se ejecutó sobre la consulta agregada emitida; la diferencia con el tiempo del servicio se reporta sin ocultarla.
- S14 se prueba con concurrencia real acotada (12 ventas/8 lecturas), no con estrés masivo; no se exige un total intermedio fijo.
- Verificación y revisión independientes realizadas; H-01 y R-03 cerrados; aceptación del responsable registrada. Commit `mismo commit`; sin push. E2-02 y CSV no iniciadas en este commit.

## TASK-DA-E2-02 — Frontend de series y alternativa accesible

Estado: **implementada y verificada localmente; NO aceptada/cerrada; commit `mismo commit`**. Su V-VIS propia y su aceptación siguen pendientes; la evidencia live de E2-03 es independiente y no concede aceptación a E2-02. No se hereda aceptación de E1. La evidencia de ejecución es del coordinador porque el verificador independiente tuvo shell denegado; la revisión independiente fue estática.

### Archivos

- `frontend/unified/src/features/terminal/admin/analytics/{seriesApi.ts,seriesApi.unit.test.ts,SalesSeries.tsx,SalesSeries.component.test.tsx}`.
- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.tsx` y su prueba: integración acotada con periodo y método vigentes.
- `frontend/unified/src/styles/base.css`: estilos acotados del panel, tabla y gráfica desplazable.
- `frontend/unified/e2e/dashboard-series.spec.ts` y ajustes de mocks en `e2e/admin.spec.ts`/`e2e/accessibility.spec.ts`.
- `frontend/unified/src/test/seriesFixture.ts`: fixture contractual de pruebas.
- Sin cambios de backend, contrato, dependencias ni E1.

### Cobertura y comandos ejecutados (frontend)

| Comando | Resultado real |
| --- | --- |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm run test` | **410/410** en 38 archivos. |
| Dirigidas `seriesApi` + `SalesSeries` | **57 + 21** pruebas correctas en las corridas registradas. |
| `npm run test:e2e` | **62/62**; incluye 2 pruebas de series y axe con panel válido. |
| `npm run build` | Correcto; solo aviso existente de chunk >500 kB. |
| Cobertura dirigida | `seriesApi.ts` ~97 % líneas; `SalesSeries.tsx` ~96 % líneas. |
| `git diff --check` | Correcto; solo avisos LF→CRLF. |

### Cobertura funcional

- Adaptador estricto: claves cerradas, strings exactos, mínimo 2000 también en `generatedAt`/periodo/buckets/effective, límites hour 745 y day 368, orden/contigüidad/partial, DST 23/25 h, hora repetida, respuestas inválidas y errores 400/401/403/429/503.
- Panel con selector Hora/Día, caída automática a Día cuando el periodo supera 31 días, tabla accesible con `caption`/`scope`, gráfica de apoyo desplazable y alternativa textual exacta.
- Periodo y método reutilizan los filtros vigentes; no hay recálculo de agregados, polling ni nuevo cliente/sesión. Un fallo de series no anula resumen, caja ni últimas ventas.
- Aborto/descarte de respuestas antiguas al cambiar filtros/desmontar; estados de carga/cero/error/DTO inválido diferenciados.
- Correcciones de revisión cerradas: mocks de series en suites existentes, formateador local sin límite de 19 dígitos, fin semiabierto, cobertura con segundos/ms, gráfica sin recorte silencioso, B-01 (mínimo semántico) y R-01 (fin de día = siguiente medianoche local IANA).

### Revisión independiente y límites

- Revisión independiente estática final: sin bloqueantes técnicos para commit; B-01 y R-01 cerrados. Observaciones no bloqueantes: aislamiento de algunos negativos de mínimo, simetría de decimales en `to`, `aria-live` del panel completo y ausencia de capturas.
- El verificador independiente no pudo ejecutar shell en la última sesión; los comandos de V-FE anteriores fueron ejecutados por el coordinador y se registran como tales, no como verificación independiente.
- **V-VIS de E2-02 pendiente:** no hay capturas propias de E2-02 ni aceptación visual humana de esa tarea.
- **V-REAL de E2-02 no acreditado por sí mismo:** su evidencia era MSW/E2E simulado. La corrida live posterior de **E2-03** es independiente: acredita series reales y no hereda ni concede aceptación a E2-02.
- No se declara E2 cerrada ni CSV iniciado.

## TASK-DA-E2-03 — Aceptación real de series

Estado actual: **cerrada y aceptada por el responsable el 2026-11-25; re-revisión final sin bloqueantes técnicos tras corregir B-3/B-4; commit pendiente de autorización. NO cierra E2.** CSV-03 sigue siendo el cierre. Autor de la suite: `frontend-implementer`; verificación: `dashboard-verifier`; revisión independiente: `dashboard-reviewer` (B-1 corregido; B-2 aceptado por el responsable).

### Entorno y dataset autorizados

- El responsable autorizó reutilizar el entorno Docker local de E1-09 para E2-03 y la V-VIS pendiente de E2-02: PostgreSQL 17.11 en `cafeteria-local-postgres-1`, backend local en `http://localhost:3000` y Vite en `http://localhost:5173`. No es staging remoto ni acredita HTTPS/distribución.
- Para no tocar datos ajenos se creó la base dedicada `cafeteria_da_e2_03` en el mismo contenedor, se aplicaron las migraciones y se sembró un dataset sintético congelado. No se ejecutó reset ni se modificó `cafeteria`, `cafeteria_test` ni historiales.
- Dataset de 12 ventas (`V000001`–`V000012`) con `saleNumber` válido, varias líneas, una opción, un pago pendiente, un reembolso, una sesión de caja abierta y una cerrada. Valores principales: día local 2026-11-24 = `9000` centavos / 3 tickets / 5 unidades, mezcla CASH `4000` y STRIPE `5000`, promedio `3000`; periodo anterior `1000/1/1`. Sin PII ni secretos; usuarios QA temporales (`qa_e2_admin`, `qa_e2_cashier`, `qa_e2_prep`).
- El manifiesto con credenciales y valores esperados se mantiene **fuera del repositorio** (`%TEMP%\opencode\da-e2-03\manifest.json`) y no se imprime ni versiona. El seed solo se ejecuta contra `cafeteria_da_e2_03` y se retiró de `backend/scripts` al terminar; copia temporal fuera del repo.
- Se usó `CATALOG_RATE_LIMIT=10000` como override de entorno local, igual que E1-09; no valida el límite de producción.

### Archivos de esta tarea

- `frontend/unified/e2e-live/dashboard-series-acceptance.spec.ts`: 7 pruebas live sin `page.route`/`context.route`.
- `frontend/unified/e2e-live/README.md`: alcance E1-09/E2-03, manifiesto por tarea y limitaciones.
- `frontend/docs/specs/dashboard-admin/validation.md`: este registro.
- Sin cambios de backend, contrato, OpenAPI, `e2e/`, dependencias ni E1.

### Comandos ejecutados

Frontend (`frontend/unified/`):

| Comando | Resultado real |
| --- | --- |
| `$env:E2E_LIVE='1'; $env:E2E_LIVE_MANIFEST='...\manifest.json'; npm.cmd run test:e2e:live -- dashboard-series-acceptance.spec.ts` | **Versión inicial 6/6** en tres corridas (8.8/8.5/8.3 s). **Tras corregir B-1 y R-1…R-7: 7/7** en dos corridas del autor (9.5/9.0 s) y dos del verificador (9.1/9.1 s). Coste observado de 745 buckets: 81, 66, 53, 57, 55 y 53 ms según corrida (no SLA). |
| `npm.cmd run typecheck` | Correcto. `tsconfig.app.json` no incluye `e2e-live`; el autor ejecutó además `tsc --noEmit --strict` sobre el spec con resultado correcto, pero no hay script de repo que lo reproduzca. |
| `npm.cmd run lint` | Correcto. |
| `npm.cmd run test` | **410/410** en 38 archivos. |
| `npm.cmd run test:e2e` | **62/62** en la verificación inicial (suite simulada; no descubre `e2e-live`). No se repitió en el pase final porque limpia `test-results` y las capturas se guardan fuera. |
| `npm.cmd run build` | Correcto; aviso existente de chunk >500 kB. |

Backend (`backend/`):

| Comando | Resultado real |
| --- | --- |
| `npm.cmd run format:check` | Correcto. |
| `npm.cmd run typecheck` | Correcto. |
| `npm.cmd run lint` | Correcto tras retirar los temporales de seed/runner del repositorio. La verificación detectó que esos temporales, sin seguimiento, causaban 8 `no-undef`; no era código de producto y quedó resuelto moviéndolos fuera del repo, no desactivando lint. |
| `npm.cmd test` | **139** unitarias correctas; 155 integraciones omitidas por diseño. |
| `npm.cmd run build` | Correcto. |
| `npm.cmd run api:validate` | OpenAPI válido, **67 ejemplos** conformes. |
| `npm.cmd run db:validate` | Esquema Prisma válido. |
| `npm.cmd run test:integration` | **155/155** en 8 archivos con bases temporales aisladas. |

Raíz:

| Comando | Resultado real |
| --- | --- |
| `git diff --check` | Sin errores; solo avisos LF→CRLF en documentos/README. |
| `git status --short` | Solo `tasks.md`, `validation.md` y `README.md` modificados y el spec live nuevo; sin manifiesto, capturas, seeds ni secretos. |
| `node scripts/check-doc-links.mjs` (backend) | 286 enlaces locales revisados, 0 inexistentes (fragmentos no comprobados). |
| Revisión de `e2e-live` | Sin `page.route`/`context.route`; sin credenciales, tokens ni `.env`; manifiesto fuera del repositorio. |

### Cobertura real acreditada (sin mocks)

- Día principal: suma de buckets = `totals` de series (importe/tickets/unidades con `BigInt`) y conciliación con `/admin/dashboard/summary` y `/sales/summary` con los mismos `from/to`; para CASH y STRIPE se comparan además tickets/unidades del resumen administrativo y `totalCents`/`count` de `/sales/summary?method=…` (`4000/1/2` y `5000/2/3`); 24 buckets hora y día de 24 h; ambos métodos `9000/3/5`; promedio `3000` y comparación recibidos del servidor, sin recalcular; cabeceras privadas en 200; UI con tabla, métricas y método vigente.
- DST otoño: 25 buckets, dos `01:00` con `-07:00`/`-08:00`, filas `Hora repetida` y valores por bucket `100/1/1` y `200/1/1`, día de 25 h `Cambio de horario`, `300/2/2`. DST primavera: 23 buckets sin `02:00`, día de 23 h, `300/1/1`.
- Bordes por API autenticada: S03 parcial (dos `partial:true`, efectivos contiguos, `8500/2/3`), precisión `to−1 µs` con ventanas reales de 1 ms (`100/1/1` en el centro, `0` a izquierda/derecha), máximo 745, mínimo 2000 (400 un ms antes / 200 en frontera), cero 2020 y rechazos 400 con `application/problem+json` para entradas inválidas, extras, repetidos, arrays, offset, decimales no admitidos y límites excedidos.
- Seguridad: ADMINISTRADOR 200; CAJERO/PREPARACION 403 y sin peticiones `/api/v1/admin/` desde la UI; contexto anónimo 401; cabeceras privadas comprobadas en respuestas 400 representativa, 401 y 403; `localStorage` vacío.
- Accesibilidad y carreras: axe WCAG 2.1 A/AA sin violaciones con series reales; tabla como alternativa textual; activación por teclado de Hora/Día con `Enter`/`Space`, `aria-pressed`, cambio de tabla y foco conservado; cambios rápidos con al menos una petición de series abortada realmente (`requestfailed` con aborto/cancelación) y UI final correspondiente a la última selección sin estado de carga.

### V-VIS

- Capturas generadas con backend real y el mismo fixture/estado, después de las suites para evitar que `test:e2e` limpie el directorio: `dashboard-series-1280.png` (1280×2723), `dashboard-series-768.png` (768×3328), `dashboard-series-390.png` (390×4551) y `dashboard-series-electron-1280.png` (1249×2738, ventana 1280×900). Dimensiones medidas por el coordinador; el verificador confirmó existencia y contenido.
- Ubicación temporal fuera del repositorio: `%TEMP%\opencode\da-e2-03\captures\`. No se versionan.
- Electron real: `_electron` contra `http://localhost:5173`, login real y dashboard con series; `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`. No acredita HTTPS ni distribución.
- La captura 1280 muestra el panel de series con 24 filas, métricas `$90.00/3/5/24`, gráfica y tabla, y el resto de Inicio con datos reales.
- **Aceptación visual y de capacidad humana registrada:** el responsable revisó y aprobó las capturas 1280/768/390 y Electron, incluido el desplazamiento horizontal de la tabla en anchos estrechos, el 2026-11-25. No se hereda la aceptación de E1.

### Aceptación del responsable — 2026-11-25

- **V-VIS y capacidad de E2-03 aceptadas:** el responsable aprobó las capturas `dashboard-series-1280.png`, `dashboard-series-768.png`, `dashboard-series-390.png` y `dashboard-series-electron-1280.png`, con el desplazamiento horizontal de la tabla en 768/390. La aceptación es propia de E2-03, no heredada de E1.
- **Limitación B-2 aceptada formalmente:** el responsable acepta que **429, 503 y fallo parcial real no se induzcan en la suite live** de E2-03, porque exigirían mocks, intercepción, inyección de fallos o alterar el backend, lo que la tarea prohíbe. Quedan cubiertos por las suites simuladas/componentes y la integración backend. `368 day` se acredita por unitaria/guarda del backend y el rol `CLIENTE` por la integración de E2-01.
- **Prueba de caos real diferida:** se deja para una tarea posterior con entorno y procedimiento autorizados. No se simula un fallo y se etiqueta como live.
- **Alcance:** esta aceptación cierra la capacidad de **series E2-03**, no E2 completa ni la exportación CSV. CSV-03 sigue siendo el cierre de E2. No autoriza commit, push ni despliegue. La secuencia se apoya en E2-02 **revisada y verificada**, no en su aceptación: E2-03 no cierra ni acepta E2-02.

### Revisión independiente

- Revisión inicial (`dashboard-reviewer`, estática): sin mocks, sin secretos y con conciliación sólida sin método; bloqueantes **B-1** (faltaba conciliación por método en tickets/unidades y `/sales/summary?method`) y **B-2** (429/503/fallo parcial real no inducidos live); riesgos R-1…R-15.
- Correcciones aplicadas: B-1 y R-1 (teclado), R-2 (cabeceras en 400/401/403), R-3 (valores por hora repetida), R-4 (carrera/cancelación real con `requestfailed`), R-5 (ventanas de 1 ms), R-7 (promedio/comparación del DTO real). Re-verificación: 7/7 en dos corridas, 9.1 s, 53 ms de coste observado.
- B-2 no se corrigió con mocks: el responsable **aceptó formalmente la limitación** el 2026-11-25 y difirió la prueba de caos real a una tarea posterior autorizada.
- **Disposición de los riesgos R-1…R-15 de la revisión inicial:**
  - R-1 teclado/foco: corregido con activación real por `Enter`/`Space` y foco conservado.
  - R-2 cabeceras solo en 200: corregido con un 400 representativo, 401 y 403; no se barrió cada 400.
  - R-3 DST sin valores por bucket: corregido con `100/1/1` y `200/1/1` en las dos horas repetidas.
  - R-4 carrera con respuesta intermedia: corregido moviendo la espera final tras la última acción y exigiendo aborto real.
  - R-5 precisión sin vecinos: corregido con ventanas reales de 1 ms a izquierda/centro/derecha.
  - R-6 máximo `day` 368: limitación aceptada; guarda unitaria/backend y máximo live 745 `hour`.
  - R-7 promedio/comparación/caja: promedio y comparación afirmados desde el DTO real; caja no se re-acredita en E2-03 y sigue cubierta por E1-09.
  - R-8 contradicción de `tasks.md`: corregida en la fila de estado y en el registro E2.
  - R-9 mezcla live/integración/simulación: separada expresamente en este registro y en el README.
  - R-10 sesión/privacidad más allá de `localStorage`: no se amplió; el flujo es de solo lectura y la sesión/CSRF de escritura siguen cubiertos por E1/suites existentes.
  - R-11 rol CLIENTE no live: aceptado; 403 cubierto por la integración de E2-01.
  - R-12 coste poco representativo: aceptado como observación, no SLA.
  - R-13 aceptación humana de capacidad: registrada el 2026-11-25 junto con la visual.
  - R-14 limpieza Git no verificable por el revisor: el coordinador comprobó `git status`/`git diff --check`; se registra en esta sección.
  - R-15 identidad de entorno/dataset: el manifiesto y los valores congelados hacen fallar un entorno distinto; la comprobación operativa del operador queda registrada, no automatizada en la suite.
- Re-revisión final (`dashboard-reviewer`): sin bloqueantes técnicos; detectó B-3 (`tasks.md` con estado antiguo) y B-4 (disposiciones R-6…R-15 ausentes), ambos corregidos. Confirmación documental posterior: sin bloqueantes para registrar E2-03 cerrada con commit pendiente, sin cerrar E2/CSV. La comprobación de `git status`/`git diff --check`/enlaces es del coordinador; el revisor tuvo shell denegado y no la reejecutó.

### Limitaciones y pendientes

- **429, 503 y fallo parcial real no se inducen live**: **limitación aceptada por el responsable el 2026-11-25**. Quedan cubiertos por suites simuladas e integración; la prueba de caos real se difiere a una tarea posterior autorizada.
- El máximo `day` de 368 buckets no es alcanzable de forma natural con fechas completas de UI; la guarda se cubre de forma unitaria y el máximo live acreditado es 745 `hour`. No se añadió una prueba HTTP artificial de 368.
- S12 (enteros grandes) y S14 (concurrencia de escritura) no se repiten live; su evidencia es unitaria/integración de E2-01.
- El rol CLIENTE no se prueba live (login de cliente distinto del personal); su 403 está cubierto por la integración backend de E2-01.
- Las cabeceras privadas se comprueban en un 400 representativo, no en todos los 400 de validación.
- El coste de 745 buckets se midió sobre un dataset de 12 ventas y un rango sin ventas; no es comparable al benchmark de 20 000 ventas de E2-01 ni un SLA.
- La corrida del directorio live completo no es válida con un manifiesto de otra tarea; cada spec valida su propio esquema. La evidencia E2-03 es la corrida dirigida registrada.
- `e2e-live` queda fuera de `npm run typecheck`; el chequeo estricto adicional del autor no está empaquetado como script.
- La conciliación es navegador↔API y API↔API sobre dataset congelado; no se consultó la BD directamente desde la suite.
- **Cierre:** re-revisión final registrada sin bloqueantes técnicos tras corregir B-3/B-4; commit pendiente de autorización. E2-03 cerrada como capacidad de series; E2 completa y CSV-03 siguen abiertos.

## TASK-DA-E2-04 — Contrato documental de ranking

Estado actual: **contrato documental aceptado por el responsable el 2026-11-25; verificado y revisado; commit pendiente de autorización. NO implementa runtime y NO cierra E2.** No inicia E2-05/06/07; CSV-03 sigue siendo el cierre. Autor: `dashboard-backend-implementer`; verificación: `dashboard-verifier`; revisión: `dashboard-reviewer`.

### Archivos

- `frontend/docs/specs/dashboard-admin/contracts/E2-ranking-contract.md`: contrato aceptado el 2026-11-25; ruta, DTO cerrado, semántica C-DATA, desempates, bajas/nombre, vectores documentales y matriz R01–R22 con D01–D15 aceptadas. Sin runtime.
- `backend/docs/api/openapi.yaml`: adición documental aceptada de `GET /api/v1/admin/dashboard/product-ranking` y esquemas `DashboardRanking*` con `x-contract-status: approved-2026-11-25`; no modifica summary/series ni implementa runtime.
- Sin cambios de runtime, frontend, UI, CSV, `schema.prisma`, migraciones ni dependencias.

### Comandos ejecutados

| Comando | Resultado real |
| --- | --- |
| `npm.cmd run format:check` (backend) | Correcto. |
| `npm.cmd run api:validate` (backend) | OpenAPI válido; **68 ejemplos** conformes (67 previos + 1 nuevo). |
| `node scripts/check-doc-links.mjs` (backend) | 286 enlaces locales, 0 inexistentes (no cubre `frontend/docs`; enlaces del contrato revisados a mano). |
| `git diff --check` (raíz) | Sin errores de whitespace; avisos LF→CRLF ya presentes. |
| `git status --short` (raíz) | Cambios E2-04 (OpenAPI + contrato nuevos) y cambios E2-03 ya cerrados; sin secretos, manifiesto, capturas ni seeds. |

No se ejecutaron pruebas HTTP/BD/UI ni runtime: no aplican a una tarea documental y no se presentan como aceptación de API real.

### Revisión independiente y correcciones

- Verificación: OpenAPI aditivo, esquemas cerrados, ejemplo 200 válido, strings exactos, roles solo ADMINISTRADOR, errores Problem Details, documentación sin autoaceptación. Sin bloqueantes de contenido. Dos comandos de verificación (`npx prettier --check` y `check-doc-links`) fueron denegados por permisos y no se eludieron; la cobertura equivalente fue `format:check` y revisión manual de enlaces.
- Revisión inicial: sin bloqueantes semánticos; pidió vectores de ambas métricas/direcciones/tops, cero/grandes/negativos (R-1) y resolver la tensión del filtro defensivo `p.status='SUCCEEDED'` frente a la conciliación (R-2), además de R-3…R-9.
- Correcciones aplicadas: sección de vectores documentales; filtro defensivo marcado como no aplicado por defecto y D11 pendiente; resolución de nombres en una sola lectura/CTE o `LATERAL`; precisión ms/µs explícita; cabeceras globales «no garantizadas»; roles negativos con `GERENTE`; forma léxica estricta de `top`; D08 para snapshot no resoluble; rutas exactas; R13 reformulado para una fila inconsistente `Sale` sin pago exitoso.
- Confirmación posterior: **sin bloqueantes nuevos para someter el contrato a aceptación** del responsable.

### Decisiones D01–D15 aceptadas — 2026-11-25

El responsable **aceptó el paquete propuesto el 2026-11-25**: ruta `GET /api/v1/admin/dashboard/product-ranking`; `from`/`to` UTC con 0–3 decimales, mínimo 2000-01-01T08:00Z y máximo 366 días; `metric=units|amount` y `direction=top|bottom` obligatorios; `top` default 5 y solo `5/10/20` con forma léxica estricta; `method` opcional; agrupación por `productId`; unidades `SUM(quantity)` e importe histórico `SUM(lineTotalCents)`; sin opciones/intentos/reembolsos; `top` descendente y `bottom` ascendente excluyendo `unitsSold=0`; desempates primaria y secundaria en la misma dirección, nombre ascendente byte a byte UTF-8 `COLLATE "C"`, `productId` numérico ascendente; incluir bajas con movimiento y usar snapshot más reciente; sin filtro defensivo `p.status='SUCCEEDED'` por defecto (D11); metadatos `matchedProductCount`/`matchedTotals`/`truncated`; `position` y `nameSource` opcionales; errores/cabeceras como series; sin índice nuevo en E2-04. OpenAPI usa `x-contract-status: approved-2026-11-25`.

### Aceptación del responsable — 2026-11-25

- **Contrato E2-04 aceptado** con el paquete anterior. La aceptación es solo del contrato documental: no implementa runtime, no inicia E2-05/06/07, no cierra E2 y no autoriza commit/push/despliegue.
- **D11:** se acepta **no aplicar** el filtro defensivo de pago por defecto. Si en el futuro se adopta, debe aplicarse el mismo predicado en resumen/`/api/v1/sales/summary` y probarse con una fila inconsistente, en tarea propia.
- **Decisiones reservadas a E2-05:** coste real, índices, verificación de cabeceras en rechazos globales y cualquier cambio de obligatoriedad de `position`/`nameSource` requieren evidencia y decisión propia; no se declaran implementadas.

### Siguiente puerta

E2-04 queda cerrada documentalmente con commit pendiente de autorización. E2-05 se ejecutó después con autorización de secuencia; su estado se registra en la sección siguiente. CSV-03 sigue siendo el cierre de E2.

## TASK-DA-E2-05 — Backend de ranking

Estado actual: **implementado, verificado y revisado sin bloqueantes; commit pendiente de autorización. NO cierra E2/CSV.** Autor: `dashboard-backend-implementer`; verificación: `dashboard-verifier`; revisión: `dashboard-reviewer`.

### Archivos

- `backend/src/modules/sales/sales.validation.ts`: `salesRankingQuery` estricto.
- `backend/src/modules/sales/sales.read.repository.ts`: `rankingAggregates` con CTE única.
- `backend/src/modules/sales/sales.service.ts`: `productRanking` y DTO.
- `backend/src/modules/sales/sales.routes.ts`: ruta ADMINISTRADOR.
- `backend/tests/dashboard-ranking.test.ts`: 13 unitarias.
- `backend/tests/integration/dashboard-ranking.integration.test.ts`: 15 integraciones.
- `backend/scripts/benchmark-dashboard-ranking.ts`: benchmark aislado.
- `backend/docs/api/openapi.yaml`: solo descripción de implementación; contrato aceptado intacto.
- Sin cambios de `app.ts`, esquema, migraciones, frontend, CSV, `validation.md` previo ni `tasks.md` por parte del autor.

### Comandos ejecutados

| Comando | Resultado real |
| --- | --- |
| `npm.cmd run format:check` | Correcto. |
| `npm.cmd run typecheck` | Correcto. |
| `npm.cmd run lint` | Correcto. |
| `npm.cmd test` | **152** unitarias correctas; 170 integraciones omitidas por diseño. |
| `npm.cmd run build` | Correcto. |
| `npm.cmd run api:validate` | OpenAPI válido; **68 ejemplos** conformes. |
| `npm.cmd run db:validate` | Esquema Prisma válido. |
| `npm.cmd run test:integration` | **170/170** en 9 archivos; ranking **15/15**. |
| `git diff --check` | Sin errores; avisos LF→CRLF preexistentes. |

### Cobertura

- Validación estricta: `from`/`to` 0–3 decimales, mínimo 2000, máximo 366 días, `metric`/`direction` obligatorios, `top` léxico 5/10/20 default 5, `method` opcional, extras/repetidos/arrays/body → 400.
- SQL: una agregación sin N+1; agrupación por `product_id`; `SUM(quantity)`/`SUM(line_total_cents)` exactos; sin opciones/refunds/eventos/intentos; metadatos antes del top; snapshot de baja `soldAt DESC, item.id DESC`; orden primario/secundario/`COLLATE "C"`/`productId`; `sold_at` sin conversión a `Date`; D11 sin filtro de pago por defecto.
- DTO: strings exactos, `method:null`, `top` echo, `truncated`, `position`/`nameSource`, `generatedAt`, error si falta agregado; sin PII.
- Ruta: ADMINISTRADOR, 401/403 incluidos GERENTE/PIN, cabeceras privadas, 400/413/429/500/503 saneados.
- Integración: units/amount, top/bottom, top 5/10/20 y default, empates por nombre/ID, nombres iguales/renombrados/bajas, cambio de precio, opciones, reembolso, pagos sin venta, D11, >20 productos y >100 ventas, enteros grandes de ID, bordes µs, cero, roles/cabeceras, conciliación con resumen y `/sales/summary`, concurrencia acotada.

### Coste medido (benchmark aislado, no SLA)

- Volumen: **20 000 ventas**, 30 días, **120 productos** (7 dados de baja), **30 000 líneas**, 6 666 CASH / 13 334 STRIPE; base temporal eliminada.
- Medianas: `units/top/5` **48.12 ms**, `amount/top/20` **48.65 ms**, `units/bottom/5` **48.04 ms** (medición del coordinador; el autor reportó 49.14/48.56/48.72 ms en otra corrida).
- Por corrida: **1 agregación** (~40 ms) + 5 revalidaciones de actor + COMMIT; `EXPLAIN` con `Aggregate`/`Hash Join`/`Sort`, 1 366–1 375 buffer hits, 0 lecturas; sin índices nuevos.
- **100 000 ventas y 366 días no medidos**; no se declara SLA ni se añaden índices/migraciones.

### Revisión independiente y residuales

- Revisión sin bloqueantes de contrato, seguridad, SQL, DTO y pruebas.
- R-2 corregido: el benchmark imprime `cleanup` real tras el DROP y no serializa URLs/credenciales.
- Residuales no bloqueantes registrados: prueba de µs no discrimina truncación interna (se apoya en SQL inspeccionado); sumas >2^53 no acreditadas end-to-end por constraints (unitarias/SQL `numeric` sí); integración no monta `adminRoutes` de producción; errores no validados contra todo el esquema `Problem`; 100k/366 días no medidos; `position`/`nameSource` emitidos siempre aunque OpenAPI los declara opcionales; casos teóricos de producto huérfano o cantidad neta 0 no montables bajo constraints.
- **No cierra E2 ni CSV**; E2-06/07 y CSV-03 siguen pendientes. Commit de E2-05 pendiente de autorización.

## TASK-DA-E2-06 — Frontend de ranking

Estado actual: **implementado, verificado, corregido y aceptado visualmente por el responsable el 2026-11-25; commit pendiente de autorización. NO cierra E2/CSV.** Autor: `frontend-implementer`; verificación: `dashboard-verifier`; revisión: `dashboard-reviewer`.

### Archivos

- `frontend/unified/src/features/terminal/admin/analytics/{rankingApi.ts,rankingApi.unit.test.ts,ProductRanking.tsx,ProductRanking.component.test.tsx}`.
- `frontend/unified/src/test/rankingFixture.ts`.
- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.tsx` (montaje acotado con periodo/método).
- `frontend/unified/src/styles/base.css` (solo `.dashboard-ranking-*`).
- `frontend/unified/e2e/dashboard-ranking.spec.ts`.
- Ajustes de mocks en suites existentes que montan Inicio.
- Sin cambios de backend, contrato, OpenAPI, `shared/api/client.ts`, `shared/auth/`, dependencias ni Electron.

### Comandos ejecutados

| Comando | Resultado real |
| --- | --- |
| `npm.cmd run typecheck` | Correcto. |
| `npm.cmd run lint` | Correcto. |
| `npm.cmd run test` | **512/512** en 40 archivos. |
| Dirigidas ranking/DashboardSummary | **116/116** tras correcciones. |
| `npm.cmd run test:e2e -- e2e/dashboard-ranking.spec.ts` | **10/10**. |
| `npm.cmd run test:e2e` | **72/72**. |
| `npm.cmd run build` | Correcto; aviso existente de chunk >500 kB. |

### Cobertura

- Defaults `units/top/5`; selectores de métrica/dirección/top 5/10/20; periodo/método heredados del resumen.
- Parser estricto: query builder, DTO cerrado, strings exactos/BigInt, eco de filtros, cardinalidad/`truncated`, IDs/posición/orden, opcionales `position`/`nameSource`.
- Tabla accesible con caption/scope, ID visible para nombres iguales, metadatos del conjunto antes del corte, importe bruto; sin sumar filas ni reordenar.
- Estados carga/cero/error/DTO inválido/429/sesión; fallo de ranking aislado; aborto/descarte de respuestas antiguas; sin polling ni nuevo cliente/sesión.
- Correcciones de revisión: propagación periodo/método (R-3), 401/403/PIN/ORIGIN (P-1), metadatos visibles (P-2), top 20 y método por UI (P-3), 429 con una petición no abortada (P-4), vector de orden literal independiente (R-2), invariante `unitsSold>0` (R-1).

### V-VIS y aceptación

- Capturas 1280×900, 768×1024 y 390×844 en `frontend/unified/test-results/dashboard-ranking-TASK-DA--e2706-shots-for-the-ranking-panel-chromium/` (ignorado), con respaldo temporal fuera del repositorio.
- Revisión humana: el responsable **aprobó la composición del panel y el desplazamiento horizontal** en pantallas estrechas el 2026-11-25. Aceptación propia de ranking, no heredada de E1/series.
- V-REAL/E2-07 sigue pendiente; no se declara integración real, HTTPS, Electron ni prueba guiada por esta aceptación visual.

### Revisión y residuales

- Revisión independiente sin bloqueantes técnicos; correcciones aplicadas y re-ejecutadas.
- Residuales no bloqueantes documentados: uso acotado de `Number` para `top`/fechas (no IDs/importes), `unitsSold>0` más estricto que el patrón literal del DTO, fixtures de orden ya complementadas con vector literal, y `test:e2e` con `--pass-with-no-tests` (no ocurrió: 10/10 y 72/72 reales).
- **No cierra E2 ni CSV**; E2-07 y CSV-03 siguen pendientes.

## TASK-DA-E2-07 — Aceptación real de ranking

Estado actual: **suite live implementada y verificada; capturas generadas; prueba guiada humana de 4 segundos y aceptación del responsable registradas el 2026-11-25. CERRADA como capacidad de ranking; commit pendiente de autorización. NO cierra E2/CSV.** V-REAL se ejecutó en local autorizado, no sustituye HTTPS/distribución.

### Entorno y dataset

- Docker local `cafeteria-local-postgres-1`, base dedicada `cafeteria_da_e2_07`, backend real `:3000` con código E2-05 y Vite `:5173`; `CATALOG_RATE_LIMIT=10000` local.
- Dataset sintético congelado: 5 productos con movimiento, 6 ventas, **28 unidades / 143 500 centavos**; CASH `11/49 000/2 productos`, STRIPE `17/94 500/4 productos`; un producto renombrado (nombre actual), uno dado de baja con snapshot histórico y precios históricos de línea. Usuarios QA temporales; manifiesto fuera del repositorio y sin secretos versionados.
- Base creada/migrada y seed temporal fuera del repo al terminar; no se tocaron `cafeteria` ni datos ajenos.

### Archivos

- `frontend/unified/e2e-live/dashboard-ranking-acceptance.spec.ts` (nuevo, 4 pruebas live).
- `frontend/unified/e2e-live/README.md` (cobertura E2-07).
- `frontend/docs/specs/dashboard-admin/validation.md` (este registro).
- Sin cambios de backend, contrato, OpenAPI ni frontend de producto.

### Comandos ejecutados

| Comando | Resultado real |
| --- | --- |
| `$env:E2E_LIVE='1'; $env:E2E_LIVE_MANIFEST='...\da-e2-07\manifest.json'; npm.cmd run test:e2e:live -- dashboard-ranking-acceptance.spec.ts` | **4/4** en tres corridas (6.7 s, 6.4/6.2 s del verificador y 6.5 s final). |
| `npm.cmd run typecheck` / `lint` | Correctos tras retirar una función no usada. |
| `git diff --check` / `git status --short` | Limpios; solo suite nueva y README antes del registro. |

### Cobertura real

- Día principal: units/top/5, 5 filas reales, totales `28/143 500`, conciliación con `/admin/dashboard/summary` (`totalCents`, `unitsSold`, tickets, mezcla) y `/sales/summary`; cabeceras `no-store`/`no-referrer`; tabla y metadatos reales.
- amount/top/10, bottom units y método CASH/STRIPE con totales `49 000/11/2` y `94 500/17/4`; nombres/IDs/baja snapshot.
- Cero 2020, `top=05` → 400, CAJERO/PREPARACION 403 sin peticiones admin, anónimo 401, axe WCAG 2.1 A/AA.
- Teclado (métrica) y carrera de top: prevalece la última selección, sin estado de carga final.

### V-VIS y Electron

- Capturas en `%TEMP%\opencode\da-e2-07\captures\`: `dashboard-ranking-1280.png` (1280×3612), `-768.png` (768×4256), `-390.png` (390×5754) y `dashboard-ranking-electron-1280.png` (1249×3627). Revisión visual: 5 filas y totales correctos; 768/390 con scroll horizontal dentro del contenedor.
- Electron real con `_electron`: `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`. El PNG por sí solo no acredita Electron; se registra el log de flags.
- **Aceptación visual y prueba guiada humanas registradas:** el responsable ejecutó la prueba guiada y reportó **4 segundos** y **«todo correcto»** el 2026-11-25, por debajo del objetivo de 15 s. Aceptación propia de ranking, no heredada de E1/series.

### Limitaciones

- Dataset con exactamente 5 productos: `top=5` no produce `truncated=true`; el corte posterior no se ejerce live. `top=10` devuelve el conjunto completo.
- No se modificó el precio actual de un producto vendido en el seed; el importe histórico se verifica por contrato/unitarias/integración, no por una diferencia de precio live.
- Enteros >2^53 no se ejercitan live; cubiertos por unitarias/integración.
- Coste de ranking no se mide dentro de la suite; benchmark E2-05 (~48–49 ms con 20 000 ventas) es la referencia, no SLA.
- CLIENTE/GERENTE no se prueban live; integración E2-05 cubre los 403. Aborto/descarte no se acredita con `requestfailed` en esta suite; sí la última selección y ausencia de spinner.
- Fallo parcial y sesión en vivo no se inducen en esta suite: el fallo aislado del panel, 401/429 y limpieza de sesión están cubiertos por E2-06 (componente/E2E simulado) y por la integración E2-05; no se presentan como live de E2-07.
- Electron no sustituye HTTPS/distribución. CSV-03 sigue siendo el cierre de E2.
- **Cierre:** E2-07 aceptada como capacidad de ranking el 2026-11-25 (4 s, todo correcto) con las limitaciones anteriores; commit pendiente de autorización. E2 completa y CSV-03 siguen abiertos.

## TASK-DA-E2-08 — Contrato de activos sin movimiento

Estado actual: **contrato documental aceptado por delegación del responsable el 2026-11-25; verificado sin bloqueantes; sin runtime ni commit.** Autor: `dashboard-backend-implementer`; verificación: `dashboard-verifier`.

### Archivos

- `frontend/docs/specs/dashboard-admin/contracts/E2-no-movement-contract.md`: ruta, universo activo, ausencia por rango/método, DTO, cursor/paginación, matriz R01–R20 y D01–D10 aceptadas.
- `backend/docs/api/openapi.yaml`: `GET /api/v1/admin/dashboard/no-movement-products` y esquemas `DashboardNoMovement*`, `approved-2026-11-25`.
- Sin runtime, UI, CSV, esquema, migraciones ni dependencias.

### Decisiones aceptadas por delegación

- Activo = `Product.deletedAt IS NULL` + categoría existente con `isActive=true` y `deletedAt IS NULL`; `isAvailable` no filtra y se devuelve como dato. No existe `Product.isActive`.
- Universo = cohorte `Product.createdAt < to`; atributos actuales, sin snapshot histórico de baja/categoría. `universe.asOf = to` es corte de cohorte, no histórico.
- Ausencia = sin línea de `OrderItem` de una `Sale` pagada en `[from,to)` y método filtrado; ventas fuera de rango u otro método no cuentan; no se afirma ausencia global; reembolsos no borran movimiento; órdenes sin `Sale` no cuentan.
- `from/to` UTC 0–3 decimales, mínimo 2000, máximo 366 días; `method` opcional; `limit` 10/20/50 default 20; cursor keyset propio (`name COLLATE "C" ASC, productId ASC`), sin `decodeCursor` genérico.
- DTO: `generatedAt`, `currency`, `period`, `method`, `universe{asOf,definition,includesUnavailable}`, `totalNoMovementProducts` (conjunto antes de paginar, no total del catálogo), `page{limit,nextCursor}`, `items[]{productId,name,category{id,name},isAvailable,createdAt}`.
- Solo ADMINISTRADOR; 401/403 (incluido GERENTE); 400/413/429/500/503; cabeceras privadas en middleware; sin CSRF nuevo.

### Verificación

- `format:check` correcto, `api:validate` 69 ejemplos, `prettier --check` correcto, 286 enlaces 0 inexistentes, `git diff --check` correcto.
- Verificación independiente sin bloqueantes; ajustes aplicados: `totalNoMovementProducts`, `asOf` como cohorte, `nextCursor` con patrón/longitud, `page.limit` propio, decodificador propio, categoría desactivada en limitaciones.
- Sin runtime/HTTP/BD/UI/CSV; la implementación y coste corresponden a E2-09/E2-11. Commit pendiente de autorización.

## TASK-DA-E2-09 — Backend de activos sin movimiento

Estado actual: **implementado, verificado y revisado sin bloqueantes de código; commit pendiente de autorización. NO cierra E2/CSV.** Autor: `dashboard-backend-implementer`; verificación: `dashboard-verifier`; revisión: `dashboard-reviewer` (GPT-6.1 Sol).

### Archivos

- `backend/src/modules/sales/{sales.validation.ts,sales.read.repository.ts,sales.service.ts,sales.routes.ts}`.
- `backend/tests/dashboard-no-movement.test.ts` (18 unitarias).
- `backend/tests/integration/dashboard-no-movement.integration.test.ts` (9 integraciones).
- `backend/scripts/benchmark-dashboard-no-movement.ts`.
- `backend/docs/api/openapi.yaml` (solo descripción del path de sin movimiento).
- Sin cambios de frontend, CSV, esquema, migraciones, `app.ts` ni ranking/series.

### Comandos

| Comando | Resultado real |
| --- | --- |
| `format:check`, `typecheck`, `lint`, `build` | Correctos. |
| `npm.cmd test` | **169** unitarias; 179 integraciones omitidas por diseño. |
| `npm.cmd run test:integration` | **179/179** en 10 archivos; no-movement 9/9. |
| `npm.cmd run api:validate` | 69 ejemplos conformes. |
| `npm.cmd run db:validate` | Esquema válido. |
| `npm.cmd run db:verify:docker` con salida temporal | PostgreSQL 17.11, **22 comprobaciones**, mutantes C01–C04 detectados. |
| `git diff --check` | Correcto. |

### Cobertura

- Universo activo: `Product.deletedAt IS NULL`, categoría activa/no borrada, `createdAt < to`; `isAvailable` no filtra y se devuelve.
- Ausencia por antijoin de ventas pagadas en `[from,to)`/método; ventas fuera/otro método, reembolsos y órdenes sin `Sale` correctos.
- Cursor propio con scope/definición/periodo/método/límite/clave; keyset `name COLLATE "C"`, productId; total antes de paginar; `totalNoMovementProducts`.
- DTO cerrado con strings exactos y `createdAt` con 6 decimales; roles 401/403 incluido GERENTE; cabeceras; body/extras; OpenAPI 200 conforme.
- R-1 corregido: cursor con NUL/controles → 400, nunca 500; 18 unitarias y 179/179 integración tras el cambio.

### Coste

- Benchmark aislado 15 000 ventas/22 500 líneas/2 000 productos (1 200 con ventas, 1 918 universo, 770 sin movimiento).
- Autor: medianas page-1/2/3 **17.73/17.56/17.39 ms**, CASH limit 50 **21.88 ms**, plan **Hash Anti Join**, sin índices nuevos.
- Coordinador: primera corrida page-1 **1.28 s** (outlier de caché en frío), segunda corrida medianas **18.84/17.47/18.31 ms** y CASH **21.81 ms**; `cleanup:true`, sin bases temporales. No es SLA; 100k no medido.

### Residuales

- R-2: cobertura de IDs >2^53 en integración y de cantidad 0 no ejercitada (constraint 1–99); decimales 4–6 en `to`, cursor tras el final con total no cero y eventos/intentos no materializados. Se registran como límites, no como aprobados.
- R-3: denegación sin agregado no instrumentada con contador; el orden de middleware la garantiza estructuralmente.
- Sin frontend/UI/CSV; E2-10/11 y CSV-03 siguen pendientes. Commit pendiente de autorización.

## TASK-DA-E2-10 — Frontend de sin movimiento

Estado actual: **implementado, verificado, revisado y aceptado visualmente por el responsable el 2026-11-25; commit pendiente de autorización. NO cierra E2/CSV.** Autor: `frontend-implementer`; verificación: `dashboard-verifier`; revisión: `dashboard-reviewer` (GPT-6.1 Sol). Los hallazgos live posteriores de E2-11 quedan registrados aparte, sin borrar esta aceptación histórica.

### Archivos

- `frontend/unified/src/features/terminal/admin/analytics/{noMovementApi.ts,noMovementApi.unit.test.ts,NoMovementProducts.tsx,NoMovementProducts.component.test.tsx}`.
- `frontend/unified/src/test/noMovementFixture.ts`.
- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.tsx` (montaje con periodo/método).
- `frontend/unified/src/styles/base.css` (solo `.dashboard-no-movement-*`).
- `frontend/unified/e2e/dashboard-no-movement.spec.ts` y mocks de suites existentes.
- Sin backend, contrato, OpenAPI, sesión, dependencias ni Electron.

### Comandos

| Comando | Resultado real |
| --- | --- |
| `typecheck`, `lint`, `build` | Correctos. |
| `npm.cmd run test` | **622/622** en 42 archivos. |
| Dirigidas no-movement | **110/110**. |
| `npm.cmd run test:e2e -- e2e/dashboard-no-movement.spec.ts` | **6/6**. |
| `npm.cmd run test:e2e` | **78/78**. |

### Cobertura

- Parser estricto, cursor opaco, DTO cerrado, eco de periodo/método/límite, strings/BigInt, total antes de paginar.
- Etiqueta «Sin movimiento en el rango y método seleccionados», definición del universo/corte, `isAvailable` como dato, tabla accesible, ID/categoría/disponibilidad/alta.
- Cargar más con `nextCursor`, sin duplicar, reinicio al cambiar filtros, fin de lista, estados/errores/429/fallo parcial, aborto/descarte, sin polling, un solo `main`.
- No calcula ausencias localmente ni reordena; no usa top N.

### V-VIS y pendientes

- Capturas 1280/768/390 en `frontend/unified/test-results/dashboard-no-movement-*` (ignorado); en 390/768 scroll horizontal interno.
- El responsable revisó el panel el 2026-11-25: **comportamiento correcto** (lista, Cargar más, disponibilidad, teclado) y pidió **quitar el código técnico de «Definición del universo»** para hacerlo más intuitivo. Se sustituyó por texto legible («productos que existen, no dados de baja, categoría activa, creados antes del corte; agotados incluidos») y se eliminó la etiqueta/código crudo; pruebas dirigidas 16/16, E2E 6/6, `typecheck`/`lint` correctos. La nueva presentación queda pendiente de una confirmación visual final del responsable.
- Confirmación posterior definitiva del responsable: **«1. apruebo como quedo 2. aprobado»** (2026-11-25). Acepta el texto intuitivo de E2-10 y autoriza entorno Docker/dataset QA preparado y participación humana de E2-11. No es aceptación final anticipada de E2-11 ni de CSV. La frase anterior conserva la secuencia histórica; su pendiente visual queda resuelta por esta confirmación.
- Residuales: deduplicación con catálogo mutable conserva primer dato; cambio de filtros durante Cargar más no tiene prueba dedicada; guarda no assertea explícitamente cero GET de no-movement en roles negativos.
- Sin integración real; corresponde a E2-11. Commit pendiente de autorización.

## TASK-DA-E2-11 — Aceptación real de sin movimiento

Estado actual: **EN CURSO / NO ACEPTADA, 2026-11-25; sin commit.** Se retoma exclusivamente E2-11 tras la confirmación «1. apruebo como quedo 2. aprobado»: desaparece la causa histórica de ausencia del responsable, no las puertas de aceptación. Autor: `frontend-implementer`; verificador previsto: `dashboard-verifier`; revisor independiente previsto: `dashboard-reviewer`, ambos **pendientes de ejecución posterior por coordinación**. No se delegó ni inició E2-12/13/CSV en este encargo.

**Actualización vigente:** correctiva B01/B02 cerrada técnicamente por verificador/revisor según remisión del coordinador; continuación autorizada de fixtures QA aislados por el autor, **12 live correctas / 2 omitidas**, incluida corrida final31.0s. La evidencia final y sus límites se registran en «Continuación secuencial: fixtures QA y escenarios faltantes». E2-11 sigue NO ACEPTADA; ni la revisión de la correctiva ni la autorización «si autorizo» sustituyen aceptación humana. Las actas anteriores conservan su procedencia histórica.

### Alcance, entorno y oráculo real

- Únicos cambios: nueva `frontend/unified/e2e-live/dashboard-no-movement-acceptance.spec.ts`, README live, estados propios E2-10/11 en este archivo y `tasks.md`. Sin runtime, contratos, dependencias, backend, esquema, siembra, reset ni commits.
- Git limpio antes de editar. Node **22.14.0**; Docker `cafeteria-local-postgres-1` saludable, PostgreSQL **17.11**, BD QA autorizada `cafeteria_da_e2_07`; health backend localhost:3000 y Vite localhost:5173 → **200**. Solo lecturas sobre catálogo/ventas QA; login/logout normales de usuarios QA existentes.
- Inspección sintética segura: **33 productos, 7 ventas, 0 reembolsos**, 4 categorías (una inactiva). Los 25 «Sin venta» fueron creados `2026-11-01T12:00:00Z`, varios agotados, una alta futura `2026-12-15T12:00:00Z`. Producto borrado y categoría inactiva excluidos. No hay categoría borrada, nombres duplicados/acentos discriminatorios ni altas/ventas con fracción real de microsegundos. No se amplió el dataset para inventar evidencia.
- Hallazgo importante: los productos vendidos fueron creados el **25/26 de noviembre**, después de las ventas del 24; el antiguo rango de ranking 24→25 no discrimina método en el universo de sin movimiento. Por eso el rango UI de E2-11 es **24–25 noviembre inclusivos locales** = `[2026-11-24T08:00:00.000Z,2026-11-26T08:00:00.000Z)`. No se corrigieron históricos.
- Oráculo SQL independiente fuera del repo: `%LOCALAPPDATA%\Temp\opencode\da-e2-07\e2-11-oracle.mjs`; resultado privado `e2-11-manifest.json`. Usa `EXCEPT` entre IDs elegibles y IDs de líneas de ventas del rango/método, join de categoría actual, lectura `REPEATABLE READ READ ONLY`, orden `COLLATE "C"` + ID numérico, fechas SQL de seis decimales. No importa repositorio ni obtiene esperados del endpoint. Credenciales se copian opacamente, nunca se imprimen ni adjuntan.
- **21 cortes**: siete rangos × método omitido/CASH/STRIPE, cada uno recorrido completo con **10/20/50** y total conciliado antes de cursor. Main: **26/28/27**; día sin ventas 25→26: **30/30/30**; `to` exactamente en alta de los 25: **0/0/0**; `to` 1 ms después: **25/25/25**; mínimo 2000: **0/0/0**; máximo 366 días: **26/28/26**; `from` 1 ms tras venta CASH inicial: **26/29/27**. La diferencia de máximo STRIPE acredita venta anterior al rango main. UI verifica **20+6** completos y reinicio de cursor por método/límite.

### Matriz RF → escenarios → evidencia / pendiente

Los identificadores de prueba citados son los títulos abreviados de la suite live. Una aserción correcta dentro de una prueba fallida no se contabiliza como prueba aprobada. Omitidos no equivalen a excepciones aceptadas.

| Contrato / RF | Prueba real / resultado | Pendiente o límite discriminatorio |
| --- | --- | --- |
| R01 / RF-13 | `universo SQL`, todas las filas exactas y metadatos; UI 20+6 | — |
| R02 / RF-13 | SQL y lista completa excluyen baja de producto presente | No prueba contador de consultas en denegación |
| R03 / RF-13 | Categoría inactiva presente, excluida en SQL/API | Categoría borrada no materializada |
| R04 / RF-13 | Disponibles y agotados presentes, booleano/UI exactos, includesUnavailable | — |
| R05 / RF-13 | Cohorte antes/dentro/exactamente `to`/futura; to=12:00:00 vs +1 ms | `to−1 µs` no materializado |
| R06 / RF-03/13 | Método omitido excluye ventas en rango, SQL completo | — |
| R07 / RF-03/13 | CASH vs STRIPE, conjuntos 28/27, IDs exactos | — |
| R08 / RF-03/13 | STRIPE vs CASH/omitido, SQL completo | — |
| R09 / RF-13 | Rango sin ventas conserva vendidos fuera; máximo STRIPE incluye venta del 23 | Venta exactamente en `to` discriminatoria no materializada |
| R10 / RF-13 | Oráculo usa solo Sale | No QA discriminatoria de órdenes impagadas/eventos/intentos: integración existente, NO acreditada live |
| R11 / RF-13 | **Omitida explícita** | 0 reembolsos QA; no crear sin autorización |
| R12 / RF-13 | Identidad por producto y existencia de línea, sin joins de opciones en oráculo | Cantidad/precio 0 y opciones discriminatorias NO acreditadas live; cantidad 0 contradice constraint 1–99 |
| R13 / RF-13 | `universo SQL` + `paginación UI`: 3 páginas con 10, 2 con 20, sin omisión/duplicación, fin null | Catálogo estable; no promesa snapshot |
| R14 / RF-13 | Total string igual a cardinalidad SQL antes de cursor en cada página | >2^53 no materializado live (33 productos); exactitud de parser tiene evidencia E2-10, no se hereda como live |
| R15 / RF-13/RNF-02 | Orden completo comparado a SQL `COLLATE "C"`, sin reordenar UI | **Omitida explícita** nombres iguales/mayúsculas/acentos discriminatorios |
| R16 / RF-19 | `entrada estricta`: cursor inválido, scope/definición/ID/NUL/extra, otros filtros/límite; normalización y terminal total26 | Decodificar cursor solo en prueba negativa/terminal; UI no lo interpreta |
| R17 / RF-03/19 | `entrada estricta` + SQL: mínimo, 366 días/+1ms, from=to/invertido, 0–3 aceptado/4–6 rechazado en ambos límites, seis decimales de salida; from inclusivo discriminado | **Omitida explícita** venta/alta to−1µs y venta exactamente to; las fechas actuales solo contienen milisegundos/ceros |
| R18 / RF-13 | Cero por API/UI; método sin ventas conserva 30 elegibles; cursor terminal items[] mantiene total26 | Contradicción documental descrita abajo, no test falso de total0 |
| R19 / RF-01/19 | Admin200, anónimo401, CAJERO/PREPARACION403, guardas cero GET administrativos; Problem Details, cabeceras400/401/403; Origin403 directo backend; body/extras/repetidos/arrays | **Omitida explícita** CLIENTE/GERENTE/PIN sin QA validada; ausencia de agregado se infiere estructuralmente, no instrumentada |
| R20 / RF-19/RNF-06 | DTO cerrado y coherente, latencia HTTP observada; regresión backend existente completa | **Omitida explícita** 413/429/500/503/fallo parcial/DTO inválido live: caos no autorizado, excepción E2-03 NO heredada; no N+1/plan nuevo a escala medido aquí |
| C-UI / RF-03/11/19 | Cero e inválido sin GET, carrera con Cargar más, última selección STRIPE/10, **5 requests/4 requestfailed**, recarga Space, logout oculta panel, GET posterior401, localStorage0 | Prueba falla por foco (B-01); expiración/refresh/multipestaña **omitidos explícitos**, no provocados |
| C-VIS/REAL / RNF-04/05/07 | Navegador/tabla, capturas 1280/768/390 y Electron, flags endurecidos reales; sin overflow general | Axe **falla390** (B-02); revisión visual humana, teclado manual/prueba guiada y aceptación final NO realizadas |

### Defectos reales y decisiones documentales pendientes

- **B-01 / RNF-04:** actualizar con Space dispara GET200 y pierde foco al deshabilitarse temporalmente «Actualizar lista». Aserción `toBeFocused` falló reproduciblemente en corridas sucesivas; se conserva fallida. `expect.soft` permite continuar logout/401 sin ocultar el fallo. Requiere tarea correctiva autorizada: no se cambia runtime en E2-11.
- **B-02 / RNF-04:** axe `scrollable-region-focusable`, impacto **serious**, a viewport **390×900**, targets `.dashboard-no-movement-table-wrap` y `.dashboard-ranking-table-wrap`. Ambos contenedores desplazan tabla sin foco de teclado. Axe1280/768 sin violaciones; scroll global no aparece a los tres anchos. No se excluyeron reglas/targets para volver verde; ranking es hallazgo vecino, no autorización de refactor.
- **D-01 / R18:** la fila agrupa cero elegibles, método sin ventas y página terminal con resultado `total:"0"`. Contradice definición total antes de cursor y ausencia por método de las secciones normativas/D04/D07/OpenAPI. Se acreditó semántica normativa: método sin ventas devuelve elegibles y terminal mantiene total26. **Se solicita aclaración agrupada al responsable; contrato intacto.**
- **D-02 / cabeceras:** contrato §§seguridad/D09 conserva reserva para rechazos globales; OpenAPI del path dice verificado E2-09 con cabeceras globales. Live Origin directo al backend sí devuelve403/no-store/no-referrer; Vite reescribe Origin y habría dado200, por lo que no acredita ese rechazo. 413/429 globales NO inducidos aquí: diferencia documental registrada, no reescrita por conveniencia.
- **D-03 / escenarios sin datos/caos:** responsable debe resolver conjuntamente fixture adicional/autorización propia o aceptación explícita de límites. La autorización actual no habilita sembrar más, forzar reembolsos, revocar sesiones, detener backend/BD, saturar rate limiter ni sustituir pruebas live por mocks. No se solicita confirmación rutinaria por archivo/comando.

### Comandos y resultados realmente ejecutados por el autor

| Comando / directorio | Resultado |
| --- | --- |
| raíz: `git status --short`, health HTTP y `docker ps` | Git limpio inicial; servicios autorizados disponibles |
| `node ...\e2-11-inspect.mjs` / `node ...\e2-11-oracle.mjs` externos | Lectura sintética, 21 esperados SQL completos; sin escrituras QA |
| FE: `npm.cmd run lint`, `npm.cmd run typecheck` | Correctos (typecheck normal no incluye e2e-live) |
| FE: `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution bundler --types node,vite/client e2e-live/dashboard-no-movement-acceptance.spec.ts src/app/desktop.ts` | Correcto; comprueba explícitamente el archivo live con TypeScript estricto |
| FE: `npm.cmd run test` | **622/622**, 42 archivos |
| FE: `npm.cmd run test:e2e` | **78/78**, suite simulada separada, NO evidencia live |
| FE: `npm.cmd run build` | Correcto; advertencia existente de chunk >500 kB |
| FE live dirigido con `E2E_LIVE=1`, `E2E_LIVE_MANIFEST=...\e2-11-manifest.json` | Última corrida: **6 correctas, 2 fallidas (B-01/B-02), 6 omitidas, 28.9 s**; no suite verde |
| BE: `format:check`, `typecheck`, `lint`, `build` | Correctos, sin cambios de backend |
| BE: `npm.cmd test` | **170 correctas**, 179 integración omitidas por diseño; no sustituyen siguiente fila |
| BE: `npm.cmd run api:validate`, `npm.cmd run db:validate` | **70 ejemplos**, esquema válido |
| BE: `npm.cmd run test:integration` | **179/179** en 10 archivos, no-movement9/9; runner existente, bases propias aisladas, no QA |
| BE: `npm.cmd run db:verify:docker` | **22 comprobaciones**, PostgreSQL17.11, mutantes C01–C04 detectados; runner existente aislado, no reset QA |
| raíz: `git diff --check` y lectura de archivo nuevo/diff | Correctos; solo cuatro rutas autorizadas en entrega |
| externo: `node ...\e2-11-stability.mjs` | Relectura SQL después de todas las corridas: 21 conjuntos esperados idénticos; SHA256 de escenarios `c013d692900edb5140a3fb7ed84665b8c42ff67cf3d84a66ef21190cbee6eb79`, sin credenciales en hash/salida |

Errores de arnés iniciales corregidos solo en la suite: import runtime de parser carga `import.meta.env` no disponible en Node (se usan solo sus tipos); Electron sin baseURL necesita URL absoluta; Origin debe comprobarse directo a3000. Primer comando tsc explícito necesitó `--ignoreConfig` (TypeScript6); correcciones de tipos de env Electron/introspección sin `any`. No son defectos del producto. Los dos fallos reales posteriores siguen abiertos.

### Capturas, coste y puertas restantes

- Evidencia fuera del repo en `%LOCALAPPDATA%\Temp\opencode\da-e2-07\e2-11-captures\`: `no-movement-1280.png`, `no-movement-768.png`, `no-movement-390.png`, `no-movement-electron-1280.png`. Capturas **del panel**, no de toda la página: excluyen usuario, credenciales, cookies, tickets/QR y ventas; solo nombres/IDs de catálogo QA sintético. Viewports navegador **1280×900 / 768×900 / 390×900**; Electron ventana1280×900 con área cliente propia. Estado20 filas/main/sin método/límite20, reloj real del servidor, generado cada respuesta, foco retirado antes de captura (no altera las aserciones de accesibilidad). Referencia E2-10 aceptada, pero estas capturas E2-11 **no están aprobadas humanamente**.
- Tamaños PNG del recorte de panel: **896×1688 / 736×1787 / 358×2025**, Electron **896×1688**. No se presentan como capturas de página completa. Resultado db:verify conservado fuera del repo como `...\da-e2-07\e2-11-dbverify-results.json`; el runner reescribió únicamente `checkedAt` del artefacto backend versionado, que se dejó con su contenido inicial tras copiar la evidencia, sin entregar cambios backend.
- Electron real: `terminalOnly=true`, `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`, `webSecurity=true`, tabla conciliada; perfil externo eliminado al terminar. No acredita HTTPS ni distribución.
- Coste observado del recorrido de tres páginas con límite10/rango366 días: **140 ms** primera corrida, **633 ms** simultánea con build/pruebas, **129 ms** y **132 ms** las dos últimas; **33 productos/7 ventas**, no benchmark representativo ni SLA. Plan/volumen representativo siguen como evidencia E2-09 (15k ventas/2k productos), no medición nueva E2-11. 100k no medido.
- **No aceptar/cerrar:** B-01/B-02, matriz parcial/omitidos/D01–D03, verificación y revisión independientes pendientes; teclado manual/prueba guiada y aceptación funcional/visual humana propias pendientes. Autorización de participar no es resultado ni aceptación. E2-12/13 y CSV no iniciados por este encargo, sin commit.

### Correctiva autorizada B01/B02 — RNF-04 / C-UI

- Encargo explícito del responsable **«si autorizo»** después de solicitar corregir ambos defectos y ampliar solo QA aislada. Esta unidad ejecuta **únicamente B01/B02**: ampliación del dataset diferida a encargo posterior tras verificación/revisión, sin tareas paralelas. Autor `frontend-implementer`; próximos responsables `dashboard-verifier` y luego `dashboard-reviewer`, secuenciales e independientes; no se atribuyen sus resultados al autor.
- Se respetó la denegación previa del comando compuesto `git status --short; Get-Location` al verificador: **no repetido**, ni se consultó estado por herramienta/agente alternativo. La inspección Git de estado actual queda no revalidada; se conservaron los cambios heredados y se leyeron patrones/diff de los archivos autorizados. `git diff --check` es una operación distinta, ejecutada y correcta. No hubo nuevas denegaciones en las pruebas de esta unidad.
- **B01:** `NoMovementProducts.tsx`: «Actualizar lista» usa `aria-disabled` sin retirar el elemento del foco. `refreshList` verifica carga y un latch `useRef` síncrono, impidiendo duplicados incluso antes de que React confirme el render. El latch se libera al terminar la petición vigente (éxito/error), respetando descarte/aborto y cambios de filtros; Reintentar reutiliza la misma guarda. Estilos existentes de `button[aria-disabled]` conservados. No se cambió cliente HTTP, endpoint, métricas ni semántica de datos.
- **B02:** contenedores de ambas tablas (`NoMovementProducts.tsx`, `ProductRanking.tsx`) con `role="region"`, nombre accesible propio y `tabIndex=0`; outline visible solo en las dos clases autorizadas mediante `:focus-visible`, mismo color/ancho existente. Sin rediseño ni refactor de ranking. Tabla/caption/orden/precisión permanecen intactos.
- Pruebas componentes: regiones nombradas/focalizables; dos casos nuevos éxito/error con respuesta retenida, doble activación síncrona antes del commit, activación adicional durante carga, foco persistente y desbloqueo para una recarga posterior. Las demoras son **MSW**, no se presentan como live.
- E2E simuladas nuevas: Space/Enter durante respuesta retenida → **un solo GET**, foco durante y después, outline3px; Tab desde el selector anterior llega a cada región y ArrowRight provoca **scrollLeft real >0** a390, axe de página completa sin exclusiones. Selector antiguo de etiqueta afinado con `exact:true` por coincidencia ambigua con el caption; no se eliminó su aserción.
- Live: conserva aserción de foco (no `fixme`), axe general y seis omitidos; añade Tab/flechas con desplazamiento real y retorno a0 para ambas tablas a390, nombres/foco/outline3px. Sigue conciliando las mismas filas SQL del dataset existente, carrera con4 `requestfailed`, logout401, guardas y Electron endurecido. Sin interceptores live, siembra ni caos.

#### Skip-link y recapturas

- Se investigó sin modificar código ni CSS del skip-link: en los tres viewports, al enfocarlo se mantiene visible (`top >= 0`), y al enfocar «Productos por página» deja de estar enfocado y queda fuera del viewport (`bottom <= 0`, transform real **matrix(1,0,0,1,0,-74)**). La superposición antigua no se reproduce con estado de foco explícito; se trata como evidencia anterior no fiable de foco/recorte, **no se afirma haber corregido un defecto runtime del skip-link**.
- No se ocultó el enlace mediante CSS, máscaras, exclusiones axe ni scripts de visibilidad. Capturas tomadas con foco real visible en el selector, no mediante blur inespecífico después de axe. Revisión visual del autor en PNG768/390: sin enlace superpuesto, texto del periodo legible y foco azul visible. No sustituye aceptación humana final.
- Recapturas sobrescritas fuera del repo en `C:\Users\angel\AppData\Local\Temp\opencode\da-e2-07\e2-11-captures\`: `no-movement-1280.png`, `no-movement-768.png`, `no-movement-390.png`, `no-movement-electron-1280.png`. Viewports/recortes/20filas/dataset/precauciones de privacidad del acta inicial conservados, ahora con foco explícito en el selector; reloj real, `generatedAt` no congelado. Ninguna contraseña/cookie/QR en capturas.

#### Archivos de esta correctiva

1. `frontend/unified/src/features/terminal/admin/analytics/NoMovementProducts.tsx`.
2. `frontend/unified/src/features/terminal/admin/analytics/ProductRanking.tsx`.
3. Tests adyacentes `NoMovementProducts.component.test.tsx` y `ProductRanking.component.test.tsx`.
4. `frontend/unified/src/styles/base.css` (solo dos selectores de foco).
5. `frontend/unified/e2e/dashboard-no-movement.spec.ts`.
6. `frontend/unified/e2e-live/dashboard-no-movement-acceptance.spec.ts`.
7. Estados propios E2-11 en este archivo y `tasks.md`.

El README live heredado de la unidad anterior no se modificó en esta correctiva; sus referencias a fallos iniciales se leen junto con esta actualización. Sin backend, contrato, dependencias, esquema/migraciones, dbverify, dataset ni commits.

#### Verificación ejecutada por el autor (correctiva)

| Comando (FE salvo indicación) | Resultado real |
| --- | --- |
| `npm.cmd run test -- src/features/terminal/admin/analytics/NoMovementProducts.component.test.tsx src/features/terminal/admin/analytics/ProductRanking.component.test.tsx` | **39/39**, dos archivos |
| `npm.cmd run test:e2e -- e2e/dashboard-no-movement.spec.ts` primera corrida | Nuevas regresiones B01/B02 correctas; 7/8 por selector anterior ambiguo, corregido a coincidencia exacta; suite completa posterior lo revalida |
| `npm.cmd run lint`, `npm.cmd run typecheck` | Correctos |
| `npm.cmd run test` | **624/624**, 42 archivos |
| `npm.cmd run test:e2e` | **80/80**, incluye ranking y Electron simulados |
| `npm.cmd run build` | Correcto; advertencia existente chunk >500kB |
| `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution bundler --types node,vite/client e2e-live/dashboard-no-movement-acceptance.spec.ts e2e/dashboard-no-movement.spec.ts src/app/desktop.ts` | Correcto, incluye ambos archivos E2E explícitamente |
| `$env:E2E_LIVE='1'; $env:E2E_LIVE_MANIFEST='C:\Users\angel\AppData\Local\Temp\opencode\da-e2-07\e2-11-manifest.json'; npm.cmd run test:e2e:live -- dashboard-no-movement-acceptance.spec.ts` | Dos corridas **8 correctas / 6 omitidas**, 22.3s ambas; última con diagnóstico de foco del skip-link. Axe1280/768/390 **sin violaciones**; foco de recarga persistente; coste observado133ms/33productos/7ventas, no SLA |
| raíz: `git diff --check`, lectura dirigida del diff runtime | Correctos; no se repitió `git status` denegado |

**No ejecutado en esta unidad:** V-BE/dbverify (correctiva exclusivamente frontend, backend/contrato/persistencia intactos); ampliación QA; caos/refresh-expiración/multipestaña/fixtures pendientes; aceptación humana/teclado manual/prueba guiada; verificación/revisión independientes. B01/B02 pasan las comprobaciones del autor, **no se declaran cerrados por revisión ajena todavía**. E2-11 continúa **EN CURSO / NO ACEPTADA**, sin otras capacidades ni CSV ni commit.

### Continuación secuencial: fixtures QA y escenarios faltantes — 2026-11-25

**Estado: EN CURSO / NO ACEPTADA.** Encargo del coordinador limitado a E2-11,
tras autorización humana «si autorizo» para corregir dos defectos y ampliar solo
QA aislada. Autor de esta continuación: subagente ejecutor GPT-6.1 Sol;
verificación siguiente `dashboard-verifier` y revisión siguiente
`dashboard-reviewer`, **aún pendientes para estos cambios**. Sin E2-13, runtime,
contratos/OpenAPI, dependencias, migraciones, reset, servicios detenidos ni commit.

#### Procedencia del cierre técnico B01/B02 (no ejecución nueva del autor)

- La remisión del coordinador confirma cierre técnico de la correctiva por
  `dashboard-verifier` y `dashboard-reviewer`, independientes de
  `frontend-implementer` (autor de la correctiva). Evidencia propia del verificador
  comunicada en el encargo: **39 componentes, 8 E2E simuladas y 2 live dirigidas**;
  revisión independiente cerró técnicamente ambos defectos. Esta continuación
  registra esa procedencia, **no atribuye esas ejecuciones al nuevo autor** ni
  inventa comandos, capturas o tiempos de aquellos agentes.
- No se modificaron los arreglos runtime ni sus pruebas componentes/E2E simuladas.
  Las nuevas corridas live conservan sus aserciones de foco, teclado, scroll y axe.
  Las referencias históricas a revisión pendiente/fallos B01/B02 de las secciones
  anteriores quedan superadas solo para esos dos defectos, no para la capacidad.

#### Objetivo, criterios y guardas de datos

| Criterio / fuente | Cambio autorizado | Evidencia propia |
| --- | --- | --- |
| R11 / RF-13, bruto | Venta Stripe sintética100c y reembolso total100c; sin proveedor | Excluida con STRIPE/omitido, incluida con CASH, recorrido completo contra SQL independiente |
| R15 / RF-13 / RNF-02 | Seis productos A/B/Same/Same/a/Á | Orden C, empate por BigInt numérico, dos lecturas completas repetibles y todas las filas UI exactas sin reordenar |
| R05/R09/R17 / RF-03/13 | Altas y ventas distintas en to−1µs y to exacto | Ventanas reales consecutivas1ms, tres métodos en oráculo y paginación completa10/20/50; salida de alta conserva .999999 |
| R03 / RF-13 | Categoría nueva borrada pero is_active=true con producto nuevo | Defensa de deleted_at aislada de inactividad; excluida SQL/API. Inconsistencia QA controlada expresamente autorizada, no comportamiento de CRUD |
| R19 / RF-01/19 | Cuentas nuevas CLIENTE, GERENTE y CLIENTE must_change_pin | Login real con CSRF/cookies opacos; GET403 FORBIDDEN/PIN_CHANGE_REQUIRED; /auth/me resuelto, guardas sin GET administrativos ni localStorage |

- Preflight ejecutado **antes de mutar**: contenedor
  `cafeteria-local-postgres-1`, `current_database() = cafeteria_da_e2_07` y tres
  firmas sintéticas (producto7 «Sin venta 01» con alta exacta, categoría2 «Bebidas
  (demo)», venta1 en fecha exacta). Baseline **33 productos/7 ventas/0 reembolsos**.
  La transacción repite guardas y cardinalidades bajo locks breves; rehúsa bases
  distintas o dataset modificado. No se inspeccionaron `.env`, contraseñas,
  manifiesto completo, cookies o tokens ni se imprimieron hashes de credenciales.
- `e2-11-fixtures.mjs --apply`, externo: **solo INSERT**, una transacción,
  **+12 productos/+1 categoría/+3 ventas/+1 reembolso/+3 cuentas**. Resultado
  **45 productos/10 ventas/1 reembolso/5 categorías**. Nuevas cuentas únicamente,
  contraseñas/NIP aleatorios, Argon2id19MiB/2/1, manifiesto privado externo;
  ninguna contraseña existente cambiada ni sesión revocada/prefabricada.
  No Checkout/Stripe/Cloudinary/correo, ni jobs/outbox nuevos ni cobros operativos.
- Huella de columnas no secretas de productos1–33, categorías1–4, ventas1–7 y sus
  pagos/líneas idéntica antes/después:
  `b7239bc13c24b0d8ad381466e6c48baee839cea8a98b05120468ba30f6fcd7f2`.
  No se afirma que cubra sesiones ni columnas no seleccionadas; el script de
  ampliación no contiene UPDATE/DELETE ni modifica filas existentes.
- Scripts QA externos, no versionados, bajo
  `C:\Users\angel\AppData\Local\Temp\opencode\da-e2-07\`:
  `e2-11-fixtures.mjs`, `e2-11-originals.mjs`, `e2-11-oracle.mjs`,
  `e2-11-stability.mjs`. No se ejecutó ningún `removed-*`, reseed/reset ni
  remoción automática. La guarda `e2-11-extension-private.json` impide aplicar
  otra vez; **no leer/imprimir/versionar ni borrar ese archivo para repetir**.
  Fallo de preparación requiere inspección autorizada, no recuperación destructiva.

#### Oráculo reproducible y estabilidad

- Sigue siendo SQL independiente **EXCEPT**, read-only REPEATABLE READ, sin
  importar endpoint/repositorio ni copiar sus resultados. Extrae también hechos
  discriminatorios de las nuevas filas (altas/ventas/refund/categoría), sin PII
  ni secretos. Manifiesto privado incorpora cuentas opacamente, no se versiona.
- **30 cortes =10 rangos ×3 métodos**, cada uno íntegro con límites10/20/50:
  main34/38/35; no-sales25/25/25; cohort0/0/0; after-cohort25/25/25;
  zero0/0/0; maximum34/38/34; from-exclusive-control34/39/35;
  micro-left39/39/39; micro-center39/40/39; micro-right40/41/40.
  Orden de cifras: omitido/CASH/STRIPE; UI main **20+14**, no truncado.
- Nuevos rangos micro: `[2026-11-26T07:59:59.998Z,.999Z)`,
  `[07:59:59.999Z,08:00:00.000Z)`, `[08:00:00.000Z,.001Z)`.
  Dos productos se crean en `.999999Z`/to exacto y dos productos **diferentes**
  tienen ventas en esos instantes: se discrimina cohorte y movimiento por separado.
- `no-sales` ahora es `[2026-11-23T08:00Z,09:00Z)` porque la nueva ventaµs
  cae en el anterior intervalo sin ventas. Es expectativa propia regenerada por
  SQL, no un cambio para imitar la API ni reescritura histórica.
- Relectura SQL tras primeras verificaciones: conjuntos idénticos,
  SHA256 escenarios (excluye credenciales):
  `879c902e5d752fe70e25904ec0c44d70b9b9374d67f4593fea9c42f98e67ebe1`.

#### Comandos/resultados del autor de esta continuación

| Directorio / comando real | Resultado |
| --- | --- |
| Externos: `node .../e2-11-inspect.mjs`, `node .../e2-11-fixtures.mjs` | Baseline no secreto, BD/dataset confirmados antes de escribir |
| Externos: `node .../e2-11-originals.mjs --record`; `node .../e2-11-fixtures.mjs --apply`; `node .../e2-11-originals.mjs` | Guarda correcta; ampliación única transaccional; originales seleccionados sin cambios |
| Externo: `node .../e2-11-oracle.mjs`, `node .../e2-11-stability.mjs` | 30 conjuntos SQL completos; estabilidad correcta |
| FE: `npm.cmd run lint`, `npm.cmd run typecheck` | Correctos, dos ejecuciones |
| FE: `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution bundler --types node,vite/client e2e-live/dashboard-no-movement-acceptance.spec.ts src/app/desktop.ts` | Correcto, incluye explícitamente suite live |
| FE: `npm.cmd run test`, `npm.cmd run test:e2e`, `npm.cmd run build` | **624/624**, **80/80**, build correcto con aviso existente chunk>500kB; simulación no sustituye live |
| FE live dirigido, mismas variables/ruta del README | Primera corrida ampliada **12 correctas/2 omitidas,31.8s**. Segunda **11 correctas/1 fallida/2 omitidas,37.3s** por expectativa de arnés demasiado genérica tras resolver auth/me: PIN obligatorio redirige al heading «Cambio de NIP obligatorio», no «Acceso no disponible». Ajustada solo esa expectativa, sin cambiar producto; reejecución final se registra a continuación |
| BE: `npm.cmd run format:check`, `typecheck`, `lint`, `build` | Correctos, sin cambios backend |
| BE: `npm.cmd test` | **170 correctas/179 integración omitidas** por diseño; no se suman como aprobadas |
| BE: `npm.cmd run api:validate`, `npm.cmd run db:validate` | **70 ejemplos**, esquema válido |
| BE: `npm.cmd run test:integration` | **179/179**,10 archivos, no-movement9/9; runners existentes/bases propias aisladas, no QA |
| BE: `$env:DB_REVIEW_OUTPUT_DIR='C:/Users/angel/AppData/Local/Temp/opencode/da-e2-07/e2-11-extension-dbverify'; npm.cmd run db:verify:docker` | **22 comprobaciones correctas**, PostgreSQL17.11, mutantes C01–C04 detectados; artefactos externos desde inicio, sin restaurar rastreados |
| BE: `node scripts/check-doc-links.mjs` | **286 enlaces,0 inexistentes**; fragmentos no comprobados |
| FE live dirigido final tras resolver /auth/me y heading específico de PIN | **12 correctas/2 omitidas,31.0s**; cero fallos, coste observado219ms, carrera5requests/4requestfailed; mismas30expectativas SQL, axe1280/768/390 correcto, Electron endurecido |
| FE: tsc explícito anterior, `npm.cmd run lint`, `npm.cmd run typecheck` sobre suite final | Correctos |
| Raíz: `git diff --check`; `node backend/node_modules/prettier/bin/prettier.cjs --check --single-quote --print-width 100 frontend/unified/e2e-live/dashboard-no-movement-acceptance.spec.ts` | Correctos; avisos LF→CRLF existentes, no denegaciones |
| Externos: originals/stability después de corrida final | Misma huella de originales y mismo SHA256 de30escenarios; sin mutación durante las corridas |
| Raíz: Node inline, resolución de enlaces Markdown de tasks/validation/README live | **23 enlaces locales,0 inexistentes**, fragmentos no comprobados |

Revisión visual propia de PNG768/390 final: sin superposición del skip-link,
selector con foco visible, total34/mostrando20, nombres sintéticos y scroll interno
de tabla móvil. No constituye aceptación humana ni reemplaza revisión independiente.

#### Omitidos, evidencia histórica y decisiones agrupadas pendientes

- **Dos omitidos NO aprobados:** R20 fallos413/429/500/503/fallo parcial/DTO
  inválido live y RF-19 expiración/refresh/multipestaña. No se detuvieron servicios,
  saturaron límites, editaron cookies/revocaron sesiones ni añadieron mocks live.
  La excepción E2-03 no se hereda. Resolver alcance de ensayo posterior o aceptación
  explícita de limitación con responsable; no declararlos verificados.
- R10/R12 pertenecen **solo E2-09** en la matriz aceptada: integración existente
  reejecutada, no se obliga a duplicar live; cantidad0 no se fabricó contra constraint.
  Reembolso parcial no añadido: R11 permite total **o** parcial, aquí total real QA.
- **D-01 sigue pendiente:** R18 contradice tabla DTO/ausencia/paginación/D04/D07:
  sin ventas del método se conserva universo elegible y página terminal conserva
  el total antes del cursor. Ahora son25 elegibles sin ventas y terminal main34;
  evidencia no autoriza cambiar contrato ni convertir total en0.
- **D-02 sigue pendiente:** contrato filas S05/§seguridad/D09 reserva cabeceras
  en rechazos globales; OpenAPI path descripción y respuestas413/429 dicen
  verificadas E2-09. Prueba existente backend `sanea 413/429/500/503` reejecutada
  en las9 integraciones: parser413 con300000 caracteres, limitador inyectado1
  para429, servicio inyectado P1001→503/error→500; aserciones no-store/no-referrer.
  Es **integración con fallos inyectados**, no caos contra localhost ni prueba de
  proveedor. Live Origin directo3000 da403/cabeceras privadas, proxy Vite no
  acredita rechazo de Origin. Contrato/OpenAPI permanecen intactos; conciliar
  documentalmente por responsable en encargo autorizado, no autoaprobar.
- B01/B02 ya no bloquean técnicamente según procedencia registrada; faltan
  **verificación/revisión independientes de esta ampliación**, teclado manual,
  prueba guiada y aceptación funcional/visual humana E2-11. Capturas del panel
  en rutas anteriores se regeneran con20 filas del dataset ampliado, foco real
  en selector, sin PII/cookies/QR; no son la captura anterior ni aprobación humana.
  Axe1280/768/390 sin violaciones y flags Electron endurecidos acreditados en
  corrida final; carrera5requests/4requestfailed; coste260/225/219ms sobre45
  productos/10ventas, no benchmark representativo/SLA. Escala sigue evidencia E2-09.
- No se reintentó `git status`/`Get-Location` ni equivalentes tras denegación previa.
  La inspección de estado actual no se revalida por otra vía. Se conservan cambios
  ajenos, incluida E2-12 documental ya presente; este encargo no la modifica ni
  inicia E2-13/CSV ni cierre E2. Sin commit.

### Verificación y revisión independientes de la ampliación — 2026-11-25

Procedencia ajena al autor: `dashboard-verifier` y `dashboard-reviewer`, secuenciales, sin editar archivos ni ejecutar commits.

- Verificador: live propio **12 correctas / 2 omitidas, 30.9 s** sin mocks ni intercepción, con el manifiesto privado consumido opacamente; coincidencia fila a fila con el oráculo SQL en **30 cortes × 10/20/50**, total previo al cursor y sin duplicados; R03/R05/R09/R17, R11 y R15 discriminatorios aprobados; R19 con 401 y 403 de CAJERO/PREPARACION/CLIENTE/GERENTE/PIN; entrada/errores, cursores y Origin directo correctos; **5 solicitudes / 4 `requestfailed`**, foco de recarga y logout/limpieza correctos; axe sin violaciones en 1280/768/390, teclado/scroll automatizados y Electron con aislamiento; coste observado **219 ms** sobre dataset pequeño, no SLA. Inspección estática de fixtures y oráculo: solo `INSERT` sobre base dedicada, guardas de destino y huella, oráculo `EXCEPT` `REPEATABLE READ READ ONLY` sin importar el endpoint.
- Revisor (solo estática): **sin nuevos bloqueantes técnicos** en las fuentes inspeccionadas; B01/B02 permanecen cerrados técnicamente y no se reabren. Señaló como pendientes los dos omitidos, D-01/D-02 y la evidencia humana, y confirmó que R10/R12 corresponden solo a E2-09 en la matriz aceptada.
- Restricción respetada: un intento de `node .../e2-11-originals.mjs` (y posteriores) fue **denegado por permisos** al verificador; no se rodeó por otra vía. Por eso la huella de originales y la estabilidad SQL siguen siendo evidencia del autor, no reejecución independiente.

### Decisiones del responsable y cierre de E2-11 — 2026-11-25

Respuesta del responsable a la solicitud agrupada: **«acepto 1 y 2 y las referencias visuales»**, seguida de la instrucción de continuar con E2-13.

1. **Omitidos diferidos.** Se acepta diferir los dos bloques omitidos —R20 (413/429/500/503, fallo parcial y DTO inválido live) y RF-19 (expiración/refresh/multipestaña)— como **limitación registrada**: **no se declaran probados** y no heredan la excepción de E2-03. Sigue sin autorizarse caos contra servicios, saturación de límites ni revocación de sesiones.
2. **Aclaraciones documentales aplicadas.** Se autorizó conciliar sin cambiar negocio, DTO ni permisos: R18 se divide en sus tres casos (sin movimiento vacío, método sin ventas → universo elegible, página terminal → total previo al cursor) y la reserva de cabeceras de D09/S05/§seguridad se actualiza citando la evidencia exacta de E2-09 (integración con fallos inyectados para 413/429/500/503 y Origin live directo), sin afirmar caos live.
3. **Referencias visuales aceptadas.** El responsable aceptó las capturas sanitizadas de panel en 1280/768/390 y Electron (`...\da-e2-07\e2-11-captures\no-movement-{1280,768,390}.png` y `no-movement-electron-1280.png`) como referencia visual de la capacidad.

**Limitación que se conserva en el registro, sin convertirla en prueba ejecutada:** no consta un recorrido manual de teclado ni una prueba guiada cronometrada realizados por una persona en esta tarea. La aceptación se apoya en la evidencia real automatizada (teclado/scroll/axe a tres anchos y Electron), en la revisión independiente y en la aceptación de las referencias visuales del responsable; no se atribuye un resultado humano de teclado o tiempo.

**Estado: TASK-DA-E2-11 CERRADA Y ACEPTADA por el responsable el 2026-11-25 con las limitaciones anteriores; sin commit autorizado.** No cierra E2: la secuencia continúa con E2-13 y el cierre sigue siendo CSV-03.

## TASK-DA-E2-12 — Contrato de participación por categorías

Estado actual: **contrato documental aceptado por delegación del responsable el 2026-11-25; verificación documental ejecutada; sin runtime ni commit.** Autor: `dashboard-backend-implementer`.

### Archivos

- `frontend/docs/specs/dashboard-admin/contracts/E2-categories-contract.md`: ruta, entrada, DTO, semántica, conciliación, advertencia de reclasificación, matriz R01–R18 y D01–D10.
- `backend/docs/api/openapi.yaml`: `GET /api/v1/admin/dashboard/category-participation` y esquemas, `approved-2026-11-25`.
- Sin runtime, UI, CSV, esquema, migraciones ni dependencias.

### Decisiones aceptadas por delegación

- Ruta `/admin/dashboard/category-participation`; `from/to` UTC 0–3 decimales, mínimo 2000, máximo 366 días; `metric=units|amount` obligatoria; `method` opcional; extras/body → 400.
- Categoría **vigente** vía `Product.categoryId`; no hay snapshot histórico; la UI debe advertir reclasificación.
- Ventas pagadas brutas; agrupación por categoría actual; sin opciones/refunds/intentos; reembolsos no restan.
- DTO: `generatedAt`, `currency`, `period`, `method`, `metric`, `denominator{unitsSold,totalCents}`, `totalCategories`, `items[]{categoryId,name,isActive,unitsSold,totalCents,sharePercent}`; strings exactos; porcentaje half-up 2 decimales; base cero con ítems `"0.00"`, sin líneas `[]`.
- Conciliación exacta de unidades/importe con resumen; residuo de porcentajes no forzado a 100; orden métrica DESC, nombre `COLLATE "C"`, categoryId; todas las categorías con movimiento; inactivas incluidas con `isActive`; categoría no resoluble → fallo saneado.
- Solo ADMINISTRADOR; 401/403 incluido GERENTE; cabeceras/errores como contratos previos.

### Verificación

- `api:validate` OpenAPI válido, **70 ejemplos**; `prettier --check`, `check-doc-links` 286/0, `git diff --check` correctos; enlaces manuales 15/15.
- `format:check` falló solo por el temporal ajeno `tmp-e2-11-add.mjs`, ya movido fuera del repo; los archivos de E2-12 cumplen Prettier.
- Sin runtime/HTTP/BD/UI/CSV; implementación/coste corresponden a E2-13/14/15. Commit pendiente de autorización.

### Revisión independiente documental — 2026-11-25

`dashboard-reviewer`, solo lectura, sin ejecutar entorno ni modificar archivos: **sin bloqueantes documentales**; E2-13 puede iniciar. Comprobó ruta y `x-contract-status`, entrada estricta (`from`/`to` UTC 0–3 decimales, mínimo 2000, 366 días; `metric` obligatoria sin default; `method` opcional; extras/repetidos/arrays/body), DTO cerrado con patrones de strings y porcentaje, ejemplo canónico y vectores A–E, errores Problem Details, hechos de esquema (`Category`, `Product` sin `isActive`, `OrderItem`, `Sale`/`Payment`, `Refund`), inclusión de opciones en `lineTotalCents`, baja de categoría, ausencia de snapshot, inactivas/borradas/fallo saneado, base cero, orden `COLLATE "C"`, seguridad ADMINISTRADOR y no invasión de E2-13/14/15.

Observaciones editoriales aplicadas en el contrato el 2026-11-25, sin cambiar DTO, permisos ni semántica: cota del residuo expresada como **≤ `0.005 × n`** (no estricta), reserva de cabeceras alineada con el montaje privado temprano de `/api/v1/admin/dashboard` y la verificación prevista en E2-13 por integración con fallos inyectados, R18 desdoblada en R18a/R18b/R18c, nota de que `sales-by-category` era candidata y la ruta aceptada es `category-participation`, y precisión de que la base cero con ítems solo aplica a `metric=amount`. La cifra de 70 ejemplos y los comandos del autor **no** fueron reejecutados por el revisor y no se presentan como revalidados por él.

## TASK-DA-E2-13 — Backend de participación por categorías

Estado actual: **implementado y verificado por el autor el 2026-11-25; corrección de hallazgos O1/O2 aplicada; verificación independiente V-BE bloqueada por denegación de shell del verificador y revisión independiente pendiente; sin aceptación; sin commit.** Autor: `dashboard-backend-implementer`. No cierra E2 ni CSV; E2-14/15 y CSV no iniciados.

### Alcance implementado

- `GET /api/v1/admin/dashboard/category-participation` solo `ADMINISTRADOR`, con `authenticate`, `authorize` y `privateCashResponse` existentes; GET sin CSRF nuevo y body no vacío rechazado.
- Entrada estricta: `from` inclusivo/`to` exclusivo UTC `Z` con 0–3 decimales, mínimo `2000-01-01T08:00:00.000Z`, máximo 366 días absolutos; `metric=units|amount` obligatoria sin default; `method=CASH|STRIPE` opcional; extras, repetidos, arrays, vacíos y body → 400 sin truncar.
- Agrupación por `Product.categoryId` **actual** vía `OrderItem.productId`; incluye categorías inactivas con `isActive:false` y productos con baja lógica/no disponibles; no hay filtro de categoría.
- Unidades `SUM(quantity)` e importe `SUM(lineTotalCents)` históricos brutos; sin unir `OrderItemOption`, `Refund`, `PaymentEvent`, `PaymentIncident` ni reintentos; sin filtro defensivo de estado de pago (D11 de E2-04).
- DTO cerrado `generatedAt/currency/period/method/metric/denominator{unitsSold,totalCents}/totalCategories/items[]{categoryId,name,isActive,unitsSold,totalCents,sharePercent}`; IDs, conteos, importes y porcentajes como strings exactos, sin `Number`.
- Porcentaje calculado en backend con bigint: `centesimas = floor((valor*10000 + denominador/2) / denominador)`, formato de dos decimales, rango `0.00–100.00`; base cero con ítems `"0.00"` sin normalizar a 100; residuo no reasignado.
- Una sola lectura/CTE: `filtered_sales → line_totals → integrity + category_totals + denominator`, con `LEFT JOIN products/categories` para detectar integridad y sin N+1. Sin consultas previas extra por categoría.
- Categoría con `deletedAt` y movimiento, o línea sin producto/categoría resoluble (`inconsistentRows > 0`), produce error interno saneado; nunca categoría ficticia ni omisión silenciosa.
- OpenAPI: solo se corrigieron notas obsoletas de «no implementa runtime» y de verificación pendiente de cabeceras 413/429; **no** se cambiaron esquemas, rutas, DTO, ejemplos ni semántica aceptada.

### Archivos

- `backend/src/modules/sales/sales.validation.ts`: `salesCategoryParticipationQuery`.
- `backend/src/modules/sales/sales.read.repository.ts`: tipos y `categoryParticipation` (una CTE agregada).
- `backend/src/modules/sales/sales.service.ts`: `formatSharePercent` con bigint y `categoryParticipation` con conciliación/validación de integridad.
- `backend/src/modules/sales/sales.routes.ts`: ruta administrativa.
- `backend/tests/dashboard-categories.test.ts` (nuevo): validación, half-up, DTO, errores y SQL.
- `backend/tests/integration/dashboard-categories.integration.test.ts` (nuevo): 11 pruebas HTTP/PostgreSQL aislado (10 originales + baja lógica/no disponible por categoría actual, corrección O2).
- `backend/scripts/benchmark-dashboard-categories.ts` (nuevo): coste aislado fuera de `test`/integración.
- `backend/docs/api/openapi.yaml`: descripciones de implementación/cabeceras; sin cambios de esquema.
- Sin cambios de `app.ts`, `schema.prisma`, migraciones, dependencias, `/sales`, resumen E1, UI, CSV ni snapshots.

### Matriz RF/RNF → prueba (E2-13 aplicable)

| Criterio | Evidencia ejecutada |
| --- | --- |
| R01 método omitido, DTO cerrado y todas las categorías con movimiento | Integración core; conformidad Ajv/OpenAPI 200; `method:null` |
| R02 `metric` obligatoria/`units`/`amount`/inválida | Unitarias de esquema + integración estricta (400) y casos `units`/`amount` |
| R03 límites UTC, 0–3 decimales, mínimo 2000, 366 días, `from`/`to−1 µs`/`to`, µs preservados | Unitarias de fechas/rango + integración precisión (`to−1 µs` con `sold_at` de 6 decimales) y rechazos |
| R04 extras, repetidos, arrays, vacíos, body, cursor inexistente | Integración estricta (400) |
| R05 reclasificación cambia grupo sin cambiar total | Integración: producto movido de categoría; solo categoría nueva, importe/unidades iguales; además, producto con `deletedAt`/`isAvailable=false` agregado por su `Product.categoryId` actual (corrección O2) |
| R06 precio actual no altera histórico | Integración: `basePriceCents` actualizado tras la venta; línea conserva `lineTotalCents` 9000 |
| R07 opciones sin multiplicar; varios pagos | Integración: línea con `OrderItemOption` cuenta 2 unidades/9000 una vez; pagos no se unen |
| R08 reembolso bruto | Integración: `Refund` 1000 no reduce 2000 de la línea |
| R09 método por subconjunto sin duplicar | Integración CASH/STRIPE: denominadores y ítems concilian con `/admin/dashboard/summary` y `/sales/summary` |
| R10 conjunto completo, `totalCategories`=longitud, sin ceros de relleno | Integración core y referencia SQL independiente; categorías sin movimiento no aparecen |
| R11 porcentajes half-up 1/6, 1/8, tercios, exactos | Unitarias (1/6, 1/8, 1/3, 2/3, tie 1/32, 100.00, 0.00) e integración 1/6 y 1/8 |
| R12 residuo sin forzar 100 | Unitaria tercios 99.99; integración conserva valores del contrato |
| R13 cero, base cero con ítems, inactiva incluida | Integración: rango sin ventas `[]`/`"0"`; base cero `amount` conserva ítems `0.00`; inactiva `isActive:false` |
| R14 categoría borrada / línea no resoluble | Integración: categoría con `deletedAt` y movimiento → 500 saneado con cabeceras; línea sin producto no sembrable bajo FK `Restrict`, cubierta por unitaria de `inconsistentRows` |
| R15 empates, nombres iguales, mayúsculas/acentos, ID numérico | Integración orden métrica DESC, `COLLATE "C"` (`A < Mismo < a < Á`) y mismo nombre por ID ascendente; repetible |
| R16 IDs/importes exactos sin `Number` | Unitarias con valores >2^53; integración con IDs de categoría >2^53 exactos; suma/orden bigint |
| R17 roles, cabeceras y body | Integración 401; 403 CLIENTE/CAJERO/PREPARACION/GERENTE/PIN; 200 ADMIN; `no-store`/`no-referrer` en 200/400/401/403; Origin |
| R18a 413/429/500/503 | Integración con fallos inyectados y body sobredimensionado; cabeceras privadas y Problem Details saneados |
| R18b lectura coherente, N+1, coste | Una consulta agregada medida + 5 revalidaciones de actor; benchmark aislado; sin índices ni migraciones |
| R18c fallo parcial de UI | Fuera de alcance backend; corresponde a E2-14 |

### Comandos ejecutados y resultados reales

| Comando | Resultado |
| --- | --- |
| `npm.cmd exec -- vitest run tests/dashboard-categories.test.ts` | **18/18** unitarias correctas |
| `npm.cmd test -- --run` | **188 correctas / 189 omitidas** (16 archivos pasan, 11 omiten integración); corrida final tras el último ajuste de la prueba de integración |
| `npm.cmd run typecheck` | Correcto |
| `npm.cmd run lint` | Correcto |
| `npm.cmd run build` | Correcto |
| `npm.cmd run format:check` | Correcto tras `prettier --write` solo en los dos archivos nuevos de prueba |
| `npm.cmd run api:validate` | OpenAPI válido; **70 ejemplos** conformes |
| `npm.cmd run db:validate` | Esquema Prisma válido |
| `node scripts/check-doc-links.mjs` | 286 enlaces locales revisados; 0 inexistentes |
| `node --env-file=.env.docker scripts/verify-database.mjs` | PostgreSQL 17.11; **22 comprobaciones correctas**; mutantes C01–C04 detectados |
| `npm.cmd run test:integration` | Todos los archivos pasan; nueva suite **10/10** (19, 34, 13, 22, 20, 20, **10**, 9, 15, 9, 18 por archivo). Tras la corrección O2 la suite quedó en **11/11**; ver corrección de hallazgos |

### Coste medido (benchmark aislado, no SLA)

- `node --env-file=.env.docker --import tsx scripts/benchmark-dashboard-categories.ts`; base temporal creada, migrada, sembrada y eliminada (`cleanup:true`).
- Volumen: **20 000 ventas** (6 666 CASH / 13 334 STRIPE), 30 días, **120 productos**, **8 categorías**, **30 000 líneas**, 1–2 líneas por venta.
- Medianas: `units` **93.97 ms** (min 93.54, max 98.55), `amount` **93.80 ms** (min 91.09, max 94.45).
- Por corrida: **1 agregación** (~83–85 ms) + 5 revalidaciones de actor + COMMIT; `EXPLAIN (ANALYZE, BUFFERS)` ~**99.2/99.9 ms**, 0 lecturas compartidas, joins por índice de productos y hash de categorías; sin índices nuevos.
- **100 000 ventas y 366 días no medidos**; cualquier proyección es extrapolación no medida. No se fija SLA.

### Omitidos, límites y residuales

- No hay verificación independiente, revisión independiente ni aceptación; este registro es la declaración del autor y no las sustituye.
- Las sumas de unidades/importes >2^53 no se sembraron de extremo a extremo porque `orders_check_1` limita `orders.total_cents` a 9 999 900 y `quantity` está acotada por constraint; se cubren con unitarias/servicio y con IDs de categoría >2^53 en integración. La proyección de importes grandes del contrato sigue siendo aritmética/documental.
- La línea sin producto/categoría resoluble no es montable bajo FK `Restrict`; la defensa se prueba en la unitaria del servicio y el caso de categoría borrada en integración.
- 413/429/500/503 se prueban con fallos inyectados, no caos live.
- Cabeceras privadas comprobadas en 400/401/403/413/429/500/503 representativos, no en todos los 400 de validación.
- No se probó UI, CSV, Electron ni entorno real; no se modificaron contratos existentes.
- OpenAPI no vuelve a declarar aceptación del contrato: E2-12 sigue siendo la aceptación documental; E2-13 no se autoaprueba.

### Comparación con el contrato aceptado

Se implementaron R01–R18a/b en el alcance backend y se mantuvieron las decisiones D01–D10 sin cambios. R18c es frontend. La conciliación de unidades se hizo contra `/api/v1/admin/dashboard/summary` porque `/api/v1/sales/summary` solo admite CAJERO/GERENTE y no expone unidades; el importe se concilió además contra `/api/v1/sales/summary` con sesión CAJERO en el mismo dataset estable. No se amplió el alcance de `/sales` ni se añadió filtro de categoría.

### Corrección de hallazgos de verificación V-BE (2026-11-25)

La verificación independiente **V-BE quedó bloqueada**: el verificador no pudo ejecutar comandos porque su shell fue denegado. Las cifras de esta sección son **del autor** y no sustituyen la verificación ni la revisión independientes. Sin commit, push, E2-14/15 ni CSV.

- **O1 (nota documental OpenAPI):** en la descripción de `/api/v1/admin/dashboard/category-participation` se alineó el residuo de `sharePercent` con la redacción aceptada del contrato (`E2-categories-contract.md:287,371`): cada porcentaje se desvía **hasta 0.005** puntos y la suma **hasta 0.005 × n** puntos porcentuales, con **cota inclusiva** (antes decía «menos de»/«menor que», estricta). No se cambiaron esquemas, patrones, ejemplos ni semántica.
- **O2 (prueba de integración):** se añadió un caso ejecutado en `backend/tests/integration/dashboard-categories.integration.test.ts` que siembra dos productos, crea su venta y después aplica `deletedAt` no nulo, `isAvailable=false` y un cambio de `categoryId` sobre uno de ellos. La respuesta agrega las tres unidades y 5000 centavos bajo la **categoría actual**, no bajo la anterior, demostrando que `Product.deletedAt`/`isAvailable` no filtran el universo. La fixture usa el runner aislado existente, sin reset, bases reales ni migraciones; no se relajó ninguna aserción ni se alteró el resto de la suite. Criterio asociado: R05/R13 (categoría actual y elegibilidad).

| Comando | Resultado (autor) |
| --- | --- |
| `npm.cmd exec -- vitest run tests/dashboard-categories.test.ts` | **18/18** unitarias correctas |
| `npm.cmd run test:integration` | Todos los archivos pasan; `dashboard-categories` **11/11** (19, 34, 13, 22, 20, 20, **11**, 9, 15, 9, 18 por archivo) |
| `npm.cmd run format:check` | Correcto |
| `npm.cmd run api:validate` | OpenAPI válido; **70 ejemplos** conformes |
| `npm.cmd run typecheck` | Correcto |

Pendiente: V-BE independiente (bloqueada por denegación de shell), revisión independiente y aceptación. No se autoaprueba el contrato ni la tarea.

### Ejecución V-BE por el coordinador tras el bloqueo del verificador — 2026-11-25

El verificador independiente quedó bloqueado dos veces por `permission.rejected — Permission denied: shell`; no se rodeó la denegación. Para no cerrar sin evidencia ejecutada, el **coordinador** ejecutó la batería autorizada y la registra como evidencia propia, **no como verificación independiente**.

| Comando (backend, Node 22.14.0) | Resultado real |
| --- | --- |
| `npm.cmd run format:check` | Correcto; todos los archivos cumplen Prettier |
| `npm.cmd run typecheck` | Correcto |
| `npm test` | **188 correctas / 190 omitidas** (16 archivos pasan, 11 omiten integración) |
| `npm.cmd run lint` | Correcto |
| `npm.cmd run build` | Correcto |
| `npm.cmd run api:validate` | OpenAPI válido; **70 ejemplos** conformes |
| `npm.cmd run db:validate` | Esquema Prisma válido |
| `npm.cmd run test:integration` | **11 archivos, todos correctos**: 19, 34, 13, 22, 20, 20, **11 (dashboard-categories)**, 9, 15, 9 y 18; total **190** |
| raíz: `git diff --check` | Correcto; solo avisos LF→CRLF de archivos ya modificados |
| raíz: `git status --short` | Modificados los archivos propios de E2-13 más los de E2-10/11/12; nuevos: `benchmark-dashboard-categories.ts`, `dashboard-categories.test.ts`, `dashboard-categories.integration.test.ts`, `dashboard-no-movement-acceptance.spec.ts`. Sin cambios en `app.ts`, `schema.prisma`, migraciones, dependencias ni `package.json` |

`db:verify` no se reejecutó en esta corrida (el autor lo registró con salida externa y 22 comprobaciones); no se presenta como evidencia nueva del coordinador. El benchmark de coste no se reejecutó: siguen vigentes las medianas del autor (20 000 ventas, 8 categorías, ~93.8–94.0 ms), no un SLA.

Con esta ejecución, V-BE cuenta con evidencia real (del coordinador) y la verificación independiente nominal sigue **no acreditada**; la revisión independiente se registra a continuación.

### Revisión independiente y cierre técnico de E2-13 — 2026-11-25

`dashboard-reviewer`, solo lectura (su shell también quedó denegado y no lo rodeó): **sin bloqueantes técnicos de contrato ni de código**. Confirmó por lectura ruta/rol ADMINISTRADOR sin CSRF nuevo, entrada estricta, microsegundos, agrupación por categoría actual con inactivas y productos dados de baja/no disponibles, `SUM(quantity)`/`SUM(lineTotalCents)` sin multiplicadores ni reembolsos, método por subconjunto y conciliación, cero y base cero, orden `COLLATE "C"`, `totalCategories`, half-up bigint sin normalizar, 500 saneado por integridad, una sola lectura sin N+1, roles y cabeceras, y ausencia de UI/CSV/esquema/migraciones/dependencias.

Residuales registrados, no bloqueantes: verificación independiente nominal no acreditada (evidencia del coordinador), diff completo no reejecutado por el revisor, coste solo a 20 000 ventas/8 categorías sin 100k ni 366 días, sumas >2^53 no sembradas de extremo a extremo por constraints, línea sin producto resoluble solo en unitaria, wiring con `adminService` no ejercitado en integración, `db:verify` no reejecutado en la corrida del coordinador, y casos 400 de JSON malformado / propiedad general del residuo / espía de agregado en 401-403 no dedicados.

**Estado: TASK-DA-E2-13 CERRADA TÉCNICAMENTE el 2026-11-25, con la salvedad de que la verificación independiente nominal no se acreditó y la evidencia ejecutada es del coordinador; sin commit autorizado.** No cierra E2; el cierre sigue siendo CSV-03.

## TASK-DA-E2-14 - Frontend de participación por categorías

Estado actual: **implementado y verificado por el autor el 2026-11-25; corrección de hallazgos de revisión F1/P1/P2/R2/R3 aplicada el 2026-11-25; verificación independiente y revisión independientes pendientes; sin aceptación; sin commit.** Autor: `frontend-implementer` por encargo del coordinador. No inicia E2-15 ni CSV; E2 sigue abierto hasta CSV-03.

### Alcance implementado

- `categoriesApi.ts`: adaptador estricto de `GET /admin/dashboard/category-participation` con `from`/`to` UTC 0-3 decimales, mínimo 2000, 366 días, `metric` obligatoria `units|amount` y `method` opcional `CASH|STRIPE`; rechaza extras (`category`, `categoryId`, `top`, `direction`, `limit`, `cursor`, etc.), arrays y valores vacíos antes de HTTP.
- Parser del DTO cerrado con envoltura `{data}`: `generatedAt`, `currency`, `period`, `method`, `metric`, `denominator`, `totalCategories` e `items`; strings exactos sin `Number` para IDs, unidades, importes y porcentajes; rechaza patrones inválidos, porcentaje fuera de rango, orden incompatible (métrica desc, nombre COLLATE "C", `categoryId` numérico), IDs duplicados, sumas de ítems distintas al denominador, `totalCategories` distinta de `items.length`, periodo/método/métrica distintos a los solicitados y base cero con `sharePercent` distinto de `0.00`.
- `CategoryParticipation.tsx`: panel integrado en `DashboardSummary` con advertencia visible y accesible (`role="note"`) de categoría vigente/reclasificación histórica, selector de métrica obligatorio en API, eco de periodo/método/métrica, denominador y unidad inequívocos, distribución visual con el string de porcentaje recibido (sin recalcular), tabla accesible con caption/headers/rowheaders y región desplazable nombrada y focalizable, estados de carga/error/DTO inválido/cero/sin base por panel, fallo parcial aislado, cancelación y descarte de respuestas antiguas, sin polling.
- Integración acotada en `admin/dashboard/DashboardSummary.tsx`; estilos en `src/styles/base.css` reutilizando tokens y estructura de los paneles E2; fixture de pruebas `src/test/categoryFixture.ts`; mocks de paneles existentes actualizados para mantener sus suites deterministas.
- Sin dependencias, backend, contrato, OpenAPI, migraciones, CSV, filtro de categoría en rutas antiguas ni cliente HTTP/sesión nuevos.

### Criterios y evidencia ejecutada

| Criterio | Evidencia ejecutada |
| --- | --- |
| Advertencia visible y accesible de categoría vigente/reclasificación | Componente: `role="note"` con nombre accesible y texto completo. E2E: visible en 1280/768/390 y en la suite de accesibilidad del dashboard. |
| Métrica obligatoria, método opcional y propagación de periodo/método | Unitarias de query; componente y E2E verifican `metric` siempre y `method` solo cuando aplica; sin `category`/`categoryId`. |
| Denominador/unidad inequívocos y porcentajes backend sin recalcular ni normalizar | Componente y E2E comprueban 72.22/20.83/6.94, 66.67/25.00/8.33 y el residuo 33.33×3 = 99.99 tal cual; sin `100.00` forzado. |
| Base cero con ítems y cero `[]` | Componente/E2E: «sin base» usando `denominator` y estado vacío explícito sin tabla. |
| Parser estricto, bigint e inválidos | Unitarias: éxito, cero, base cero, >2^53 y >19 dígitos, redondeo, inactivas, orden, patrones, sumas, periodo/método/métrica y respuestas antiguas/abort. |
| Fallo parcial, 401/403/429/503, sin reintentos ni polling | Componente: alerta aislada y `DashboardSummary` conserva series/ranking; E2E: panel caído mantiene resumen/series/ranking y no reintenta; sin peticiones antes de la guarda administrativa. |
| Tabla accesible, teclado, foco y axe | Región nombrada y `tabIndex=0` con `:focus-visible`; E2E recorre con Tab, verifica foco/outline, scroll horizontal con ArrowRight y axe WCAG 2.1 A/AA sin violaciones en 1280/390 y, desde la corrección F1, también a 768 px dentro de la captura V-VIS. |

### Archivos

- `frontend/unified/src/features/terminal/admin/analytics/{categoriesApi.ts,categoriesApi.unit.test.ts,CategoryParticipation.tsx,CategoryParticipation.component.test.tsx}`.
- `frontend/unified/src/test/categoryFixture.ts` (fixture contractual de pruebas).
- `frontend/unified/src/features/terminal/admin/dashboard/DashboardSummary.tsx` y `DashboardSummary.component.test.tsx` (integración y fallo parcial).
- `frontend/unified/src/features/terminal/admin/analytics/{SalesSeries,ProductRanking}.component.test.tsx` y `frontend/unified/e2e/{admin,accessibility,dashboard-series,dashboard-ranking,dashboard-no-movement}.spec.ts` (mocks del nuevo panel para conservar suites).
- `frontend/unified/src/styles/base.css`.
- `frontend/unified/e2e/dashboard-categories.spec.ts`.

### Comandos ejecutados y resultados reales (frontend/unified)

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Correcto |
| `npm.cmd run lint` | Correcto |
| `npm.cmd test` | **44 archivos, 720 pruebas correctas** (tras la corrección de hallazgos) |
| `npm.cmd exec -- vitest run <categoriesApi.unit|categoriesApi.component|DashboardSummary.component>` | **107/107 antes de la corrección**; `categoriesApi.unit` **80/80** tras la corrección |
| `npm.cmd run build` | Correcto; aviso existente de chunk >500 kB, sin error |
| `npm.cmd run test:e2e` | **89/89 correctas** (incluye 9 nuevas de categorías y accesibilidad del dashboard) |

### Corrección de hallazgos de revisión (2026-11-25)

Corrección aplicada dentro de E2-14: sin nueva capacidad, backend, CSV, dependencias ni commit. La verificación independiente nominal (`dashboard-verifier`) y la revisión independiente (`dashboard-reviewer`) siguen **no acreditadas**; este registro es evidencia del autor.

- **F1 (media): axe a 768 px.** En `e2e/dashboard-categories.spec.ts`, el caso de capturas V-VIS fija `768x1024` y ejecuta `expectNoViolations(page)` con el helper existente (tags WCAG 2.1 A/AA, sin exclusiones de reglas ni targets). Así el panel queda cubierto por axe a 1280, 768 y 390 px.
- **P1 (baja): 366 días exactos.** `categoriesApi.unit.test.ts` acepta y parsea el rango `2000-01-01T08:00:00.000Z`–`2001-01-01T08:00:00.000Z`; el rechazo de 366 días + 1 ms se conserva.
- **P2 (baja): desempate final por `categoryId`.** La fixture `tieBreakCategoryItems` usa misma métrica (`unitsSold: "5"`) y mismo nombre (`Empate`) con IDs `10` y `9007199254740993` (> 2^53); el parser acepta el orden numérico ascendente y porcentajes `50.00`.
- **R2 (baja): nombre en code points.** `boundedText` mide `[...value].length` para alinearse con `maxLength: 120` de OpenAPI/JSON Schema. Los nombres válidos existentes no se rechazan (el conteo en code points es menor o igual al de unidades UTF-16); una prueba acepta 120 caracteres astrales y rechaza 121.
- **R3 (documental): ruta real de capturas.** Ver la sección V-VIS para la ruta producida por `test.info().outputPath` y la copia a `%TEMP%`.

| Comando (frontend/unified) | Resultado real |
| --- | --- |
| `npm.cmd exec -- vitest run src/features/terminal/admin/analytics/categoriesApi.unit.test.ts` | **80/80 correctas** |
| `npm.cmd run lint` | Correcto |
| `npm.cmd run typecheck` | Correcto |
| `npm.cmd test` | **44 archivos, 720 pruebas correctas** |
| `npm.cmd run test:e2e -- e2e/dashboard-categories.spec.ts` | **9/9 correctas** |
| `npm.cmd run test:e2e` | **89/89 correctas** |
| raíz: `git diff --check` | Correcto (`exit 0`); solo avisos LF→CRLF de archivos ya modificados |

### V-VIS y pendientes

- Capturas generadas por la suite E2E con datos de fixture mediante `test.info().outputPath(...)` en `frontend/unified/test-results/dashboard-categories-TASK--17c43-8-px-for-the-category-panel-chromium/` (ruta relativa a la raíz del repositorio; la carpeta la deriva Playwright del título del caso y puede cambiar si cambia el título): `dashboard-categories-1280x900.png`, `dashboard-categories-768x1024.png` y `dashboard-categories-390x844.png`. No se versionan.
- Copia real a `C:\Users\angel\AppData\Local\Temp\opencode\da-e2-14\captures\` (`%TEMP%\opencode\da-e2-14\captures\`) desde `frontend/unified`: `$src = '.\test-results\dashboard-categories-TASK--17c43-8-px-for-the-category-panel-chromium\*.png'; $dst = Join-Path $env:TEMP 'opencode\da-e2-14\captures'; Copy-Item -Path $src -Destination $dst -Force`. Los tres PNG copiados conservan los tamaños de la carpeta de salida (80973, 75974 y 44055 bytes). No se versionan.
- **V-VIS humana queda pendiente de E2-15:** no se registra aceptación visual del responsable ni comparación con el baseline E1/paneles E2 aceptados.
- **V-REAL queda pendiente de E2-15:** no se ejecutó API/BD real ni Electron; MSW/E2E simulado no acredita aceptación real.
- Limitación de entorno: una instancia previa de Vite en `:5173` sirvió un módulo transformado obsoleto durante la primera corrida E2E; se detuvo ese proceso de desarrollo y la corrida limpia con el servidor reiniciado pasó 89/89. No fue un fallo de código ni se modificó configuración.
- Sin verificación independiente (`dashboard-verifier`) ni revisión independiente (`dashboard-reviewer`) ejecutadas; ambas quedan pendientes. Sin commit autorizado.

### Verificación del coordinador y re-revisión independiente — cierre técnico E2-14

Procedencia: el verificador independiente `dashboard-verifier` quedó **bloqueado por `permission.rejected — Permission denied: shell`** en su primer comando, sin reintento ni rodeo. La ejecución real la realizó el **coordinador** y se registra como evidencia del coordinador, **no** como verificación independiente.

| Comando (coordinador, `frontend/unified`; Node 22.14.0) | Resultado real |
| --- | --- |
| `npm.cmd run lint` | Correcto |
| `npm.cmd run typecheck` | Correcto |
| `npm.cmd test` | **44 archivos, 720 pruebas correctas** |
| `npm.cmd run test:e2e -- e2e/dashboard-categories.spec.ts` | **9/9 correctas** |
| `npm.cmd run test:e2e` (antes de la corrección) | **89/89 correctas** |
| `npm.cmd run build` (antes de la corrección) | Correcto; el `code 1` de PowerShell provino solo del aviso de chunk >500 kB emitido por stderr, no de un fallo de compilación |
| raíz: `git diff --check` | Correcto; solo avisos LF→CRLF |

Re-revisión `dashboard-reviewer` (solo lectura, shell también denegado y no rodeado): **F1/P1/P2/R2/R3 cerrados, sin bloqueante nuevo de código**. Confirmó axe sin exclusiones a 768×1024 además de 1280 y 390, el rango válido de exactamente 366 días junto al rechazo de 366 días + 1 ms, el desempate por `categoryId` numérico con ID >2^53, la medición de `name` en code points (120 astrales aceptados, 121 rechazados) y la ruta real de capturas con su copia a `%TEMP%`. No observó regresión en fixtures existentes ni debilitamiento de aserciones previas.

Riesgos residuales no bloqueantes: la pareja `'10'`/`'9007199254740993'` no discrimina por sí sola la comparación lexicográfica (el código usa `BigInt`, correcto); las alturas del axe a 1280/390 no coinciden exactamente con las de las capturas (1280×720 y 390×900 frente a 1280×900 y 390×844); las capturas no se comparan contra un baseline automático; y la verificación independiente de ejecución sigue sin acreditarse.

**Estado: TASK-DA-E2-14 CERRADA TÉCNICAMENTE el 2026-11-25 con la salvedad de que la verificación independiente de ejecución no se acreditó (evidencia del coordinador) y con V-VIS/V-REAL humanas pendientes de E2-15; sin commit autorizado.** No cierra E2; el cierre sigue siendo CSV-03.

## TASK-DA-E2-15 — Aceptación real de participación por categorías

Estado actual: **EN CURSO / NO ACEPTADA, 2026-11-25; sin commit.** Autor de esta ejecución: subagente ejecutor. Verificación y revisión independientes, V-VIS humana y aceptación funcional del responsable **siguen pendientes**; este registro no las sustituye. No inicia CSV-00…03 ni cierra E2.

### Alcance, entorno y límites respetados

- Únicos cambios de producto: ninguno. Se añadieron `frontend/unified/e2e-live/dashboard-categories-acceptance.spec.ts`, la sección E2-15 de `frontend/unified/e2e-live/README.md`, y este estado en `validation.md`/`tasks.md`. Sin contratos, OpenAPI, esquema, migraciones, dependencias, CSV ni commit.
- Entorno autorizado: Docker `cafeteria-local-postgres-1` (PostgreSQL **17.11**), base dedicada `cafeteria_da_e2_07`, backend `http://localhost:3000`, Vite `http://localhost:5173`. El backend en ejecución se había iniciado antes de la ruta E2-13 y devolvía 404; se reinició con un wrapper externo que conserva la base QA (`e2-15-run.mjs`), sin leer/imprimir `.env`, sin reset/reseed ni cambios de código.
- No se leyeron ni imprimieron `.env`, contraseñas, cookies ni tokens. El manifiesto QA se consume programáticamente y no se imprime ni se versiona; contiene credenciales QA en claro, vive fuera del repositorio y **debe borrarse o rotarse tras la corrida** (este registro no afirma que ya se haya hecho). No se ejecutaron `removed-*`, resets, reseeds ni acciones destructivas.
- Scripts QA externos (no versionados) en `C:\Users\angel\AppData\Local\Temp\opencode\da-e2-15\`: `e2-15-fixtures.mjs`, `e2-15-originals.mjs`, `e2-15-oracle.mjs`, `e2-15-stability.mjs`; guarda de aplicación única `e2-15-extension-private.json`.

### Fixtures QA sintéticas (solo INSERT + una mutación controlada)

- Preflight antes de escribir: `current_database() = cafeteria_da_e2_07`, producto 7, categoría 2, venta 1, categoría 4 inactiva, producto 33, categoría 5 borrada y producto 34; baseline **45 productos/10 ventas/1 reembolso/5 categorías** y 12 productos de la extensión E2-11. La transacción repitió las guardas y cardinalidades bajo locks breves; se rechazó cualquier base/dataset distinto.
- `--apply` una sola vez: **+14 productos, +6 categorías, +16 ventas**, **1 UPDATE controlado** de `products.category_id` sobre el producto sintético reclasificado (de categoría 1 a 3) después de su venta. La secuencia «venta → reclasificación» la acredita el script externo `e2-15-fixtures.mjs` —INSERT de la venta y después `UPDATE` de `category_id`—, no el oráculo; `e2-15-oracle.mjs` solo lee el estado actual resultante. Sin cuentas nuevas, proveedores, sesiones prefabricadas ni cambios de filas QA existentes.
- Dataset resultante: **59 productos/26 ventas/1 reembolso/11 categorías**. Huella de filas originales (productos ≤45, categorías ≤5, ventas ≤10, sus órdenes/pagos/líneas) idéntica antes/después: `b2706e5987383bd91d7fe309edae5666f62574f2159808918e27619cec26bdb9`.
- Casos materializados: (a) reclasificación real post-venta con control en la categoría anterior; (b) categoría inactiva `is_active=false`/`deleted_at` nulo con movimiento; (c) base cero `metric=amount` con líneas de importe 0 (`unit_price_cents=0`, `line_total_cents=0`, quantity≥1, permitido por constraint); (d) categoría con `deleted_at` no nulo vinculada a una línea, aislada en un rango de 2010 para el 500 saneado; (e) rango sin ventas, empates y nombres `A/B/Empate/a/Á`, además de tercios para el residuo.
- **No se usaron mocks ni intercepción** en la suite live.

### Oráculo independiente y estabilidad

- `e2-15-oracle.mjs` es SQL/Node externo, `REPEATABLE READ READ ONLY`; no importa backend/repositorio ni consulta el endpoint. Agrupa por `Product.categoryId` actual, ordena por métrica DESC, `name COLLATE "C"` y `categoryId` numérico, y calcula `sharePercent` half-up con `BigInt`. Compara además que `Σ order_items.line_total_cents = Σ sales.total_cents`.
- **42 escenarios = 14 rangos × 3 métodos** (omitido/CASH/STRIPE), con `itemsUnits`, `itemsAmount` y `summary` completos. El manifiesto también incorpora hechos de fixtures (categoría actual/original, ventas, borrada/inactiva, importes) y las cuentas QA existentes de forma opaca.
- Relectura posterior a todas las corridas: huella de originales sin cambios; SHA256 de escenarios+fixtures **`c8d43cac63391386466e938e0a598bf0169c67fbc6e3a08d071526ec72020314`**, estable.

### Matriz RF → prueba real / resultado

| RF / criterio | Escenario real | Resultado |
| --- | --- | --- |
| R01/R09/R10/R11 (RF-12/14) | 39 escenarios 200 × `metric=units|amount`; tres métodos; DTO cerrado | **13 live correctas**; DTO, denominadores, ítems y porcentajes idénticos al oráculo |
| R09 conciliación | Todos los cortes 200 contra `/admin/dashboard/summary` y `/sales/summary` con CAJERO | Unidades, tickets, totales y mezcla CASH/STRIPE exactos |
| R05/R06 (RF-14) | Producto sintético vendido en categoría 1 y reclasificado a 3 | Historial bajo categoría 3; categoría 1 solo conserva el control; total 10000 sin cambio; advertencia UI visible |
| R13 inactiva/baja | Categoría 4 `isActive=false`, `deletedAt=null` con 1500 cts | Incluida con `isActive:false`; UI muestra «Inactiva» y 50.00 % |
| R12/R13 base cero y residuo | Líneas con importe 0; tres tercios | `denominator.totalCents="0"` con ítems y `sharePercent="0.00"`; UI «sin base»; tercios `33.33×3=99.99`, sin normalizar |
| R13 cero real | Rango 2000 sin ventas | `items:[]`, denominadores `"0"`, `totalCategories:"0"`, UI sin tabla |
| R15 orden/empates/acentos | `QA E215 A/B/Empate/Empate/a/Á` | Orden SQL exacto; mismo nombre desempata por `categoryId` numérico; repetible |
| R03 precisión y bordes (RF-03) | `micro-left/center/right`, mínimo 2000, máximo 366 días | `from` incluido, `to−1 µs` incluido, `to` excluido; +1 ms sobre 366 días y `from` anterior a 2000 → 400 |
| R02/R04/R17 entrada | Extras, repetidos, arrays, `metric` ausente/inválida, `method` inválido/vacío, body, 4–6 decimales, `from>=to`, Origin; filtro `category`/`categoryId` contra rutas antiguas | Todos 400/403 con Problem Details y cabeceras privadas; 0–3 decimales normalizados aceptados; `GET /admin/dashboard/summary` (ADMINISTRADOR) y `GET /sales/summary` (CAJERO) rechazan `category`/`categoryId` con 400 `VALIDATION_ERROR` saneado |
| R14 categoría borrada | Rango 2010 con línea de categoría 5 | API **500 INTERNAL_ERROR** saneado; UI muestra error aislado del panel y conserva resumen/mezcla |
| R17 roles | Anónimo; CAJERO/PREPARACION; CLIENTE/GERENTE/PIN | 401 y 403 `FORBIDDEN`/`PIN_CHANGE_REQUIRED`; guardas sin GET administrativos; `localStorage` vacío |
| C-UI (RF-03/19) | Cambio rápido de métrica/método, teclado, logout | **4 solicitudes / 3 `requestfailed` con texto real `net::ERR_ABORTED`**; la única respuesta completada es la final aplicada; foco de tabla y logout/401 correctos |
| C-VIS/REAL (RNF-04/05/07) | Axe y capturas 1280/768/390; Electron | Axe WCAG 2.1 A/AA **sin violaciones**; tabla enfocable con scroll real a 390; Electron con `terminalOnly`, `nodeIntegration=false`, `contextIsolation/sandbox/webSecurity=true` |
| R18b (RNF-06) | `maximum` 366 días | Coste HTTP observado **32 ms** (59 productos/26 ventas); no es SLA ni benchmark representativo |

### Comandos ejecutados y resultados reales

| Directorio / comando | Resultado |
| --- | --- |
| Externos: `node e2-15-originals.mjs --record`; `node e2-15-fixtures.mjs`; `--apply`; `e2-15-originals.mjs`; `e2-15-oracle.mjs`; `e2-15-stability.mjs` | Guardas correctas, ampliación única, 42 escenarios y estabilidad SHA256 correcta |
| FE: `npm.cmd run lint`, `npm.cmd run typecheck` | Correctos |
| FE: `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution bundler --types node,vite/client e2e-live/dashboard-categories-acceptance.spec.ts src/app/desktop.ts` | Correcto |
| FE: `npm.cmd run test` | **44 archivos, 720/720** |
| FE: `npm.cmd run test:e2e` | **89/89** (suite simulada; no sustituye live) |
| FE: `npm.cmd run build` | Correcto; aviso existente de chunk >500 kB |
| FE live dirigido (`E2E_LIVE=1`, manifiesto `...\da-e2-15\e2-15-manifest.json`) | **13 correctas / 1 omitida explícita, 23.2 s**, sin mocks ni intercepción |
| BE: `npm.cmd run format:check`, `typecheck`, `lint`, `build` | Correctos |
| BE: `npm.cmd test` | **188 correctas / 190 omitidas** por diseño |
| BE: `npm.cmd run api:validate` | OpenAPI válido; **70 ejemplos** |
| BE: `npm.cmd run db:validate` | Esquema Prisma válido |
| BE: `npm.cmd run test:integration` | **190/190** en 11 archivos; incluye `dashboard-categories` 11/11 |
| raíz: `git diff --check` | Correcto (solo avisos LF→CRLF) |
| raíz: `node backend/scripts/check-doc-links.mjs` | **286 enlaces, 0 inexistentes** (fragmentos no comprobados) |

Correcciones de arnés durante la ejecución, sin cambios de producto: la columna de participación es la cuarta `td` (no la quinta) y el rango UI de categoría borrada usa el offset real de junio (PDT, `07:00Z`), no un `08:00Z` fijo. El 404 inicial fue un backend de desarrollo obsoleto, resuelto al reiniciarlo sobre la misma base QA.

### Capturas y evidencia visual

- Ruta externa: `C:\Users\angel\AppData\Local\Temp\opencode\da-e2-15\captures\`.
- `categories-1280.png` (76326 B, viewport 1280×900), `categories-768.png` (78154 B, 768×900), `categories-390.png` (68618 B, 390×1600 para evitar el artefacto de costura de elementos fijos), `categories-electron-1280.png` (76632 B).
- Capturas **recortadas al panel**, sanitizadas: solo catálogo QA sintético (nombres/IDs), métricas agregadas y advertencia; sin usuario, cookies, QR, tickets ni ventas. La captura de 390 muestra foco visible en la región de tabla y `skip-link` fuera del viewport (`bottom=-29`, `transform=-74`), sin ocultarlo por CSS.
- **No son aceptación humana**: V-VIS y la comparación con el baseline E1/paneles E2 aceptados quedan para el responsable.

### Omitidos, límites y defectos

- **Omitido explícito (no aprobado):** 413/429/503, DTO inválido live, expiración/refresh y multipestaña. No se indujo caos, saturación de rate limit, revocación de sesiones ni se heredó la excepción de series E2-03.
- Límites: dataset QA pequeño; coste observado **32 ms** no es SLA; 100k ventas/366 días no medido; las capturas no se comparan automáticamente contra un baseline; la base cero con ítems solo aplica a `metric=amount` (quantity≥1 por constraint).
- **Defectos de producto hallados en E2-15: ninguno.** El 404 inicial y los dos ajustes de aserción fueron entorno/arnés, no runtime. No se modificó producto, contrato, OpenAPI ni datos históricos existentes.
- Verificación y revisión independientes **no ejecutadas** en esta unidad; V-VIS/V-REAL humana y aceptación funcional **pendientes**.

### Corrección de residuales de revisión — 2026-11-25

Cambios de arnés/documentación dentro de la misma tarea; sin tocar producto/runtime, contratos, OpenAPI, esquema, migraciones, dependencias ni CSV. Sin commit.

- **R1 (carrera/cancelación):** la suite acumula ahora `request.failure()?.errorText` y exige que al menos uno sea aborto real (`/ERR_ABORTED|cancel/i`), además de comparar la última respuesta lógica **completada** con la que la UI aplica. Texto real observado de Playwright/Chromium: `net::ERR_ABORTED`; la aserción se ajustó a lo que la corrida demuestra. Resultado: **4 solicitudes, 3 `requestfailed` `net::ERR_ABORTED`, 1 respuesta completada y aplicada**.
- **R2 (rutas antiguas):** dos comprobaciones 400 con filtro `category`/`categoryId` contra `GET /api/v1/admin/dashboard/summary` con sesión ADMINISTRADOR (en el test R02/R04/R17) y `GET /api/v1/sales/summary` con sesión CAJERO (en el test R09). Ambas devuelven **400 `VALIDATION_ERROR`** con Problem Details saneado y cabeceras privadas; el parámetro extra se rechaza. `/sales/summary` admite CAJERO, por lo que se reutilizó esa sesión sin roles nuevos.
- **R3 (documental):** se precisa que la secuencia «venta → reclasificación» la acredita el script externo `e2-15-fixtures.mjs` (INSERT de la venta y después UPDATE de `products.category_id`), no el oráculo; `e2-15-oracle.mjs` solo lee el estado actual.
- **R4 (documental):** la nota de secretos se reformula: el manifiesto se consume programáticamente y no se imprime ni se versiona; contiene credenciales QA en claro fuera del repositorio y **debe borrarse o rotarse tras la corrida**. Este registro no afirma que ya se haya borrado.
- **R6 (documental):** el test omitido se renombra exactamente a «413/429/503 reales, DTO inválido live, expiración/refresh y multipestaña», sin 500 y sin omitir multipestaña.

Comandos ejecutados en `frontend/unified/` (corrida de esta corrección):

| Comando | Resultado real |
| --- | --- |
| `npm.cmd run lint` | Correcto |
| `npm.cmd run typecheck` | Correcto |
| `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution bundler --types node,vite/client e2e-live/dashboard-categories-acceptance.spec.ts src/app/desktop.ts` | Correcto |
| `npm.cmd run test` | **44 archivos, 720/720** |
| `npm.cmd run test:e2e` | **89/89** (simulada; no sustituye live) |
| `npm.cmd run test:e2e:live -- dashboard-categories-acceptance.spec.ts` (manifiesto opaco) | **13 correctas / 1 omitida explícita, 22.6 s** (la corrida previa registrada fue 23.2 s) |
| raíz: `git diff --check` | Correcto (solo avisos LF→CRLF) |

Sin cambio de producto hallado. E2-15 continúa **EN CURSO / NO ACEPTADA**; no se declara aceptación humana ni cierre E2/CSV.

### Ejecución live del coordinador — 2026-11-25

Como el verificador independiente seguía con shell denegado y no se rodeó la denegación, el **coordinador** ejecutó la suite live dirigida para no depender solo de la evidencia del autor. Se registra como evidencia del coordinador, **no** como verificación independiente.

- Preparación: backend local ya escuchando en `:3000` (comprobado `GET /api/v1/health` → 200) y Vite en `:5173`; manifiesto QA de E2-15 consumido opacamente (`E2E_LIVE=1`, `E2E_LIVE_MANIFEST=...\da-e2-15\e2-15-manifest.json`). No se imprimieron credenciales ni el manifiesto, ni se resembró, reseteó o migró nada.
- Comando (desde `frontend/unified`): `npm.cmd run test:e2e:live -- dashboard-categories-acceptance.spec.ts`.
- Resultado propio: **13 correctas / 1 omitida, 21.9 s**, sin mocks ni intercepción. Pasaron R01/R09/R10/R11 (DTO, ambas métricas, tres métodos), conciliación con resumen administrativo y `/sales/summary` (CAJERO), reclasificación real con total intacto, categoría inactiva, base cero y residuo 99.99, cero/empates/acentos y orden SQL, µs y bordes `from`/`to−1µs`/`to` con mínimo 2000 y 366 días, entrada estricta y errores reales incluidos los nuevos 400 de filtro `category` en rutas antiguas, categoría borrada → 500 saneado con fallo parcial aislado, 401 y 403 de todos los roles sin GET administrativos, teclado/foco/carrera con **3 `net::ERR_ABORTED` y 1 respuesta aplicada**, axe a 1280/768/390 y Electron con aislamiento.
- Coste observado por el coordinador: **33 ms** en el recorrido de 366 días sobre 59 productos/26 ventas QA; no es SLA. El único omitido es el bloque de 413/429/503 reales, DTO inválido live, expiración/refresh y multipestaña, conforme a lo registrado.

### Decisión requerida al responsable para aceptar E2-15

1. Revisar y aceptar las capturas sanitizadas del panel en 1280/768/390 y Electron como referencia visual de la capacidad E2-15.
2. Aceptar o rechazar que los escenarios 413/429/503, DTO inválido live, expiración/refresh y multipestaña queden como **limitación registrada no probada**, sin autorizar caos ni revocación.
3. Confirmar la aceptación funcional de E2-15 y, si procede, autorizar el siguiente paso de la secuencia (**CSV-00**, contrato documental) y la revisión independiente pendiente. Hasta entonces E2-15 sigue **EN CURSO / NO ACEPTADA** y E2 no se cierra: el cierre sigue siendo CSV-03.

### Cierre de E2-15 — aceptación del responsable, 2026-11-25

El responsable respondió **«Acepto E2-15 y sigo a CSV-00»** tras revisar la propuesta con la ruta de capturas. Registro:

1. **V-VIS aceptada:** las capturas sanitizadas de panel en 1280, 768, 390 y Electron (`C:\Users\angel\AppData\Local\Temp\opencode\da-e2-15\captures\`) quedan aprobadas como referencia visual de la capacidad de participación por categorías. Siguen siendo recortes de panel con catálogo QA sintético, no capturas de página completa ni comparación automática contra baseline.
2. **Omitidos aceptados como limitación no probada:** 413/429/503 reales, DTO inválido live, expiración/refresh y multipestaña no se declaran probados; no se autoriza caos, saturación de rate limit ni revocación de sesiones.
3. **Evidencia aceptada:** aceptación explícita de la evidencia ejecutada (13 live correctas/1 omitida del autor y 13/1 reproducidas por el coordinador, oráculo SQL independiente de 42 escenarios, 720/720 unitarias, 89/89 E2E simuladas, 190/190 integración, 70 ejemplos OpenAPI), con la salvedad ya registrada de que la verificación independiente nominal no se acreditó por denegación de shell.

**Estado: TASK-DA-E2-15 CERRADA Y ACEPTADA por el responsable el 2026-11-25 con las limitaciones anteriores; sin commit autorizado.** E2 **no** queda cerrada: el cierre único sigue siendo **CSV-03**, y la siguiente tarea autorizada es **CSV-00** (contrato documental), cuya aceptación explícita se solicitará antes de CSV-01/02.

## TASK-DA-E2-CSV-00 — Propuesta documental de exportación CSV

Estado: **PROPUESTA DOCUMENTAL CORREGIDA TRAS REVISIÓN, NO ACEPTADA; sin runtime, UI, SQL ejecutable, CSV real ni commit**. Fecha 2026-11-25. Autor `dashboard-backend-implementer`; verificación y revisión independientes **pendientes**, no atribuidas. `CSV-01`/`CSV-02`/`CSV-03` no iniciadas. E2 no se cierra hasta `CSV-03`.

### Archivos de esta tarea

- `frontend/docs/specs/dashboard-admin/contracts/E2-csv-contract.md`: contrato propuesto de cinco exportaciones (ventas + series + ranking + sin movimiento + categorías), formato, columnas, orden de ventas `soldAtUtc ASC, saleId ASC`, metadatos, límites, errores, generación, matriz CSV-R01…R36 y decisiones D01–D36 pendientes (incluidas D29–D36 de corrección de revisión).
- `backend/docs/api/openapi.yaml`: adiciones exclusivamente CSV con `x-contract-status: proposed-2026-11-25`; paths `sales-export.csv`, `sales-series-export.csv`, `product-ranking-export.csv`, `no-movement-products-export.csv` y `category-participation-export.csv`; respuestas Problem comunes y `DashboardCsvInputInstant`; nota de orden `rowOrder` y de buckets de series. No se modificaron esquemas existentes.
- `frontend/docs/specs/dashboard-admin/tasks.md`: solo estado propio CSV-00.
- Este registro: estado, comandos y límites de la propuesta. No se registra aceptación ficticia.

### Decisiones que requieren aceptación explícita

- Rutas/alcance D01–D04; ventas D05–D09; analítica D10–D18; formato D19–D21; seguridad/cabeceras/errores D22–D25; generación y puertas D26–D28; correcciones de revisión D29–D36. Detalle completo en el contrato.
- Puntos sensibles: cinco archivos frente a «cuatro exportaciones»; prefijo `/api/v1/admin/dashboard/...-export.csv` frente a las candidatas `/admin/sales/export.csv` y `/api/v1/admin/sales/export.csv`; una fila por venta con `orderStatus` actual y orden `soldAtUtc ASC, saleId ASC`; ventas con `from`/`to` obligatorios y 0–3 decimales; ranking con top N, `rowLimit` máximo vs `top` efectivo y metadatos del conjunto completo; sin movimiento completo sin cursor; BOM UTF-8; prefijo antifórmulas `'` solo en texto (incluido LF/espacios iniciales); topes 20 000/745/368/20/2 000/1 000; generación acotada en memoria con consulta única o aislamiento probado; nombre de archivo por `Content-Disposition`; accesibilidad y Electron en CSV-02/03.

### Correcciones de revisión documental aplicadas (2026-11-25)

Estado tras corrección: **sigue PROPUESTA, NO ACEPTADA**; sin runtime, UI, SQL ejecutable, CSV real ni commit. No se autoaprueba el DTO ni la revisión.

- **B-01:** separada la regla de cero resultados. Ventas/ranking/sin movimiento/categorías → metadatos + encabezado sin filas; series con rango válido → siempre ≥1 bucket intersectado (`bucketCount>=1`, `rowCount>=1`) con métricas `0`, nunca archivo solo con encabezado. Excepción reflejada en CSV-R25, D10 y D14.
- **B-02:** orden determinista de ventas `soldAtUtc ASC, saleId ASC`, publicado como `rowOrder` en metadatos, ejemplo y CSV-R36; sin reordenar en frontend.
- **R-01/D31:** CSV-R20 separa Origin inválido/PIN/rol → `403` con su código, frente a token o parámetro extra en URL (`token`, `access_token`, `jwt`…) → `400 VALIDATION_ERROR`.
- **R-02/D32:** CSV-R24 separa IDs (pueden superar 2^53) de importes/conteos acotados por `orders_check_1` (≤ 9 999 900) y topes; documenta que no son sembrables de extremo a extremo y se prueban con vectores controlados de serialización/aritmética, como en series/ranking.
- **R-03/D30:** `rowLimit` es el máximo contractual y `top` el corte efectivo; aclarado en metadatos, D11 y D14.
- **R-04/D33:** nombre de archivo por `Content-Disposition` desde el mismo origen/proxy, leído por extensión acotada del cliente HTTP existente; prueba prevista en CSV-02.
- **R-05/D34:** no se promete `REPEATABLE READ` (withTransaction no lo configura); se exige una sola consulta que cuente y devuelva filas/agregados, o aislamiento explícito probado, más prueba de concurrencia conteo/filas.
- **R-06/D35:** `soldAt`/`createdAt` se serializan desde PostgreSQL (`to_char`/US o equivalente), nunca desde `Date`; prueba de seis decimales y `to − 1 µs`.
- **R-08/D36:** CSV-02/CSV-03 incorporan botón accesible, teclado/foco, anuncio de estado, descarga única, cancelación y prueba en Electron.
- **R-09:** antifórmulas amplía a LF y a espacios iniciales seguidos de carácter de fórmula; añadido a CSV-R23 y D20.
- **R-10:** el markdown es fuente normativa de columnas; OpenAPI se mantiene informativo y aditivo.
- **R-11:** `method=all` en CSV equivale a `method` omitido/null del DTO, no a un tercer método.
- **R-12:** CSV-02 exige 401 con refresh único sin bucle y Problem Details que no se guarda como CSV.
- **R-07:** fila resumen de `tasks.md` actualizada a E2-15 «CERRADA Y ACEPTADA» según el registro ya existente, sin reescribir historia.
- Se añadieron D29–D36; la aceptación sigue requiriendo decisión explícita del responsable.

### Comandos ejecutados y resultados reales

| Directorio / comando | Resultado |
| --- | --- |
| `backend/`: `npm.cmd run format:check` | Correcto; todos los archivos cumplen Prettier. |
| `backend/`: `npm.cmd run api:validate` | Correcto; OpenAPI válido, **75 ejemplos** conformes a esquema y ruta (70 previos + 5 CSV). |
| `backend/`: `node scripts/check-doc-links.mjs` | **286 enlaces locales revisados, 0 inexistentes**; fragmentos no comprobados. |
| raíz: `git diff --check` | Correcto; solo avisos LF→CRLF preexistentes, sin errores de whitespace. |
| raíz: `git status --short` | Cambios previos de E2-13/14/15 conservados; esta tarea añade `contracts/E2-csv-contract.md` y modifica OpenAPI/tasks/validation. Sin secretos, CSV real, capturas ni artefactos temporales. |

Corrección de proceso registrada: la primera invocación de `api:validate` falló porque `description` no es una propiedad admitida en el Media Type Object de esta versión; se retiraron esas descripciones opcionales y se conservó la nota normativa en el markdown. La primera invocación de `check-doc-links.mjs` desde la raíz falló porque el script resuelve `./docs`; se ejecutó desde `backend/`, su directorio correcto. No se eludió ninguna denegación.

### No ejecutado y límites

- Sin runtime, rutas implementadas, UI, SQL ejecutable, migraciones, dependencias, pruebas HTTP/BD, benchmarks, descargas reales, apertura en hoja de cálculo ni V-REAL. No se atribuye a los ejemplos documentales una ejecución HTTP.
- La aceptación del contrato, la verificación independiente y la revisión independiente siguen pendientes. OpenAPI `proposed-2026-11-25` no equivale a contrato aceptado.
- No se crea commit. Cualquier commit/push/despliegue requiere encargo explícito.

### Contradicciones registradas

- Spec `/admin/sales/export.csv`, plan `/api/v1/admin/sales/export.csv` y propuesta `/api/v1/admin/dashboard/sales-export.csv`: ninguna aceptada; decisión D02.
- `Sale` no tiene `status`; se propone `orderStatus` actual, no snapshot histórico (D07).
- Ranking top N no exporta el conjunto completo de productos; solo metadatos completos (D11).
- `/sales` admite fechas opcionales y hasta seis decimales; la exportación propone reglas más estrictas sin cambiar `/sales` (D04).
- 413 es límite global de body, no de filas; el tope de filas propone 400 `EXPORT_LIMIT_EXCEEDED` (D25).

### Puerta siguiente

Solicitar verificación y revisión independientes y someter al responsable la aceptación agrupada D01–D36. Hasta entonces CSV-00 es **propuesta no aceptada**; CSV-01/02 no pueden iniciarse y CSV-03 sigue siendo el cierre único de E2. Las correcciones B-01/B-02/R-01…R-12 son documentales y no constituyen aceptación.

### Aceptación del contrato y cierre de CSV-00 — 2026-11-25

El responsable respondió **«Acepto el contrato y sigo con CSV-01»** a la solicitud agrupada. Registro:

- **Contrato aceptado:** D01–D36 de [E2-csv-contract.md](./contracts/E2-csv-contract.md), incluidas las decisiones derivadas de la revisión (D29 orden de filas `soldAtUtc ASC, saleId ASC`; D30 series siempre con al menos un bucket; D31 token/extra en URL → 400; D32 viabilidad de >2^53; D33 entrega del nombre de archivo; D34 consistencia conteo/filas; D35 microsegundos desde PostgreSQL; D36 accesibilidad/Electron de CSV-02).
- **Alcance habilitado:** exclusivamente `CSV-01` (backend) y `CSV-02` (descarga frontend) bajo este contrato. No autoriza imágenes, PNG, XLSX, PDF, histórico global, cambios de negocio ni commit/push/despliegue.
- **OpenAPI:** las cinco entradas CSV pasan a `x-contract-status: approved-2026-11-25`; se conservan los 75 ejemplos válidos.
- **Puertas vigentes:** `CSV-03` sigue siendo el único cierre de E2 y requiere su propia aceptación real con descarga contra entorno autorizado. La verificación independiente nominal de esta propuesta quedó documentada por la revisión `dashboard-reviewer` (sin bloqueantes tras B-01/B-02); la ejecución de comandos la realizó el autor.

**Estado: TASK-DA-E2-CSV-00 CERRADA Y CONTRATO ACEPTADO el 2026-11-25; sin commit autorizado en este registro.** Siguiente tarea autorizada: **CSV-01**.
