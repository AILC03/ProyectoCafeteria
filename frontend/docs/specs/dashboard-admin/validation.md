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

Estado: **implementada y verificada localmente; NO aceptada/cerrada; commit `mismo commit`**. V-VIS y V-REAL/E2-03 siguen pendientes; no se hereda aceptación de E1. La evidencia de ejecución es del coordinador porque el verificador independiente tuvo shell denegado; la revisión independiente fue estática.

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
- **V-VIS pendiente:** no hay capturas 1280/768/390 ni aceptación visual humana de E2-02.
- **V-REAL/E2-03 pendiente:** toda la evidencia es MSW/E2E simulado; no acredita conciliación navegador→API/BD real, Electron ni HTTPS.
- No se declara E2 cerrada ni CSV iniciado.
