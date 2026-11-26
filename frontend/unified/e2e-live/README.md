# Suite E2E live — TASK-DA-E1-09, E2-03, E2-07, E2-11, E2-15 y CSV-03

Suite de aceptación **contra backend real**, separada de la suite simulada de
`frontend/unified/e2e`. No usa `page.route` ni `context.route`: el navegador
habla con Vite (`http://localhost:5173`), que reenvía `/api` al backend real.

- `dashboard-acceptance.spec.ts`: aceptación real del resumen integrado
  (TASK-DA-E1-09).
- `dashboard-series-acceptance.spec.ts`: aceptación real de series horarias y
  diarias (TASK-DA-E2-03).
- `dashboard-ranking-acceptance.spec.ts`: aceptación real de ranking
  (TASK-DA-E2-07).
- `dashboard-no-movement-acceptance.spec.ts`: aceptación real de activos sin
  movimiento (TASK-DA-E2-11).
- `dashboard-categories-acceptance.spec.ts`: aceptación real de participación
  por categorías (TASK-DA-E2-15).
- `dashboard-csv-acceptance.spec.ts`: aceptación real de las cinco
  exportaciones CSV y cierre E2 (TASK-DA-E2-CSV-03).

## Requisitos previos

- Backend real escuchando en `http://localhost:3000` con autenticación activa.
- Vite en `http://localhost:5173` (la config live lo reutiliza; si no está,
  arranca el mismo comando que `playwright.config.ts`, nunca el backend).
- PostgreSQL local autorizado, migrado y sembrado con el dataset congelado de
  la tarea que se va a ejecutar.
- Usuarios QA creados y un manifiesto temporal por tarea.
- Las ventas del dataset E1 deben cumplir el contrato `saleNumber`
  `^V[0-9]{6,}$`; si no, la UI rechaza la respuesta y no se pueden validar las
  últimas ventas ni el ticket.

Cada tarea usa su propio manifiesto. No son intercambiables: E1-09 necesita
los campos de resumen/caja y E2-03 los de series. El manifiesto vive **fuera del
repositorio** y no se versiona ni se imprime.

## Variables de entorno

| Variable | Valor |
| --- | --- |
| `E2E_LIVE` | `1` para habilitar la suite. Cualquier otro valor la omite. |
| `E2E_LIVE_MANIFEST` | Ruta absoluta al manifiesto temporal JSON de la tarea. |

Si falta cualquiera de las dos, Playwright marca las pruebas como omitidas; no
se ejecutan ni cuentan como evidencia.

## Comando

Desde `frontend/unified`:

```powershell
$env:E2E_LIVE = '1'
$env:E2E_LIVE_MANIFEST = '<ruta-absoluta-al-manifiesto-de-la-tarea>'
npm.cmd run test:e2e:live
```

No ejecutar en CI ni contra bases de desarrollo/producción. Los inicios de
sesión usan únicamente credenciales válidas y no repiten intentos inválidos.

Para ejecutar solo la suite de una tarea, se puede añadir su archivo como filtro:

```powershell
npm.cmd run test:e2e:live -- dashboard-series-acceptance.spec.ts
npm.cmd run test:e2e:live -- dashboard-acceptance.spec.ts
```

Cada archivo valida el esquema de su propio manifiesto al cargarse; ejecutar el
directorio completo con el manifiesto de otra tarea no es una corrida válida.

## Aislamiento y privacidad

- `testDir` propio: `./e2e-live`; `npm run test:e2e` sigue usando solo `./e2e`.
- `workers: 1`, `fullyParallel: false`, sin mocks ni intercepción de red.
- `trace: 'off'`, sin video, screenshot ni HAR; el reporte es solo `list`.
- La suite no imprime credenciales, cookies, tokens ni el contenido del
  manifiesto. Tampoco captura ni registra el QR del ticket.
- No se hace commit ni push desde la suite.

