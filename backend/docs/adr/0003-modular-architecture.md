# 0003 — Monolito modular y contrato

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: explícita del responsable del backend en conversación, tras revisar organización modular, capas, transacciones y contrato OpenAPI. La coordinación del esquema y contrato con el equipo sigue siendo parte del desarrollo.

## Contexto

Separar responsabilidades sin introducir microservicios en un equipo de tres integrantes.

## Opciones consideradas

Capas globales; monolito por módulos; microservicios.

## Decisión

Monolito por módulos auth, catalog, orders, payments, cash y customers. Rutas y Zod validan entrada; controladores traducen HTTP; servicios aplican reglas y transacciones; repositorios encapsulan Prisma. OpenAPI se modifica antes del código de cada operación. Un servicio coordinador puede usar repositorios de otros módulos dentro de una misma transacción; evitar llamadas HTTP internas y dependencias circulares.

## Consecuencias

Menor complejidad operativa; exige fronteras explícitas. El contrato publicado diferencia operaciones planeadas de implementadas.

## Verificación

Una prueba de flujo atraviesa HTTP, servicio y persistencia. No hay consultas ni cálculos de negocio en controladores. Cada operación incluye permisos y errores en OpenAPI.

## Referencias

- [Reglas](../business-rules.md)
- [Cierre de planeación](../planning-readiness.md)
