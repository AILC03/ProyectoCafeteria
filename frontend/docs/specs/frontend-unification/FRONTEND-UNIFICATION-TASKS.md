# TASKS-FE-001 — Frontend unificado de Coffee's POS

**Estado:** Aprobado — ejecución en curso
**Fecha:** 2026-11-18  
**Referencias:** [SPEC-FE-001](./FRONTEND-UNIFICATION-SPEC.md) y [PLAN-FE-001](./FRONTEND-UNIFICATION-PLAN.md).

**Seguimiento de cierres:** [Registro de tareas terminadas](./FRONTEND-UNIFICATION-STATUS.md). Este documento define el alcance; el registro indica qué tareas están realmente cerradas y su evidencia.

**Decisiones aceptadas:** [Registro de decisiones](./FRONTEND-UNIFICATION-DECISIONS.md). Una recomendación no aprobada no modifica el alcance de la task.

## Reglas de ejecución

- Estas tasks se ejecutan en orden de dependencias, una por una.
- Antes de cada task: revisar `git status --short` y preservar cambios ajenos.
- Cada task usa `frontend-implementer`, `frontend-verifier` y `frontend-reviewer`; se añade `frontend-spec-researcher` cuando la investigación sea necesaria.
- Ninguna task se commitea sin verificaciones aplicables y revisión independiente sin bloqueantes, salvo excepción autorizada y documentada por el responsable.
- Cada commit será local, atómico y limitado a la task. No se hará push, merge, rebase, reset ni `git add -A`.
- Al cerrar una task, incluir su fila de estado y evidencia en el registro de cierres dentro del mismo commit atómico; confirmar después el hash real en el reporte al responsable.
- Registrar toda decisión propuesta/aceptada antes de implementarla; enlazar sus IDs en el cierre. Una decisión sustituida permanece visible y no habilita implementar la opción anterior.
- Las aplicaciones `clientes/` y `empleados/` no se eliminan ni modifican como parte de una task de coexistencia, salvo que su alcance lo indique y una aprobación posterior lo autorice.

## Dependencias resumidas

```text
T00 → T01 → T02
                ├→ T03
                └→ T04 → T05 → T06 → T07
                                  ├→ T08
                                  ├→ T09 → T10 → T11 → T12
                                  └→ T13 → T14 → T15 ┬→ T16
                                                       ├→ T17
                                                       └→ T18 → T19
T01 + T13 + T15 + T16 + T17 → T20
T11 + T12 + T16 + T17 + T18 + T19 + T20 → T21
```

## Objetivo y comandos de verificación

En cada task, el texto posterior a `TASK-XX —` es su **Objetivo**. Su apartado de verificación se complementa con el perfil de comandos siguiente; todos los comandos se ejecutan desde `frontend/unified/` salvo que se indique otra ruta.

| Perfil | Tasks | Comandos exactos |
| --- | --- | --- |
| V-DOC | T00, T21 | Desde raíz: `git diff --check`. Para T21 además `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e` y `npm run build`. |
| V-BASE | T01 | `npm ci`; `npm run lint`; `npm run typecheck`; `npm run build`. |
| V-TEST | T02–T08 | `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`. |
| V-CLIENT | T09–T12 | `npm run lint`; `npm run typecheck`; `npm run test`; `npm run test:e2e`; `npm run build`. |
| V-TERMINAL | T13–T19 | `npm run lint`; `npm run typecheck`; `npm run test`; `npm run test:e2e`; `npm run build`. |
| V-ELECTRON | T20 | `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`; `npm run dist:win`. `npm run dist:mac` se ejecuta sólo en un entorno macOS autorizado. |

Si un script aún no existe, su task precedente debe añadirlo. Una imposibilidad de ejecutar un comando se documenta como bloqueante y evita el commit salvo autorización explícita.

## TASK-00 — Validar matriz de integración

