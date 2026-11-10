# DOC-02 — Reconciliación de documentación

- Fecha: 2026-11-09.
- Responsable: asistente, por encargo de revisar y reconciliar `docs/`.
- Revisor humano: Ángel; coordinación de contrato con Enrique si corresponde.
- Rama base y árbol revisado: `dev`, inicialmente limpio; sin cambio de rama.
- Estado: en revisión humana; alcance exclusivamente documental.

## Objetivo y fuentes

Eliminar desfases entre resúmenes, backlog y guías sin convertir código o pruebas
en aprobaciones. Fuentes: reglas, permisos, ADR aceptados, OpenAPI 0.6.0,
`src/app.ts`, módulos, Prisma/migraciones, scripts y evidencia de tareas ORD/CASH/AUTH.

## Alcance y exclusiones

- Incluye índice vigente, referencias de estado, versiones históricas, preparación,
  registro QR y distinción entre esquema versionado y migración aplicada.
- Excluye código, endpoints, OpenAPI, dependencias, migraciones, secretos,
  despliegue, frontend y modificación de decisiones ADR o evidencias JSON.
- Preserva reglas, permisos, restricciones de seguridad y resultados históricos.

## Criterios de aceptación y trazabilidad

| ID  | Requisito y fuente                                                 | Implementación documental                                           | Verificación esperada                                                       |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| D01 | Separar estado vigente de historia (flujo §1/5)                    | `docs/README.md`, contexto, avance, planeación, DOC-01 y delegación | Sin presentar exclusiones históricas como pendientes actuales.              |
| D02 | Reflejar caja/registro/preparación presentes (app, rutas y tareas) | Backlog, arquitectura, guías ORD/CASH/auth, testing                 | PREP-01 cubierto; AUTH-02/TKT-01 siguen parciales por alcance original.     |
| D03 | Contrato actual 0.6.0 (OpenAPI)                                    | Plan de contrato y guías                                            | Versiones anteriores identificadas como cortes de entrega; sin cambiar API. |
| D04 | No inferir migración/integración/proveedor real (tareas y ADR0012) | Índice y guías operativas/datos                                     | Pendientes operativos explícitos; sin aprobar ni activar Cloudinary.        |
| D05 | Enlaces y formato (flujo §5)                                       | Documentos afectados                                                | `format:check`, enlaces locales y `git diff --check`.                       |

## Plan e impacto

1. Contrastar documentos con fuentes y evidencias existentes.
2. Corregir resúmenes y guías; preservar historia con encabezados explícitos.
3. Validar formato, enlaces, contrato sin cambios y diff.

Sin impacto funcional en API/BD/seguridad ni dependencias nuevas. No se requieren
nuevas decisiones de negocio: se corrigen desfases de estado. Cualquier contradicción
real de decisiones requiere resolución humana, no se resuelve por preferencia de la IA.

## Evidencia de entrega

| Comprobación ejecutada                                | Resultado                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `node --version`                                      | v22.14.0, compatible con el flujo.                                             |
| `npm run format:check`                                | Correcto en todo el repositorio, tras formatear solo los documentos afectados. |
| `npm run api:validate`                                | OpenAPI válido, 52 ejemplos conformes; contrato sin cambios.                   |
| Verificador local Node de enlaces Markdown de `docs/` | 181 destinos locales existentes; no verifica disponibilidad web ni anclas.     |
| `git diff --check`                                    | Correcto; diff revisado, únicamente documentación.                             |

Ejecución en Windows mediante `npm.cmd`. No se instalaron dependencias ni se
leyeron secretos. D01–D04 contrastados con rutas, esquema/scripts y tareas;
D05 comprobado con los comandos anteriores. Sin nuevas decisiones ni aprobaciones.

No se ejecutaron typecheck, lint, build, pruebas funcionales, integraciones ni
checks de BD: no hubo cambios de código, configuración, contrato o persistencia.
La matriz local del flujo exige formato/diff/enlaces para documentación; CI conserva
sus comprobaciones completas al publicarse. No se ejecutaron migraciones,
proveedores reales ni operaciones sobre bases del proyecto.

Las 86 pruebas unitarias/HTTP y 92 integraciones del cierre AUTH-02 siguen siendo
evidencia histórica, no una nueva ejecución. Los 52 ejemplos OpenAPI sí se
revalidaron en esta revisión. Cloudinary continúa simulado; su verificación real,
revisión humana, integración y configuración operativa siguen pendientes.
