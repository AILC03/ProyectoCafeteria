# AUTH-02 — Registro de cliente mediante QR de ticket

- Fecha/encargo: 2026-10-30, Ángel. Responsable: IA; revisión humana: Ángel y coordinación con Enrique.
- Estado: implementada y verificada localmente, cierre 2026-10-31; pendiente revisión humana/integración. Sin commit/push/merge/despliegue.
- Árbol inicial: cambios pendientes de CASH y otros archivos, incluido .env.example;
  se conservan sin leer archivos de entorno ni descartar trabajo anterior.

## Objetivo y fuentes

Alta exclusivamente con el token original del QR de registro de una compra pagada
de invitado. Fuentes: [CASH tarea](CASH-01-02-cash-payments.md),
[implementación CASH](../cash-implementation.md), [frontend](../frontend-integration.md),
[permisos](../permissions.md), [reglas](../business-rules.md) BR-REG-001/002/003/005/006,
BR-USR-002/003/008/009/010, BR-ORD-009; [arquitectura](../architecture.md),
[integridad](../database/integrity-protocols.md), ADR 0004/0005/0006/0008/0011/0012,
[OpenAPI](../api/openapi.yaml), Prisma y migraciones existentes.

No existe módulo customers funcional. CASH-02 genera token base64url de 43 caracteres
(32 bytes), persiste SHA-256 y copia AES-256-GCM temporal para impresión; vence 24h
desde pago. AUTH-02 compara el hash del original; no crea otro formato, no descifra
el ticket ni exige una nueva clave. El cuerpo no acepta el prefijo del qrPayload.

## Contrato y flujo

POST `/api/v1/customer-registration/ticket`, público para invitado, con Origin y
bootstrap CSRF según flujo existente. Body estricto `{token,name,phone,pin}`.
Sin cookies de acceso/refresh: un usuario con sesión debe cerrar sesión primero,
conforme a la matriz (no segunda cuenta desde una sesión cliente/personal).

1. Límite propio de 20 intentos/minuto/IP (en memoria por proceso), sin afectar otras rutas.
2. Validar token opaco, nombre trim 1–120, teléfono MX (10 dígitos o +52) y NIP string de 4 dígitos.
3. En una transacción con reintento acotado: token FOR UPDATE → venta → orden/pago,
   revalidar uso/vencimiento, compra pagada y referencias/importes/método coherentes.
   Solo EN_PREPARACION/LISTO, paidAt y pago SUCCEEDED/confirmado, sin cliente asociado.
4. Serializar teléfono normalizado, comprobar unicidad incluso cuentas inactivas;
   generar hash Argon2id con utilidad extraída de auth, dentro de la transacción.
   Revalidar vencimiento tras hash y antes de consumir: límite menor entre expiresAt y pago+24h.
5. Reservar identity users y número `C` + decimal mínimo seis dígitos (no CLI-),
   rol CLIENTE y accountType CUSTOMER; no contraseña staff/correo/rol enviados por cliente.
   Unicidad de teléfono también en SQL; números/IDs previos ocupados se omiten con límite.
6. Asociar **solo** la orden de esa venta sin tocar snapshots/estado/importes/guestName;
   consumir token con usedAt/usedByCustomerId, conservar hash y borrar cifrado/versión.
   Auditar sin NIP, token ni cuerpo personal. Fallo en cualquier paso revierte todo.
7. 201 `{data:{customer:{customerNumber,name,phone}}}`; teléfono normalizado +52.
   Sin ID interno, cookies, JWT, hash, token ni cifrado. Login posterior por auth normal.

Errores seguros: 400 VALIDATION_ERROR (estructura); 404 REGISTRATION_TOKEN_INVALID
(inexistente/formato válido de otro propósito); 409 REGISTRATION_TOKEN_USED,
REGISTRATION_TOKEN_EXPIRED, REGISTRATION_PURCHASE_INELIGIBLE o PHONE_ALREADY_REGISTERED.
No se consulta teléfono antes de validar QR/compra. 403 CSRF/solo invitado;
429 REGISTRATION_RATE_LIMITED; 503 dependencia. Sin datos de compra ni identidad ajena.
No se cachea éxito idempotente ni se reentrega identidad al reutilizar QR; tras
respuesta perdida, un reintento usado indica que no se permite otra alta.

