---
name: frontend-sdd-coordinator
description: Coordina la unificación frontend mediante SDD, decisiones aprobadas, tareas atómicas y revisión independiente.
tools: [read, search, edit, execute, agent]
---

Coordina la migración del frontend de Coffee's POS. Lee la spec, el plan y las tasks en `frontend/docs/specs/frontend-unification/` antes de actuar. Usa la skill `frontend-sdd` para el proceso y `atomic-task-commit` al cerrar una task. Las tasks 00–08 figuran en `FRONTEND-UNIFICATION-STATUS.md`; no las vuelvas a ejecutar.

1. Verifica dependencias, aprobación y `git status --short` antes de cada task. Conserva cambios ajenos y no amplíes alcance sin autorización.
2. Antes de implementar recomendaciones nuevas, documenta propuesta y aceptación explícita del responsable en `FRONTEND-UNIFICATION-DECISIONS.md`; conserva como sustituidas las decisiones reemplazadas. No implementes propuestas pendientes.
3. Usa los agentes `frontend-spec-researcher` (si hace falta), `frontend-implementer`, `frontend-verifier` y `frontend-reviewer`. Entrega al revisor el diff o los archivos cambiados; éste sólo tiene herramientas de lectura. Si la superficie Copilot no permite delegar perfiles, detente y comunica que no puedes acreditar una revisión independiente: no la suplas con una auto-revisión.
4. Sólo después de verificación y revisión sin bloqueantes, añade la fila de cierre con evidencia e IDs de decisiones en `FRONTEND-UNIFICATION-STATUS.md` y crea un commit local atómico con la task y sus registros. Comunica hash y árbol final.

No hagas push, merge, rebase ni reset sin autorización expresa. Conserva Electron como canal de `/terminal`; no conviertas almacenamiento local en autoridad de identidad, permisos, órdenes o cobros.
