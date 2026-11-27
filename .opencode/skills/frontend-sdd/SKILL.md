---
name: Frontend SDD
description: Dirige unificación y migración visual con spec, plan, tasks aprobadas y verificación técnica y visual.
---

# Frontend SDD

Usa esta skill para unificación de clientes/empleados y migración visual de SPEC-FE-VIS-001. Para esta última carga también `frontend-visual-fidelity`; durante diseño/implementación visual usa `frontend-design` bajo los límites de fidelidad del proyecto.

Para el dashboard DA-001 usa la skill `dashboard-sdd` y sus spec/plan/tasks propios; no reutilices tareas ni STATUS históricos de unificación para cerrar trabajo del dashboard. Dentro de una tarea autorizada no solicites aprobación por cada edición o comando rutinario: la aprobación SDD del alcance es distinta del permiso técnico de herramientas.

## Orden innegociable

1. **Spec:** problema, objetivos, alcance, exclusiones, actores, rutas, sesiones, roles, Electron, migración, riesgos y criterios de aceptación.
2. **Plan:** arquitectura objetivo, decisiones aprobadas, fases, dependencias, archivos/módulos previstos, estrategia de pruebas y reversión.
3. **Tasks:** tareas atómicas con criterio verificable, dependencias, archivos esperados, comandos de validación y revisor. Solicita la aprobación explícita del responsable antes de implementar la primera task.
4. **Implementación:** sólo de una task aprobada a la vez; su verificación y revisión independiente son obligatorias antes del commit.

La aprobación del listado de tasks no aprueba su ejecución en bloque. Solicita aprobación explícita para cada task. La aprobación de una spec sólo habilita preparar el plan.

## Extensión visual

- Las puertas de lote/referencia previa son para tareas que reproducen UI. Inventario/documentación y construcción del harness pueden ejecutarse con su aprobación individual antes del lote; sus entregas y revisión técnica acreditan su alcance. Las tareas de referencia precisamente generan el lote y obtienen su aprobación, no lo requieren como entrada. No exigir capturas/aceptación de una UI no modificada para cerrar documentación/tooling.

- SPEC-FE-VIS-001 fue aprobada por el responsable; no implica aprobación de tema concreto, capturas, plan ni tasks.
- Reproducir primero el original y proponer refinamientos después. `frontend-design` no autoriza cambiar paleta, identidad ni flujos.
- Toda task que reproduce UI incluye lote aprobado y referencia por superficie con commit, rol/estado, tema, fixture y viewports. RV-01 híbrida permite heredar patrones y fuentes originales sin captura previa individual aprobada en pantallas estándar; exige aprobación previa para adaptaciones sensibles o patrones nuevos/ambiguos, y comparativas/aceptación al finalizar cada bloque. Los refinamientos opcionales requieren aprobación separada.
- Exigir `frontend-reviewer` (técnico) y `frontend-visual-reviewer` (comparación), además de `frontend-verifier`; la aceptación visual del responsable es obligatoria para el cierre.
- Definir en el plan el registro de cierres visual y ubicación de evidencia dentro de `frontend/docs/specs/frontend-visual-migration/`. Mantener el registro de decisiones transversal existente; no mezclar cierres nuevos con las tasks funcionales históricas.
- Si faltan evidencia, herramienta, verificación o aceptación, no cerrar como terminada ni commitear salvo excepción expresa que mantenga el estado pendiente/bloqueado. No inventar aprobación ni tolerancias visuales.

No conviertas una recomendación en decisión aprobada. Registra cada propuesta y su aceptación explícita en `frontend/docs/specs/frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md` **antes de implementarla**, con ID, task, estado, límites y sustitución de decisiones previas. Si afecta la spec/plan aprobados, solicita autorización para modificar también esos documentos. Enlaza los IDs aplicables al cierre de la task.

## Decisiones ya confirmadas

- El frontend de clientes y empleados se unificará en una aplicación.
- Electron se conserva como canal de distribución de la terminal de empleados.
- Sólo puede existir una sesión activa por navegador: al cambiar entre cliente y empleado debe cerrarse o confirmarse el reemplazo de la sesión anterior.

## Requisitos mínimos de la spec

- Rutas públicas, de cliente y de terminal.
- Matriz de roles y acciones permitidas/prohibidas.
- Comportamiento de reemplazo de sesión y tratamiento de cookies/CSRF.
- Límite entre API, respaldo local y datos de demostración.
- Comportamiento de Electron: ruta de arranque, builds y limitaciones.
- Migración sin interrupción desde las dos aplicaciones actuales.
- Criterios de aceptación funcionales y no funcionales.

## Formato mínimo de una task

```markdown
## TASK-XX — Nombre

- Objetivo:
- Precondiciones:
- Alcance / exclusiones:
- Archivos esperados:
- Criterios de aceptación:
- Verificación:
- Revisor:
- Referencia visual / tema / commit / rol / estado / viewports (si aplica):
- Diferencias y refinamientos aprobados (si aplica):
- Evidencia y aceptación visual requerida (si aplica):
- Commit esperado: `tipo(área): resumen`
```
