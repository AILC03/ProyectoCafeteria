# DOC-01 — Conciliación documental con ADR

## Estado

Implementada y verificada en `dev` el 2026-10-26; pendiente únicamente de la
revisión humana y fusión del pull request hacia `main`.

## Objetivo

Dejar la documentación de trabajo alineada con el estado de los ADR y con la
implementación real, sin reescribir los registros históricos de decisiones.

## Fuente de verdad

- Decisiones: `docs/adr/0001-0012`.
- Esquema y migraciones aplicadas: `prisma/schema.prisma` y
  `prisma/migrations/`.
- Contrato disponible: `docs/api/openapi.yaml`.
- Implementación: código y pruebas de la rama `dev`.

## Resultado de la conciliación

- ADR 0001–0012: aceptados. El 0011 fue aceptado el 2026-10-20 y el 0012 el
  2026-10-26.
- Implementado en `dev`: infraestructura/persistencia, catálogo de lectura y
  administración, autenticación y sesiones, e `ORD-01` de órdenes pendientes.
- Aún pendiente: apertura/cierre y cobro en efectivo, pagos/Stripe, tickets QR,
  registro y recuperación de clientes, worker/correo, ventas, favoritos e
  integración real de Cloudinary.

## Criterio de mantenimiento

Los documentos que describen una revisión o etapa anterior conservan sus datos
como evidencia, pero deben llevar una advertencia visible de historial y no
presentarse como estado vigente. Los ADR aceptados no se reescriben: cambios de
decisión futuros requieren otro ADR.
