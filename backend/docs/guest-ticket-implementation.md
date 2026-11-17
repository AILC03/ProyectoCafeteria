# TKT-02 — Comprobante digital de invitado

Entrega local del 2026-11-09. Contrato funcional autorizado por Ángel en la
conversación del encargo; pendiente revisión humana/integración y coordinación
frontend. Contrato OpenAPI 0.7.0. [Criterios y evidencia](tasks/TKT-02-guest-digital-ticket.md).

## API

- `POST /api/v1/sales/{id}/ticket-access`, body `{}`: sesión CAJERO/ADMINISTRADOR,
  Origin exacto y CSRF. Solo venta CASH pagada coherente sin cliente asociado y
  dentro de 24h del pago. No exige caja abierta: entrega comprobante, no cobra.
- Respuesta 201 `{data:{purpose:"GUEST_TICKET",token,expiresAt,path:"/api/v1/guest-ticket"}}`.
  Cada emisión exitosa revoca accesos anteriores. No es idempotente; una respuesta
  perdida se resuelve reemitiendo desde caja. No devuelve el original anterior.
- `GET /api/v1/guest-ticket`, cabecera `X-Ticket-Token`: devuelve `{data}` con
  saleId, saleNumber, orderFolio, soldAt, currency, totalCents, cashReceivedCents,
  changeCents e items históricos. Nunca estado, identidad del cliente, credenciales,
  empleados, QR de registro o acceso a otros recursos. Las cookies no autorizan.
- Sin query ni body en GET, ni query/campos adicionales en POST. Token ausente,
  desconocido, revocado o vencido: 404 indistinguible. Formato inválido: 400.
  Sesión ausente en emisión: 401; rol/CSRF/Origin indebidos: 403.

## Persistencia y concurrencia

Se reutiliza `guest_ticket_tokens`, sin migración ni nuevos secretos/dependencias.
Original de 32 bytes aleatorios, solo SHA-256 en base. Caducidad fija desde el pago,
no desde emisión/reimpresión. GET no consume ni renueva. Auditoría registra
`GUEST_TICKET_ISSUED`, actor y venta, nunca original ni hash.

Locks venta existente → orden → pago → tokens digitales. Son compatibles con
AUTH-02, que toma su token de registro y después venta → orden → pago; este flujo
no bloquea tokens de registro. Revalidación de sesión en transacción y rollback
conservan el acceso anterior si falla la emisión. Reemisiones concurrentes dejan
un único acceso vigente; una lectura concurrente se serializa y relee revocación.

El alta QR posterior no invalida un comprobante previamente emitido, pero no
habilita nuevos accesos digitales desde caja para la compra ya asociada. El permiso
original mantiene exclusivamente su alcance/plazo iniciales.

## Frontend y operación

Mantener el original solo en memoria y enviarlo exclusivamente en la cabecera.
No incorporarlo a URL, QR/enlace, logs, analítica, localStorage ni cachés. Esta
entrega ofrece API, no diseña un canal de entrega remota ni impresión HTML/PDF.
El empleado entrega el acceso por el flujo frontend que se coordine con Enrique.
Una recarga que pierda el original requiere reemisión autorizada desde caja.

`Cache-Control:no-store` y `Referrer-Policy:no-referrer` cubren también errores
tempranos de estas rutas. Logs HTTP existentes omiten cabeceras/cuerpos/query.
Límite público existente por IP/proceso y CORS exacto. No existe acceso por folio,
QR de registro ni QR de cobro. El QR de cobro/escaneo permanece para la entrega
siguiente; escanear no debe confirmar pago. Stripe continúa pendiente.

`db:verify` admite `DB_REVIEW_OUTPUT_DIR` para escribir nueva evidencia fuera de
los informes históricos; sin esa variable conserva su comportamiento previo.
No se aplicaron migraciones ni se cambiaron datos/configuración reales.
