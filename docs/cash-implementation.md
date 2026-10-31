# CASH-01/CASH-02 — Caja, efectivo y ticket

Implementación local de la entrega solicitada el 2026-10-26; verificación de cierre
2026-10-27. Pendiente revisión humana e integración, no despliegue.
Fuentes/criterios/evidencia: [tarea](tasks/CASH-01-02-cash-payments.md).
Contrato de esta entrega al cierre: OpenAPI 0.5.0. El contrato vigente puede tener
versiones posteriores; consultar [OpenAPI](api/openapi.yaml).

## Rutas disponibles

Prefijo `/api/v1`. Solo CAJERO/ADMINISTRADOR; cookie, sesión/rol vigentes en BD,
CSRF/Origin en mutaciones, respuestas `no-store`. No habilitar rutas por un rol
guardado solo en frontend. ID y dinero siempre strings decimales.

| Método/ruta                    | Función                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| POST /cash-sessions            | Abrir, body `{openingAmountCents}`; 201 o 409 si existe abierta |
| GET /cash-sessions/current     | Activa y resumen; `{data:null}` si no hay abierta               |
| GET /cash-sessions/{id}        | Resumen de sesión abierta/cerrada por ID                        |
| POST /cash-sessions/{id}/close | Cierre propio o excepcional admin                               |
| POST /payments/cash            | Cobrar por ID de orden y sesión, sin recotizar catálogo         |
| GET /sales/{id}/ticket         | Ticket JSON imprimible protegido; QR de registro preparado      |

No hay listado/historial completo de ventas ni ticket público de invitado. Consultar
una caja ajena no concede cobrarla/cerrarla. Los clientes y preparación no acceden
a caja, pagos ni tickets de esta entrega.

## Apertura, resumen y cierre

Una caja abierta global, protegida por transacción y el índice parcial existente
`only_one_open_cash_session`. Responsable original no cambia. Abrir/cerrar registra
auditoría, actor y fecha. Reiniciar API o vencer auth no cierra una sesión de caja.

Cierre ordinario: `{countedCashCents}`. Otro empleado no lo permite; administrador
solo puede cerrar ajena con `exceptionalCloseReason` (1–500 caracteres tras trim).
El motivo completo se conserva en la sesión; auditoría referencia sesión/actor/fecha.
En cierre propio no se admite motivo excepcional. Un cierre nuevo de caja cerrada
devuelve 409; reintento con su clave original devuelve su resultado original.

Esperado = fondo inicial + ventas CASH exitosas de esa sesión; no es efectivo
recibido bruto. Diferencia = contado − esperado, puede ser negativa. Resumen:
`cashSalesCents`, `successfulPayments` y `computedExpectedCashCents` calculados;
los campos de cierre permanecen NULL hasta cerrar. Se detectan referencias/montos
incoherentes de pago/venta antes de resumir/cerrar. Importes individuales y fondo
más ventas deben caber en BIGINT positivo; no truncar, redondear ni convertir a Number.

## Cobro

```json
{
  "cashSessionId": "1",
  "orderId": "1",
  "cashReceivedCents": "10000"
}
```

Identificadores ilustrativos; obtener la caja y orden reales autorizadas.
Se admite `changeCents` opcional solo como aserción: si no coincide con
recibido − total, 409. No se acepta total, precio, estado ni otros campos extra.

Solo el responsable de la sesión abierta puede cobrar. ADMINISTRADOR no puede
cobrar por otro empleado: su excepción es exclusivamente el cierre con motivo.
Exige CASH, PENDIENTE_PAGO, paidAt NULL, plazo no vencido y sin pago/venta previa.
Recibido menor al total produce 409; forma/tipo/rango inválido produce 400.
Usa el total histórico de ORD-01 incluso si luego se agota/retira el catálogo.
No modifica order_items ni order_item_options.

En una transacción: crea payment CASH/SUCCEEDED (MXN, sesión/cajero, recibido y
cambio), sale independiente con número V+identity, marca paidAt/EN_PREPARACION,
prepara registro de invitado si corresponde y audita. Cualquier fallo hace rollback.
Un pago/venta máximo está protegido también por índices UNIQUE existentes.
No declara EXPIRADA automáticamente; solo rechaza cobro fuera de plazo.

El resultado 201 contiene `{data:{payment,sale,order,ticket:{saleId,path}}}`.
El ticket se solicita por `path` con la sesión autorizada: el resultado idempotente
**no contiene tokens**. CASH ahora no pasa a LISTO sin pago SUCCEEDED, monto/moneda
y venta coherentes, además de EN_PREPARACION y paidAt. ORD-01 conserva su contrato,
con esa comprobación de integridad adicional al conectar pagos reales.

## Exclusión e idempotencia

Reutiliza transacción con reintento limitado y revalidación de sesión de orders.
Lock de idempotencia por usuario/operación/clave antes de caja; después lock global
de caja (2026,2), fila de caja → orden → pago → venta. El lock global cubre también
apertura vacía y resumen. No hay HTTP ni proveedores externos dentro de la transacción.

