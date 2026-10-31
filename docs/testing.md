# Estrategia de pruebas

CASH-01/02, verificación local 2026-10-27: nuevas suites de importes/cifrado y
HTTP+PostgreSQL aislado para caja/cobro/ticket. Matriz de resultados y limitaciones
en [tarea CASH](tasks/CASH-01-02-cash-payments.md). Los datos inferiores de ORD-01
se conservan como referencia de esa etapa. No se probó el alta final de registro.

Vitest y Supertest están configurados según ADR 0002. En `dev`, `npm test`
verificó 56 pruebas unitarias/HTTP y `npm run test:integration` verificó 50
pruebas PostgreSQL para auth/admin, catálogo y ORD-01. Los casos siguientes
siguen siendo criterios de los módulos aún pendientes, salvo los ya cubiertos
por esas suites. Consultar el [estado reconciliado](tasks/DOC-01-adr-status-reconciliation.md).

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
los módulos disponibles. No registrar como ejecutados los casos de pagos,
recuperación, worker o Cloudinary real hasta que existan sus pruebas.
