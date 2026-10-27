# Ruta de desarrollo — Backend de cafetería

Actualizado: 26 de octubre de 2026. Esta ruta describe el repositorio activo: `C:\Users\angel\OneDrive\Documentos\ProyectoCafeteria\CafeteriaProyecto-BACKEND`.

## Estado comprobado

El backend ya no está en fase inicial. Tiene base de datos migrada, catálogo público, autenticación basada en cookies y administración de catálogo. La siguiente entrega debe construirse sobre esta base sin volver a implementar estos módulos.

| Área                       | Estado actual                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plataforma                 | Express 5, TypeScript estricto, PostgreSQL 17, Prisma 7, Zod, pruebas Vitest y validación OpenAPI.                                                                                                                                          |
| Persistencia               | Esquema Prisma con entidades de usuarios, catálogo, órdenes, pagos, ventas, caja, tokens, sesiones, auditoría, jobs y subida de imágenes. La migración inicial fue corregida y se agregó una migración aditiva para `image_upload_intents`. |
| Datos de demostración      | Seed aditivo e idempotente con roles, categorías, productos y opciones ficticias. La cuenta `AngelAdmin` se crea de forma local con contraseña introducida interactivamente.                                                                |
| Infraestructura HTTP       | Errores `application/problem+json`, serialización segura de `BIGINT`, cursor estable, request ID, logs saneados, Helmet, CORS de origen exacto, límite JSON de 256 KiB y límite público de lectura.                                         |
| Catálogo público           | Implementado: categorías, productos, detalle y opciones, con filtros, cursor, precios como centavos en cadenas, disponibilidad y bajas lógicas.                                                                                             |
| Autenticación              | Implementada: login de personal y cliente, cookies HttpOnly, JWT de hasta 15 minutos, refresh rotativo, revocación, bloqueo persistente, límite por IP, CSRF y cambio de NIP/contraseña.                                                    |
| Administración de catálogo | Implementada: administración de categorías, productos, grupos/opciones, disponibilidad del cajero y configuración atómica. Incluye flujo de intents para imágenes y limpieza durable simulada.                                              |
| Cloudinary real            | Pendiente: faltan credenciales del equipo y una prueba real autorizada. Las pruebas actuales usan proveedor simulado.                                                                                                                       |
| Compras                    | Pendiente: no hay módulo de órdenes, caja, pagos, Stripe, tickets ni preparación.                                                                                                                                                           |
| Clientes posteriores       | Pendiente: registro por QR de ticket, recuperación de NIP por correo, reset administrativo, perfil/historial/favoritos y CRUD de empleados.                                                                                                 |
| Operación asíncrona        | Pendiente: worker de expiración, correo, conciliación Stripe, reembolsos y outbox en ejecución.                                                                                                                                             |

## Precauciones de estado

- `docs/PROJECT-CONTEXT.md` y otros documentos conservan secciones históricas. Para el estado vigente se debe priorizar su encabezado del 25 de octubre, `docs/backend-progress.md`, `docs/auth-admin-implementation.md`, el código y las pruebas.
- ADR 0011 está aceptado. Ángel aceptó explícitamente ADR 0012 el 2026-10-26. Su diseño se conserva; Cloudinary continúa simulado, también en CI, sin autorización de configuración ni prueba real.
- La carpeta `.git` no fue accesible durante esta revisión, por lo que no se verificaron rama, historial ni cambios sin confirmar. Antes de editar, OpenCode debe ejecutar `git status --short` y preservar trabajo ajeno.
- No se leyeron ni copiaron secretos de `.env`.

## Lo que ya está acordado y debe conservarse

- Órdenes con `CASH` o `STRIPE`, sin pagos mixtos o parciales; estados `PENDIENTE_PAGO`, `EN_PREPARACION`, `LISTO` y `EXPIRADA`. No existe `CANCELADO`.
- Stripe se confirma solamente desde backend. El QR de cobro es exclusivo de efectivo. Stripe pendiente también expira, después de reconciliar el estado real del proveedor.
- `orders`, `payments` y `sales` permanecen separados. Los snapshots en `order_items` y `order_item_options` preservan nombre, precio y opciones históricas.
- No se borran categorías con productos asociados, incluso retirados. Las bajas del catálogo son lógicas.
- Hay una sola sesión de caja abierta; el administrador puede cerrar excepcionalmente con motivo y auditoría.
- El cajero puede levantar órdenes en caja y asociar un cliente existente por teléfono o `customer_number`, sin ver correo, NIP ni historial.
- Compra pagada de invitado: QR de registro de un uso y 24 horas. Compra asociada: sin QR de registro. El registro crea una sola cuenta y asocia solamente la compra del token.
- Clientes: ID interno, `customer_number`, teléfono y NIP de cuatro dígitos. Recuperación de NIP mediante correo verificado o reset presencial por administrador con NIP temporal, cambio obligatorio y auditoría. El cajero no recupera cuentas.
- Una orden `LISTO` sale de la vista de preparación, pero permanece en historial y base de datos con actor y fecha.

