# FIN-01 — Cierre funcional del backend en pruebas

- Responsable: asistente, por encargo de Ángel.
- Revisor humano: Ángel; coordinación de contrato con Enrique pendiente.
- Rama base y trabajo: dev (se conserva el árbol previo sin descartar cambios).
- Estado: implementada/verificada en pruebas, pendiente revisión humana, 2026-11-10.

## Objetivo y autorización

Completar el backlog funcional sobre el avance existente. Ángel eligió explícitamente
«Completar en pruebas»: autoriza módulos, contratos y dependencias necesarios,
PostgreSQL aislado y proveedores simulados; no autoriza llamadas reales, modificar
bases del proyecto, Cloudinary real ni despliegue. Solicitó commit, push y apagado
posterior a la verificación del push. El trabajo previo se revisa y conserva.

Fuentes: [reglas](../business-rules.md), [permisos](../permissions.md), ADR
[0005](../adr/0005-authentication.md), [0006](../adr/0006-http-contract.md),
[0007](../adr/0007-payments-processing.md), [0008](../adr/0008-jobs-email.md),
[0011](../adr/0011-integrity-protocols.md) y [OpenAPI](../api/openapi.yaml).

## Alcance y exclusiones

Incluye ventas, edición de cuenta, administración de empleados/clientes, reset
presencial, verificación/recuperación por correo, jobs/outbox, expiración CASH,
Checkout/webhooks/reconciliación/reembolso Stripe y documentación de integración.
Conserva Argon2id, cookies/CSRF, transacciones, históricos, límites e idempotencia.
No incluye frontend, inventario, cancelaciones, devoluciones generales, proveedores
reales, configuración remota, migraciones sobre bases existentes ni producción.

## Criterios y trazabilidad

| ID    | Requisito y fuente                          | Implementación prevista                   | Prueba esperada                                                                | Estado                            |
| ----- | ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| CA-01 | SALES-01: permisos, filtros, cursor y sumas | sales                                     | HTTP/BD: acceso mínimo, filtros y centavos exactos                             | Verificado                        |
| CA-02 | BR-USR-010/013 y CRUD personal              | accounts                                  | NIP actual, unicidad, baja lógica, revocación, auditoría                       | Verificado                        |
| CA-03 | BR-USR-006/007/011/012                      | accounts y correo                         | tokens 30 min, uso único, correo anterior, respuesta genérica y reset auditado | Verificado                        |
| CA-04 | ADR 0008: lease, reintentos y cifrado       | worker                                    | dos workers, caída, backoff, payload borrado y sin logs sensibles              | Verificado                        |
| CA-05 | BR-ORD-004, ADR 0007                        | worker/stripe                             | CASH vence atómicamente; Stripe incierto no expira                             | Verificado                        |
| CA-06 | BR-PAY-001/006                              | stripe                                    | firma, importe, MXN, duplicados, timeout, tardíos y refund idempotente         | Verificado con proveedor simulado |
| CA-07 | Contrato y documentación vigente            | OpenAPI, índice y guía frontend existente | validación del contrato, enlaces y matriz de checks                            | Verificado                        |

## Plan, riesgos y entrega

1. Definir contrato y escenarios antes del código de cada bloque.
2. Implementar por capas, con proveedores inyectados y pruebas aisladas.
3. Ejecutar formato, tipos, lint, unitarias/HTTP, OpenAPI, Prisma, integración,
   verificación de BD y build. Revisar diff y secretos antes del commit/push.

Migraciones solo aditivas y en bases temporales. La ausencia de configuración
debe fallar cerrada; no introducir claves por defecto. Operaciones externas fuera
de transacciones; incertidumbre se conserva y reconcilia, no equivale a fracaso.
SMTP puede duplicar entregas tras caída, nunca permite reutilizar un token.
No se declara integración humana ni producción por pasar pruebas simuladas.

## Evidencia

Base inicial: Node 22.14.0; `npm test`: 109 aprobadas, 124 integraciones omitidas.

Resultado de cierre, Node 22.14.0 / PostgreSQL 17.11 efímero:

| Comprobación realmente ejecutada                     | Resultado                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                             | Correcto; cliente Prisma generado desde lockfile                                                                                    |
| `npm run format:check`                               | Correcto                                                                                                                            |
| `npm run typecheck`, `npm run lint`, `npm run build` | Correctos                                                                                                                           |
| `npm test`                                           | 114 unitarias/HTTP aprobadas; 145 integraciones omitidas por diseño                                                                 |
| `npm run api:validate`                               | OpenAPI 0.11.0 válido; 65 ejemplos conformes                                                                                        |
| `npm run db:validate`, `npm run db:diagram`          | Esquema válido y Mermaid regenerado                                                                                                 |
| `node scripts/verify-isolated.mjs`                   | Ejecutó los runners de `test:integration` y `db:verify`: 145 integraciones aprobadas; 22 checks de BD y mutantes C01–C04 detectados |
| Integración por suite                                | auth/admin 19; cash/tickets/QR 34; catálogo 13; FIN-01 21; registro 20; clientes/favoritos 20; órdenes 18                           |
| Prisma aislado                                       | Deploy, deploy repetido, diff vacío y smoke cliente correctos                                                                       |
| `node scripts/check-doc-links.mjs`                   | 282 enlaces locales existentes; no comprueba fragmentos                                                                             |
| `npm audit` / `npm audit --omit=dev`                 | 10 avisos moderados solo en tooling; 0 vulnerabilidades de producción                                                               |
| `git diff --check`                                   | Sin errores de whitespace                                                                                                           |

Pruebas concretas CA-01–06: `tests/completion.test.ts` y
`tests/integration/completion.integration.test.ts`, más suites previas conservadas.
Incluyen validación de respuestas nuevas contra OpenAPI con AJV, permisos,
transacciones reales, simultaneidad y fallos; no solo compilación/mocks de BD.
Implementación: `src/modules/accounts/`, `src/modules/sales/sales.*`,
`src/modules/payments/stripe.*`, `src/worker/`, integración HTTP/server y tickets.

Durante desarrollo hubo dos fallos de fixtures con reloj fijo/availableAt y una
ejecución intermedia incompleta de integración. Se fijaron tiempos explícitos en
fixtures y se reforzó el healthcheck TCP del contenedor; la pasada final completa
aprobó las 145 integraciones. También se resolvieron errores iniciales de tipos,
schema OpenAPI y formato/lint sin desactivar controles. Evidencia histórica de BD
conservada; las ejecuciones finales escriben en directorios temporales nuevos.

No ejecutado, por exclusión expresamente autorizada: proveedores reales Stripe,
SMTP comercial y Cloudinary; migraciones sobre bases del proyecto; frontend;
despliegue/CI remoto y revisión humana. Server/worker **no habilitan Stripe real**;
el adaptador se prueba mediante inyección sin red. El SMTP local opcional tampoco
fue contactado: los tests usan transporte simulado. No implica preparación de
producción. Revisión de avisos de tooling pendiente, sin `audit fix --force`.

Documentación reconciliada: README/ruta, índice/contexto/backlog/avance, contrato,
arquitectura/permisos/diccionario, pruebas y guía existente de frontend. Estado y
operación detallados en [backend-completion](../backend-completion.md). No se
modificaron decisiones aceptadas ni se hicieron llamadas reales. La solicitud
autoriza publicación en dev y apagado; no autoriza merge/promoción a main.
