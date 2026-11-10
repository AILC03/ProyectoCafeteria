# CASH-03 — Emisión y escaneo de QR de cobro CASH

- Responsable: asistente, por encargo de Ángel «sigue desarrollando en base al plan».
- Revisor humano: Ángel; coordinar API con Enrique y migración con Leonel antes de integrar.
- Rama base/trabajo: dev existente, sin descartar cambios documentales ni TKT-02.
- Estado: implementada/verificada localmente, pendiente revisión humana/integración;
  alcance funcional autorizado en esta conversación.

## Objetivo y fuentes

Cerrar QR pendiente de CASH-02. Fuentes: BR-ORD-001–005, BR-CASH-001/004/005,
BR-PAY-002 de [reglas](../business-rules.md), [permisos](../permissions.md),
[contexto §4](../PROJECT-CONTEXT.md), ADR 0006/0009/0011 y OpenAPI.
Escanear identifica la orden: nunca confirma pago. Sin consulta pública de estado.

## Alcance y contrato

- Opción aditiva `includeCashQr: true` en creación móvil/caja, exclusivamente CASH.
  Devuelve propiedad hermana `cashQr` junto a `data`, sin cambiar el DTO Order.
  Ausente/false preserva respuesta y requisitos existentes. QR con token aleatorio
  de 32 bytes, payload `cafeteria:cash:<token>` y vencimiento original de 30 minutos.
- POST `/api/v1/cashier/orders/{id}/cash-qr`, body `{}`: CAJERO/ADMINISTRADOR,
  sesión vigente, Origin/CSRF. Emite o reimprime el mismo QR de orden CASH pendiente
  y vigente; no rota ni prolonga plazo. Funciona para órdenes antiguas sin original.
- POST `/api/v1/cashier/orders/scan-cash-qr`, body `{token}` sin prefijo: mismo
  acceso. Respuesta mínima con orderId, orderFolio, totalCents, paymentExpiresAt e
  items históricos. No exige caja abierta para consultar; cobrar sí la exige y
  valida responsable en POST `/payments/cash` existente con Idempotency-Key.
- Escanear no consume, paga, crea venta ni cambia estado. Token inválido 404;
  orden pagada/vencida/no CASH da 409 cuando es identificable por personal.
- Reintento de creación con clave original conserva el QR original, incluso
  después de pagar/vencer, igual que el resultado original de ORD-01. Escanearlo
  entonces se rechaza; nunca concede consulta al invitado ni renueva plazo.

## Persistencia y seguridad

Migración aditiva: ciphertext y versión opcionales en orders, ambos NULL o ambos
presentes y exclusivos de CASH; no se modifican migraciones aplicadas. Hash
cash_qr_token_hash sigue siendo la identidad UNIQUE. AES-256-GCM con AAD
`cash-payment:<orderId>:<version>`, separado de registro. Reutiliza configuración
TICKET_ENCRYPTION_KEY/TICKET_KEY_VERSION existente, sin secretos de auth/fallback.
No original en response_json, logs o auditoría. Sin clave, solo operaciones que
necesitan emitir/descifrar QR devuelven 503 con rollback; scan/cobro por ID siguen
independientes de descifrado. Limpieza manual existente elimina ciphertext tras
48h desde creación, conservando hash e históricos y la ventana de reintentos.

Locks de orden serializan emisión/reimpresión/escaneo con cobro y asociación.
Idempotencia de creación sigue usando actor/alcance/clave 48h antes del lock de
orden. Nunca se usa folio o Idempotency-Key como permiso de consulta de estado.
Privacidad no-store/no-referrer también en errores HTTP tempranos.

## Criterios y trazabilidad

| ID    | Requisito/fuente                         | Implementación prevista                       | Prueba esperada                                                | Estado                              |
| ----- | ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| CA-01 | QR CASH pendiente; BR-ORD-001/004        | orders validación/servicio, OpenAPI           | móvil/invitado/caja, STRIPE rechazado, plazo fijo              | Verificado: orders/cash y BD        |
| CA-02 | No consulta pública; BR-ORD-005          | rutas y DTO scan mínimo                       | 401/403/CSRF, token ajeno/prefijo/extra inválidos              | Verificado: cash BD y orders        |
| CA-03 | Secreto sin filtración; ADR0009          | cifrado contextual, hash, migración, limpieza | AAD/manipulación, no original en BD/logs, rollback             | Verificado: cash unitaria y BD      |
| CA-04 | Reintentos/concurrencia; ADR0006         | idempotencia y locks orden                    | misma creación/QR, dos emisiones, escaneos/cobros concurrentes | Verificado: cash BD                 |
| CA-05 | Cobro y preparación atómicos; BR-PAY-002 | payments existente sin nuevo canal            | escaneo sin efectos, un pago/venta y cierre/responsable        | Verificado: cash BD y regresión     |
| CA-06 | Históricos y regresión                   | snapshots y checks completos                  | catálogo modificado no recotiza, migración/diff y suites       | Verificado: integración y db:verify |