## Fuera de alcance

Sin registro libre, login nuevo/automático, perfil/historial, cambio/recuperación/reset
de NIP, correo/worker, QR de pago, Stripe/webhooks/reembolsos/conciliación ni cambios
de catálogo/caja/cobro. Solo se asocia la compra del token. No aplicar migraciones
a desarrollo/shadow/producción ni leer/imprimir valores .env.

## Matriz requisito → código → prueba

| ID  | Criterio                                              | Código                        | Evidencia ejecutada                                                                                                                                        |
| --- | ----------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Alta válida y número C visible, rol/tipo correctos    | service/repository            | HTTP desde ticket CASH real; CLIENTE/CUSTOMER y C visible comprobados.                                                                                     |
| A02 | NIP solo Argon2id, login normal; no sesión automática | auth.credentials/shared input | Hash codificado Argon2id, verify y login normal; passwordHash NULL, cero sesiones nuevas y sin Set-Cookie en alta.                                         |
| A03 | Asociación exclusiva y snapshots intactos             | repository.associate          | Compara orden y Latte con dos opciones, pago y venta antes/después; otra orden permanece sin cliente.                                                      |
| A04 | Uso permanente y purga de cifrado                     | repository.consume            | usedAt/usedBy correctos, hash retenido, cifrado/versión NULL; reimpresión sin QR y repetición usada aun después de vencer.                                 |
| A05 | Tokens/compra no aptos                                | service                       | Inexistente, vencido almacenado y pago+24h; orden impaga, pago pendiente, ya asociada y total incoherente; sin altas parciales. SQL rechaza moneda no MXN. |
| A06 | Teléfono normalizado único                            | SQL UNIQUE/advisory           | Duplicado inactivo y dos QR concurrentes mismo teléfono 10 dígitos/+52: una alta, otro QR intacto.                                                         |
| A07 | Validación estricta                                   | schemas/controller            | Unitarias y HTTP: NIP longitud/tipo, token ausente, campos extra, nombre/teléfono inválidos.                                                               |
| A08 | Una alta concurrente y atomicidad                     | FOR UPDATE/withTransaction    | Mismo QR: 201+409, una fila; fallo audit tras consumo revierte todo y permite reintento; vencimiento durante hash y tras asociación revierte.              |
| A09 | Sin secretos ni permisos por QR                       | routes/controller/DTO         | DTO exacto de tres campos, logs sin token/hash, alta sin copia cifrada y consulta de orden con QR da 401. Ticket sigue protegido por rutas existentes.     |
| A10 | Rate limit propio, CSRF y regresión                   | routes/app                    | CSRF ausente y cookie de sesión rechazados; 429 propio no bloquea health/CSRF; suites anteriores pasan.                                                    |

Pruebas: [unitarias/HTTP](../../tests/customer-registration.test.ts) (17 casos) y
[PostgreSQL](../../tests/integration/customer-registration.integration.test.ts) (20 casos).

## Archivos e impacto realizados

- Nuevo módulo `src/modules/customer-registration/` con routes/controller/service/repository/schemas.
- Extracciones mínimas: hash Argon2id en auth; normalización MX/esquema NIP común;
  formato visible A/C/V reutilizado en orders/sales. No se cambia ningún algoritmo/plazo.
- Integración en `src/app.ts` y `src/server.ts`; `docs/api/openapi.yaml` 0.6.0
  actualizado primero con `scripts/update-registration-contract.mjs`.
- Nuevas utilidades `src/modules/auth/auth.credentials.ts`,
  `src/shared/http/customer-input.ts` y `src/shared/database/visible-number.ts`.
- Consumidores mínimos: auth.service/controller, orders.validation/repository,
  sales.repository y tickets.validation (exporta esquema del token original).
