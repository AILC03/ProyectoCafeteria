# Suite E2E live — TASK-DA-E1-09

Suite de aceptación **contra backend real**, separada de la suite simulada de
`frontend/unified/e2e`. No usa `page.route` ni `context.route`: el navegador
habla con Vite (`http://localhost:5173`), que reenvía `/api` al backend real.

## Requisitos previos

- Backend real escuchando en `http://localhost:3000` con autenticación activa.
- Vite en `http://localhost:5173` (la config live lo reutiliza; si no está,
  arranca el mismo comando que `playwright.config.ts`, nunca el backend).
- Dataset controlado y usuarios QA ya creados.
- Las ventas del dataset deben cumplir el contrato `saleNumber` `^V[0-9]{6,}$`;
  si no, la UI rechaza la respuesta y no se pueden validar últimas ventas ni ticket.
- Manifiesto temporal **fuera del repositorio** con las credenciales y los
  valores esperados. No se versiona ni se imprime.

## Variables de entorno

| Variable | Valor |
| --- | --- |
| `E2E_LIVE` | `1` para habilitar la suite. Cualquier otro valor la omite. |
| `E2E_LIVE_MANIFEST` | Ruta absoluta al manifiesto temporal JSON. |

Si falta cualquiera de las dos, Playwright marca las pruebas como omitidas; no
se ejecutan ni cuentan como evidencia.

## Comando

Desde `frontend/unified`:

```powershell
$env:E2E_LIVE = '1'
$env:E2E_LIVE_MANIFEST = '<ruta-absoluta-al-manifiesto>'
npm.cmd run test:e2e:live
```

No ejecutar en CI ni contra bases de desarrollo/producción. Los inicios de
sesión usan únicamente credenciales válidas y no repiten intentos inválidos.

## Aislamiento y privacidad

- `testDir` propio: `./e2e-live`; `npm run test:e2e` sigue usando solo `./e2e`.
- `workers: 1`, `fullyParallel: false`, sin mocks ni intercepción de red.
- `trace: 'off'`, sin video, screenshot ni HAR; el reporte es solo `list`.
- La suite no imprime credenciales, cookies, tokens ni el contenido del
  manifiesto. Tampoco captura ni registra el QR del ticket.

## Cobertura

Login real de personal, conciliación del resumen con `/sales/summary`,
periodos/presets y método, caja actual independiente, últimas ventas, ticket
reimpreso en un clic, roles negativos (403/401), rango vacío, axe WCAG 2.1 A/AA,
`localStorage` vacío y `Cache-Control: no-store`.
