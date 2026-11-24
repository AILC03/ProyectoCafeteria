# Validación de sustitución — Frontend unificado

Evidencia de TASK-21 ejecutada el **2026-11-23** sobre la rama `feat/frontend-unification`, con Node v22.14.0 y dependencias instaladas en `frontend/unified/`. Separa **ejecutado**, **parcial**, **omitido** y **bloqueado**. No sustituye la aceptación funcional del responsable ni autoriza retirar `clientes/` o `empleados/`.

Los resultados numéricos corresponden a las ejecuciones reales de esta validación. Las pruebas E2E de navegador usan Chromium con API simulada; la prueba de Electron combina su suite automatizada con una verificación en vivo contra backend local autorizado.

## 1. Comandos ejecutados

| Comando (en `frontend/unified/`) | Resultado |
| --- | --- |
| `npm.cmd run lint` | Correcto, sin diagnósticos. |
| `npm.cmd run typecheck` | Correcto (`tsc -b`). |
| `npm.cmd run test` | **283/283** en **32 archivos**. |
| `npm.cmd run test:e2e` | **59/59** en 13 archivos; 4 pruebas de Electron y 5 auditorías axe. |
| `npm.cmd run build` | Correcto; advertencia no bloqueante de chunk > 500 kB. |
| `git diff --check` | Sin errores de whitespace. |
| `npx electron-builder --win portable nsis --x64 --config.directories.output=%TEMP%` (ejecutado desde `cmd`; en PowerShell usar `"$env:TEMP\..."`) | Correcto; `app.asar` con `electron/*.cjs` y `package.json`, sin `node_modules` ni `dist`. |

Composición E2E: `admin` 6, `client-account` 1, `client-auth` 3, `client-catalog` 1, `electron` 4, `history` 7, `kitchen` 6, `mobile-order` 2, `payment-ticket` 6, `pos-and-cash` 3, `staff-auth` 5, `ticket-registration` 10 y `accessibility` 5.

La suite axe usa `@axe-core/playwright` 4.14 y analiza WCAG 2.1 A/AA con `color-contrast` en 5 auditorías sobre 4 rutas: `/cliente/menu`, `/terminal/acceso` (visitante y CAJERO), `/terminal/pos` y `/terminal/administracion`. Falla tanto ante violaciones como ante resultados `incomplete` de `color-contrast`. En la ejecución final no quedaron violaciones; se corrigió un `label-content-name-mismatch` real en el botón de producto del POS.

## 2. Matriz de criterios

