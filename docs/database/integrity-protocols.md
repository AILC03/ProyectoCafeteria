# Protocolos de integridad

2026-10-18. Especificación de servicios futuros. ADR 0011 fue aceptado el
2026-10-20; algunas garantías ya se implementaron en auth/orders y las restantes
continúan como guía para sus módulos pendientes.

## Identificadores

Reservar ID con nextval(pg_get_serial_sequence('orders','id')) y suministrarlo
explícitamente al insertar. Folio A + decimal con mínimo seis posiciones, sin
truncar. Igual para users/customer_number con C y sales/sale_number con V.
UNIQUE protege concurrencia. No usar MAX+1, COUNT+1 ni reinicio diario.
Secuencias permiten huecos por rollback; no son permisos de acceso. Reintento
idempotente recupera recurso previo. Prueba futura: 50 creaciones simultáneas,
sin duplicados; rollback permite huecos. No hay servicio implementado aún.

## Roles y campos exclusivos

Semilla controlada de cuatro roles; no permitir CRUD ni renombrado genérico de
roles. CUSTOMER debe tener CLIENTE; STAFF otro rol. Validar combinación al
crear/cambiar usuario dentro de transacción, revocando sesiones si cambian
permisos. CHECK SQL excluye campos híbridos, no consulta roles. Aplicación sin
privilegios DDL y todas las escrituras por servicio. Prueba futura: combinación
rol/tipo inválida rechazada atómicamente; fixtures SQL no prueban esa validación.

## Pertenencia y precios

Crear snapshots y modificar grupos/valores/asignaciones bajo un mismo advisory
lock transaccional de catálogo, clave reservada (2026,1). Estrategia conservadora
para carga académica; no llamar proveedores externos mientras se retiene lock.
Validar categoría/producto/grupo/valor vigentes, pertenencia y límites.
GLOBAL exige global informado y override NULL; PER_PRODUCT exige override y
global NULL. Validar asignaciones existentes antes de cambiar pricing_scope.
Catálogo no reescribe históricos. Garantías entre tablas pertenecen a servicios;
no están cubiertas por CHECK locales y SQL externo puede romperlas.
Prueba futura: editar catálogo concurrentemente con crear orden conserva una
copia coherente; opción de otro grupo se rechaza sin cambios parciales.

## Orden de locks

- Cobro/cierre: caja → orden → pago → venta.
- Stripe: orden → pago → venta.
- Creación: catálogo → orden nueva → líneas.
- Edición catálogo no bloquea órdenes existentes. Flujos que necesiten ambos
  adquieren primero catálogo; no introducir orden inverso.
- Registro: token → venta → cliente/asociación.
- Refresh: familia → sesión/token.

Reintentar deadlocks/fallos serializables con límite e idempotencia.

## Ticket y refresh

Ver ADR 0011 aceptado; el esquema soporta expiración/revocación, no fija por sí
solo duración ni protocolo concurrente. Token ticket nunca permite ver estado.

## Restricciones manuales SQL

- only_one_open_cash_session: índice único parcial sobre constante con closed_at NULL.
- only_one_success_payment_per_order: único por order_id con status SUCCEEDED.
- CHECK de migration.sql: garantías locales fuera del modelo declarativo Prisma.
- Identity intencional, introspectada por Prisma como autoincrement.
- Índices completos/UNIQUE compuestos están mapeados con nombres SQL en Prisma.
- Inversas de relaciones únicas: opcionales singulares.

Diff vacío no certifica CHECK/índices parciales: ejecutar pruebas SQL también.
No regenerar migración perdiendo restricciones manuales. Este candidato no
compartido/aplicado admite corrección; tras aplicación compartida, crear nuevas
migraciones en lugar de modificar historial.
