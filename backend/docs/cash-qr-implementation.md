# CASH-03 — QR de cobro y escaneo para efectivo

Entrega local del 2026-11-09, verificada en PostgreSQL 17 aislado; pendiente
revisión humana/integración y coordinación frontend. OpenAPI 0.8.0.
[Criterios, archivos y evidencia](tasks/CASH-03-cash-qr.md).

## Crear con QR sin romper consumidores existentes

`POST /api/v1/orders` (invitado/CLIENTE) y `POST /api/v1/cashier/orders`
(CAJERO/ADMINISTRADOR) conservan cookies/Origin/CSRF e Idempotency-Key originales.
El cuerpo admite `includeCashQr: true` únicamente con `paymentMethod: "CASH"`.
La respuesta añade `cashQr` al mismo nivel que `data`, con este formato ficticio:

```json
{
  "purpose": "CASH_PAYMENT",
  "token": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "qrPayload": "cafeteria:cash:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "expiresAt": "2026-11-09T12:30:00.000Z"
}
```

No es URL ni endpoint; frontend renderiza el payload como QR. Ausente/false:
respuesta original sin QR ni requisito nuevo de cifrado. STRIPE + true: 400.
Crear orden nunca cobra ni crea venta/preparación. El flag pertenece al cuerpo
canónico: cambiarlo con la misma clave devuelve 409.

Reintento con misma clave/cuerpo por 48h devuelve exactamente la representación
original de creación y QR, incluso si ya se pagó o venció. No revela estado actual:
es replay de la creación. QR repetido no cambia plazo ni habilita nuevo cobro;
escaneo posterior valida estado/plazo reales. No ofrecer consultas al invitado
usando folio, token o clave de idempotencia.

## Caja: emitir/reimprimir, escanear y cobrar

1. `POST /api/v1/cashier/orders/{id}/cash-qr`, JSON `{}`. CAJERO/ADMINISTRADOR con
   sesión vigente, Origin y CSRF. Solo CASH PENDIENTE_PAGO dentro de los 30 minutos
   originales y sin paidAt. Emite para órdenes antiguas sin original recuperable;
   repetir/concurrir devuelve el mismo token, sin rotación ni extensión. No exige
   caja abierta, pues no cobra. Respuesta 200 `{data: <QR>}`.
2. `POST /api/v1/cashier/orders/scan-cash-qr`, JSON `{token: "<original>"}`. Mismo
   acceso, sin query/campos adicionales. Frontend separa prefijo `cafeteria:cash:`
   y envía solo el original. Respuesta 200 `{data:{orderId,orderFolio,totalCents,
paymentExpiresAt,items}}` desde snapshots; no datos de cuenta ni historial.
   Repetible y sin efectos sobre pagos/ventas/preparación. No exige caja abierta.
3. Confirmar recibido/cambio en UI y usar `POST /api/v1/payments/cash` existente,
   con orderId/cashSessionId/cashReceivedCents e Idempotency-Key. Backend revalida
   caja abierta, responsable, plazo y total histórico dentro de la transacción.
   Un escaneo exitoso no reserva el cobro ni garantiza que siga cobrable.

Escanear **no confirma pago**. Invitado/CLIENTE/PREPARACION no acceden al escaneo.
401 sesión ausente; 403 rol/CSRF/Origin; 400 entrada; 404 ID/token no disponible;
409 orden identificada por personal no cobrable (STRIPE/pagada/vencida); 503 BD
o cifrado no disponible. Tokens de registro/ticket digital no resuelven órdenes.

## Persistencia, claves y operación

Migración aditiva `20261109_cash_qr_delivery`: ciphertext TEXT y versión VARCHAR(32)
opcionales en orders, CHECK de presencia conjunta y exclusivo de CASH. Conserva
hash UNIQUE, órdenes previas y snapshots; no modifica migraciones anteriores.
Su aplicación a bases del proyecto requiere autorización/coordinación humana.

Original de 32 bytes aleatorios, SHA-256 como identidad de escaneo. Recuperación
AES-256-GCM con IV aleatorio y AAD `cash-payment:<orderId>:<version>`: no admite
traslado desde registro ni entre órdenes/versiones. Reutiliza configuración
externa `TICKET_ENCRYPTION_KEY`/`TICKET_KEY_VERSION`, distinta de auth y sin
fallback. Conservar clave/versión durante las **48h** de reintentos, no solo 24h
de registro. No hay keyring/rotación transparente; no se configuró ningún secreto.

Sin clave, creación opt-in y emisión/reimpresión fallan con rollback; creación
sin flag, escaneo y cobro por ID siguen independientes del descifrado. El original
solo sale en respuesta de creación/emisión autorizada; no entra en response_json,
auditoría o logs. La auditoría de emisión por caja referencia solo actor/orden.

Idempotencia de creación antes de locks de orden; emisión/escaneo/cobro/asociación
usan el mismo lock de orden. Dos emisiones no cambian token y dos cobros no crean
dos pagos/ventas. Si cobra después de escanear, la ruta de pago revalida invariantes.

`npm run tickets:cleanup` añade retirada del ciphertext/versión CASH tras 48h
desde creación; conserva hash e históricos. Requiere DATABASE_URL explícita, no
carga .env y no instala scheduler. Programar ejecución segura periódica antes
de despliegue. No se ejecutó contra datos reales.

No-store/no-referrer, también en errores tempranos. Token/payload solo en memoria
frontend: no URL, analítica, logs, caché ni localStorage. No es QR de registro ni
permiso de TKT-02 y no autoriza lectura pública de estado/comprobante. Sin nueva
dependencia, proveedor externo, cámara, imagen QR, HTML/PDF, Stripe o worker.
