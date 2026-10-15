# 0002 — Herramientas del backend

- Estado: Aceptado
- Fecha: 2026-10-14
- Responsables: equipo ESMAOS; aprobación del responsable del backend.

## Contexto

U2AV1 ya propone Node.js, Express y TypeScript: se conservan.
Se necesitan herramientas complementarias para datos, formato y pruebas.

## Opciones consideradas

SQL directo o ORM; formato manual o automatizado; pruebas manuales o automatizadas.

## Decisión

Express 5, TypeScript estricto, npm, Prisma 7 con PostgreSQL, Zod, ESLint 10,
Prettier, Vitest 5 y Supertest. Node 22, mínimo 22.13. Versiones exactas en lockfile.

La auditoría inicial detecta cuatro avisos high en dependencias transitivas de
Prisma CLI (deepmerge-ts/mysql2 y sus dependientes). No aplicar audit fix --force:
propone un cambio mayor de Prisma. Revisar actualizaciones antes de despliegue.
Prisma usa prisma.config.ts y generador prisma-client. El adaptador PostgreSQL
se usará al incorporar modelos y acceso a datos.

## Consecuencias y verificación

Instalar con npm ci cuando exista lockfile; no mezclar gestores. Ejecutar
typecheck, lint, format:check, test y build antes de integrar cambios.
Autenticación pendiente de ADR propio. Health solo verifica HTTP.

Nota de continuidad: la frase anterior describe el momento de esta decisión;
autenticación quedó definida y aceptada posteriormente en ADR 0005. Sigue
pendiente su implementación, no su elección.
