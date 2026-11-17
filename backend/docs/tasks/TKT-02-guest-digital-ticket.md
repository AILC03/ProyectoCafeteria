# TKT-02 — Comprobante digital de invitado

- Responsable: asistente, por encargo de Ángel.
- Revisor humano: Ángel; coordinar contrato con Enrique antes de integrar.
- Rama base: dev; se conserva la rama y el trabajo documental existentes.
- Estado: implementada/verificada localmente, pendiente revisión humana/integración;
  contrato funcional aprobado explícitamente por Ángel en esta conversación.

## Objetivo y fuentes

Completar el acceso limitado al comprobante CASH pagado de invitado. Fuentes:
[ADR 0011 §2](../adr/0011-integrity-protocols.md), BR-REG-006 y BR-ORD-005
en [reglas](../business-rules.md), [permisos](../permissions.md) y
[plan de contrato](../api/contract-plan.md). Aprobación del encargo: emitir/reemitir
desde caja, token distinto de registro/cobro en cabecera, 24h desde pago,
revocación de anteriores sin ampliar plazo, sin estado ni historial.

## Alcance y exclusiones

- POST `/api/v1/sales/{id}/ticket-access`: CAJERO/ADMINISTRADOR, sesión vigente,
  Origin y CSRF. Body `{}` sin campos adicionales. Emite un token nuevo y revoca
  los anteriores en una transacción serializada por venta/orden. Cada solicitud
  exitosa rota el acceso; no es idempotente ni conserva el original recuperable.
  Ante respuesta perdida, volver a emitir desde caja.
- GET `/api/v1/guest-ticket`: exclusivamente `X-Ticket-Token`, sin query/body.
  Token aleatorio 32 bytes, solo SHA-256 en `guest_ticket_tokens` existente.
  Ausente, desconocido, vencido o revocado: 404 indistinguible; mal formado: 400.
- Emisión solo para venta CASH coherente de invitado, dentro de 24h desde pago.
  GET no consume el token ni amplía plazo. Un alta QR posterior no amplía permisos
  ni revoca el comprobante ya emitido; no permite emitir nuevos accesos desde caja
  cuando la compra ya tiene cliente asociado.
- Respuesta con lista explícita de campos del comprobante y snapshots, nunca
  estado, cliente, empleados, sesiones, datos de cuenta o QR de registro.
- No incluye QR de cobro/escaneo (siguiente entrega), Stripe, HTML/PDF, impresión,
  enlaces públicos, worker, nuevas dependencias, secretos ni migraciones.
- Preservar contrato de ticket protegido, registro QR y cobros existentes.

## Criterios y trazabilidad

| ID    | Requisito/fuente                                         | Implementación prevista                  | Prueba esperada                                           | Evidencia                                      |
| ----- | -------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| CA-01 | Emisión solo caja para invitado pagado; permisos/ADR0011 | tickets rutas/servicio/repositorio       | 401/403, CSRF, asociada/inexistente y pago futuro/vencido | Verificado: HTTP y cash/TKT-02                 |
| CA-02 | Token opaco, hash, 24h desde pago; ADR0011               | guest_ticket_tokens, auth.tokens         | no original persistido, límite exacto y relectura         | Verificado: cash/TKT-02                        |
| CA-03 | Reemisión revoca anteriores sin extensión; ADR0011       | locks venta/orden/pago y transacción     | concurrencia, rollback y una autorización activa          | Verificado: cash/TKT-02                        |
| CA-04 | Solo comprobante; BR-ORD-005/BR-REG-006                  | DTO explícito, GET independiente         | sin estado/cuenta/registro, otros tokens no autorizan     | Verificado: HTTP y cash/TKT-02                 |
| CA-05 | Sin fugas; ADR0011/0006                                  | cabecera exclusiva, no-store/no-referrer | errores, logs, query/body rechazados                      | Verificado: HTTP y cash/TKT-02                 |
| CA-06 | Contrato y regresión                                     | OpenAPI 0.7.0 y pruebas HTTP/PostgreSQL  | respuesta conforme, suites existentes conservadas         | Verificado: 88 HTTP/unitarias + 98 integración |

## Plan e impacto

