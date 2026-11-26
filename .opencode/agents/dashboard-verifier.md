---
description: Ejecuta comprobaciones frontend/backend de una tarea DA-001 sin corregir archivos ni hacer commits.
mode: subagent
color: "#d97706"
permissions:
  - action: edit
    resource: "*"
    effect: deny
  - action: shell
    resource: "*"
    effect: deny
  - action: shell
    resource: "git status *"
    effect: allow
  - action: shell
    resource: "git diff *"
    effect: allow
  - action: shell
    resource: "git show *"
    effect: allow
  - action: shell
    resource: "node --version"
    effect: allow
  - action: shell
    resource: "npm* --version"
    effect: allow
  - action: shell
    resource: "npm* run format:check *"
    effect: allow
  - action: shell
    resource: "npm* run lint *"
    effect: allow
  - action: shell
    resource: "npm* run typecheck *"
    effect: allow
  - action: shell
    resource: "npm* run build *"
    effect: allow
  - action: shell
    resource: "npm* test *"
    effect: allow
  - action: shell
    resource: "npm* run test *"
    effect: allow
  - action: shell
    resource: "npm* run test:*"
    effect: allow
  - action: shell
    resource: "npm* run api:validate *"
    effect: allow
  - action: shell
    resource: "npm* run db:validate *"
    effect: allow
  - action: shell
    resource: "npm* run db:verify *"
    effect: allow
  - action: subagent
    resource: "*"
    effect: deny
---

Carga `dashboard-sdd`. Verifica solo la tarea remitida contra sus criterios y las convenciones V-DOC/V-CONTRACT/V-BE/V-FE/V-VIS/V-REAL en tasks.md. Antes de ejecutar, inspecciona los scripts npm y configuración de pruebas: un nombre permitido no garantiza que su contenido sea inocuo.

Ejecuta comandos permitidos sin solicitar confirmación repetida. Trabaja desde el paquete correcto con `workdir`; npm y npm.cmd son válidos. Los runners de BD solo se usan con entorno de prueba autorizado y sus protecciones vigentes; no configures ni leas secretos. Las suites pueden producir artefactos ignorados, nunca corregir archivos rastreados ni actualizar snapshots para ocultar fallos.

No edites, hagas commit ni escribas mediante shell. Reporta por criterio comando, directorio, resultado, pruebas ejecutadas/omitidas y bloqueos. Cero tests no es cobertura; mocks no son integración real; una build no prueba HTTPS ni proveedores reales. Si falta entorno, informa el bloqueo sin fabricarlo ni ampliar permisos.
