---
name: Atomic Task Commit
description: Verifica y crea un commit local, atómico y trazable al finalizar una única tarea aprobada.
---

# Atomic Task Commit

Usa esta skill al finalizar una task ya implementada, verificada y revisada.

## Condiciones previas

- La task pertenece a una spec y plan aprobados.
- La implementación terminó dentro de alcance.
- Las verificaciones obligatorias se ejecutaron y la revisión no tiene hallazgos bloqueantes.
- `git status --short` identifica con claridad los archivos de la tarea y cualquier cambio ajeno.
- Para una tarea que cambia UI: lote/referencia conforme a RV-01 híbrida, capturas comparables, revisión técnica y visual independientes y aceptación explícita del resultado. Carga `frontend-visual-fidelity`; pruebas verdes no acreditan fidelidad. Para documentación/inventario/harness preparatorio, exigir evidencia y revisión técnica de su entrega, no lote previo ni aceptación visual de pantallas que no cambió; una task de referencias obtiene la aprobación del lote como salida. Sin evidencia/aceptación aplicable no cierres como terminada.

## Procedimiento

1. Revisa `git diff --check` y el diff de los archivos de la tarea.
2. Comprueba que las decisiones nuevas aceptadas de la task estén registradas en `frontend/docs/specs/frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md` y que cualquier decisión reemplazada se marque como sustituida. Actualiza la fila de la task en `frontend/docs/specs/frontend-unification/FRONTEND-UNIFICATION-STATUS.md` con estado, fecha, evidencia ejecutada (y omisiones/bloqueos), revisión, IDs de decisiones y referencia `mismo commit`. No inventes pruebas ni marques terminada una task bloqueada.
   Para SPEC-FE-VIS-001 usa el registro de cierre visual definido en el plan aprobado dentro de `frontend/docs/specs/frontend-visual-migration/`, no la tabla de tasks funcionales. Incluye referencias a capturas, commit origen, viewports, estado/rol, diferencias autorizadas y aceptación visual real. Si ese registro aún no está definido o la task no está aprobada, detén el cierre. Las decisiones transversales conservan su registro existente.
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