## Ruta pendiente, en orden

### 1. Conservar la base aprobada de auth/admin

- ADR 0012 aceptado por Ángel el 2026-10-26; no queda pendiente decidir su aceptación.
- Mantener las pruebas de autenticación, CSRF, revocación, límites, roles y administración.
- Continuar simulando Cloudinary, también en CI. No configurar credenciales ni hacer llamadas reales hasta contar con credenciales del equipo y autorización explícita para una prueba pequeña.

**Salida:** la implementación existente y su ADR están revisados; no se cambia la seguridad por compatibilidad con flujos antiguos.

### 2. Contrato y módulo de órdenes

- Completar OpenAPI para crear órdenes desde móvil y caja, consultas propias/operativas y marcar `LISTO`.
- Implementar validación y cálculo de precios exclusivamente en backend: catálogo vigente, límites de 50 líneas y 1–99 unidades, total máximo de 9,999,900 centavos, opciones válidas y método de pago fijo.
- Crear snapshots y una orden `PENDIENTE_PAGO` con vencimiento, folio seguro e idempotencia de 48 horas.
- Permitir al cajero asociar un cliente antes del pago mediante búsqueda mínima; la asociación no cambia después del pago salvo el flujo futuro de registro QR.
- Implementar vista operativa y preparación: solo `EN_PREPARACION`; preparación, cajero y administrador pueden pasarla a `LISTO` y registrar actor/fecha.

**Salida:** crear o repetir una orden no altera precios ni duplica recursos; cambios posteriores del catálogo no cambian el historial.

### 3. Caja, efectivo y tickets

- Implementar apertura, consulta, resumen y cierre de `cash_sessions` con locks y una sesión abierta global.
- Cobrar solo efectivo con sesión abierta y cajero responsable; validar recibido, cambio, idempotencia y transición atómica a venta/preparación.
- Generar ticket imprimible y QR de cobro solo para efectivo.
- Emitir QR de registro solamente en venta pagada de invitado; almacenar hash, vencimiento y consumo único.

**Salida:** reintentos, doble clic y cobro/cierre concurrente no producen dos pagos, ventas o cierres incompatibles.

### 4. Stripe, expiración e incidencias

- Crear/reutilizar Checkout Stripe en MXN con claves de idempotencia persistentes.
- Recibir webhooks con cuerpo crudo, validar firma, importe, moneda y relación con la orden.
- Persistir eventos, reconciliar antes de vencer y procesar confirmación, venta y preparación de forma idempotente.
- Expirar Stripe incompleto solamente tras reconciliación. Un pago posterior a expiración definitiva genera incidencia y reembolso, sin volver a preparación.

**Salida:** webhooks repetidos, timeout, resultado incierto y avisos tardíos no duplican ventas ni preparan órdenes no válidas.

### 5. Clientes y correo

- Registro de cliente exclusivamente mediante QR de ticket pagado de invitado, en una transacción.
- Perfil, historial propio, favoritos y repetición con catálogo/precios actuales.
- Verificación de correo, recuperación autoservicio de NIP y reset administrativo presencial auditado con `must_change_pin`.
- CRUD de empleados con baja lógica y revocación de sesiones.

**Salida:** nadie puede abrir una cuenta sin token válido, reaprovechar token o recuperar una cuenta desde caja.

### 6. Worker, entrega y operación

- Ejecutar jobs/outbox persistentes para correo, vencimientos, reconciliación, reembolsos y limpieza de imágenes.
- Añadir pruebas de integración de cada módulo con PostgreSQL aislado, y actualizar OpenAPI antes de cada endpoint.
- Mantener CI, documentación de despliegue, secretos, respaldos y restauración. Definir proveedor de correo, hosting y dominio antes de producción.

