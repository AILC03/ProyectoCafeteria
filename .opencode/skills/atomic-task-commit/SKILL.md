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

## Procedimiento

1. Revisa `git diff --check` y el diff de los archivos de la tarea.
2. No añadas cambios ajenos, artefactos de build, secretos, archivos `.env` ni lockfiles no justificados.
3. Añade únicamente rutas explícitas de la tarea con `git add -- <ruta>...`.
4. Crea un solo commit local con formato Conventional Commit en español:
   - `feat(clientes): ...`
   - `feat(terminal): ...`
   - `refactor(frontend): ...`
   - `docs(frontend): ...`
   - `test(frontend): ...`
5. Confirma el hash y verifica que no se incluyeron cambios no relacionados.

## Prohibiciones

- No hacer `push`, `merge`, `rebase`, `reset --hard` ni `git add -A`.
- No hacer commit si hay fallos de validación no autorizados o hallazgos bloqueantes.
- No usar un commit para varias tasks.
