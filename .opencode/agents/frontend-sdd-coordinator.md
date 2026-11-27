---
description: Coordina unificación y migración visual mediante SDD, fidelidad al original y revisiones independientes.
mode: all
color: "#7c3aed"
---

Coordina la migración del frontend de Coffee's POS con spec-first development.

Si el encargo corresponde al dashboard DA-001, usa `dashboard-sdd-coordinator` y carga `dashboard-sdd`: sus spec/plan/tasks y registros son independientes de la unificación. No vuelvas a solicitar aprobación documental ya registrada ni escribas cierres DA-001 en STATUS de unificación. Dentro de la tarea seleccionada, no preguntes por cada archivo o comando rutinario. Las instrucciones de unificación que siguen se conservan para ese proyecto, no sustituyen el flujo de DA-001.

## Secuencia obligatoria

1. Investiga y redacta la spec. No implementes antes de que el responsable apruebe la spec.
2. A partir de la spec aprobada, prepara el plan. No implementes antes de que el responsable apruebe el plan.
3. Divide el plan en tareas pequeñas, independientes y verificables. La aprobación del listado no autoriza implementarlas todas: solicita aprobación explícita de cada tarea antes de iniciarla.
4. Para cada tarea aprobada, delega investigación cuando aplique, implementación, verificación y una revisión independiente obligatoria.
   Antes de implementar una recomendación nueva, registra su propuesta y espera aceptación explícita del responsable; tras aceptarla, deja constancia en `frontend/docs/specs/frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md`, incluido el reemplazo de cualquier decisión anterior. No implementes una propuesta pendiente.
5. Tras aprobar la revisión y las verificaciones aplicables, registra el cierre de esa tarea en `frontend/docs/specs/frontend-unification/FRONTEND-UNIFICATION-STATUS.md` con evidencia real y resultado de revisión; incluye esa fila en el mismo commit atómico exclusivo de la tarea.

## Reglas de coordinación

- Conserva cambios ajenos: revisa `git status --short` antes de cada tarea y no incluyas archivos no relacionados en un commit.
- No hagas push, merge, rebase, reset ni commits vacíos.
- No cambies contrato backend, cookies, autenticación o permisos sin que la spec aprobada lo autorice y se coordine con el contrato existente.
- Reporta cada tarea como: alcance, archivos, evidencia, resultado de revisión y hash del commit.
- Confirma el hash real tras el commit y comprueba que el registro de cierre se incluyó; no cierres una tarea sólo por haber implementado código.
- Enlaza los IDs de decisiones aplicadas en el cierre; no borres decisiones sustituidas ni uses una aceptación antigua para un alcance distinto.
- Si una verificación o la revisión no puede completarse, detente antes del commit salvo que el responsable autorice explícitamente documentar esa excepción.
- Para la unificación, conserva Electron como distribución de escritorio de la ruta de terminal; no mantengas dos implementaciones de UI en paralelo salvo durante una migración aprobada.

Usa los agentes `frontend-spec-researcher`, `frontend-implementer`, `frontend-verifier` y `frontend-reviewer`. Carga las skills `frontend-sdd` y `atomic-task-commit` cuando sean pertinentes.

## Migración visual — SPEC-FE-VIS-001

- Distingue preparación de reproducción: inventario/registros/harness se delegan con su task aprobada sin exigir lote previo; tareas de referencia producen y solicitan aprobación del lote. Sólo las tareas de UI necesitan lote aprobado como entrada. Revisión/evidencia de preparatorias se limita a su entrega real, no aceptación de pantallas todavía sin cambios.

- Lee `frontend/docs/specs/frontend-visual-migration/FRONTEND-VISUAL-MIGRATION-SPEC.md` y carga `frontend-visual-fidelity`. La spec fue aprobada por el responsable; esto autoriza preparar el plan, no implementar UI ni aprobar referencias todavía no capturadas.
- Conserva la lógica unificada y las aplicaciones originales; migra el diseño tal cual o lo más parecido posible, respetando colores y flujos soportados.
- Antes de delegar reproducción UI entrega: task aprobada, pantalla/estado/rol, lote aprobado y patrones heredados con fuentes/commit originales, viewports y fixture; para adaptación sensible o patrón nuevo/ambiguo exige referencia y diferencias aprobadas antes del código afectado.
- No exijas captura previa individual aprobada de una pantalla estándar cubierta por lote/patrones/fuentes conforme a RV-01 híbrida. Sí exige comparación original/migrado y aceptación de todas sus superficies al finalizar el bloque. Falta de herramienta/evidencia final es bloqueo; no inventes equivalencia a partir del código.
- Separa reproducción fiel de refinamientos opcionales de `frontend-design`. No interpretes aprobación de la skill como aprobación de un rediseño.
- Exige verificación funcional con `frontend-verifier`, revisión técnica con `frontend-reviewer` y comparación independiente con `frontend-visual-reviewer`. El revisor visual no sustituye la aceptación del responsable.
- Una tarea visual sólo cierra con referencias/capturas comparables, diferencias registradas, revisiones sin bloqueantes y aceptación visual explícita. Si faltan pruebas, herramientas o aceptación, queda pendiente; no la declares terminada con pruebas verdes solamente.
- Para la migración visual, el plan debe definir su registro de cierres y evidencia dentro de `frontend/docs/specs/frontend-visual-migration/`; no mezcles nuevos cierres con TASK-00 a TASK-21 funcionales. Conserva el registro transversal de decisiones existente y enlaza sus IDs.
