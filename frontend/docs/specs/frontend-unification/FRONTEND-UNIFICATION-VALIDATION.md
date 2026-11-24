# Validación de sustitución — Frontend unificado

Evidencia de TASK-21 ejecutada el **2026-11-23** sobre la rama `feat/frontend-unification`, con Node v22.14.0 y dependencias instaladas en `frontend/unified/`. Separa **ejecutado**, **parcial**, **omitido** y **bloqueado**. No sustituye la aceptación funcional del responsable ni autoriza retirar `clientes/` o `empleados/`.

Los resultados numéricos corresponden a las ejecuciones reales de esta validación. Las pruebas E2E de navegador usan Chromium con API simulada; la prueba de Electron combina su suite automatizada con una verificación en vivo contra backend local autorizado.

## 1. Comandos ejecutados

| Comando (en `frontend/unified/`) | Resultado |
| --- | --- |
| `npm.cmd run lint` | Correcto, sin diagnósticos. |
| `npm.cmd run typecheck` | Correcto (`tsc -b`). |
| `npm.cmd run test` | **283/283** en **32 archivos**. |
| `npm.cmd run test:e2e` | **54/54** en 12 archivos; 4 pruebas de Electron. |
| `npm.cmd run build` | Correcto; advertencia no bloqueante de chunk > 500 kB. |
| `git diff --check` | Sin errores de whitespace. |
| `npx electron-builder --win portable nsis --x64 --config.directories.output=%TEMP%` (ejecutado desde `cmd`; en PowerShell usar `"$env:TEMP\..."`) | Correcto; `app.asar` con `electron/*.cjs` y `package.json`, sin `node_modules` ni `dist`. |

Composición E2E: `admin` 6, `client-account` 1, `client-auth` 3, `client-catalog` 1, `electron` 4, `history` 7, `kitchen` 6, `mobile-order` 2, `payment-ticket` 6, `pos-and-cash` 3, `staff-auth` 5, `ticket-registration` 10.

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
| QR de registro de invitado, token no persistido y sin login automático | `ticket-registration.spec.ts` (10 pruebas), pruebas de `registration` | **Ejecutado** | API simulada; el alta real contra backend autorizado no se ejecutó en esta task. |
| Accesibilidad: teclado, foco, contraste y movimiento reducido | Pruebas de foco/teclado en componentes y E2E; `prefers-reduced-motion` en `base.css` | **Parcial** | No hay análisis automatizado de contraste ni `axe`. |
| Electron carga `/terminal`, conserva aislamientos y bloquea cliente | `e2e/electron.spec.ts` (4), revisión independiente | **Ejecutado** | Origen de desarrollo `http://localhost:5173`. |
| Mutación CSRF real desde Electron | Ver §3 | **Ejecutado** | Contra backend local autorizado, no contra un origen HTTPS de distribución. |
| Electron desde origen HTTPS con fallback History API | — | **Bloqueado** | No existe despliegue HTTPS ni host con fallback autorizado en este entorno. |
| Build macOS | Configuración `dmg`/`zip` en `package.json` | **Omitido** | No construible desde Windows; requiere macOS. |
| Empaquetado en `release/` del workspace | `npm.cmd run dist:win` | **Bloqueado** | `EPERM` al renombrar por ACL de OneDrive; el empaquetado equivalente en `%TEMP%` fue correcto. |
| Comparación con aplicaciones origen | §4 | **Ejecutado (documental)** | No se ejecutaron las apps legadas en paralelo; el mapeo por flujo figura en §4. |
| Retiro de `clientes/` y `empleados/` | — | **Omitido por alcance** | TASK-21 prohíbe eliminarlas; requiere un plan de retiro separado y aceptación funcional. |

## 3. Verificación en vivo de Electron

Procedimiento autorizado por el responsable y **ejecutado durante TASK-20; se reutiliza aquí como evidencia de validación**. Usó backend local (`:3000`), PostgreSQL local, Vite (`:5173`, origen permitido por `FRONTEND_ORIGIN`) y un usuario temporal con rol CAJERO creado para la prueba:

1. Electron cargó `http://localhost:5173/terminal` con `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` y `webSecurity:true`.
2. Login staff real: `POST /api/v1/auth/login/staff` → **200**, cookies de sesión y CSRF presentes.
3. Se abrió `/terminal/disponibilidad` y se ejecutó una mutación real: `PATCH /api/v1/products/1/availability` → **200**, con cabecera `x-csrf-token` y cookie CSRF.
4. Se restauró el estado del producto con un segundo `PATCH` → **200**.
5. El usuario temporal y sus eventos de auditoría locales se eliminaron al terminar; no se guardaron contraseñas ni secretos en el repositorio.

Esto cubre login y mutación CSRF desde Electron sobre un origen de desarrollo permitido. **No** cubre el requisito de origen HTTPS de distribución ni el fallback History API de un host real.

## 4. Diferencias respecto a las aplicaciones origen

| Flujo | Origen | Unificado | Estado |
| --- | --- | --- | --- |
| Arranque de escritorio | `empleados/electron` cargaba Vite en desarrollo y `file://` en producción | Carga URL HTTP(S) a `/terminal`; sin `file://` ni offline | Cambio aprobado (D-23/D-25). |
| Credenciales/datos demo | Roles, usuarios y menú locales de demostración | Sólo API; sin credenciales de respaldo | Diferencia documentada por el plan §5 (no migrar `empleados/src/data`); no es una aprobación nueva. |
| Carrito legado | `taffy_cart` en `localStorage` | Borrador acotado `cafeteria:cart-draft:v1` | Cambio aprobado (D-11). |
| PIN/reset de personal | Flujos y PIN locales | No migrados; autenticación por usuario/contraseña de API | Cambio aprobado (TASK-13). |
| PDF/impresión | Impresión simulada local | Vista imprimible con `window.print()` | Cambio aprobado (D-20). |
| PWA de clientes | `manifest.json` y service worker | No incluida en el paquete unificado | Fuera del alcance de la spec §9 (Electron es el canal de escritorio); no sustituye la validación de Electron. |
| QR CASH y pago Stripe | Funciones parciales/simuladas en origen | QR CASH y cobro Stripe no migrados | Fuera de alcance de las tasks cerradas. |

## 5. Conclusión

Las rutas, roles, sesión, CSRF, idempotencia, QR de registro y Electron cuentan con evidencia automatizada; Electron además se validó en vivo contra backend local. Quedan **bloqueados** el origen HTTPS de distribución con fallback SPA y el empaquetado en `release/` por el entorno, y **omitidos** el build macOS, la validación real de alta QR contra backend y la accesibilidad automatizada de contraste. La aceptación funcional y cualquier retiro de las aplicaciones anteriores requieren decisión del responsable y un plan separado.
