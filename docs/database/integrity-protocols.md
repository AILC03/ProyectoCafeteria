# Protocolos de integridad

Especificación inicial del 2026-10-18; estado reconciliado el 2026-11-09.
ADR 0011 fue aceptado el 2026-10-20. Auth, catálogo, ORD-01, CASH y registro QR
ya implementan garantías de este protocolo; Stripe y los demás flujos no
disponibles siguen siendo diseño pendiente. Ver [estado vigente](../README.md).

## Identificadores

Reservar ID con nextval(pg_get_serial_sequence('orders','id')) y suministrarlo
explícitamente al insertar. Folio A + decimal con mínimo seis posiciones, sin
truncar. Igual para users/customer_number con C y sales/sale_number con V.
UNIQUE protege concurrencia. No usar MAX+1, COUNT+1 ni reinicio diario.
Secuencias permiten huecos por rollback; no son permisos de acceso. Reintento
idempotente recupera recurso previo. ORD-01 probó 50 creaciones simultáneas sin
folios duplicados; CASH genera V y AUTH-02 genera C con la utilidad compartida
`src/shared/database/visible-number.ts`. Rollback permite huecos; no reiniciar secuencias.

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
ORD-01 incluye pruebas de locks, snapshots y rechazo de opciones ajenas; consultar
su tarea para evidencia, sin extenderla a los módulos pendientes.

## Orden de locks

- Cobro/cierre: caja → orden → pago → venta.
- Stripe: orden → pago → venta.
- Creación: catálogo → orden nueva → líneas.
- Edición catálogo no bloquea órdenes existentes. Flujos que necesiten ambos
  adquieren primero catálogo; no introducir orden inverso.
- Registro: token → venta → cliente/asociación.
- Refresh: familia → sesión/token.

Detalles de implementación: CASH toma primero idempotencia y lock global de caja
(2026,2), incluso para apertura vacía/resumen. Registro AUTH-02 bloquea token →
venta → orden/pago, después serializa teléfono antes de crear/asociar cliente.
Consultar las tareas CASH/AUTH-02 y sus repositorios para el protocolo completo;
la lista resumida no autoriza invertir locks ni da por implementado Stripe.

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
No regenerar migraciones perdiendo restricciones manuales. La migración inicial
ya fue aplicada a desarrollo según el registro del 2026-10-20: no admite
reescritura. Crear migraciones nuevas; una revisión documental no autoriza aplicarlas.
