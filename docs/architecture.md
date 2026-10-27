# Arquitectura

## Base acordada

Frontend y backend en repositorios separados. Backend implementado con Node.js,
Express, TypeScript y PostgreSQL; comunicación HTTP/JSON mediante API REST.

## Organización aceptada — ADR 0003

Monolito modular, sin microservicios. Módulos previstos: `auth`, `catalog`,
`orders`, `payments`, `cash` y `customers`.

Dentro de un módulo:

- Rutas: endpoints y middleware de permisos.
- Validación: estructura y límites de entradas.
- Controlador: traducción entre HTTP y servicio.
- Servicio: reglas de negocio y coordinación transaccional.
- Acceso a datos: Prisma 7 y adapter-pg, aprobados en ADR 0002.

No colocar consultas SQL ni cálculos de precios en controladores.
No mover código a `shared` solo porque podría reutilizarse algún día.

## Fronteras

- Backend decide permisos, precios y confirmación de pagos.
- PostgreSQL conserva integridad, históricos y transacciones.
- Stripe gestiona tarjeta; no almacenar PAN ni CVV.
- OpenAPI define el contrato con frontend.
- Migraciones versionadas serán la fuente de verdad del esquema.

## Decisiones aceptadas y trabajo por implementar

Prisma, Zod, pruebas y herramientas ya fueron aprobados en ADR 0002.
ADR 0003 aceptada: organización modular y responsabilidades de capas.
ADR 0004 aceptada: persistencia, tipos, restricciones e históricos.
ADR 0005 aceptada: JWT en cookie, renovación PostgreSQL y revocación.
ADR 0006 aceptada: contrato HTTP, paginación, errores e idempotencia.
ADR 0007 aceptada: confirmación, reconciliación y expiración de pagos.
ADR 0008 aceptada: tareas persistentes, worker, reintentos y correo.
ADR 0009 aceptada: seguridad web, CI, entornos y respaldos.
ADR 0010 aceptada: Cloudinary Free, carga desde panel y límites de imágenes.
ADR 0011 y ADR 0012 también están aceptadas. Ya existen los módulos de catálogo,
auth, admin y orders en `dev`; siguen pendientes cash, payments, customers,
tickets y worker. El esquema y contrato de cada flujo pendiente deben definirse
antes de implementarlo. Consultar [estado reconciliado](tasks/DOC-01-adr-status-reconciliation.md)
y [permisos](permissions.md).