- **Precondiciones:** ninguna.
- **Alcance / exclusiones:** documentar origen HTTPS, fallback SPA, CORS/CSRF, endpoints y restricciones vigentes; no modificar backend, contrato ni configuración de despliegue.
- **Archivos esperados:** documentación de integración bajo esta carpeta y referencias a OpenAPI/guía backend.
- **Criterios:** separa QR de registro, QR CASH y `X-Ticket-Token`; identifica bloqueos para Electron y caja; confirma que el alta QR requiere invitado sin sesión.
- **Verificación:** revisión de enlaces/contrato y `git diff --check`.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `docs(frontend): document unified integration matrix`.

## TASK-01 — Crear paquete unificado base

- **Precondiciones:** TASK-00 aprobada.
- **Alcance / exclusiones:** crear `frontend/unified/` con React 19, TypeScript estricto, Vite 8 y lockfile propio; no migrar flujos funcionales ni retirar paquetes antiguos.
- **Archivos esperados:** `frontend/unified/package.json`, `package-lock.json`, TS config, Vite config, HTML y entrada mínima.
- **Criterios:** compila de forma aislada; proxy `/api` configurable sin secretos; `clientes/` y `empleados/` siguen intactos.
- **Verificación:** instalación limpia, typecheck, lint y build del paquete nuevo.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(frontend): scaffold unified application`.

## TASK-02 — Configurar pruebas y calidad base

- **Precondiciones:** TASK-01.
- **Alcance / exclusiones:** instalar/configurar Vitest, React Testing Library, MSW y Playwright; no cubrir aún dominios de negocio.
- **Archivos esperados:** configuración de pruebas, setup y una prueba de humo.
- **Criterios:** comandos de test diferenciados para unitario, componentes y E2E; ninguna prueba requiere secretos o API real por defecto.
- **Verificación:** lint, typecheck, build y prueba de humo.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `test(frontend): add unified test foundation`.

## TASK-03 — Crear router, layouts y guardas vacías

- **Precondiciones:** TASK-01 y TASK-02.
- **Alcance / exclusiones:** establecer rutas de cliente y terminal, layouts separados y páginas placeholder; no implementar login, roles ni pantallas del producto.
- **Archivos esperados:** `src/app/`, `src/layouts/` y pruebas de router.
- **Criterios:** existen rutas de SPEC-FE-001; `/terminal` y `/cliente/*` no comparten layout; rutas desconocidas no exponen datos.
- **Verificación:** pruebas de router y accesibilidad básica de navegación.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(frontend): add client and terminal routing`.

## TASK-04 — Unificar cliente HTTP y Problem Details

- **Precondiciones:** TASK-01 y TASK-02.
- **Alcance / exclusiones:** crear cliente tipado `/api/v1` con cookies, CSRF en memoria, RFC 7807 y reintento único de `CSRF_INVALID`; no hacer login ni refresh.
- **Archivos esperados:** `src/shared/api/` y pruebas MSW.
- **Criterios:** mutaciones adjuntan CSRF; errores preservan `status`, `code`, `detail` y `requestId`; tokens no se persisten.
- **Verificación:** pruebas para GET, mutación, `CSRF_INVALID`, 204 y Problem Details; typecheck/lint/build.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(api): add shared csrf client`.

## TASK-05 — Implementar sesión y refresh por perfil

- **Precondiciones:** TASK-04.
- **Alcance / exclusiones:** resolver actor mediante API, refresh con un único líder por perfil y coordinación entre contextos; no migrar pantallas de login.
- **Archivos esperados:** `src/shared/auth/`, provider de sesión y pruebas de concurrencia.
- **Criterios:** nunca lee cookies HttpOnly; dos contextos no ejecutan refresh concurrente; trata 401, `PIN_CHANGE_REQUIRED` y `REFRESH_ALREADY_ROTATED` conforme contrato.
- **Verificación:** perfil V-TEST; pruebas MSW de carrera, 401, 403 y 409. Conforme a D-03, Web Locks es obligatorio para elegir el único líder de refresh por perfil; sin soporte se expone error recuperable y no se intenta refresh, sin mecanismo alterno local.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(auth): coordinate session refresh`.

## TASK-06 — Implementar cambio de actor y limpieza distribuida

- **Precondiciones:** TASK-05.
- **Alcance / exclusiones:** confirmar reemplazo cliente/invitado/personal, logout CSRF, difusión entre pestañas/ventanas y limpieza de estado permitido; no implementar formularios de actor.
- **Archivos esperados:** flujo de cambio de actor, canal entre contextos y pruebas.
- **Criterios:** logout fallido bloquea cambio; 401 definitivo/revocación limpian contexto; se descartan carrito, nombre de invitado y estado privado; sólo sobreviven preferencias visuales no sensibles. Un 403 se propaga por código: `CSRF_INVALID` invalida la caché CSRF de todos los contextos, y `PIN_CHANGE_REQUIRED` restringe cada contexto a cambio de NIP o logout.
- **Verificación:** perfil V-TEST; pruebas de dos contextos, 403 por código y almacenamiento manipulado.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(auth): add actor replacement flow`.

## TASK-07 — Crear almacenamiento local permitido

- **Precondiciones:** TASK-06.
- **Alcance / exclusiones:** crear adaptador para preferencias y borrador de carrito; prohibir/migrar a limpieza las claves legacy e IndexedDB definidas por spec.
- **Archivos esperados:** `src/shared/storage/`, migrador/limpiador controlado y pruebas.
- **Criterios:** no lee credenciales, roles, cuentas, órdenes, tickets ni `CoffeesPosDatabase`; datos manipulados no autorizan acciones.
- **Verificación:** pruebas de allowlist y casos negativos; inspección de bundle para no incluir secretos conocidos.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(storage): restrict local persistence`.

## TASK-08 — Implementar idempotencia reutilizable

- **Precondiciones:** TASK-04 y TASK-06.
- **Alcance / exclusiones:** ofrecer clave/cuerpo estables en memoria para reintentos de operaciones autorizadas; no integrar aún una orden o pago concreto.
- **Archivos esperados:** utilidad de idempotencia y pruebas unitarias.
- **Criterios:** timeout conserva clave y cuerpo; éxito/conflicto finaliza la operación; una acción nueva usa clave nueva; no persiste secretos.
- **Verificación:** pruebas de timeout, reintento, 409 y acción nueva.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(api): add idempotent operation helper`.

## TASK-09 — Migrar autenticación y entrada de cliente

- **Precondiciones:** TASK-03 a TASK-07.
- **Alcance / exclusiones:** migrar login CLIENTE, acceso invitado, logout y guardas de cliente; no migrar QR de registro ni menú.
- **Archivos esperados:** `features/clientes/auth/`, rutas y pruebas.
- **Criterios:** CLIENTE, invitado y personal no se mezclan; guardas no dependen de localStorage; flujos de cambio de actor funcionan.
- **Verificación:** pruebas de componentes y E2E de login/logout/reemplazo; accesibilidad de formulario.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(clientes): migrate authentication entry`.

## TASK-10 — Migrar catálogo y personalización de cliente

- **Precondiciones:** TASK-04, TASK-07 y TASK-09.
- **Alcance / exclusiones:** migrar categorías, productos, detalle y opciones desde API; no crear pedidos.
- **Archivos esperados:** `features/clientes/catalog/` y pruebas MSW/componentes.
- **Criterios:** disponibilidad, mínimos/máximos y recargos se muestran conforme respuesta API; caché local no es fuente operativa.
- **Verificación:** pruebas de carga, vacío, error, producto agotado y navegación por teclado.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(clientes): migrate catalog browsing`.

## TASK-11 — Migrar carrito y orden móvil

- **Precondiciones:** TASK-08 a TASK-10.
- **Alcance / exclusiones:** migrar carrito borrador y creación de orden móvil CASH/STRIPE conforme contrato; no implementar retorno Stripe ni QR de registro.
- **Archivos esperados:** `features/clientes/cart/`, `orders/` y pruebas.
- **Criterios:** no envía precios/totales prohibidos; crea orden con idempotencia; red incierta no muestra pago/success falso.
- **Verificación:** MSW/E2E de orden, timeout/reintento y cambio de catálogo; accesibilidad de carrito.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(clientes): migrate mobile ordering`.

## TASK-12 — Migrar cuenta, favoritos e historial

- **Precondiciones:** TASK-09 y TASK-10.
- **Alcance / exclusiones:** migrar perfil propio, favoritos, historial y repetición; no exponer datos de otros roles.
- **Archivos esperados:** `features/clientes/account/` y pruebas.
- **Criterios:** sólo CLIENTE accede a datos propios; actualización optimista revierte ante fallo; repetir no cobra ni modifica orden original.
- **Verificación:** pruebas de autorización, fallo de favorito y preview/repetición.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(clientes): migrate account features`.

## TASK-13 — Migrar acceso staff y guardas de terminal

- **Precondiciones:** TASK-03 a TASK-07.
- **Alcance / exclusiones:** migrar bienvenida, login staff, logout y rutas por CAJERO/PREPARACION/ADMINISTRADOR; no migrar POS ni administración.
- **Archivos esperados:** `features/terminal/auth/`, guardas y pruebas.
- **Criterios:** elimina ID/PIN local, autologin y rol GERENTE; una respuesta API determina actor; cada rol sólo entra a rutas permitidas.
- **Verificación:** E2E por rol, 401/403 y accesibilidad de acceso terminal.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(terminal): migrate staff access`.

## TASK-14 — Migrar POS y sesión de caja

- **Precondiciones:** TASK-08, TASK-10 y TASK-13.
- **Alcance / exclusiones:** migrar toma de orden de caja, búsqueda/asociación mínima de cliente y apertura/consulta/cierre de caja; no realizar cobro ni QR de registro.
- **Archivos esperados:** `features/terminal/pos/`, `cash/` y pruebas.
- **Criterios:** asociación sólo antes de pago/vencimiento; caja respeta responsable; no hay menú, empleado u orden local como autoridad.
- **Verificación:** MSW/E2E de caja abierta/cerrada, asociación y 403/409; accesibilidad táctil/teclado.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(terminal): migrate pos and cash sessions`.

## TASK-15 — Migrar cobro y ticket protegido

- **Precondiciones:** TASK-08, TASK-13 y TASK-14.
- **Alcance / exclusiones:** migrar cobro CASH con idempotencia y obtención/impresión de ticket protegido; no implementar `X-Ticket-Token` ni retorno Stripe.
- **Archivos esperados:** pago CASH, renderizador de ticket y pruebas.
- **Criterios:** sólo responsable de caja cobra; timeout no produce recibo final; ticket se obtiene con sesión mediante `GET /sales/{id}/ticket`; QR CASH sigue independiente.
- **Verificación:** E2E de cobro, timeout/reintento, conflicto y rol no autorizado.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(terminal): migrate cash payment and ticket`.

## TASK-16 — Migrar QR de registro de invitado

- **Precondiciones:** TASK-09 y TASK-15.
- **Alcance / exclusiones:** renderizar el QR de alta del ticket pagado y migrar el formulario de alta de invitado; no implementar ticket digital, QR CASH ni sesión automática.
- **Archivos esperados:** componentes ticket/QR y `features/clientes/registration/` con pruebas.
- **Criterios:** QR proviene sólo del ticket protegido y se conserva en memoria; al registrar, resuelve actor con API, exige logout si existe sesión y usa CSRF prelogin; no persiste token ni inicia sesión automáticamente. El token no puede aparecer en URL, fragmento, logs, analítica, mensajes de error ni almacenamiento local.
- **Verificación:** perfil V-TERMINAL; E2E de venta invitado → ticket → alta → login normal; pruebas negativas QR CASH, `X-Ticket-Token`, token usado/expirado, sesión activa y fuga por URL/log/memoria persistente.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(clientes): migrate guest ticket registration`.

## TASK-17 — Migrar historial y ventas operativas

- **Precondiciones:** TASK-13 y TASK-15.
- **Alcance / exclusiones:** migrar historial/reimpresión operativa y consultas de ventas permitidas; no conceder historial personal de cliente a staff.
- **Archivos esperados:** `features/terminal/history/`, `sales/` y pruebas.
- **Criterios:** datos expuestos respetan rol/propiedad; reimpresión no genera nuevo cobro/ticket de registro.
- **Verificación:** pruebas por rol, respuestas denegadas y estado vacío/error.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(terminal): migrate operational history`.

## TASK-18 — Migrar cocina y disponibilidad

- **Precondiciones:** TASK-13 y TASK-14.
- **Alcance / exclusiones:** migrar cola `EN_PREPARACION`, acción `LISTO` y disponibilidad permitida para CAJERO; no migrar administración completa.
- **Archivos esperados:** `features/terminal/kitchen/`, disponibilidad y pruebas.
- **Criterios:** sólo estados/roles autorizados; `LISTO` no se fuerza desde estados inválidos; cliente no entra a cocina.
- **Verificación:** pruebas de transición, roles, errores y accesibilidad de cola.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(terminal): migrate kitchen workflow`.

## TASK-19 — Migrar administración de terminal

- **Precondiciones:** TASK-13, TASK-17 y TASK-18.
- **Alcance / exclusiones:** migrar dashboard, catálogo/opciones, personal y corte autorizados; no integrar proveedores externos no habilitados.
- **Archivos esperados:** `features/terminal/admin/` y pruebas.
- **Criterios:** sólo ADMINISTRADOR accede a CRUD administrativo; CAJERO conserva únicamente disponibilidad permitida; no se muestran secretos/proveedores simulados como operativos.
- **Verificación:** pruebas de guardas, validación API, errores y accesibilidad administrativa.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(terminal): migrate administration workspace`.

## TASK-20 — Adaptar Electron a terminal unificada

- **Precondiciones:** TASK-01, TASK-13, TASK-15, TASK-16 y TASK-17; origen/Fallback SPA validado en TASK-00.
- **Alcance / exclusiones:** migrar wrapper Electron para cargar URL HTTP(S) configurada en `/terminal`, allowlist externa y builds; no habilitar `file://` ni modo offline.
- **Archivos esperados:** `frontend/unified/electron/`, scripts de empaquetado y pruebas/documentación.
- **Criterios:** conserva aisladores de seguridad; desarrollo apunta a Vite unificado; producción exige origen permitido y HTTPS; no puede navegar al área cliente.
- **Verificación:** build, empaquetado aplicable Windows/macOS y prueba autorizada de login/mutación CSRF desde Electron.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `feat(electron): load unified terminal route`.

## TASK-21 — Ejecutar validación de sustitución

- **Precondiciones:** TASK-11, TASK-12, TASK-16 a TASK-20.
- **Alcance / exclusiones:** ejecutar y documentar matriz integral; no borrar aplicaciones previas.
- **Archivos esperados:** evidencia de verificación y actualización documental de cobertura.
- **Criterios:** cubre rutas, roles, sesión única, CSRF, idempotencia, almacenamiento manipulado, QR de registro, accesibilidad y Electron; compara cada flujo migrado con su aplicación origen, documenta diferencias aprobadas y prepara evidencia para aceptación funcional. Separa ejecutado, omitido y bloqueado.
- **Verificación:** perfil V-DOC; suite completa del paquete, E2E aplicable y revisión de diff/documentos.
- **Revisor:** `frontend-reviewer`.
- **Commit esperado:** `test(frontend): document unified validation matrix`.

## Aprobación requerida

La aprobación de este documento autoriza implementar **TASK-00** únicamente. Antes de iniciar cada task posterior, el coordinador solicitará la aprobación explícita del responsable para esa task concreta, aunque sus dependencias estén terminadas, verificadas, revisadas y commiteadas. Cualquier cambio de alcance requiere actualizar spec/plan/tasks y aprobación del responsable.