1. Contrato y pruebas de seguridad/concurrencia.
2. Persistencia con tabla existente; locks venta existente → orden → pago → tokens
   digitales. Compatible con AUTH-02, que toma su token de registro y luego
   venta → orden → pago; esta entrega nunca bloquea tokens de registro.
   No se modifican snapshots. Auditoría sin originales/hashes.
3. Pruebas HTTP y PostgreSQL aislado, checks del flujo y documentación.

API aditiva. Frontend debe mantener el token solo en memoria, enviarlo en cabecera,
no ponerlo en URL, analítica, logs, cachés ni almacenamiento persistente. No se
crea enlace/QR digital que exponga el token. GET recibe solo el comprobante;
sesión/cookies no sustituyen la cabecera. Límite público existente de 120/minuto
por IP/proceso y CORS exacto se conservan. Sin llamadas externas ni costos nuevos.

## Decisiones y evidencia

Contrato funcional y orden de implementación aprobados por Ángel mediante «sí»
en esta conversación. No implica revisión/integración ni autorización de despliegue.
No implica aprobación de integración/despliegue. No se tocaron bases reales ni
evidencia histórica. Se conservaron los cambios documentales previos del usuario.

## Evidencia de entrega — 2026-11-09

- CA-01–06: comprobados por `tests/tickets.test.ts` (2 pruebas de frontera HTTP)
  y los 6 casos TKT-02 añadidos a `tests/integration/cash.integration.test.ts`.
  Incluyen contrato de ambos DTO, roles/CSRF, campos adicionales, hash sin
  original persistido, errores sin filtración, límite IP, plazo exacto, pago
  futuro/vencido, token ajeno, reemisión concurrente, rollback y carrera con alta QR.
- `npm test`: **88 aprobadas, 98 omitidas** (integraciones, no contadas como aprobadas).
- `npm run test:integration`: **98 aprobadas** sobre PostgreSQL **17.11** temporal:
  auth/admin 19, cash/TKT-02 28, catálogo 13, registro QR 20 y orders 18.
  Primer intento contra configuración local existente falló con ECONNREFUSED;
  la ejecución posterior aislada completó las cinco suites.
- `npm run db:verify`: **22 comprobaciones correctas y mutantes C01–C04 detectados**;
  migración/repetición/diff/smoke en bases propias y posterior limpieza.
  Evidencia nueva en `C:\Users\angel\AppData\Local\Temp\opencode\cafeteria-tkt02-b55c953a\corrections-results.json`,
  usando `DB_REVIEW_OUTPUT_DIR` para no reescribir evidencia histórica.
- PostgreSQL de pruebas: contenedor efímero con almacenamiento tmpfs, puerto
  aleatorio ligado a loopback y credencial efímera no impresa. Eliminado al terminar.
- `npm run typecheck`, `npm run lint`, `npm run build` y `npm run db:validate`: correctos.
- `npm run api:validate`: correcto, 54 ejemplos conformes. Un primer intento
  detectó indentación YAML de las rutas nuevas; se corrigió antes de integración.
- `npm run format:check` y `git diff --check`: correctos. Revisados diff y
  archivos nuevos; informes históricos, migraciones y módulos auth/admin intactos.

### Archivos de la entrega

- `src/modules/tickets/tickets.{routes,controller,validation,service,repository}.ts`:
  API, DTO explícito, validación, locks, transacciones y tokens limitados.
- `src/app.ts`: cabeceras de privacidad también en errores previos al router.
- `tests/tickets.test.ts` y `tests/integration/cash.integration.test.ts`: evidencia.
- `scripts/verify-database.mjs`: directorio opcional de evidencia, sin cambiar
  comprobaciones ni destino de BD; evita reescribir informes históricos.
- `docs/api/openapi.yaml`, esta tarea, `docs/guest-ticket-implementation.md`,
  `docs/README.md`, `docs/api/contract-plan.md`, `docs/permissions.md`,
  `docs/development-tasks.md` y `docs/frontend-integration.md`: contrato y continuidad.

Sin proveedor nuevo/simulado ni llamadas externas. No se aplicaron migraciones
al proyecto; se reutilizó la tabla existente. Pendientes: revisión Ángel/Enrique,
integración frontend/canal de entrega y QR de cobro/escaneo en entrega separada.
Sin commit, push, merge ni despliegue; no existe enlace de PR de esta entrega.
