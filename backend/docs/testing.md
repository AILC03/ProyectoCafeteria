# Estrategia de pruebas

## FIN-01 — cierre funcional en pruebas (2026-11-10)

`tests/completion.test.ts` cubre cifrado/AAD, validación estricta, firma raw Stripe,
fallo de persistencia de webhook, proveedor ausente y errores saneados del worker.
`tests/integration/completion.integration.test.ts` usa HTTP y PostgreSQL 17 aislado
para ventas/contrato, cuentas/permisos/revocación, tokens/correo/reset, Checkout
concurrente/timeout, webhooks duplicados, conciliación y refund excepcional, tickets
Stripe, leases/fencing/reintentos/expiración y borrado de secretos. Proveedores de
Stripe/correo simulados inyectados; sin acceso a proveedores reales.

`node scripts/verify-isolated.mjs` crea un contenedor efímero sin volúmenes y ejecuta
los runners existentes de integración y db:verify con credenciales aleatorias. Solo
crea/elimina sus propias bases y contenedor; evidencia nueva en directorio temporal,
sin sobrescribir snapshots históricos. Requiere Docker, no necesita leer `.env`.
La matriz final y fallos de desarrollo resueltos se registran en
[FIN-01](tasks/FIN-01-backend-completion.md). `npm test` sigue omitiendo integración.

## Evidencia histórica — AUTH-02, 2026-10-31

El cierre AUTH-02 registró 86 pruebas unitarias/HTTP y 92 integraciones PostgreSQL
(auth 19, caja 22, catálogo 13, registro 20, órdenes 18), además de 52 ejemplos
OpenAPI. `npm test` omitió esas 92 integraciones; solo el runner dedicado las
ejecutó. Incluye alta QR final, concurrencia y rollback. Ver
[comandos y límites de esa ejecución](tasks/AUTH-02-ticket-qr-registration.md#evidencia-de-comandos--2026-10-31).
Estos resultados son históricos, no pruebas repetidas por la conciliación documental.

## Referencias de entregas anteriores

CASH-01/02, verificación local 2026-10-27: nuevas suites de importes/cifrado y
HTTP+PostgreSQL aislado para caja/cobro/ticket. Matriz de resultados y limitaciones
en [tarea CASH](tasks/CASH-01-02-cash-payments.md). Los datos inferiores de ORD-01
se conservan como referencia de esa etapa. CASH no probó el alta final: se cubrió
después en AUTH-02.

Vitest y Supertest están configurados según ADR 0002. En `dev`, `npm test`
verificó 56 pruebas unitarias/HTTP y `npm run test:integration` verificó 50
pruebas PostgreSQL para auth/admin, catálogo y ORD-01. Los casos siguientes
siguen siendo criterios de los módulos aún pendientes, salvo los ya cubiertos
por esas suites. Consultar el [estado reconciliado](README.md).

## Niveles previstos

- Unitarias: cálculo de precios, opciones y transiciones.
- Integración: consultas, transacciones y restricciones con PostgreSQL de pruebas.
- API: validación, autenticación, permisos y respuestas del contrato.
- Stripe: modo de prueba, eventos repetidos y reconciliación.

## Casos mínimos

- Tamaño con distinto recargo por bebida; leche/sabor/extras globales.
- Opciones obligatorias, límites y producto agotado.
- Dos configuraciones del mismo producto conservadas por separado.
- Precio enviado por navegador no modifica total del backend.
- Pago repetido no duplica venta ni preparación.
- Expiración concurrente con cobro y webhook tardío.
- Fallo de Stripe al verificar no produce expiración definitiva arbitraria.
- Cobro sobre orden definitivamente expirada solicita reembolso.
- Solo una caja abierta; cobrar efectivo exige sesión abierta.
- QR de registro vencido/usado y consumo concurrente.
- Registro asocia solo la compra del token.
- Teléfono único, limitación de intentos y reset con cambio obligatorio.
- Cajero no hace CRUD de productos ni recupera cuentas.
- Cambios del catálogo no modifican órdenes históricas.

Usar datos ficticios y base aislada. Nunca ejecutar limpieza de pruebas contra
producción. No exigir credenciales Stripe reales para pruebas unitarias.

El entorno Docker prepara cafeteria_test y TEST_DATABASE_URL en .env.docker.
`npm run test:integration` carga ese archivo cuando existe y no se proporcionó ya
TEST_DATABASE_URL explícita (prioridad para CI/revisión aislada);
ejecutar antes `npm run db:up` para iniciar PostgreSQL. Si se usa otra instalación
local, definir `TEST_DATABASE_URL` en el entorno sin imprimir credenciales.
Ver [arranque local](database-setup.md). Esto no conecta automáticamente cualquier
prueba nueva a PostgreSQL: las suites de integración existentes sí cubren negocio.
La futura limpieza
debe validar su destino explícitamente; jamás usar desarrollo ni shadow.

## Casos adicionales de ADR aceptadas

- Acceso personal vence a 8 horas absolutas, no por inactividad ni renovación; caja permanece abierta.
- JWT 15 minutos y clientes 30 días; logout/reset/baja revocan acceso inmediatamente.
- Renovaciones simultáneas no cierran una sesión legítima ni permiten reutilización indebida.
- Contraseña personal acepta 8–24 caracteres, NIP conserva ceros; bloqueo 5 fallos/15 minutos.
- Admin puede operar caja propia y cerrar ajena con motivo; cajero ajeno no cobra/cierra.
- PREPARACION/CAJERO/ADMINISTRADOR marcan LISTO solo desde EN_PREPARACION, con auditoría.
- Pedido previo a agotado conserva condiciones; pedido nuevo con agotado se rechaza.
- Máximos 50 líneas, 99 unidades/línea y 9999900 centavos.
- Efectivo recibido/cambio produce ingreso neto igual a venta; cierre concurrente incluye o rechaza el cobro atómicamente.
- Asociación posterior al pago rechazada salvo alta transaccional por QR; búsqueda no expone secretos/historial.
- Idempotency-Key conserva resultado 48 h; misma clave con datos distintos produce 409.
- CORS/CSRF y límite JSON 256 KiB conforme ADR 0009; health conserva su respuesta.
- Carga Cloudinary solo admin, una imagen JPEG/PNG/WebP hasta 5 MiB; fallo no pierde foto anterior.
- Worker reiniciable, reintento idempotente y outbox cifrada con purga; recuperación/verificación 30 minutos.

El límite JSON y los controles transversales de ADR 0009 están implementados en
los módulos disponibles. Pagos CASH y registro QR ya tienen pruebas; no extender
esa evidencia a Stripe, recuperación, worker general o Cloudinary real hasta que
existan y se ejecuten sus pruebas correspondientes.
