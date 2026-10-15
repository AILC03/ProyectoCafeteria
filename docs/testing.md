# Estrategia de pruebas

Vitest y Supertest configurados según ADR 0002. Ejecutar npm test.
Actualmente solo existen pruebas de health y configuración; los casos de
negocio siguientes son criterios pendientes, no pruebas implementadas.
Consultar la matriz AC-01–AC-22 en [cierre de planeación](planning-readiness.md).

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

El código actual aún aplica JSON 100kb; cambiar a 256 KiB al implementar
ADR 0009 y cubrir el límite con pruebas. No registrar estos casos como ejecutados.
