---
name: Frontend SDD
description: Dirige la unificación del frontend con el orden spec, plan, tasks e implementación verificable.
---

# Frontend SDD

Usa esta skill para el trabajo de unificación de clientes y empleados.

Para el dashboard DA-001 usa la skill `dashboard-sdd` y sus spec/plan/tasks propios; no reutilices tareas ni STATUS históricos de unificación para cerrar trabajo del dashboard. Dentro de una tarea autorizada no solicites aprobación por cada edición o comando rutinario: la aprobación SDD del alcance es distinta del permiso técnico de herramientas.

## Orden innegociable

1. **Spec:** problema, objetivos, alcance, exclusiones, actores, rutas, sesiones, roles, Electron, migración, riesgos y criterios de aceptación.
2. **Plan:** arquitectura objetivo, decisiones aprobadas, fases, dependencias, archivos/módulos previstos, estrategia de pruebas y reversión.
3. **Tasks:** tareas atómicas con criterio verificable, dependencias, archivos esperados, comandos de validación y revisor. Solicita la aprobación explícita del responsable antes de implementar la primera task.
4. **Implementación:** sólo de una task aprobada a la vez; su verificación y revisión independiente son obligatorias antes del commit.

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
- Commit esperado: `tipo(área): resumen`
```