`Idempotency-Key` UUID v4 es obligatorio en apertura, cierre y cobro. Retención 48h;
misma clave/entrada canónica devuelve resultado público original; distinta entrada 409. Un replay de cobro tras cerrar la caja no cobra de nuevo. Con otra clave o
pasadas 48h, las invariantes permanentes de orden/pago/venta siguen bloqueando
duplicados. Un fallo de validación/negocio no deja éxito idempotente ni filas parciales.

Cobro/cierre concurrente: si gana cobro, cierre incluye venta neta; si gana cierre,
cobro falla. Asociación compite por el mismo lock de orden: si gana antes del cobro
no se emite registro de invitado; si el pago gana, asociación se rechaza.

## Ticket, QR y límites de seguridad

El recurso protegido produce JSON para que frontend lo renderice/imprima: número
de venta, folio, fecha, MXN, importes y líneas/opciones desde snapshots. No se creó
HTML/PDF ni se controla una impresora desde backend. Nombres deben renderizarse como
texto escapado, nunca con innerHTML de datos del catálogo.

Invitado: un token aleatorio de 32 bytes en `customer_registration_tokens`, hash
SHA-256, vinculado de forma única a la venta, vence 24h desde pago. Ticket incluye
`registration:{purpose,token,qrPayload,expiresAt}`. `qrPayload` tiene forma
`cafeteria:register:<token>`: dato para renderizar QR, **no URL ni endpoint activo**.
Frontend debe conservarlo únicamente para esa impresión, no en cachés, logs,
analítica, localStorage ni URL de llamadas backend. Asociado, usado o vencido:
`registration:null`. Reimprimir repite el mismo token/plazo; no crea, consume ni
renueva el registro. Respuestas `Cache-Control:no-store` y `Referrer-Policy:no-referrer`.

Este QR no cobra ni permite GET de orden/venta/ticket/pago o historial. No es el
token de ticket digital invitado de ADR 0011. No hay aún endpoint que consuma el
registro: la creación de cuenta, asociación y consumo transaccional/un uso se
implementarán juntos en AUTH-02. Aquí se comprueban unicidad de emisión y manejo
de usado/vencido, no se afirma probado el flujo final de alta.

### Recuperar el token sin guardarlo en claro

Nueva migración aditiva `20261026_cash_ticket_delivery` añade `encrypted_payload`
y `key_version` opcionales, CHECK de presencia conjunta e índice de vencimiento.
El original se conserva cifrado AES-256-GCM, IV aleatorio y AAD por venta/versión,
solo para impresión/reimpresión; el hash sigue siendo la identidad de consumo.
No está en `response_json`, auditoría ni logs. No se alteraron migraciones previas.

Configuración externa: `TICKET_ENCRYPTION_KEY`, 32 bytes aleatorios como 64 hex,
distinta de las claves auth; `TICKET_KEY_VERSION`, opcional, por defecto `v1`.
No hay fallback ni se generó/configuró ningún secreto real o archivo .env aquí.
La prueba usa una clave efímera inyectada. Sin clave: apertura/cierre y cobro
asociado funcionan; cobro invitado devuelve 503 con rollback y no entrega un pago
sin registro recuperable. Reimpresión con clave/versión incorrecta devuelve 503.
Conservar la clave original durante la vida de sus tickets; no hay keyring ni
rotación transparente. Configurar mediante el mecanismo seguro del entorno antes
de usar invitados; no introducir ni mostrar la clave en chats, argumentos o logs.

`npm run tickets:cleanup` exige DATABASE_URL explícita y no carga archivos .env.
Retira solo cifrado/versión usados o vencidos; conserva hash, venta y trazabilidad.
Hay que programarlo periódicamente al desplegar: no se instaló scheduler/worker.
No se ejecutó contra desarrollo/shadow/producción.

## Verificación y pendientes

Pruebas unitarias/HTTP y PostgreSQL aislado cubren carreras, restricciones SQL,
roles, cierre excepcional, montos, idempotencia, rollback tras crear pago/venta,
snapshots, QR/cifrado, caché/logs y regresiones. Resultados exactos en la tarea.
Se reutiliza el runner que crea y elimina solo bases propias. Con TEST_DATABASE_URL
explícita se omite cargar .env.docker; uso normal Docker de TEST-01 se conserva.

No incluye QR **de cobro**/escaneo, ticket digital público de invitado, registro
final, recuperación, Stripe, conciliación, reembolsos, favoritos, historial completo,
correo real, expiración automática ni worker. Cloudinary continúa simulado.
Antes de uso real: revisar con Ángel/Enrique, aplicar migración mediante el flujo
aprobado, configurar clave segura y limpieza periódica, e implementar/renderizar
la impresión en frontend. No se aplicó migración a las bases del proyecto.