| Criterio / escenario | Evidencia | Estado | Límites o diferencias |
| --- | --- | --- | --- |
| Una sola aplicación con rutas cliente/terminal | `src/app/router.tsx`, pruebas de router y componentes; `client-*`, `staff-auth`, `pos-and-cash`, `admin`, `history`, `kitchen` | **Ejecutado** | Rutas de terminal y cliente en el mismo build. |
| Visitante y CLIENTE limitados a su perfil, favoritos e historial | `client-auth.spec.ts`, `client-account.spec.ts`, `client-catalog.spec.ts`, pruebas de cuenta | **Ejecutado** | Con API simulada; la autorización final sigue siendo del backend. |
| Roles CAJERO/PREPARACION/ADMINISTRADOR y acciones permitidas | `staff-auth`, `admin`, `kitchen`, `pos-and-cash`, `history`; guardas de sesión | **Ejecutado** | Cubre accesos y acciones principales por rol; no agota cada endpoint administrativo. |
| Cambio cliente ↔ personal, confirmación y logout | `client-auth.spec.ts` (3), `session.unit.test.ts`, `SessionProvider` | **Ejecutado** | Simulado; no se probó con dos navegadores físicos. |
| Sesión única por perfil y difusión entre pestañas | Web Locks y `BroadcastChannel` en pruebas unitarias/componentes | **Parcial** | Verificado por contrato y mocks; no hay prueba E2E con dos contextos reales. |
| Limpieza de estado privado y tokens al cerrar/reemplazar | `session.unit.test.ts`, `storage/*.unit.test.ts`, `ticket-registration.spec.ts` | **Ejecutado** | Se comprueban claves conocidas y tokens de registro. |
| Almacenamiento local manipulado no concede sesión/rol/orden | Pruebas de almacenamiento y negativas E2E | **Parcial** | No hay barrido exhaustivo de todas las claves legadas de dispositivos antiguos. |
| CSRF, cookies y errores 401/403/409/429/503 | `client.unit.test.ts`, `payment-ticket.spec.ts`, `admin.spec.ts` (cabecera `x-csrf-token`) | **Ejecutado** | Contrato cubierto con mocks; en vivo se validó una mutación real (ver §3). |
| Idempotencia y resultado incierto en pagos/órdenes | `idempotency.unit.test.ts`, `payment-ticket.spec.ts`, `mobile-order.spec.ts` | **Ejecutado** | Con API simulada; no se provocó un timeout real contra backend. |
| QR de registro de invitado, token no persistido y sin login automático | `ticket-registration.spec.ts` (10 pruebas), pruebas de `registration` y flujo real de §4 | **Ejecutado** | Automatizado con mocks y validado contra backend local; ver §4. |
| Accesibilidad: teclado, foco, contraste y movimiento reducido | Suite axe (5 auditorías sobre 4 rutas, con `incomplete` de contraste), pruebas de foco/teclado y `prefers-reduced-motion` | **Ejecutado (automatizado)** | axe cubre contraste y reglas WCAG A/AA; no sustituye una revisión manual con lector de pantalla. |
| Electron carga `/terminal`, conserva aislamientos y bloquea cliente | `e2e/electron.spec.ts` (4), revisión independiente | **Ejecutado** | Origen de desarrollo `http://localhost:5173`. |
| Mutación CSRF real desde Electron | Ver §3 | **Ejecutado** | Contra backend local autorizado, no contra un origen HTTPS de distribución. |
| Electron desde origen HTTPS con fallback History API | — | **Bloqueado** | No existe despliegue HTTPS ni host con fallback autorizado en este entorno. |
| Build macOS | Configuración `dmg`/`zip` en `package.json` | **Omitido por decisión** | D-26: el responsable no requiere macOS por ahora; la configuración se conserva. |
| Empaquetado en `release/` del workspace | `npm.cmd run dist:win` | **Bloqueado por entorno** | `EPERM` al renombrar por ACL de OneDrive; el empaquetado equivalente en `%TEMP%` fue correcto. Ver D-26. |
| Comparación con aplicaciones origen | §5 | **Ejecutado (documental)** | No se ejecutaron las apps legadas en paralelo; el mapeo por flujo figura en §5. |
| Retiro de `clientes/` y `empleados/` | — | **Omitido por alcance** | TASK-21 prohíbe eliminarlas; requiere un plan de retiro separado y aceptación funcional. |

## 3. Verificación en vivo de Electron

Procedimiento autorizado por el responsable y **ejecutado durante TASK-20; se reutiliza aquí como evidencia de validación**. Usó backend local (`:3000`), PostgreSQL local, Vite (`:5173`, origen permitido por `FRONTEND_ORIGIN`) y un usuario temporal con rol CAJERO creado para la prueba:

1. Electron cargó `http://localhost:5173/terminal` con `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` y `webSecurity:true`.
2. Login staff real: `POST /api/v1/auth/login/staff` → **200**, cookies de sesión y CSRF presentes.
3. Se abrió `/terminal/disponibilidad` y se ejecutó una mutación real: `PATCH /api/v1/products/1/availability` → **200**, con cabecera `x-csrf-token` y cookie CSRF.
4. Se restauró el estado del producto con un segundo `PATCH` → **200**.
5. El usuario temporal y sus eventos de auditoría locales se eliminaron al terminar; no se guardaron contraseñas ni secretos en el repositorio.

