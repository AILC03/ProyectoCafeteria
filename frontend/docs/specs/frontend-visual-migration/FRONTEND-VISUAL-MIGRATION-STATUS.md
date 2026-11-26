# Registro de cierres — TASKS-FE-VIS-001

**Fuente:** [tasks](./FRONTEND-VISUAL-MIGRATION-TASKS.md), [plan](./FRONTEND-VISUAL-MIGRATION-PLAN.md) y [referencias](./FRONTEND-VISUAL-MIGRATION-REFERENCES.md). Rama de trabajo `feat/frontend-visual-migration` creada desde `AILC03/ProyectoCafeteria:feat/frontend-visual-migration` (`c88d01b`); este registro no modifica el cierre de las tasks funcionales TASK-00…TASK-21. El responsable autorizó individualmente iniciar HYB-01 al pedir «haz eso [...] trabaja en la rama que corresponde» (2026-11-25); no autorizó iniciar HYB-02 ni seleccionar temas.

| Task | Estado | Commit | Evidencia, decisiones, revisiones y aceptación |
| --- | --- | --- | --- |
| HYB-01 — Crear registros e inventario conjunto | Terminada | `mismo commit` | Autorización individual del responsable (2026-11-25). Inventario de todas las superficies de SPEC §6 con originales/destino, recursos, temas candidatos, licencias por verificar, diferencias y aprobaciones pendientes en `FRONTEND-VISUAL-MIGRATION-REFERENCES.md`; fuentes de Ángel a `c88d01b`, rutas cotejadas con `frontend/unified/src/app/router.tsx`; originales, backend y UI sin modificar. `git diff --check` sin errores; revisión técnica independiente en dos pasadas: se corrigieron IDs de temas y se añadió trazabilidad de recursos por superficies, veredicto sin bloqueantes de contenido. No se capturaron ni aceptaron imágenes, temas ni adaptación visual; aprobación visual no aplicable a esta task documental. Decisiones vigentes de SPEC-FE-VIS-001 respetadas; no se propone decisión nueva. |

**HYB-02…HYB-25:** pendientes, sin implementación ni autorización inferida. Los lotes HYB-03/04, adaptaciones sensibles y resultados de cada bloque requieren aprobaciones separadas. No hay capturas aprobadas aún.

## Cómo cerrar una task

1. Comprobar estado Git, fuentes/decisiones vigentes y autorización individual; conservar cambios ajenos.
2. Registrar sólo evidencia real: commits de fuente, archivos, rol/estado/tema/viewport, capturas cuando correspondan, comandos y resultados, diferencias, revisiones técnica/visual aplicables y aprobación del responsable. Distinguir pendiente, bloqueada, pendiente de aceptación y terminada.
3. Una task documental acredita su inventario/revisión técnica, no finge aceptar pantallas. Una task que cambia UI requiere comparación y aceptación visual explícita por bloque.
4. Añadir fila de cierre con `mismo commit` dentro del único commit atómico de la task; después informar el hash real. Sin push, merge, rebase, reset ni `git add -A` por iniciativa propia.