## Cobertura E1-09

Login real de personal, conciliación del resumen con `/sales/summary`,
periodos/presets y método, caja actual independiente, últimas ventas, ticket
reimpreso en un clic, roles negativos (403/401), rango vacío, axe WCAG 2.1 A/AA,
`localStorage` vacío y `Cache-Control: no-store`.

## Cobertura E2-03

Serial y sin mocks, con un único dataset congelado y la misma sesión del
navegador:

1. **Día principal** (`2026-11-24` local): rango personalizado por UI, cabeceras
   privadas (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`),
   `granularity=hour`, 24 buckets, suma exacta de importe/tickets/unidades con
   `BigInt` (nunca `Number` para importes o identificadores), `bucketCount`
   igual a la longitud, orden y cobertura efectiva contiguos, 24 filas y
   métricas en la tabla. Conciliación con `/admin/dashboard/summary` (incluido
   `averageTicketCents` y el objeto `comparison` del DTO real) y
   `/sales/summary` con los mismos límites. Repetición con `method=STRIPE`
   (5000/2/3) y `method=CASH` (4000/1/2), conciliando cada corte con su propio
   `/sales/summary?method=…` y con tickets/unidades del resumen, incluido el
   método vigente en la UI. Cambio a `Día`: un bucket de 24 h y los mismos
   totales sin recálculo local.
2. **DST**: `hour` y `day` para otoño (`2026-11-01`, 25 buckets, dos `01:00`
   con offsets `-07:00`/`-08:00`, valores por bucket `100/1/1` y `200/1/1` sin
   suma local, y fila `Hora repetida`, día de 25 h con `Cambio de horario`) y
   primavera (`2026-03-08`, 23 buckets, sin hora local `02:00`, día de 23 h).
3. **Bordes por API autenticada** con `page.request` y la sesión del navegador:
   S03 parcial (dos `partial:true`, cobertura efectiva contigua, 8500/2/3),
   precisión de microsegundos (bucket `10:00` con `100/1/1`, ventana izquierda
   de 1 ms en cero, ventana central `[10:59:59.999Z, 11:00:00.000Z)` con
   `100/1/1` y ventana derecha posterior en cero), máximo `hour` de 745 buckets,
   mínimo de dominio desde 2000 (400 un milisegundo antes con cabeceras
   privadas, 200 en la frontera con `localStart`
   `2000-01-01T00:00:00-08:00`), día vacío de 2020 con un bucket cero y
   rechazos 400: sin granularidad, granularidad inválida, extra `metric`,
   parámetro repetido, `from[]`, `offset`, cuatro decimales, `from >= to`,
   `hour` > 744 h, `day` > 366 días y cuerpo no vacío. La consulta real de 745
   buckets se cronometra solo como **coste observado**; no es un SLA ni una
   aceptación de rendimiento.
4. **Roles y privacidad**: ADMINISTRADOR 200; CAJERO y PREPARACION no ven
   administración, no disparan `/api/v1/admin/` y su petición directa devuelve
   403 con cabeceras privadas; contexto anónimo 401 con cabeceras privadas;
   `localStorage.length === 0`.
5. **Accesibilidad**: axe WCAG 2.1 A/AA sobre el dashboard con series reales y
   tabla como alternativa textual equivalente. Además, activación por teclado
   de `Hora`/`Día` con `Enter`/`Space`, respuesta real, `aria-pressed`, cambio
   de tabla y foco persistente en el botón.
6. **Carrera/cancelación UI**: cambios rápidos Hora↔Día y de periodo; al menos
   una petición de series se cancela realmente (observada vía
   `requestfailed`, sin intercepción) y la tabla y las métricas finales
   corresponden a la última respuesta, sin estado de carga.

## Limitaciones registradas

- 503, 429 y el fallo parcial real **no se inducen** en la suite live: hacerlo
  requeriría mocks, intercepción de red o alterar el backend, lo que
  contradice el propósito de esta suite. Esos escenarios se cubren en las
  suites simuladas/componentes e integración.
- El dataset y el entorno de E2-03 son específicos y no heredan aceptación de
  E1.
- El dataset congelado contiene otra venta distinta exactamente en
  `2026-11-26T11:00:00.000Z` (777/1/1), además de la venta de precisión en
  `to − 1 µs`. Por eso la comprobación de frontera usa ventanas reales de 1 ms
  a ambos lados en lugar de exigir que un rango de 2 h posterior sea cero.
- Esta suite aporta evidencia ejecutable y no declara por sí sola la aceptación
  de TASK-DA-E2-03. La aceptación de capacidad/V-VIS y su alcance se registran en
  `frontend/docs/specs/dashboard-admin/validation.md`; el cierre de E2 corresponde
  a CSV-03, que no forma parte de esta tarea.

## Cobertura E2-07

`dashboard-ranking-acceptance.spec.ts` ejecuta la aceptación real de ranking:

1. Día principal: ranking units/top/5, conciliación exacta con
   `/admin/dashboard/summary` y `/sales/summary`, items/ID/nombres/baja snapshot,
   cabeceras privadas y tabla real.
2. amount/top/10, bottom units y método CASH/STRIPE con totales por método.
3. Cero (2020), 400 de `top` inválido, roles CAJERO/PREPARACION 403, anónimo 401,
   cabeceras privadas y axe WCAG 2.1 A/AA.
4. Teclado y carrera de selección de métrica/top, sin estado de carga final.

Variables y comando son los mismos de las tareas anteriores. Cada tarea usa su
propio manifiesto; ejecuta el archivo dirigido, no el directorio completo con un
manifiesto ajeno. V-VIS y la prueba guiada humana se registran en `validation.md`;
esta suite no las declara por sí sola.

## E2-11 — activos sin movimiento (EN CURSO / NO ACEPTADA)

Archivo dirigido: `dashboard-no-movement-acceptance.spec.ts`. **No ejecutar el
directorio entero con este manifiesto.** No usa mocks, interceptores, escrituras
de catálogo/ventas ni modificación de cookies. Login/logout QA son los únicos
cambios de sesión. No ejecuta los scripts históricos `removed-*` ni prepara datos.

```powershell
$env:E2E_LIVE = '1'
$env:E2E_LIVE_MANIFEST = 'C:\Users\angel\AppData\Local\Temp\opencode\da-e2-07\e2-11-manifest.json'
npm.cmd run test:e2e:live -- dashboard-no-movement-acceptance.spec.ts
```

### Oráculo independiente y manifiesto privado

El manifiesto E2-07 de ranking **no sirve** como oráculo de E2-11. El temporal
`e2-11-oracle.mjs` junto al manifiesto genera E2-11 mediante lecturas PostgreSQL
`REPEATABLE READ READ ONLY`, usando **EXCEPT** entre el universo completo y los
IDs de líneas de ventas del rango/método; no importa código backend, no consulta
el endpoint y no aplica límite/cursor. Orden SQL `name COLLATE "C", id` y fechas
`to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`; IDs se convierten a texto antes
de JSON. Copia las credenciales QA existentes opacamente, sin imprimirlas.
Es externo, no es un script de siembra ni se ejecuta desde la suite.

Estructura (sin incluir valores de credenciales):

- `dataset`: etiqueta QA, `users`: `admin/cashier/prep` con las credenciales
  existentes y `manager` (username/password), `customer/pinChange`
  (identifier/pin) de **cuentas QA nuevas**, sin cambiar credenciales existentes.
  No registrar, adjuntar ni versionar el manifiesto.
- `captureDir`: directorio externo precreado para capturas sanitizadas.
- `scenarios[]`: `{id,from,to,method,items}`; `method` null/CASH/STRIPE,
  `items` es el conjunto completo de `NoMovementItem` esperado por SQL, no una
  respuesta copiada de la API. El escenario `main` además tiene
  `startDate/endDate` locales inclusivas para los controles UI.
- IDs requeridos: `main`, `no-sales`, `cohort`, `after-cohort`, `zero`, `maximum`,
  `from-exclusive-control`, `micro-left`, `micro-center`, `micro-right`, cada uno con los tres métodos. Fechas y restricciones
  concretas del dataset actual: consultar el acta E2-11 en `validation.md`.
- `fixtures[]`: hechos SQL de las 12 altas sintéticas, con productId/name/createdAt,
  categoryDeleted/categoryActive y sales(soldAt/method/status/totalCents/refundCents).
  Acreditan las precondiciones discriminatorias, no se deducen del endpoint.

Para otro dataset se necesita un oráculo independiente, escenarios y autorización
propios; no cambiar expectativas a partir del resultado del endpoint. La suite
acredita solo casos materializados: sus nombres no garantizan R01–R20 completos.

### Cobertura ejecutable y límites explícitos

- Compara **cada fila y cada página** con SQL para 30 cortes × 10/20/50; total
  antes de cursor, default 20, sin IDs duplicados, sin corte top N. UI acumula
  20+14 y reinicia al cambiar método/límite, sin reconstruir ausencias.
- 400/401/403, Problem Details y cabeceras, Origin directo a localhost:3000
  (Vite reescribe Origin), precisión de entrada 0–3 frente a 4–6 decimales,
  mínimo/rango máximo, extras/repetidos/arrays/body y cursores incompatibles,
  normalizados/manipulados y terminal con total no cero.
- Cero real, filtro inválido sin GET nuevo, carrera con Cargar más y
  `requestfailed` observado, recarga por teclado, logout y localStorage vacío.
- Axe completo en viewports 1280×900/768×900/390×900, sin overflow general;
  capturas **recortadas al panel** para excluir usuario, shell, ventas y QR.
  Reloj real, dataset estable y estado inicial de 20 filas; no se congela
  `generatedAt` ni se oculta ningún error de accesibilidad. Electron real con
  perfil temporal externo eliminado al terminar y aislamiento comprobado.
- Los controles de foco/axe se mantienen como aserciones exigibles, no `fixme`.
  `expect.soft` permite registrar logout y las demás capturas, pero **falla** la
  prueba. Resultado y defectos en el acta; no significa aceptación.
- Cuatro omitidos anteriores **habilitados con fixtures QA autorizados**: reembolso
  total Stripe conserva movimiento; nombres iguales con IDs distintos y orden C
  de A/B/Same/Same/a/Á repetible y presentado sin reordenar; alta/venta en
  `2026-11-26T07:59:59.999999Z` y `08:00:00.000000Z` contrastadas mediante ventanas
  consecutivas de 1 ms; CLIENTE/GERENTE403 y PIN_CHANGE_REQUIRED403 mediante
  login real con CSRF y cookies del contexto (sin imprimirlas), guardas sin GET
  administrativos una vez resuelta `/auth/me`. Incluye categoría borrada defensiva
  con `is_active=true`: prueba `deleted_at` independientemente de inactividad.
- **Dos omitidos explícitos**: caos 413/429/500/503/fallo parcial/DTO inválido y
  expiración/refresh/multipestaña. No hay autorización para inducirlos ni heredar la
  excepción de series E2-03. R10/R12 son exigencias backend según la matriz del
  contrato: su integración existente no se presenta como caso live ni se exige
  duplicarla en el navegador.

### Preparación QA autorizada (externa, no ejecutada por la suite)

Continuación secuencial E2-11 por autorización «si autorizo», separada de la
correctiva frontend B01/B02 ya verificada/revisada. Temporales bajo
`C:\Users\angel\AppData\Local\Temp\opencode\da-e2-07\`:

1. `e2-11-fixtures.mjs` sin argumentos comprueba `current_database()` exactamente
   `cafeteria_da_e2_07`, producto7/nombre/alta, categoría2/nombre y venta1/fecha.
   Antes de escribir exigió 33 productos/7 ventas/0 reembolsos y ningún producto
   de esta ampliación. No accede a `.env` ni a secretos de conexión: usa el
   `POSTGRES_USER` opaco del contenedor local autorizado con psql por stdin.
2. `e2-11-originals.mjs --record` registra huella de columnas no secretas del
   catálogo original y ventas/pagos/líneas originales. **Solo una vez**;
   sin argumentos compara la huella, no reescribe la referencia.
3. `e2-11-fixtures.mjs --apply` fue ejecutado una sola vez: transacción con guardas
   repetidas y locks breves; **solo INSERT**, 12 productos/1 categoría/3 ventas
   Stripe/1 reembolso/3 cuentas QA, sin proveedor, sesiones prefabricadas ni UPDATE
   de filas existentes. Contraseñas/NIP aleatorios y hashes Argon2id se procesan
   opacamente; credenciales en `e2-11-extension-private.json`, fuera del repo,
   nunca imprimir/copiar. Si existe ese archivo, rehúsa reseed automático. No
   ejecutar de nuevo ni borrar esa guarda; un fallo exige inspección autorizada.
4. `e2-11-oracle.mjs` regenera expectativas completas exclusivamente por SQL
   read-only EXCEPT y hechos de fixtures, incorpora opacamente usuarios QA al
   manifiesto. `e2-11-stability.mjs` vuelve a generar y compara SHA256 de
   escenarios, sin credenciales. No usar el endpoint como oráculo.

Dataset resultante: **45 productos/10 ventas/1 reembolso/5 categorías**. `main`
conserva rango UI 24–25 noviembre locales, con **34/38/35** sin método/CASH/STRIPE.
`no-sales` ahora usa `[2026-11-23T08:00Z,09:00Z)`, sin ventas y con25 elegibles,
porque la nueva venta µs cae dentro del antiguo intervalo sin ventas. No se
reescribieron históricos para acomodarlo. La categoría borrada activa con producto
es inconsistencia **intencional y aislada**, permitida por constraints y autorizada
solo para comprobar defensa R03; no afirma que el CRUD permita crearla.

Los scripts y credenciales siguen externos; esta descripción permite reconstruir
las precondiciones sin versionar secretos. No hay reset/reseed/removed-seed,
migraciones, cambios runtime, revocación de sesiones ni caos. Las capturas actuales
del panel conservan20 filas iniciales pero corresponden al **dataset ampliado**,
no al anterior; la aprobación visual E2-10 no acepta estas capturas de E2-11.

R18 agrupa casos incompatibles: método sin ventas conserva universo elegible y
página terminal conserva total anterior al cursor. Se prueba la semántica de las
secciones normativas; la aclaración documental corresponde al responsable, no a
una modificación unilateral de contrato. El acta distingue además la reserva de
cabeceras globales del contrato frente a la descripción verificada E2-09 de OpenAPI.

La aceptación humana E2-11, teclado manual, revisión/verificación independientes y
decisiones sobre omitidos siguen siendo puertas obligatorias. Esta suite no inicia
E2-12/13, CSV ni cierre E2.

## E2-15 — participación por categorías (EN CURSO / NO ACEPTADA)

Archivo dirigido: `dashboard-categories-acceptance.spec.ts`. **No ejecutar el
directorio entero con este manifiesto.** No usa `page.route`/`context.route` ni
interceptores, no escribe catálogo/ventas y no modifica cookies. Login/logout QA
son los únicos cambios de sesión. No ejecuta scripts de siembra ni `removed-*`.

```powershell
$env:E2E_LIVE = '1'
$env:E2E_LIVE_MANIFEST = 'C:\Users\angel\AppData\Local\Temp\opencode\da-e2-15\e2-15-manifest.json'
npm.cmd run test:e2e:live -- dashboard-categories-acceptance.spec.ts
```

### Oráculo independiente y manifiesto privado

`e2-15-oracle.mjs` (externo) lee PostgreSQL `cafeteria_da_e2_07` en
`REPEATABLE READ READ ONLY`, agrupa líneas históricas por
`Product.categoryId` actual con `name COLLATE "C"` y `categoryId` numérico, y
calcula denominadores y `sharePercent` half-up con `BigInt` fuera del endpoint.
No importa backend/repositorio ni copia respuestas HTTP. Para cada corte produce
`itemsUnits` e `itemsAmount` completos, `summary` (`ticketCount`, `totalCents`,
`unitsSold`, `cashCents`, `stripeCents`) y hechos de fixtures. Las credenciales
existentes se copian opacamente al manifiesto; no se imprimen ni versionan.

Escenarios del dataset E2-15 (42 = 14 rangos × 3 métodos): `main`,
`main-from-exclusive`, `reclass`, `inactive`, `zero-amount`, `ties`, `thirds`,
`zero`, `min-boundary`, `maximum` (366 días exactos), `micro-left`,
`micro-center`, `micro-right` y `deleted-category` (500 saneado). El manifiesto
incluye fechas locales para los cortes que se aplican por UI.

### Cobertura ejecutable

- Conciliación exacta navegador→API contra oráculo y contra
  `/admin/dashboard/summary` + `/sales/summary` con sesión CAJERO, en ambos
  `metric` y en método omitido/CASH/STRIPE.
- Reclasificación real posterior a la venta (producto sintético movido de
  categoría 1 a 3): el historial aparece bajo la categoría actual, la anterior
  no recibe el importe y el total no cambia. Categoría inactiva con movimiento
  se incluye con `isActive:false`.
- Base cero con ítems (`metric=amount`, líneas de importe 0), «sin base» en UI,
  cero real `[]`, tercios con residuo `33.33 × 3 = 99.99` mostrado sin
  normalizar, empates y nombres `A/B/Empate/a/Á` con orden `COLLATE "C"`.
- Precisión de microsegundos y bordes: venta en `from`, venta en `to−1 µs`,
  exclusión de `to`, mínimo 2000 y máximo 366 días (+1 ms rechazado).
- Negativos de query/body/extras/repetidos/arrays, 400/401/403/500 con Problem
  Details y cabeceras privadas; Origin directo al backend; roles
  CAJERO/PREPARACION/CLIENTE/GERENTE/PIN sin GET administrativos.
- Carrera/cancelación real (`requestfailed`), teclado/foco, axe WCAG 2.1 A/AA a
  1280/768/390, capturas **recortadas al panel** y Electron real con
  `terminalOnly`, `nodeIntegration=false`, `contextIsolation/sandbox/webSecurity`.
- El fallo parcial se observa con el rango de categoría borrada (500 real): el
  panel de categorías muestra error saneado mientras el resumen y la mezcla
  siguen visibles. No se induce caos, 429/503 ni revocación de sesiones.

### Límites explícitos

- 413/429/503, DTO inválido live, expiración/refresh y multipestaña quedan como
  **omitidos explícitos**: no hay autorización para caos ni revocación. La
  excepción de series E2-03 no se hereda.
- El dataset es sintético y aislado; la ampliación E2-15 solo inserta
  productos/categorías/ventas y realiza **una** mutación controlada de
  `category_id` sobre un producto sintético. No resetea ni reescribe históricos.
- Las capturas no son aprobación humana ni reemplazan la revisión independiente;
  V-VIS/V-REAL y la aceptación funcional se registran en `validation.md`.

## CSV-03 — exportaciones CSV y cierre E2 (EN CURSO / NO ACEPTADA por el responsable)

Archivo dirigido: `dashboard-csv-acceptance.spec.ts`. **No ejecutar el directorio
entero con este manifiesto.** No usa mocks ni interceptación, no escribe catálogo,
ventas ni sesiones y no modifica cookies. Login/logout QA son los únicos cambios
de sesión. No ejecuta scripts de siembra ni `removed-*`.

```powershell
$env:E2E_LIVE = '1'
$env:E2E_LIVE_MANIFEST = 'C:\Users\angel\AppData\Local\Temp\opencode\da-csv-03\csv-03-manifest.json'
npm.cmd run test:e2e:live -- dashboard-csv-acceptance.spec.ts
```

### Oráculo independiente y manifiesto privado

`csv-03-oracle.mjs` (externo, en `da-csv-03`) lee PostgreSQL
`cafeteria_da_e2_07` en `REPEATABLE READ READ ONLY` y regenera por SQL las cinco
expectativas: ventas (7 filas en el corte principal), series (24 buckets
horarios), ranking (top 5 de 6 productos con movimiento), sin movimiento
(47 filas, más de una página) y categorías (participación, inactivas, tercios
99.99, base cero). El manifiesto copia opacamente los usuarios QA ya existentes
de E2-15 y no se versiona ni se imprime.

### Cobertura ejecutable

- Cinco descargas reales por botón con la sesión del navegador, cabeceras
  `text/csv; charset=utf-8`, `Content-Disposition` con nombre seguro, `no-store`,
  `no-referrer` y `nosniff`; BOM UTF-8, CRLF, comillas RFC 4180 y filas `#meta`.
- Ventas completas (7 > 5 visibles) y orden `soldAtUtc, saleId`, conciliadas con
  `/api/v1/sales` paginado, `/admin/dashboard/summary` y `/sales/summary`;
  reembolso real conservado en bruto. Series con 17 buckets vacíos y suma exacta;
  ranking top 5/10 con `matchedProductCount`; sin movimiento completo contra el
  endpoint; categorías con `sharePercent` del backend, inactivas y residuo 99.99.
- Cero resultados (ventas/ranking/sin movimiento/categorías con encabezado sin
  filas; series con al menos un bucket cero), variantes CASH/STRIPE/hora/día/
  métrica/dirección/top y negativos 400/401/403 reales (CAJERO, PREPARACION,
  GERENTE, CLIENTE y PIN), `token`/extra, rango/precisión, repetidos, arrays y
  cuerpo; precedencia D31 y Origin.
- Parser CSV propio, sin dependencias: recuento de filas/columnas, fechas UTC con
  seis decimales, locales con offset, IDs/importes canónicos, antifórmulas y
  ausencia de PII textual.
- Teclado (Enter descarga una vez, foco conservado), estado anunciado, axe
  WCAG 2.1 A/AA a 1280/768/390 y Electron real con `terminalOnly`,
  `nodeIntegration=false`, `contextIsolation/sandbox/webSecurity=true` y descarga
  efectiva.

### Límites explícitos

- Los topes de 20 000 ventas/2 000 productos/1 000 categorías **no se
  reproducen** con el dataset autorizado (26/59/11); sembrar volumen no está
  autorizado. Su cobertura es de unitarias/integración de CSV-01.
- El dataset live no contiene nombres con coma, comillas ni saltos de línea ni
  fórmulas; el escape de esos casos se acredita en unitarias/integración. Las
  cinco copias se guardan fuera del repositorio en
  `C:\Users\angel\AppData\Local\Temp\opencode\da-csv-03\exports\`.
- 413/429/503, DTO inválido live, expiración/refresh y multipestaña siguen como
  omitidos explícitos; no hay autorización de caos ni revocación.
- La suite aporta evidencia ejecutable. La aceptación humana, la apertura de un
  CSV en hoja de cálculo, la revisión independiente y el cierre E2 se registran
  en `frontend/docs/specs/dashboard-admin/validation.md`.
