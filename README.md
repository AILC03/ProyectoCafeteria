# Backend — Proyecto Cafetería

API del Sistema Web de Gestión de Órdenes para Cafetería, equipo ESMAOS.
El frontend tendrá un repositorio separado.

## Estado

Base Express/TypeScript ejecutable con endpoint HTTP de salud y pruebas.
Prisma configurado, todavía sin modelos, migraciones ni conexión real verificada.

Tecnologías previstas: Node.js, Express, TypeScript, API REST y PostgreSQL.
Prisma 7, npm, Zod, ESLint 10, Prettier, Vitest 5 y Supertest aprobados en ADR 0002.
Autenticación definida en ADR 0005, todavía sin implementar.

## Ejecutar localmente

Node 22 (mínimo 22.13). Instalar dependencias con `npm ci`.
Seguir [preparación de PostgreSQL](docs/database-setup.md) y crear `.env`
localmente sin compartir credenciales. Ejecutar `npm run dev` y abrir
`http://localhost:3000/api/v1/health`. Este endpoint no verifica PostgreSQL.

Comprobaciones: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test`, `npm run build`. Formato automático: `npm run format`.
No ejecutar migraciones todavía: faltan los modelos.

## Equipo

- Enrique: frontend.
- Leonel: base de datos.
- Responsable solicitante: backend.
- Todos colaboran y revisan cambios de los demás.

## Organización

- `src/modules/`: funcionalidades de negocio.
- `src/middleware/`: autenticación, permisos y tratamiento HTTP transversal.
- `src/config/`: configuración validada desde variables de entorno.
- `src/shared/`: utilidades realmente compartidas.
- `tests/`: pruebas.
- `docs/`: reglas, modelo, arquitectura, pruebas, ADR y contrato de API.

Los archivos `.gitkeep` mantienen directorios vacíos al versionarlos.

## Documentación

- [Contexto completo, estado y próximos pasos](docs/PROJECT-CONTEXT.md)
- [Reglas de negocio](docs/business-rules.md)
- [Diccionario de datos](docs/data-dictionary.md)
- [Arquitectura](docs/architecture.md)
- [Guía de desarrollo](docs/development-guide.md)
- [Pruebas](docs/testing.md)
- [Decisiones técnicas](docs/adr/README.md)
- [Contrato OpenAPI](docs/api/openapi.yaml)
- [Colaboración](CONTRIBUTING.md)

## Próximo trabajo

1. Revisar [cierre de planeación](docs/planning-readiness.md); ADR 0001–0010 aceptadas. Preparar modelo físico, contratos por operación y tareas.
2. Aplicar reglas y permisos ya aprobados al diseño de cada módulo.
3. Comprobar conexión, diseñar modelos/migraciones y revisar con base de datos.
4. Completar contrato de catálogo antes de su implementación.

Nunca subir `.env`, claves Stripe, credenciales reales ni datos personales.