- Documentación: esta tarea, frontend-integration, permissions, backend-progress,
  development-tasks y PROJECT-CONTEXT. CASH histórico se conserva.
- **Sin migración nueva**: users/customer_registration_tokens/orders y sus UNIQUE/FK
  actuales soportan el flujo. Prisma/schema y migraciones anteriores no se editaron
  en AUTH-02; los cambios CASH ya estaban pendientes al comenzar.

## Riesgos y decisiones

El QR es portador: quien tenga el original válido puede registrar la compra.
No demuestra titularidad del teléfono (verificación SMS fuera de alcance). CSRF no
es sesión y se obtiene antes de la mutación; la respuesta del registro no pone cookies.
Se mantienen teléfono/código únicos y locks de BD; límite IP de un proceso no es
un limitador distribuido. No se amplían permisos de lectura ni se asocian otras compras.
No hay nuevas decisiones de negocio/ADR; revisión de contrato con frontend pendiente.

## Evidencia de comandos — 2026-10-31

Node v22.14.0; sin dependencias nuevas ni cambios de lockfile.

| Comando                    | Resultado real final                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`        | Correcto.                                                                                                                                                                  |
| `npm run lint`             | Correcto, cero advertencias.                                                                                                                                               |
| `npm run format:check`     | Correcto, todo el repositorio. Prettier write limitado a archivos de esta entrega.                                                                                         |
| `npm test`                 | 86 correctas, 92 omitidas de integración (no se suman como aprobadas en este comando).                                                                                     |
| `npm run api:validate`     | OpenAPI válido; 52 ejemplos conformes. También ejecutado antes de código.                                                                                                  |
| `npm run db:validate`      | Prisma válido.                                                                                                                                                             |
| `npm run build`            | Correcto.                                                                                                                                                                  |
| `npm run test:integration` | 92 correctas: auth 19, cash 22, catálogo 13, registro 20, orders 18. Cero omitidas.                                                                                        |
| `npm run db:verify`        | PostgreSQL 17.10, 22 comprobaciones correctas; mutantes C01–C04 detectados, deploy/redeploy y diff vacío, aserciones estructurales y smoke Prisma correctos; cleanup=true. |

Entorno BD: cluster **nuevo y propio** `auth02-pg-20261030` en temporal autorizado,
solo loopback/puerto 56440, usuario local de revisión sin secreto. Sin binario
createdb disponible: se creó únicamente la nueva cafeteria_test mediante pg.
Runners crean/eliminan sus propias bases; no se usaron bases del proyecto.
Comandos BD con `TEST_DATABASE_URL` explícito de esa cafeteria_test y
`DOTENV_CONFIG_PATH` apuntando a archivo inexistente `auth02-no-env`; no cargan
.env/.env.docker. El runner db:verify generó evidencia válida a las 08:46:27Z;
su JSON histórico se dejó exactamente con la fecha previa de CASH para no
sobrescribir evidencia anterior (el resto del contenido fue idéntico).

Iteraciones corregidas, no ocultadas: tipos iniciales de fixtures, lint de regex
de controles (reemplazado por códigos de caracteres), aislamiento de corrupción
del fixture de venta y prueba de moneda rechazada por CHECK de BD; formato
ajustado hasta pasar. Todos los comandos anteriores se repitieron correctamente.

Revisión final: `git diff --check` correcto (excluidos archivos .env sin leerlos),
52 enlaces locales de los seis documentos correctos; diff de migraciones previas
y package-lock vacío. Se revisaron diff de extracciones/integración y archivos
nuevos. Base propia cafeteria_test eliminada; ninguna base de runners pendiente;
cluster temporal propio detenido con pg_ctl. No se detuvo ningún otro servidor.

Sin checks obligatorios bloqueados. No se ejecutaron despliegue, proveedor real,
frontend, recuperación ni migraciones sobre bases del proyecto: fuera de alcance.
Pendientes reales: revisión de Ángel/contrato con Enrique, integración y protección
distribuida del rate limit si se despliegan varias instancias. El portador del QR
no demuestra titularidad del teléfono; no se introduce SMS en este encargo.
