# Colaboración

## Flujo de trabajo recomendado

1. Crear una tarea con responsable, alcance y criterios de aceptación.
2. Crear rama corta: `feat/catalog-api`, `fix/payment-expiration`, `docs/data-model`.
3. Implementar solo el alcance de la tarea, incluyendo pruebas y documentación.
4. Abrir pull request con resumen, comprobaciones y cambios de API o esquema.
5. Obtener revisión de otro integrante antes de integrar a `main`.

`main` debe permanecer estable. Las protecciones de ramas y la integración
continua se configurarán cuando exista el repositorio remoto.

## Commits

Formato: `tipo(área): descripción`.

Ejemplos:

- `feat(catalog): add product listing`
- `fix(orders): reject unavailable options`
- `docs(adr): define authentication strategy`

## Definición de terminado

- Cumple criterios de aceptación.
- Pasa las comprobaciones automatizadas disponibles.
- Incluye pruebas de reglas, permisos y errores relevantes.
- Actualiza contrato OpenAPI y diccionario cuando corresponde.
- Cambios estructurales tienen migración; decisiones importantes tienen ADR.
- No incluye secretos ni datos reales.
- Fue revisado por otro integrante.

## Cambios compartidos

Coordinar cambios del esquema con Leonel y cambios del contrato con Enrique.
No reescribir migraciones aplicadas y compartidas: crear una nueva.
No agregar dependencias sin justificar su necesidad en el pull request.
