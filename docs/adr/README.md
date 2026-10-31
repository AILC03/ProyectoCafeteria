# Registro de decisiones arquitectónicas (ADR)

[0012 — Precisiones de implementación auth/admin](0012-auth-admin-implementation.md):
aceptado explícitamente por Ángel el 2026-10-26; implementación y pruebas disponibles.
Cloudinary continúa simulado, también en CI; la aceptación no autoriza una prueba real.

ADR adicional: [0011 — Protocolos de integridad](0011-integrity-protocols.md),
aceptada explícitamente el 2026-10-20. ADR 0001–0010 conservan su estado aceptado.

Crear `NNNN-titulo-corto.md` usando [la plantilla](template.md).
Estados: Propuesto, Aceptado, Rechazado, Reemplazado.
Decisiones aceptadas no se reescriben silenciosamente: otra ADR las reemplaza.

Las notas de continuidad pueden aclarar estado de implementación sin alterar
la decisión técnica aceptada.

## Decisiones de negocio ya aprobadas

Repositorios separados; backend Node/Express/TypeScript/PostgreSQL; orders común
para Stripe y efectivo; dinero en centavos, históricos y bajas lógicas;
recargos globales excepto tamaños por producto. Ver reglas y diccionario.

## Estado actual

ADR 0001–0012 están aceptadas. En entregas locales pendientes de revisión/integración
ya se implementaron infraestructura y persistencia, catálogo, auth/admin, `ORD-01`,
`CASH-01/02` y registro QR `AUTH-02`; que una ADR esté aceptada no convierte
automáticamente el resto de sus flujos en funcionalidad disponible.

Pendientes principales: QR de cobro, ticket digital de invitado, pagos Stripe,
recuperación de NIP, worker/correo, perfil/historial, consulta de ventas y Cloudinary
real. Consultar el
[estado reconciliado](../tasks/DOC-01-adr-status-reconciliation.md), el
[contrato](../api/contract-plan.md) y las tareas de desarrollo.

## ADR registrados

- [0009 — Seguridad web, imágenes y operación](0009-web-security-operation.md): Aceptado por el responsable del backend.

- [0008 — Trabajos durables, correo y tokens](0008-jobs-email.md): Aceptado por el responsable del backend.

- [0007 — Pagos, concurrencia y reconciliación](0007-payments-processing.md): Aceptado por el responsable del backend.

- [0006 — Contrato HTTP, errores e idempotencia](0006-http-contract.md): Aceptado por el responsable del backend.

- [0005 — Sesiones, credenciales y autorización](0005-authentication.md): Aceptado por el responsable del backend.

- [0004 — Persistencia, tipos y restricciones](0004-persistence.md): Aceptado por el responsable del backend.

- [0003 — Monolito modular y contrato](0003-modular-architecture.md): Aceptado por el responsable del backend.

- [0010 — Imágenes en Cloudinary Free](0010-cloudinary-images.md): Aceptado, dentro de cuota gratuita.

- [0001 — PostgreSQL como base de datos](0001-postgresql.md): Aceptado.
- [0002 — Herramientas del backend](0002-backend-tooling.md): Aceptado.
