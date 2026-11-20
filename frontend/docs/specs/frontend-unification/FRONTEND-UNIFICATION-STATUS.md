# Registro de cierre — TASKS-FE-001

Fuente de alcance y criterios: [FRONTEND-UNIFICATION-TASKS.md](./FRONTEND-UNIFICATION-TASKS.md). Los hashes y fechas provienen del historial local de la rama `feat/frontend-unification`; los resultados de pruebas detallados provienen de las verificaciones comunicadas al cerrar cada tarea. Un commit identifica el cambio, no sustituye la evidencia de ejecución. No se atribuyen cifras a tareas para las que no se conservó una cifra comprobable.

Las recomendaciones aceptadas y sus sustituciones se documentan en el [registro de decisiones](./FRONTEND-UNIFICATION-DECISIONS.md).

| Task | Estado | Fecha del commit | Commit | Resultado / evidencia de cierre |
| --- | --- | --- | --- | --- |
| TASK-00 — Matriz de integración | Terminada | 2026-11-18 | `652b23a` | Contratos, orígenes, QR y restricciones documentados en `FRONTEND-UNIFICATION-INTEGRATION.md`. |
| TASK-01 — Paquete unificado base | Terminada | 2026-11-18 | `040a659` | Scaffold React/TypeScript/Vite, lockfile y build independiente. |
| TASK-02 — Pruebas y calidad base | Terminada | 2026-11-18 | `db176c2` | Vitest, RTL, MSW y Playwright configurados con prueba de humo. |
| TASK-03 — Router, layouts y guardas iniciales | Terminada | 2026-11-18 | `1b7a710` | Rutas cliente/terminal, layouts separados y placeholders; pruebas de router. |
| TASK-04 — Cliente HTTP y Problem Details | Terminada | 2026-11-19 | `9d5e0bf` | CSRF en memoria, RFC7807 y manejo de errores; lint, typecheck, build y 24 pruebas correctos; revisión aprobada. |
| TASK-05 — Sesión y refresh por perfil | Terminada | 2026-11-19 | `7d82325` | Web Locks obligatorio, guardas por actor/rol y bootstrap con refresh coordinado; lint, typecheck, build y 41 pruebas correctos; revisión aprobada. |
| TASK-06 — Cambio de actor y limpieza distribuida | Terminada | 2026-11-19 | `f2146ce` | Logout confirmado, PIN restringido, invalidación distribuida y modal accesible; lint, typecheck, build y 53 pruebas correctos; revisión aprobada. |
| TASK-07 — Almacenamiento local permitido | Terminada | 2026-11-19 | `5a43d6a` | Preferencias y borrador acotados, limpieza legacy/IndexedDB; lint, typecheck, build, escaneo de bundle y 65 pruebas correctos; revisión aprobada. |
| TASK-08 — Idempotencia reutilizable | Terminada | 2026-11-19 | `65ce738` | Operaciones en memoria sin reintento automático; lint, typecheck, build y 73 pruebas correctos; revisión aprobada. |
| TASK-09 — Autenticación y entrada de cliente | Terminada | 2026-11-20 | `mismo commit` | Login `CLIENTE`, invitado en memoria, logout, reemplazo de actor y guardas `/cliente/*`; `lint`, `typecheck`, `build`, 92 pruebas Vitest y 3 E2E Playwright (Chromium, mocks de API) correctos; revisión aprobada; decisiones D-14 a D-16. |

**Pendientes:** TASK-10 a TASK-21. No se consideran terminadas por tener precondiciones cumplidas; cada una requiere implementación, verificación, revisión independiente y commit propio.

**Decisiones por tarea:** TASK-04: D-01; TASK-05: D-02 (sustituida), D-03 y D-04; TASK-06: D-05 a D-07; TASK-07: D-08 a D-11 (D-10 sustituida); TASK-08: D-12 y D-13; TASK-09: D-14 a D-16. TASK-00 a TASK-03 se rigen por la spec y el plan aprobados, sin recomendación adicional registrada aquí.

## Cómo registrar cada cierre futuro

1. Antes del commit, completar las verificaciones aplicables y la revisión independiente sin bloqueantes; consignar cualquier excepción aprobada explícitamente.
2. Añadir **una fila** con identificador, estado, fecha, resumen de alcance, evidencia real (comandos/resultados, omisiones o bloqueos), resultado de revisión e IDs de decisiones aplicables. Preparar esta fila junto con los archivos de la task, no como actualización retrospectiva de otra task.
3. Crear **un único commit atómico** que incluya implementación y fila de cierre. Sustituir en la fila el hash por `mismo commit` antes de crearlo (el hash definitivo no se conoce aún sin crear un segundo commit).
4. Tras el commit, confirmar y comunicar el hash real con `git log -1 --format='%h %cs %s'`, revisar `git show --stat HEAD` y `git status --short`. El hash comunicado es la referencia verificable de esa fila; no crear un segundo commit sólo para sustituir `mismo commit`.

Las filas históricas anteriores se incorporaron de forma retrospectiva; sus hashes corresponden a los commits de implementación originales, no al commit que añade este registro.
