# Tarea: TASK-13 — Acceso staff y guardas de terminal en frontend unificado

- Responsable: Leonel (implementación coordinada con IA)
- Revisor humano: Equipo frontend, pendiente de PR
- Aplicación afectada: `frontend/unified/` (área terminal)
- Rama base: `feat/frontend-task-12` (PR #12 TASK-11 y PR #13 TASK-12; se actualizará a `main` tras su integración)
- Rama de trabajo: `feat/frontend-task-13`
- Estado: implementada y verificada; pendiente de revisión humana y PR

## Objetivo y fuentes

Migrar el acceso staff y las guardas de terminal del frontend unificado conforme a
[TASK-13](../specs/frontend-unification/FRONTEND-UNIFICATION-TASKS.md),
[SPEC-FE-001](../specs/frontend-unification/FRONTEND-UNIFICATION-SPEC.md),
[PLAN-FE-001](../specs/frontend-unification/FRONTEND-UNIFICATION-PLAN.md),
[OpenAPI](../../../backend/docs/api/openapi.yaml),
[permisos](../permissions.md) y [reglas](../business-rules.md).

## Alcance y exclusiones

- Incluye: login staff (`POST /api/v1/auth/login/staff`), logout staff
  (`POST /api/v1/auth/logout`), bienvenida en `/terminal` y guardas de rol para
  `CAJERO`, `PREPARACION`, `ADMINISTRADOR` y eliminación del rol legacy `GERENTE`.
- No incluye: migrar POS, cobro, caja, cocina, administración, QR, recuperación o
  reset de PIN, cambios de contrato/backend ni servicios reales.

## Criterios de aceptación y trazabilidad

| ID | Requisito y fuente | Archivo / componente afectado | Verificación esperada | Estado |
| --- | --- | --- | --- | --- |
| CA-01 | Login staff válido/inválido, CSRF prelogin, `mustChangePin`, 401/403/429 | `features/terminal/auth/`, `shared/auth/session.ts` | POST `/auth/login/staff`, CSRF, PIN, errores | Verificado |
| CA-02 | Logout staff revoca sesión y limpia estado privado | `features/terminal/`, `shared/auth/session.ts` | POST `/auth/logout`, limpieza y error al fallar | Verificado |
| CA-03 | Bienvenida `/terminal` y destino post-login por rol | `features/terminal/auth/`, router | CAJERO/ADMINISTRADOR → `/terminal/pos`; PREPARACION → `/terminal/cocina` | Verificado |
| CA-04 | Guardas por rol en rutas terminal | `app/guards.tsx`, router | CAJERO/ADMINISTRADOR en POS y caja; PREPARACION/CAJERO/ADMINISTRADOR en cocina; ADMINISTRADOR en administración; GERENTE y CUSTOMER bloqueados | Verificado |
| CA-05 | Accesibilidad y E2E por rol, 401/403 | pruebas E2E/componente | teclado, estados, bloques y mensajes seguros | Verificado |

## Impacto técnico

- API: sólo rutas y esquemas existentes en OpenAPI; no se agregaron endpoints.
- Estado local: sin ID/PIN locales ni autologin; actor determinado por API, CSRF sólo en memoria.
- Interfaz: bienvenida pública, acceso staff en `/terminal/acceso`, logout en el layout y guards por rol.

## Decisiones aplicadas (propuestas, pendientes de ratificación formal)

1. Destino post-login staff: `/terminal/pos` para CAJERO/ADMINISTRADOR y
   `/terminal/cocina` para PREPARACION; roles inesperados vuelven a `/terminal`.
2. Login staff con sesión activa: se reutiliza `replaceActor('terminal')` desde
   “Cambiar de usuario”, con logout previo y mensaje de error si falla.
3. `mustChangePin` staff: se respeta la restricción global a `/cambiar-nip`; no se
   implementa flujo de cambio/reset de PIN ni recuperación (fuera de alcance).

## Evidencia de entrega

- Archivos nuevos: `features/terminal/auth/{staffAuthValidation.ts,staffAccess.ts,TerminalWelcomePage.tsx,TerminalAuthPage.tsx,staffAuth.unit.test.ts,TerminalAuthPage.component.test.tsx}`, `e2e/staff-auth.spec.ts`.
- Archivos modificados: `shared/api/client.ts`, `shared/auth/session.ts`,
  `shared/auth/session.unit.test.ts`, `app/guards.tsx`, `app/router.tsx`,
  `layouts/TerminalLayout.tsx`, `App.component.test.tsx`.
- Comandos y resultados (perfil V-TERMINAL): `npm.cmd run lint` ✅,
  `npm.cmd run typecheck` ✅, `npm.cmd run test` **165/165 en 16 archivos** ✅,
  `npm.cmd run test:e2e` **12/12 en Chromium** ✅, `npm.cmd run build` ✅,
  `git diff --check` ✅.
- Entorno: Node v26.13.0 detectado, fuera del rango declarado `>=22.13.0 <23`;
  queda repetir la matriz con Node 22 en el pipeline del equipo.
- Pruebas manuales con API real: no previstas; URL y estados simulados con MSW/Playwright.
- Pendientes conocidos: revisión humana y ratificación de las decisiones
  propuestas; registro de cierre incluido en
  `FRONTEND-UNIFICATION-STATUS.md` y PR #14 abierto sobre la rama base.

## Referencias

- [TASK-13 — Migrar acceso staff y guardas de terminal](../specs/frontend-unification/FRONTEND-UNIFICATION-TASKS.md)
- [SPEC-FE-001 — Unificación frontend](../specs/frontend-unification/FRONTEND-UNIFICATION-SPEC.md)
- [PLAN-FE-001 — Unificación frontend](../specs/frontend-unification/FRONTEND-UNIFICATION-PLAN.md)
- [Cobertura de endpoints](../api/endpoints-coverage.md)
- [Backlog](../development-tasks.md)
