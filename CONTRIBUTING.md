# Colaboración

## Flujo de trabajo obligatorio

Leer [AGENTS.md](AGENTS.md) y [el flujo completo](docs/workflow/README.md).
Usar la [plantilla de tarea](docs/workflow/task-template.md) y la plantilla de PR.

1. Crear una tarea con responsable, alcance y criterios de aceptación.
2. Crear rama corta desde `dev`: `feat/catalog-api`, `fix/payment-expiration`, `docs/data-model`.
3. Implementar solo el alcance de la tarea, incluyendo pruebas y documentación.
4. Abrir pull request con resumen, comprobaciones y cambios de API o esquema.
5. Obtener revisión de otro integrante antes de integrar a `dev`; promover a `main` mediante PR revisado.

`main` debe permanecer estable. CI está definida en `.github/workflows/backend-ci.yml`;
su ejecución remota y las protecciones de ramas deben habilitarse/verificarse en
GitHub según el flujo. Un archivo local no demuestra que estén activas.

## Commits

Formato: `tipo(área): descripción`.

Ejemplos:

- `feat(catalog): add product listing`
- `fix(orders): reject unavailable options`
- `docs(adr): define authentication strategy`

## Definición de terminado

- Cumple criterios de aceptación.
- Pasa las comprobaciones automatizadas disponibles.
- Cada criterio se relaciona con código y evidencia; reporta omitidos y bloqueos.
- `npm test` no sustituye las integraciones ni la regresión de PostgreSQL.
- Incluye pruebas de reglas, permisos y errores relevantes.
- Actualiza contrato OpenAPI y diccionario cuando corresponde.
- Cambios estructurales tienen migración; decisiones importantes tienen ADR.
- No incluye secretos ni datos reales.
- Fue revisado por otro integrante.

## Cambios compartidos

Coordinar cambios del esquema con Leonel y cambios del contrato con Enrique.
No reescribir migraciones aplicadas y compartidas: crear una nueva.
No agregar dependencias sin justificar su necesidad en el pull request.