Esto cubre login y mutación CSRF desde Electron sobre un origen de desarrollo permitido. **No** cubre el requisito de origen HTTPS de distribución ni el fallback History API de un host real.

## 4. Registro QR real contra backend local

Procedimiento autorizado por el responsable y ejecutado el 2026-11-23 contra el backend local (`:3000`), PostgreSQL local y Vite (`:5173`). Antes se aplicaron las migraciones pendientes del entorno local con `npx prisma migrate deploy` (3 migraciones) y se proporcionó `TICKET_ENCRYPTION_KEY` sólo al proceso del servidor, sin escribirla en el repositorio. Los primeros intentos devolvieron `503 DEPENDENCY_UNAVAILABLE` por esas migraciones pendientes; tras aplicarlas el flujo completo funcionó.

1. Un usuario temporal CAJERO abrió caja y creó una orden CASH de invitado con opciones válidas.
2. `POST /api/v1/payments/cash` confirmó la venta **V000007**.
3. `GET /api/v1/sales/{id}/ticket` devolvió un `registration` con token de **43 caracteres** y `qrPayload === "cafeteria:register:<token>"`.
4. En `/cliente/registro-ticket`, el formulario real envió `POST /api/v1/customer-registration/ticket` → **201** y la interfaz mostró «Cuenta creada… Inicia sesión para continuar».
5. El cliente registrado **C000005** pudo iniciar sesión con `POST /api/v1/auth/login/customer` → **200**.
6. La caja se cerró con `POST /api/v1/cash-sessions/{id}/close` → **200**.
7. El usuario temporal se desactivó y sus eventos de auditoría locales se eliminaron; no se guardaron contraseñas, tokens ni claves en el repositorio.

Conclusión: el alta real consume el token, crea la cuenta y no inicia sesión automáticamente. Quedan datos de prueba locales (ventas, órdenes y clientes) en la base de desarrollo; no se usaron datos productivos.

## 5. Diferencias respecto a las aplicaciones origen

| Flujo | Origen | Unificado | Estado |
| --- | --- | --- | --- |
| Arranque de escritorio | `empleados/electron` cargaba Vite en desarrollo y `file://` en producción | Carga URL HTTP(S) a `/terminal`; sin `file://` ni offline | Cambio aprobado (D-23/D-25). |
| Credenciales/datos demo | Roles, usuarios y menú locales de demostración | Sólo API; sin credenciales de respaldo | Diferencia documentada por el plan §5 (no migrar `empleados/src/data`); no es una aprobación nueva. |
| Carrito legado | `taffy_cart` en `localStorage` | Borrador acotado `cafeteria:cart-draft:v1` | Cambio aprobado (D-11). |
| PIN/reset de personal | Flujos y PIN locales | No migrados; autenticación por usuario/contraseña de API | Cambio aprobado (TASK-13). |
| PDF/impresión | Impresión simulada local | Vista imprimible con `window.print()` | Cambio aprobado (D-20). |
| PWA de clientes | `manifest.json` y service worker | No incluida en el paquete unificado | Fuera del alcance de la spec §9 (Electron es el canal de escritorio); no sustituye la validación de Electron. |
| QR CASH y pago Stripe | Funciones parciales/simuladas en origen | QR CASH y cobro Stripe no migrados | Fuera de alcance de las tasks cerradas. |

## 6. Conclusión

Las rutas, roles, sesión, CSRF, idempotencia, QR de registro, accesibilidad y Electron cuentan con evidencia automatizada. Además, Electron se validó en vivo con login y mutación CSRF, y el registro QR se validó de extremo a extremo contra backend local. Queda **bloqueado** el origen HTTPS de distribución con fallback SPA y el empaquetado en `release/` del workspace por el entorno; macOS queda **fuera de alcance** por decisión del responsable (D-26). La aceptación funcional y cualquier retiro de las aplicaciones anteriores requieren decisión del responsable y un plan separado.
