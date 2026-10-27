# Órdenes — primera entrega ORD-01

2026-10-26. Implementación local, pendiente de revisión humana e integración.
Fuentes y criterios: [tarea ORD-01](tasks/ORD-01-pending-orders.md).
Contrato aditivo: [OpenAPI 0.4.0](api/openapi.yaml).

## Operaciones

Todas llevan prefijo `/api/v1`; respuestas privadas y de creación con `Cache-Control: no-store`.

| Método/ruta                         | Acceso y función                                                           |
| ----------------------------------- | -------------------------------------------------------------------------- |
| POST /orders                        | Invitado o CLIENTE; crea móvil, CASH o STRIPE fijo                         |
| POST /cashier/orders                | CAJERO/ADMINISTRADOR; crea caja, CASH fijo                                 |
| GET /orders/{id}                    | Cliente: propia; cajero/admin: operación; preparación: solo EN_PREPARACION |
| GET /preparation/orders             | Preparación/cajero/admin; solo EN_PREPARACION, paginado                    |
| POST /orders/{id}/ready             | Preparación/cajero/admin; EN_PREPARACION pagada → LISTO                    |
| POST /cashier/customers/search      | Cajero/admin; búsqueda exacta mínima de cliente activo                     |
| PATCH /cashier/orders/{id}/customer | Cajero/admin; asocia cliente antes de pago/vencimiento                     |

No hay consulta pública por folio ni historial de invitado. Los clientes no consultan
órdenes ajenas (404). PREPARACION deja de ver detalle cuando sale de EN_PREPARACION;
cajero/admin conservan consulta operativa, y el cliente asociado conserva consulta propia.
La lista de preparación devuelve resumen con folio/nombre de invitado opcional;
su detalle se obtiene por ID con los permisos anteriores. No se implementó listado
general ni historial paginado de cliente en esta entrega.

## Crear y reintentar

Obtener bootstrap CSRF con `GET /auth/csrf`; enviar Origin configurado,
credenciales del navegador, `X-CSRF-Token` y `Idempotency-Key` UUID v4 aleatorio.
También el invitado exige CSRF. Una cookie de acceso inválida o una sesión que
requiere renovación no se degrada a invitado. No imprimir valores de cabeceras.

```json
{
  "paymentMethod": "CASH",
  "items": [{ "productId": "1", "quantity": 2, "optionValueIds": [] }]
}
```

IDs ilustrativos: obtener IDs y opciones del catálogo real de pruebas; los mínimos
obligatorios deben cumplirse. `optionValueIds` omitido equivale a `[]`. Opcional
`guestName` solo para invitado, no cliente autenticado. Caja admite además
`customer: {identifier, confirmedName}`; es excluyente con guestName. Nunca aceptar
precio, total, source, estado, customerId ni snapshots aportados por cliente.
El cliente móvil se asocia desde su sesión, no desde entrada manipulable.

Se permiten 1–50 líneas, 1–99 unidades por línea; suma máxima 9999900 centavos.
La selección de opciones es un conjunto de IDs únicos por línea. Se valida
pertenencia, grupo/valor vigente, disponibilidad, mínimos/máximos y alcance:
GLOBAL usa precio global y override NULL; PER_PRODUCT usa override y global NULL.
El backend calcula `(base + recargos) * cantidad` con BIGINT; IDs/dinero son strings
en HTTP. Guarda nombres/precios de producto, grupo y opción como snapshots.
Catálogo posterior no cambia la orden ni el resultado original idempotente.

Cada orden nace PENDIENTE_PAGO con plazo de 30 minutos y folio `A` + ID identity
rellenado a mínimo seis dígitos, conforme ADR 0011. Es único bajo concurrencia,
puede tener huecos y **no es un secreto ni un permiso**.

