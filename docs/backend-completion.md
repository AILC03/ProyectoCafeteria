# FIN-01 — Backend funcional en pruebas

Entrega 2026-11-10, contrato OpenAPI **0.11.0**. Complementa los módulos existentes,
no sustituye revisión humana ni acredita despliegue. Autorización y matriz:
[FIN-01](tasks/FIN-01-backend-completion.md).

## Implementación y límites operativos

| Bloque       | Implementado                                                                           | Condición operativa                                                                           |
| ------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Ventas       | Listado/resumen por fechas UTC y método, cursor con microsegundos, centavos exactos    | CAJERO/ADMINISTRADOR; no historial privado de clientes ni saldo neto de refunds               |
| Cuentas      | Edición propia, corrección administrativa y CRUD de personal con baja lógica           | Teléfono exige NIP actual; cambios de acceso revocan sesiones; no cambiar responsable de caja |
| Recuperación | Correo verificado, tokens 30 minutos de un uso, reset presencial auditado              | Outbox cifrada, clave externa; buzón SMTP local opcional, no correo comercial                 |
| Worker       | SKIP LOCKED, leases con UUID de fencing, backoff, 8 intentos, mantenimiento            | Proceso separado; fallos agotados requieren revisión manual, no se borran jobs                |
| Stripe       | Intento/clave persistentes, Checkout, firma raw, eventos/jobs, reconciliación y refund | Proveedor inyectado en pruebas; **server/worker no habilitan llamadas Stripe reales**         |
| Tickets      | CASH/STRIPE, ticket propio de cliente, comprobante limitado de invitado y registro QR  | Entrega/impresión y renderizado corresponden a frontend; invitado no consulta estado          |

El adaptador SDK `StripeSdkProvider` acepta únicamente claves `sk_test_` y nunca se
instancia automáticamente. Los tests inyectan un simulador sin red. Que existan las
rutas **no significa** que Checkout funcione en la API local normal: sin proveedor
autorizado devuelve 503. No configurar claves reales ni anunciar tarjeta disponible
antes de autorizar/configurar una prueba externa y coordinarla con frontend.
Cloudinary conserva su restricción previa. El servidor tampoco inicia SMTP ni el
worker por sí mismo. El worker sin transporte no consume correos; sin proveedor
Stripe no consume sus jobs. Los jobs de imágenes siguen con `npm run images:cleanup`
y su proveedor ya existente, no se reclaman como trabajos desconocidos de FIN-01.

## Persistencia y concurrencia

Migración aditiva `20261110_backend_completion`: permiso Checkout de invitado
(hash y copia cifrada de replay), referencias URL/vencimiento Stripe, vínculo de
evento con Checkout, lease UUID para jobs/outbox y un índice único parcial para un
intento Stripe pendiente por orden. No se reescriben migraciones anteriores.
Las tres migraciones CASH/tickets/FIN-01 recientes requieren revisión y aplicación
autorizada en cada entorno; las pruebas usan únicamente bases temporales propias.

Checkout reserva intento y clave antes de HTTP. Timeout no elimina ese intento.
El proveedor se llama fuera de transacciones; reintentos usan los mismos parámetros
y clave. Un webhook guarda evento normalizado y job antes de responder 200; no
persiste PAN/CVV ni el payload original. Si llega antes de vincular la sesión, se
reintenta tras la conciliación de creación. Orden, pago exitoso y venta se coordinan
con lock de orden; duplicados no crean otra venta. LISTO verifica también Stripe.

La orden tiene objetivo de 30 minutos. Checkout requiere al menos 30 minutos desde
su creación; se solicita 31 minutos desde la reserva para tolerar el desfase y se
persiste el vencimiento real. Al alcanzar el plazo local, el worker intenta cerrar
Checkout y reconcilia: no declara EXPIRADA mientras pueda cobrar o sea incierto.
Un pago conciliado antes de expiración definitiva se reconoce aunque su aviso llegue
tarde. Un cobro excepcional de orden definitivamente EXPIRADA conserva el pago,
crea incidencia y refund durable, sin venta ni preparación. No es una devolución
general. Tokens de registro/comprobante Stripe vencen 24h desde `providerPaidAt`.

Claves del proveedor con resultado incierto no se recrean después de 23h (Stripe
retiene idempotencia al menos 24h): requieren revisión, nunca un nuevo cobro ciego.
Refund con ID ya conocido se consulta en vez de recrearlo. SMTP puede entregar más
de una vez tras una caída; los tokens siguen siendo de un uso. Payload outbox se
borra al completar, expirar, invalidar enlaces o agotar intentos. Nunca se guarda
el mensaje de error externo: solo códigos internos saneados.

## Operación local y pruebas

1. Node 22.13–22.x, `npm ci`, configuración local según `.env.example`, sin imprimir
   secretos. No copiar ni versionar `.env`.
2. Revisar migraciones y aplicarlas **solo con autorización explícita** al entorno
   elegido; esta entrega no migra bases del proyecto.
3. API: `npm run dev`; worker separado: `npm run worker`. Compilados:
   `npm run build`, `npm start` y `npm run worker:start`.
4. Correo de pruebas requiere `OUTBOX_ENCRYPTION_KEY` exclusiva (64 hex),
   `OUTBOX_KEY_VERSION`, `SMTP_LOCAL_PORT` y `MAIL_FROM`. SMTP solo 127.0.0.1,
   sin credenciales comerciales. Sin cifrado, las solicitudes de correo fallan 503.
   El worker bloquea ejecución `NODE_ENV=production` hasta revisión operativa.
5. `node scripts/verify-isolated.mjs` crea un contenedor PostgreSQL 17 efímero
   con puerto/contraseña aleatorios, sin volúmenes, ejecuta integración y db:verify
   y elimina solo su contenedor. Evidencia de BD en directorio temporal de OpenCode,
   sin sobrescribir snapshots históricos. Requiere Docker Desktop.
6. Alternativa ya existente: `npm run test:integration` y `npm run db:verify` con
   `TEST_DATABASE_URL` local `/cafeteria_test`; definir `DB_REVIEW_OUTPUT_DIR` nuevo
   para conservar evidencia histórica. `npm test` omite esas integraciones.

`npm audit` encontró 10 avisos moderados en herramientas de desarrollo (minimatch /
ESLint / typescript-eslint). `npm audit --omit=dev`: 0 vulnerabilidades. No se ejecutó
`audit fix --force`, downgrade de lint ni actualización indiscriminada.

## Revisión manual y entrega real pendientes

- Revisar `jobs.status='FAILED'`, `outbox_messages.status='FAILED'`,
  `payment_incidents.review_status='OPEN'` y `refunds.status IN ('PENDING','FAILED')`
  mediante acceso operativo autorizado; no exponer payloads/tokens en reportes.
  No reactivar jobs inciertos ni cambiar referencias/claves sin conciliar proveedor.
- Revisión humana del diff/contrato, coordinación con Enrique, CI remoto y promoción
  por PR; publicar en dev no equivale a integración en main.
- Stripe test y SMTP reales autorizados, Cloudinary, claves/rotación/retención,
  migraciones, infraestructura HTTPS, correo/dominio, monitoreo y restauración.
- Frontend, canal de entrega del ticket de invitado, cámara y renderizado/impresión.
  Ninguna configuración remota se considera activa por existir este documento.