## Plan, exclusiones y riesgos

1. Contrato OpenAPI 0.8.0 y escenarios antes del código.
2. Migración aditiva, cifrado contextual y módulos existentes, sin dependencias.
3. Pruebas HTTP/PostgreSQL aislado, documentación y revisión del diff.

Fuera: cámara/renderizado QR, frontend, QR de registro, cambios en TKT-02, Stripe,
worker, expiración automática, hosting, despliegue o aplicación a bases reales.
Frontend conserva token en memoria, nunca URL/logs/analítica/localStorage; confirma
recibido/cambio antes de cobrar con la ruta vigente. Coordinar migración y clave
antes de activar includeCashQr; no se configurarán secretos reales aquí.
No nueva decisión de negocio/roles; se preserva seguridad y compatibilidad por
opción explícita. La aceptación funcional no equivale a revisión/integración.

## Evidencia de entrega — 2026-11-09

- `npm run db:generate`: cliente Prisma generado correctamente, sin conectar ni migrar bases reales.
- `npm run db:validate`: esquema válido.
- `npm run typecheck`, `npm run lint`, `npm run build`: correctos.
- `npm run api:validate`: OpenAPI válido, **58 ejemplos conformes**.
- `npm test`: **90 aprobadas y 104 omitidas** (integración; no se cuentan como aprobadas).
- `npm run test:integration`: **104 aprobadas** en PostgreSQL **17.11**, repetidas
  tras añadir carrera simultánea scan/cobro: auth/admin 19, cash/TKT-02/CASH-03 34,
  catálogo 13, registro QR 20 y órdenes 18. Contenedores efímeros con tmpfs,
  credencial aleatoria no impresa, puerto aleatorio solo loopback. Eliminados al finalizar.
- `npm run db:verify`: **22 comprobaciones y mutantes C01–C04 detectados**.
  Migración/repetición/diff/smoke de cliente correctos en bases creadas por el runner.
  Informe nuevo en `C:\Users\angel\AppData\Local\Temp\opencode\cafeteria-cash03-d56a0fec\corrections-results.json`
  mediante DB_REVIEW_OUTPUT_DIR. No se modificaron informes históricos.
- `npm run format:check` y `git diff --check`: correctos. Diff y archivos nuevos
  revisados; informes históricos, migraciones previas y auth/admin intactos.

### Pruebas y archivos

- 6 casos CASH-03 en `tests/integration/cash.integration.test.ts`: creación
  concurrente/replay con QR, hash/cifrado/response_json/logs, emisión concurrente
  de legado, clientes/caja, separación de tokens y permisos/CSRF, scan/cobros
  concurrentes, responsable de caja, snapshots tras cambio de catálogo, rechazo
  posterior al pago, rollback sin clave, clave incorrecta, plazo exacto 30min,
  CHECK SQL y limpieza exacta a 48h conservando hashes.
- `tests/orders.test.ts`: opt-in CASH, STRIPE/forma inválida y escaneo estricto.
- `tests/cash.test.ts`: separación AEAD entre CASH y registro con misma clave/ID.
- `src/modules/orders/orders.{validation,routes,controller,service,repository}.ts`:
  contrato, autorización/validación, emisión/reimpresión, escaneo y persistencia.
- `src/modules/tickets/tickets.cipher.ts`: propósito AEAD explícito; default de
  registro conservado. `src/server.ts`: inyección del cifrado CASH independiente.
- `src/app.ts`: cabeceras de privacidad también para errores tempranos de órdenes.
- `prisma/schema.prisma` y nueva migración `20261109_cash_qr_delivery/migration.sql`:
  columnas/constraints aditivos; migraciones anteriores intactas.
- `scripts/cleanup-ticket-secrets.ts`: limpieza manual de originales CASH elegibles.
- `docs/api/openapi.yaml`, esta tarea, `docs/cash-qr-implementation.md`, índice,
  backlog, guía frontend, permisos, diccionario, progreso y plan del contrato.

Sin dependencias/proveedor nuevo ni llamadas externas. Migración probada solo
en bases temporales: **no aplicada a desarrollo/shadow/producción**. No se
configuraron secretos ni scheduler; falta revisión humana, coordinación de
migración/clave conservada 48h, limpieza periódica y cámara/renderizado frontend.
TKT-02 y documentos previos se conservaron. Sin commit/push/merge/despliegue.
No existe PR/revisión humana de esta entrega.
