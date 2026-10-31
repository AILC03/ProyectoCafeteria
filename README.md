# Backend — Proyecto Cafetería

API del Sistema Web de Gestión de Órdenes para Cafetería, equipo ESMAOS.
El frontend tendrá un repositorio separado.

## Desarrollo con IA y contribuciones

Antes de modificar este repositorio, leer [AGENTS.md](AGENTS.md) y seguir
[el flujo de desarrollo](docs/workflow/README.md): tarea verificable, contrato,
implementación, pruebas y revisión humana. Incluye plantillas de tarea/PR y CI.
Las protecciones de GitHub requieren activación manual; no basta con estos archivos.

## Estado

**CASH-01/CASH-02 local, 2026-10-27:** caja, cobro efectivo por ID, venta y ticket
JSON protegido. [Guía y límites](docs/cash-implementation.md). La entrega posterior
AUTH-02 ya consume el QR de registro de invitado; QR de cobro, Stripe y worker siguen
pendientes. Las entregas locales requieren revisión/integración y configuración operativa.

**AUTH-02 local, 2026-10-31:** registro de cliente exclusivamente con QR válido de
ticket pagado, en transacción, con NIP Argon2id, teléfono único y sin sesión automática.
[Alcance y evidencia](docs/tasks/AUTH-02-ticket-qr-registration.md). El contrato vigente
es OpenAPI 0.6.0; recuperación de NIP, perfil/historial y ticket digital de invitado no
forman parte de esta entrega.

**Estado vigente en `dev`, 2026-10-26:** ADR 0001–0012 aceptados. Primera
entrega de órdenes pendientes móvil/caja,
cálculo/snapshots backend, idempotencia, consultas protegidas y preparación/LISTO.
[Rutas, reglas y límites](docs/orders-implementation.md). Sin cobros, Stripe,
caja, tickets/QR, worker ni expiración automática. Pendiente revisión del PR y
fusión hacia `main`.

**Entrega previa, 2026-10-25:** autenticación corregida (Argon2id, cookies,
sesiones/refresh/CSRF/roles) y administración de catálogo implementadas.
[Guía de uso, rutas y límites](docs/auth-admin-implementation.md).
Cloudinary requiere credenciales y prueba real; hay mock e infraestructura de
intents/limpieza. No hay registro abierto. La contraseña de AngelAdmin se conserva.
Las notas inferiores de etapas 1–3 se conservan como historial.

**Historial, 2026-10-20:** candidato y ADR 0011 aprobados, migración aplicada
a desarrollo y menú demo cargado. Infraestructura común y cuatro GET de catálogo
implementados. [Estado vigente y comandos](docs/backend-progress.md).
Crear administrador en terminal local con `npm run admin:create`; todavía no
existe endpoint de login.

La base incluye Express/TypeScript, persistencia Prisma, catálogo, auth/admin y
órdenes pendientes. El historial de validación inicial se conserva en
[correcciones pendientes](docs/database/correcciones-pendientes.md); no describe
el alcance actual.

Tecnologías previstas: Node.js, Express, TypeScript, API REST y PostgreSQL.
Prisma 7, npm, Zod, ESLint 10, Prettier, Vitest 5 y Supertest aprobados en ADR 0002.
Autenticación implementada conforme ADR 0005; los flujos de recuperación de NIP
siguen pendientes.

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
- Angel: backend.
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

- [Auth y administración: estado vigente](docs/auth-admin-implementation.md)
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

1. Revisar e integrar las entregas locales pendientes según el flujo de PR.
2. Coordinar con frontend el contrato OpenAPI 0.6.0 vigente.
3. Continuar preparación, perfil/historial de cliente y ticket digital según backlog.
4. Implementar worker/correo antes de recuperación de NIP; Stripe conserva su secuencia propia.

Nunca subir `.env`, claves Stripe, credenciales reales ni datos personales.
