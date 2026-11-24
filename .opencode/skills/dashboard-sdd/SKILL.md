---
name: Dashboard SDD
description: Ejecuta DA-001 por tareas autorizadas, con contratos primero, backend y frontend integrados, revisión independiente y CSV obligatorio al cerrar E2.
---

# Dashboard SDD — DA-001

Las rutas siguientes son relativas a la raíz del repositorio, no a la carpeta de esta skill.

## Fuentes y alcance

Leer `frontend/docs/specs/dashboard-admin/spec.md`, `plan.md` y `tasks.md`; para backend leer `backend/AGENTS.md` y `backend/docs/workflow/README.md`, contrato y fuentes relevantes. Spec, plan y backlog aceptados, incluida exportación solo CSV al cierre E2. No confundir aprobación documental con contrato específico aprobado o tarea iniciada.

- E1: Inicio integrado, backend calcula totales/tickets/promedio/unidades/comparación; caja actual independiente del periodo y últimas ventas/ticket existentes. No reconstruir catálogo/personal.
- E2: series/rankings/sin movimiento, categorías como ampliación acordada; CSV obligatorio al cierre para ventas y datos analíticos implementados, no imágenes ni XLSX.
- E3/E4 y opcionales: solo las capacidades seleccionadas expresamente, no todo el PDF por extensión.

Para tareas de interfaz que construyan o cambien composición visual, cargar también `frontend-design` y respetar el PDF y RNF-05; no reemplazar el diseño por una plantilla genérica.

## Autonomía sin confirmaciones rutinarias

Seleccionada una tarea por el usuario o coordinador autorizado, su alcance es autorización para leer/editar sus archivos, usar patch y ejecutar comandos shell habituales (inspección, tipos, lint, build, pruebas y validadores) sin preguntar por cada operación. Los archivos esperados son orientativos, no una lista que obligue a pedir permiso por cada archivo vecino necesario dentro de alcance. Una corrección derivada de revisión sigue el mismo encargo si no altera decisiones/alcance.

No anuncies «¿puedo editar?» o «¿ejecuto el comando?» en cada paso. Comunica solo hallazgos, decisiones o bloqueos relevantes. Las confirmaciones de la herramienta y aprobaciones SDD son distintas: la configuración elimina prompts rutinarios, no la aceptación de contratos/negocio. No evadir un permiso denegado mediante shell, scripts, otra herramienta o agente.

Preguntar/detener la parte afectada únicamente por: contrato nuevo pendiente de aceptación, cambio de negocio/seguridad/arquitectura, dependencia no autorizada, ampliación de alcance, entorno real no autorizado o acción destructiva. No leer/imprimir `.env`, tokens, NIP o contraseñas. Los ejemplos públicos sí pueden leerse.

## Tarea y contratos

1. Revisar estado Git y conservar cambios ajenos, incluidas las especificaciones sin seguimiento; no stash, restauración de ramas ni limpieza para ocultarlos.
2. Identificar ID y precondiciones. Empezar por TASK-DA-E1-00 solo cuando se seleccione. Es contrato documental, sin runtime. TASK-DA-E2-CSV-00 funciona igual para CSV.
3. Reutilizar decisiones aceptadas sin volver a preguntar. Redactar propuesta de detalles pendientes y solicitar una aceptación agrupada del contrato, no permisos por archivo.
4. Implementar una tarea a la vez y delegar con contexto completo cuando el coordinador esté autorizado; frontend/backend pueden separarse sobre contrato ya aceptado sin aceptar cambios unilaterales.
5. Verificar según tasks.md y obtener revisión independiente. Cerrar solo con evidencia real y sin bloqueantes; mocks no prueban API real. No empezar tareas posteriores automáticamente sin autorización de secuencia.

## Registro correcto y commits

Para DA-001, registrar cierres y decisiones locales aceptadas en `frontend/docs/specs/dashboard-admin/validation.md` cuando haya una tarea que cerrar; no crear pruebas o aceptaciones ficticias. Decisiones transversales frontend siguen en el registro existente `frontend/docs/specs/frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md` con referencias cruzadas, sin reescribir la historia. Si cambia arquitectura backend, seguir sus ADR.

No registrar nuevas tareas DA-001 en STATUS de unificación. No marcar aprobación de detalle por la aceptación del backlog. Commits solo por encargo explícito, una tarea y rutas explícitas tras pruebas/revisión; no `git add .`, push, merge, migraciones, reset ni despliegue automático. La skill `atomic-task-commit` solo aplica cuando el commit ya esté autorizado.

## Entrega mínima

ID y alcance, archivos afectados, RF/criterios, comandos ejecutados y resultados, pruebas omitidas/bloqueadas, revisión independiente y decisiones aceptadas/pendientes. Si no hay commit autorizado, indicarlo; no solicitarlo repetidamente ni crearlo por defecto.
