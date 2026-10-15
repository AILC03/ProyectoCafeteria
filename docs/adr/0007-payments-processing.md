# 0007 — Pagos, concurrencia y reconciliación

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: explícita del responsable del backend tras revisar confirmación, duplicados, atomicidad, reconciliación, expiración, avisos tardíos y reembolso excepcional.

## Contexto

Webhooks duplicados y fallos de red no pueden duplicar ventas ni declarar vencimientos falsos.

## Opciones consideradas

Confirmar desde retorno web; solo webhook; webhook y reconciliación durable.

## Decisión

Confirmar solo desde backend tras verificar proveedor, firma de webhook con cuerpo raw, importe, MXN y relación. Persistir evento antes de responder 2xx; fallo de persistencia devuelve no-2xx. Worker procesa pagos/eventos persistidos; bloquear orden y revalidar estado. Pago aceptado, venta y EN_PREPARACION en una transacción local. Stripe HTTP siempre fuera de transacciones largas; idempotency keys persistentes por intento. Un intento Checkout abierto por orden; reutilizarlo, no abrir otro por timeout. Reconciliar creación incierta antes de reintentar. Vencimiento efectivo a 30 minutos desde creación; Stripe también objetivo 30 minutos, registrar vencimiento real de Checkout y reconciliar antes de marcar EXPIRADA. No declarar EXPIRADA mientras un intento pueda cobrar o su estado sea incierto. Cobro excepcional de expirada se registra, abre incidencia y reembolso idempotente, sin venta/preparación. Fallos permanecen visibles para revisión.

## Consecuencias

La sesión Checkout tiene límites de expiración del proveedor: no asumir que expires_at local puede pasarse siempre sin desfase. No introducir pagos diferidos ni módulo general de devoluciones. Reintentos no equivalen a éxito. Un pago ocurrido dentro del plazo se reconoce aunque el aviso llegue después; una orden definitivamente expirada no vuelve automáticamente a preparación. La organización del worker se concreta en ADR 0008. Esta aprobación no implementa integración Stripe ni ejecuta cobros o reembolsos.

## Verificación

Casos: doble cobro, dos workers, webhook previo a respuesta de creación, eventos fuera de orden, timeout, pago confirmado antes del plazo avisado después, reembolso incierto. Una venta máxima y trazabilidad de todo cobro.

## Referencias

- [Reglas](../business-rules.md)
- [Cierre de planeación](../planning-readiness.md)

- [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions)
- [Expirar Checkout](https://docs.stripe.com/api/checkout/sessions/expire)
