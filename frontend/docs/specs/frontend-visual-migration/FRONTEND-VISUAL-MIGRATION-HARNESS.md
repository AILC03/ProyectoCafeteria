# Harness de capturas aisladas — HYB-02 (en curso)

La configuración de capturas es **independiente** de `frontend/unified/playwright.config.ts`: el E2E funcional excluye `e2e/visual/**`. El harness no selecciona tema ni crea baselines aprobados.

## Arranque y ejecución

En Windows, instalar desde los lockfiles existentes sin cambiar las fuentes originales:

```powershell
npm.cmd --prefix frontend/clientes ci --ignore-scripts
npm.cmd --prefix frontend/empleados ci --ignore-scripts
npm.cmd --prefix frontend/unified ci
```

Después, desde `frontend/unified/`:

```powershell
npm.cmd run test:visual -- --workers=1
```

Playwright levanta tres servidores Vite con `--host localhost --strictPort`: unificado `5173`, cliente original `5183`, terminal original `5184`. No reutiliza servidores preexistentes. Si el puerto está ocupado, se detiene en vez de tomar un servidor no controlado. El proxy API unificado apunta a `127.0.0.1:1` (sin backend); los proxies de los originales conservan su configuración legada pero las peticiones de navegador se interceptan antes de navegar. No se inicia backend ni se usa `.env`, cuenta, ticket, QR o base de datos real.

`e2e/visual/fixtures.ts` crea perfiles de navegador efímeros independientes, bloquea service workers y controla el cierre; `capture.helpers.ts` intercepta API y conexiones externas (incluidas fuentes remotas), espera fuente cargada, comprueba estado y recursos de imagen; `harness.visual.spec.ts` comprueba fallo por selector/imagen inexistente, aislamiento de cookies/storage, bloqueo de API no simulada/red externa y arranque Electron con perfil temporal y preload real. La ruta Electron se sirve desde Vite unificado, cuyo proxy API está deliberadamente desconectado también antes de instalar los mocks en la página.

Los PNG y JSON de humo se escriben **sólo bajo `frontend/unified/test-results/` (ignorado por Git)** con contexto, origen, revisión fuente, viewport, DPR y OS; `approvedBaseline: false`. No contienen datos reales. Las fuentes externas se bloquean en esta fase, así que **estas imágenes no son evidencia comparable de fidelidad**, ni se promocionan al lote de HYB-03/04. Antes de aprobar referencias se debe resolver/probar la carga y licencia de las fuentes elegidas con un mecanismo autorizado, fixture equivalente, viewport, tema y estado explícitos. El harness no prueba por sí solo todos los estados o roles.

## Resultados preliminares (2026-11-25)

- `npm.cmd run test:visual -- --list`: 4 tests visuales en un archivo (test de aislamiento de red añadido tras el listado inicial de 3).
- `npm.cmd run test:visual -- --workers=1`: **4/4** en Node v22.23.0, incluidos navegador y Electron con bridge real y captura de humo temporal. Durante el desarrollo aparecieron fallos al recargar Electron: además de esperar a que termine la primera carga, se corrigió un mock demasiado amplio (`**/api/**`) que interceptaba erróneamente los módulos `/src/shared/api/*.ts`; el mock final limita peticiones al prefijo real `http://localhost:5173/api/**`. No se atribuyen capturas aprobadas a los ensayos anteriores.
- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test` (**283/283**, 32 archivos), `npm.cmd run test:e2e` (**59/59**, 59 pruebas funcionales excluyen las 4 visuales), `npm.cmd run build` correctos en Node v22.23.0 después de `npm ci` en cada paquete.
- `git diff --check` sin errores para archivos ya seguidos; comprobar también archivos nuevos con `git diff --cached --check` al preparar un cierre.
- **Entorno:** Node v22.23.0 temporal en `%LOCALAPPDATA%/Temp/opencode/node22-visual/`, sin cambiar instalación global v26.13.0; `build` advierte chunk >500 kB (preexistente, sin modificación de bundle por esta task).
- **Revisión técnica independiente:** pendiente; el intento de subagente terminó en «Free usage limit reached». Sin revisión aprobada no cerrar HYB-02 ni iniciar HYB-03 como cerrada.

## Auto-revisión del implementador (no independiente)

- Diff limitado a configuración y pruebas visuales del unificado, script del paquete y documentación visual; `frontend/clientes/`, `frontend/empleados/` y `backend/` sin cambios. `npm ci` sólo instaló dependencias ignoradas por Git.
- Tres servidores bind a `localhost`/`strictPort`, sin reutilización; el backend del unificado apunta a un destino inactivo. Navegador mockea `/api/` por prefijo de ruta y aborta orígenes externos. Electron mockea **sólo** `http://localhost:5173/api/**`: una máscara más amplia bloqueaba módulos legítimos y fue retirada tras detectar pantalla vacía.
- Tests de selector/imagen ausente y API no simulada fallan correctamente; cookies y localStorage sintéticos no cruzan perfiles. Originales y unificado no comparten contexto de navegador; Electron usa carpeta temporal y preload real.
- Los artefactos se guardan en `test-results/` ignorado; JSON señala `approvedBaseline: false` y advierte que las fuentes externas están bloqueadas. No hay capturas ni temas aprobados y no se cambió código de interfaz.
- Este checklist **no acredita revisión independiente ni aceptación humana**. Mantener HYB-02 en curso hasta revisión externa o excepción explícita y documentada del responsable.
