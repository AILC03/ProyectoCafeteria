---
name: Atomic Task Commit
description: Verifica y crea un commit local, atómico y trazable al finalizar una única tarea aprobada.
---

# Atomic Task Commit

Usa esta skill al finalizar una task ya implementada, verificada y revisada.

Solo crear el commit cuando exista encargo explícito; aprobar spec/plan/backlog o permitir shell no autoriza commits. Para DA-001 cargar `dashboard-sdd`: usar `frontend/docs/specs/dashboard-admin/validation.md` para cierre/evidencia, no el STATUS de unificación. Mantener decisiones transversales aceptadas en el registro frontend existente con referencias cruzadas. En el procedimiento siguiente, seleccionar los documentos de cierre del proyecto activo; nunca añadir una fila DA-001 a un registro histórico ajeno.

## Condiciones previas

- La task pertenece a una spec y plan aprobados.
- La implementación terminó dentro de alcance.
- Las verificaciones obligatorias se ejecutaron y la revisión no tiene hallazgos bloqueantes.
- `git status --short` identifica con claridad los archivos de la tarea y cualquier cambio ajeno.

## Procedimiento

1. Revisa `git diff --check` y el diff de los archivos de la tarea.
2. Para unificación, comprueba decisiones aceptadas en `frontend/docs/specs/frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md` y actualiza su `FRONTEND-UNIFICATION-STATUS.md`. Para DA-001, usa el registro indicado arriba y su skill. En ambos casos conserva sustituciones explícitas y registra estado, fecha, evidencia ejecutada (y omisiones/bloqueos), revisión, IDs de decisiones y referencia `mismo commit`. No inventes pruebas ni marques terminada una task bloqueada.
3. No añadas cambios ajenos, artefactos de build, secretos, archivos `.env` ni lockfiles no justificados.
4. Añade únicamente rutas explícitas de la tarea, **las decisiones nuevas aplicables y la fila de cierre** con `git add -- <ruta>...`.
5. Crea un solo commit local con formato Conventional Commit en español:
   - `feat(clientes): ...`
   - `feat(terminal): ...`
   - `refactor(frontend): ...`
   - `docs(frontend): ...`
   - `test(frontend): ...`
6. Confirma el hash y verifica que el registro se incluyó y no hay cambios no relacionados; informa el hash real en el reporte. No hagas un segundo commit sólo para escribir el hash en la fila.

## Prohibiciones

- No hacer `push`, `merge`, `rebase`, `reset --hard` ni `git add -A`.
- No hacer commit si hay fallos de validación no autorizados o hallazgos bloqueantes.
- No usar un commit para varias tasks.
