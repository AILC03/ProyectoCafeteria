# Cierre de planeación antes de desarrollo

Actualización vigente 2026-10-20: Ángel aprobó candidato corregido y ADR 0011.
Migración aplicada a desarrollo, seed y catálogo lectura realizados. Ver
[backend-progress.md](backend-progress.md). Las puertas de salida inferiores
registran la etapa histórica de revisión; Docker/entorno Leonel sigue externo.

Actualizado: 2026-10-18. ADR 0001–0010 aceptadas. Reglas, permisos y parámetros de
imágenes cerrados; aprobación documental no equivale a funcionalidad implementada.

## Responsabilidades y estado

Coordinar esquema y migraciones con Leonel y contrato con Enrique para frontend.
Health es el único endpoint implementado. La entrega de Leonel añade 29 modelos,
SQL candidato y contrato de catálogo, sin migración aplicada a las bases del proyecto.
No está aprobada: ver [correcciones pendientes](database/correcciones-pendientes.md).
No ejecutar migraciones en revisión documental.

Actualización de correcciones: C01-C05 y C09-C11 resueltos técnicamente. Suite
aislada en PostgreSQL 17.10: 22 casos, mutantes C01-C04, deploy repetido, diff
vacío y cliente Prisma. C06 tiene propuesta ADR 0011 por revisar. C08 sigue
pendiente en equipo de Leonel/Docker. C12 requiere aprobación de Ángel. No se
han migrado las bases del proyecto ni implementado módulos. Ver evidencia y
matriz actual de correcciones, no confundir estado de entrega original con revisión.

## Decisiones vigentes

| Área          | Acuerdo                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Arquitectura  | Monolito modular y capas, ADR 0003                                                                        |
| Datos         | PostgreSQL/Prisma, BIGINT, centavos string HTTP, UTC, baja lógica, ADR 0001/2/4                           |
| Autenticación | JWT cookie 15 min, refresh PostgreSQL; personal 8 h sin inactividad, clientes 30 días; Argon2id, ADR 0005 |
| API           | /api/v1, cursor 20/máximo 100, errores uniformes e idempotencia 48 h, ADR 0006                            |
| Pagos         | Backend confirma y reconcilia antes de expirar; reembolso excepcional, ADR 0007                           |
| Tareas/correo | Worker PostgreSQL, reintentos, tokens protegidos, correo de pruebas, ADR 0008                             |
| Operación     | HTTPS, CORS/CSRF, JSON 256 KiB, CI y respaldos, ADR 0009                                                  |
| Imágenes      | Cloudinary Free; una JPEG/PNG/WebP hasta 5 MiB, ADR 0010                                                  |

Ya están decididos asociación mínima por teléfono/número, inmutabilidad tras
pago salvo registro QR, respeto de órdenes previas al agotar producto, efectivo
recibido/cambio, máximo 9999900 centavos, teléfono MX, correo verificado y
administrador con permisos de cajero/cierre excepcional. Ver [reglas](business-rules.md).

## Preparación pendiente

- Consolidar diseño físico y ER: campos, longitudes, enums técnicos, CHECK, FK,
  índices y tablas de soporte; coordinar con base de datos.
- Definir acceso al ticket digital de invitado con permiso limitado al comprobante;
  concretar expiración/rotación del token sin habilitar estado o historial.
- Concretar biblioteca/algoritmo de firma JWT y protocolo de refresh concurrente;
  límites por IP y programación/reintentos del worker al implementar módulos.
- Desarrollo/shadow manuales verificados. Probar arranque Compose de las tres
  bases y conectar futuras pruebas a cafeteria_test aislada.
- Completar OpenAPI por módulo antes de código; coordinar frontend.
- Preparar tareas con criterios AC. Aún no están implementadas las reglas.
- Hosting/dominio/correo real, conservación/anonimización y retención de respaldos
  antes de producción, no para iniciar catálogo.

## Criterios de aceptación por flujo

| ID    | Escenario                                            | Resultado obligatorio                                           |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------- |
| AC-01 | Invitado crea pedido con opciones válidas            | Backend calcula total, guarda snapshots y método fijo           |
| AC-02 | Precio/opción manipulada o producto agotado al crear | Rechazo sin orden parcial                                       |
| AC-03 | Efectivo sin caja abierta                            | Rechazo de cobro sin pago/venta                                 |
| AC-04 | Dos aperturas concurrentes                           | Solo una sesión abierta                                         |
| AC-05 | Repetición/doble clic de cobro                       | Un pago exitoso, una venta y EN_PREPARACION                     |
| AC-06 | Efectivo pendiente vence                             | EXPIRADA persistida, sin preparación                            |
| AC-07 | Stripe confirma y webhook se repite                  | Una venta, resultado idempotente                                |
| AC-08 | Stripe incierto al vencer                            | Reconciliar; no declarar vencimiento definitivo solo por reloj  |
| AC-09 | Cobro excepcional en expirada                        | Pago conservado, incidencia/reembolso; sin preparación          |
| AC-10 | Preparación marca LISTO                              | Sale de vista activa y queda en BD/historial                    |
| AC-11 | Ticket de compra asociada                            | Sin QR de registro                                              |
| AC-12 | Invitado pagado                                      | Ticket con token de un uso y vencimiento 24 h                   |
| AC-13 | Dos registros simultáneos del mismo token            | Una cuenta y una asociación de esa compra                       |
| AC-14 | Token usado/vencido o teléfono duplicado             | Sin cuenta parcial ni pérdida indebida de token                 |
| AC-15 | Login teléfono/número con NIP 0007                   | Misma cuenta, conserva ceros y valida hash                      |
| AC-16 | Recuperación por correo no verificado                | No permite recuperar; respuesta no revela existencia            |
| AC-17 | Reset administrativo                                 | Identidad verificada, auditoría sin secreto, cambio obligatorio |
| AC-18 | Cajero intenta CRUD catálogo o reset NIP             | Acceso rechazado en backend                                     |
| AC-19 | Producto/opción cambia o se da de baja               | Historia y total de venta permanecen iguales                    |
| AC-20 | Categoría con productos incluso dados de baja        | Baja/eliminación bloqueada                                      |
| AC-21 | Repetir pedido                                       | Usa catálogo/precios actuales y advierte diferencias            |
| AC-22 | Reinicio durante trabajo externo                     | Reintento durable sin duplicar efecto comercial                 |

## Puertas de salida

- [x] ADR 0001–0010 aceptadas.
- [x] Reglas y permisos consolidados con cuestionario vigente.
- [ ] Revisar diseño físico y ER con Leonel, sin migrar todavía.
- [ ] Completar OpenAPI del primer módulo y revisar con frontend.
- [x] Repetir db:check: desarrollo y shadow manuales conectan (0 tablas public).
- [ ] Probar primer arranque Docker e integrar pruebas de negocio aisladas.
- [ ] Definir tareas, criterios y orden de implementación.
- [ ] Catálogo lectura → autenticación/administración → compra efectivo → Stripe/recuperación.

Prueba de producción separada: HTTPS, correo real, cuotas Cloudinary, respaldos y
restauración. No considerar estas configuraciones realizadas por aprobar ADR.