Idempotencia: ámbito por canal y actor (usuario; invitado sin cuenta usa ámbito
guest), hash SHA-256 de clave y entrada canónica validada. Orden de propiedades
JSON no cambia el hash; el orden de arrays sí. Por 48 horas la misma entrada devuelve
201 y exactamente la respuesta original persistida, no el estado actualizado.
Otra entrada válida con la misma clave devuelve 409 IDEMPOTENCY_CONFLICT.
Después del plazo, reutilizarla representa una operación nueva. La clave nunca
concede consulta por GET. Fallo de validación/negocio hace rollback sin orden ni
registro de éxito; no hay reservas parciales visibles entre transacciones.

## Asociación y preparación

Búsqueda por POST con `{identifier}`: número C o teléfono MX (+52/diez dígitos),
normalizado y exacto, sin listado/prefijo. Solo devuelve `id`, `name`,
`customerNumber`; nunca correo, NIP, teléfono o historial. Confirmar el nombre
vigente con `{identifier, confirmedName}` al crear caja o asociar. Nombre distinto
produce 409; cliente inexistente/inactivo produce 404. No se crea cuenta.

Asociación bloquea la orden y revalida PENDIENTE_PAGO, paidAt NULL y plazo no vencido;
al asociar borra guestName y registra auditoría sin el cuerpo personal de entrada.
No reasocia después del pago ni simula el futuro registro por QR.

Preparación solo lista EN_PREPARACION. POST ready exige `{}` y CSRF, bloquea orden
y revalida EN_PREPARACION con paidAt no nulo; guarda LISTO, actor y fecha, más
auditoría. Una carrera tiene un ganador; repetición/otro estado devuelve 409 sin
sobrescribir fecha/actor. LISTO sale de preparación y permanece en BD.

## Persistencia y límites de alcance

No se necesita migración: esquema actual incluye órdenes, snapshots, idempotencia,
readyAt y readyByEmployeeId. No se editaron migraciones aplicadas.
Creación/snapshots usa el lock de catálogo (2026,1) compartido con administración;
la idempotencia se serializa con lock por canal/actor/hash de clave. Se revalidan
sesión, usuario y rol vigente dentro de la transacción. Reintentos limitados para
errores de deadlock/serialización reconocidos. Sin llamadas externas bajo locks.

El CHECK existente exige hash para CASH: se reserva un hash aleatorio interno,
descartando el valor original. No se devuelve token ni QR y no sirve para cobrar.
Su futura emisión/reemisión deberá implementarse con su propio flujo autorizado.

**No hay caja ni cobro efectivo, Checkout/Stripe, pagos, webhooks, ventas, tickets,
QR, correo, worker, reembolsos o expiración automática.** Crear CASH no exige caja
abierta porque no cobra; la restricción de sesión/responsable aplica al futuro
cobro. STRIPE solo se guarda como método elegido, no se contacta al proveedor.
Vencer paymentExpiresAt no cambia por sí solo el estado; no afirmar que el módulo
completa el flujo de compra. No hay endpoint para forzar EN_PREPARACION o paidAt.
Los tests de LISTO usan fixtures SQL de una orden pagada explícitamente aislados.
Cloudinary continúa simulado; auth/admin no se han rediseñado.

## Verificación

Unitarias/HTTP de validación/precios y una suite HTTP+PostgreSQL aislada para
creación, permisos, CSRF, límites, snapshots, idempotencia, 50 folios concurrentes,
locks, búsqueda mínima, asociación y LISTO. Se valida respuesta real contra OpenAPI.
El runner `npm run test:integration` descubre el nuevo archivo automáticamente y
crea/elimina solo bases propias `cafeteria_catalog_*` sobre PostgreSQL 17.
`npm test` omite esas integraciones si no se usa el runner dedicado.

El generador `node scripts/update-orders-contract.mjs` solo añade/reemplaza
operaciones/esquemas ORD-01; revisar diff. Si se regenera auth/admin con
`npm run api:features`, ejecutar después el generador ORD-01 para conservar
metadatos 0.4.0, seguido de Prettier y `npm run api:validate`.
Los resultados reales de cierre y cualquier bloqueo están en la tarea ORD-01.