## Próxima tarea recomendada

Implementar el **módulo de órdenes**, empezando por el contrato OpenAPI y las pruebas. No mezclarlo todavía con caja, Stripe, correo o registro QR: esos flujos dependen de la orden creada y deben añadirse en entregas posteriores y verificables.

## Prompt para OpenCode

```text
Trabaja en C:\Users\angel\OneDrive\Documentos\ProyectoCafeteria\CafeteriaProyecto-BACKEND.

Antes de editar, lee AGENTS.md y docs/workflow/README.md completos. Ejecuta git status --short y conserva cualquier cambio ajeno. Revisa docs/PROJECT-CONTEXT.md, docs/backend-progress.md, docs/business-rules.md, docs/permissions.md, docs/architecture.md, ADR 0001–0012, docs/api/openapi.yaml, el esquema Prisma, los módulos auth/catalog y sus pruebas. No leas ni imprimas .env, secretos, cookies, tokens ni contraseñas.

La tarea es implementar la primera entrega del módulo orders: contrato y creación de órdenes pendientes de pago, más sus consultas operativas mínimas. No implementes todavía caja, cobro efectivo, Stripe, webhooks, tickets, registro QR, correo, worker, expiración automática ni reembolsos. No modifiques los módulos auth/admin ya existentes salvo que sea imprescindible para integrar permisos, y no cambies decisiones de ADR sin aprobación.

Primero crea una tarea verificable usando docs/workflow/task-template.md, con fuentes, alcance, exclusiones, criterios, matriz requisito→código→prueba y riesgos. Después actualiza OpenAPI antes del código para estas operaciones: crear orden móvil/invitado, crear orden desde caja, consultar una orden propia o de operación según rol, listar órdenes de preparación y marcar LISTO. Si una ruta o detalle de contrato entra en conflicto con documentos aceptados, detente y enumera la contradicción.

Reglas obligatorias:
- Estados: PENDIENTE_PAGO, EN_PREPARACION, LISTO y EXPIRADA. No existe CANCELADO.
- CASH y STRIPE comparten orders; al crear la orden el método de pago es fijo. No hay pagos mixtos ni parciales.
- Crear orden valida catálogo, disponibilidad, grupos y opciones en backend; nunca acepta precio, total o snapshots enviados por el cliente.
- Máximo 50 líneas, cantidad de 1 a 99, total máximo 9,999,900 centavos; IDs y dinero se serializan como cadenas decimales.
- Guardar snapshots de producto/opciones en order_items y order_item_options. Cambiar o retirar catálogo después no puede modificar una orden histórica.
- Usar folio seguro, vencimiento de pago e Idempotency-Key de 48 horas; misma clave y mismo cuerpo devuelve el resultado original; misma clave con cuerpo distinto da 409.
- El cajero puede crear orden de caja y asociar cliente antes del pago, buscándolo por customer_number o teléfono y mostrando solo datos mínimos. No exponer correo, NIP o historial; no permitir cambiar el cliente después del pago.
- Solo órdenes EN_PREPARACION aparecen en preparación. PREPARACION, CAJERO y ADMINISTRADOR pueden marcar LISTO desde EN_PREPARACION, guardando actor y fecha. LISTO sale de preparación y permanece en historial.
- Invitados no obtienen acceso a historial o estado público solo por tener folio.

Usa el patrón existente de rutas, validación, controlador, servicio y repositorio. Emplea transacciones y locks donde la integridad lo requiera; no reescribas migraciones aplicadas. Si el esquema necesita cambios, crea una migración aditiva y documenta la razón.

Añade pruebas HTTP y de integración PostgreSQL aislada para éxito, entradas manipuladas, campos adicionales, roles indebidos, idempotencia concurrente, límites, snapshots, producto agotado/retirado, asociación mínima de cliente y transición a LISTO. Actualiza documentación de estado y contrato.

Ejecuta los comandos aplicables: npm run format:check, npm run typecheck, npm run lint, npm test, npm run api:validate, npm run db:validate, npm run test:integration, npm run db:verify y npm run build. No apuntes pruebas destructivas a desarrollo, shadow o producción. Entrega los archivos cambiados, criterios con evidencia, comandos y resultados reales, además de cualquier verificación bloqueada. No hagas commit, push, merge ni despliegue.
```
