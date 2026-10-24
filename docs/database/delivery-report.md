# Entrega de Leonel — ESMAOS (candidato de revisión)

**Estado: ENTREGADO PARA REVISIÓN DE ÁNGEL — NO APROBADO.**

## Actualización de revisión técnica — 18/10/2026

La entrega original se conserva documentada abajo como historial de Leonel.
El responsable de la corrección posterior alineó defaults SQL/Prisma, corrigió
CHECK de efectivo/cierre, mapeó índices y relaciones únicas, regeneró ER/SVG,
ajustó OpenAPI, backlog e instrucciones y añadió pruebas ejecutables.

Pruebas nuevas sobre PostgreSQL 17.10 temporal: 22 casos de regresión correctos;
mutantes C01-C04 detectados; deploy repetible, diff declarativo vacío y cliente
Prisma generado con adapter-pg comprobado. El contrato tiene 18 ejemplos válidos.
Esto es evidencia de revisión, no comprobaciones atribuidas a Leonel.
Ver `verification.md` y `review-evidence/corrections-results.json`.

No se migró desarrollo, shadow ni producción; no se publicó ni se creó commit.
Siguen pendientes C08 en equipo de Leonel/Docker, revisión de propuesta ADR 0011
y aprobación final. No cerrar la entrega automáticamente por pasar pruebas.

## Origen

Archivo ZIP de `ProyectoCafeteria` rama `dev`; commit referenciado `6a41644` en cabecera del archivo GitHub. Entrega sobre copia local, **no publicada ni con nuevo commit**. No se modificó ninguna BD.

## Inventario de cambios

- `prisma/schema.prisma`: 29 modelos y enums; tabla `favorites` con PK compuesta; soporte de tokens, pagos e idempotencia.
- `prisma/migrations/20261015_initial_candidate/migration.sql`: DDL candidato íntegro con relaciones, CHECK, índices parciales y compuestos.
- `docs/database/physical-model.md`: diccionario por campo, restricciones y decisiones.
- `docs/database/er-diagram.mmd`: ER Mermaid fuente para renderizado.
- `docs/api/openapi.yaml`: catálogo público con cuatro rutas, ejemplos y errores; health sin alterar.
- `docs/development-tasks.md`: backlog futuro priorizado.
- `docs/database/verification.md` y `tests/database/structural-assertions.sql`: pasos y pruebas estructurales reproducibles.

## Decisiones / supuestos

- Se agregó `categories.created_at` para paginación estable aprobada.
- Se agregó `users.account_type` para CHECK de campos exclusivos CUSTOMER/STAFF, mientras que la relación rol/tipo requiere validación de servicio.
- Se incorporó `guest_ticket_tokens` para token separado de comprobante (no autoriza consulta del pedido) y `audit_events` para correcciones.
- Enums técnicos y tamaños son propuestas técnicas sujetas a revisión.
- Los importes e identificadores HTTP se expresan en strings; no se serializan modelos Prisma crudos.
- Las restricciones entre filas y relaciones de pago/venta dependen de transacciones backend futuras; el SQL por sí solo no garantiza todas las reglas.

## Resultados y pendientes

- COMPLETADO: archivos candidatos de modelo, SQL, OpenAPI, ER, documentación y matriz de pruebas.
- VERIFICADO: lectura estática del repo y lectura de YAML con parser; no equivale a validación OpenAPI formal.
- **NO PROBADO**: `npm ci` no completó en el entorno de generación; no hay validación Prisma/format/lint/test reales, ni PostgreSQL local test, ni concurrencia. Requiere pasos en `verification.md` y ajustes si aparecen errores.
- NO APLICADO: migración SQL en dev/shadow/producción; no se modificó GitHub.

## Solicitud de revisión de Ángel

Revisar divergencias Prisma/SQL, FK, integridad de rol, orden de locks, estados y snapshots, controles de efectivo/Stripe, contratos y evidencia. No aprobar hasta ejecutar las validaciones y pruebas faltantes en test aislado; solicitar ajustes si corresponde.
