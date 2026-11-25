# Suite E2E live — TASK-DA-E1-09 y TASK-DA-E2-03

Suite de aceptación **contra backend real**, separada de la suite simulada de
`frontend/unified/e2e`. No usa `page.route` ni `context.route`: el navegador
habla con Vite (`http://localhost:5173`), que reenvía `/api` al backend real.

- `dashboard-acceptance.spec.ts`: aceptación real del resumen integrado
  (TASK-DA-E1-09).
- `dashboard-series-acceptance.spec.ts`: aceptación real de series horarias y
  diarias (TASK-DA-E2-03).

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
