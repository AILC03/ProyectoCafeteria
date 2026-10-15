# 0004 — Persistencia, tipos y restricciones

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: explícita del responsable del backend tras revisar tipos, restricciones, históricos, bajas lógicas y migraciones.

## Contexto

Prisma y PostgreSQL ya están aceptados; falta concretar integridad y serialización.

## Opciones consideradas

IDs numéricos pequeños, UUID o BIGINT; integridad solo en servicios o también en SQL.

## Decisión

Prisma 7 con adapter-pg y migraciones versionadas. BIGINT identity para claves internas y strings decimales en JSON; TIMESTAMPTZ en UTC; dinero BIGINT en centavos, también string decimal en HTTP para evitar pérdida de precisión. Enums explícitos para roles, estados y métodos. FK RESTRICT para históricos; baja lógica de catálogo/personal. Índices parciales para una sesión abierta y un pago SUCCEEDED por orden, UNIQUE en sales.order_id y sales.payment_id. CHECK para cantidades, importes y campos por tipo de usuario. Validaciones entre tablas en servicios transaccionales. Las migraciones SQL completan lo que Prisma no represente.

## Consecuencias

No ejecutar migraciones hasta revisión con Leonel. IDs y dinero HTTP como string aprobados por responsable del backend; coordinar contrato con Enrique. No cambiar ADR 0001/0002. Eliminar producto en el panel significa baja lógica: desaparece del catálogo disponible sin borrar relaciones históricas. Una categoría con productos asociados, incluso dados de baja, no puede eliminarse.

## Verificación

Rechazar cantidades cero, precios negativos, usuario híbrido y doble pago/caja abierta. Probar carreras con PostgreSQL real aislado. Nunca convertir IDs BIGINT a Number sin control.

## Referencias

- [Reglas](../business-rules.md)
- [Cierre de planeación](../planning-readiness.md)
