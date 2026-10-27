# Tarea: TEST-01 — Ejecución reproducible de integración local

- Responsable: Ángel/Codex, 2026-10-26.
- Revisor humano: Ángel.
- Rama base: dev.
- Estado: implementada y validada en `dev`; pendiente de revisión humana y fusión a `main`.

## Objetivo y fuentes

Hacer reproducible `npm run test:integration` con la configuración Docker local
documentada. Fuentes: `AGENTS.md`, `docs/workflow/README.md`,
`docs/testing.md`, `docs/database-setup.md` y el runner
`scripts/test-catalog-integration.mjs`.

## Alcance y exclusiones

- Incluye cargar `.env.docker` de forma opcional desde el script npm de integración
  y documentar el orden de ejecución.
- No incluye cambiar la URL de pruebas, revelar secretos, modificar migraciones,
  tocar datos de desarrollo/shadow ni alterar pruebas de negocio.

## Criterios de aceptación y trazabilidad

| ID    | Requisito                                         | Implementación                                                  | Prueba esperada                                                                 | Estado                                       |
| ----- | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| CA-01 | El comando usa `.env.docker` cuando existe        | `package.json` con `--env-file-if-exists`                       | `npm run test:integration` deja de pedir `TEST_DATABASE_URL` después de `db:up` | Cumplido: 50 pruebas correctas               |
| CA-02 | No se obliga a Docker para otra instalación local | Carga condicional; el entorno puede definir `TEST_DATABASE_URL` | El runner conserva sus validaciones de destino aislado                          | Cumplido: el archivo solo se carga si existe |
| CA-03 | La guía explica el requisito de arranque          | `docs/testing.md`                                               | Instrucción no expone credenciales                                              | Hecho                                        |

## Evidencia de entrega

- Archivos modificados: `package.json`, `docs/testing.md` y esta tarea.
- `npm run db:check:docker`: desarrollo, shadow y pruebas conectan, sin tablas.
- `npm run test:integration`: 50 pruebas correctas: 19 auth/admin, 13 catálogo y
  18 órdenes; el runner creó y eliminó sus bases temporales propias.
- No hay cambios a órdenes, autenticación, administración, migraciones ni datos.
