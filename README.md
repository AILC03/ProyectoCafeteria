# Backend — Proyecto Cafetería

API del Sistema Web de Gestión de Órdenes para Cafetería, equipo ESMAOS.
El frontend tendrá un repositorio separado.

## Estado

**Actualización 2026-10-20:** candidato y ADR 0011 aprobados, migración aplicada
a desarrollo y menú demo cargado. Infraestructura común y cuatro GET de catálogo
implementados. [Estado vigente y comandos](docs/backend-progress.md).
Crear administrador en terminal local con `npm run admin:create`; todavía no
existe endpoint de login.

Base Express/TypeScript ejecutable con health y catálogo de lectura, 29 modelos,
migración aprobada y contrato OpenAPI. Candidato probado en PostgreSQL 17.10;
pendiente evidencia en equipo de Leonel, no la aprobación de Ángel ya otorgada.
Ver [correcciones pendientes](docs/database/correcciones-pendientes.md).
Migración aplicada a desarrollo local; shadow sin cambios. Arranque Docker preparado; ver estado de
validación en la guía de PostgreSQL.

Tecnologías previstas: Node.js, Express, TypeScript, API REST y PostgreSQL.
Prisma 7, npm, Zod, ESLint 10, Prettier, Vitest 5 y Supertest aprobados en ADR 0002.
Autenticación definida en ADR 0005, todavía sin implementar.

## Ejecutar localmente

Node 22 (mínimo 22.13). Instalar dependencias con `npm ci`.
Con Docker Desktop abierto, `npm run db:up` prepara PostgreSQL y tres bases locales;
`npm run db:check:docker` verifica conexión y `npm run dev:docker` inicia la API
con ese entorno. No modifica el `.env` existente ni aplica migraciones.
Seguir [preparación de PostgreSQL](docs/database-setup.md) y crear `.env`
localmente si se prefiere la instalación manual. Ejecutar `npm run dev` para
esa alternativa y abrir
`http://localhost:3000/api/v1/health`. Este endpoint no verifica PostgreSQL.

Comprobaciones: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test`, `npm run build`. Formato automático: `npm run format`.
La base local aprobada ya está migrada. En un entorno nuevo ejecutar db:prepare
solo sobre una base local vacía o con historial de este proyecto, nunca reset.
`npm run api:validate` comprueba contrato y ejemplos; `npm run db:diagram` regenera
ER desde Prisma. `npm run db:verify:docker` crea bases desechables propias para
regresión solo cuando Docker esté disponible. Ver guía de verificación.

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

- [Avance vigente: persistencia, infraestructura y catálogo](docs/backend-progress.md)
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

1. Crear AngelAdmin localmente con admin:create (sin contraseña predeterminada).
2. Revisar contrato de catálogo implementado con Enrique.
3. Implementar autenticación/permisos/CSRF antes de CRUD o cobros.
4. Continuar administración, órdenes y compra en efectivo según backlog.

Nunca subir `.env`, claves Stripe, credenciales reales ni datos personales.
