# Respuestas del cuestionario y decisiones vigentes

Registro histórico incorporado el 2026-10-14. Fuente: respuestas explícitas del
responsable del backend en este chat. ADR 0001–0010 estaban aceptadas entonces;
ADR 0011 y 0012 se aceptaron después. Consultar el ADR y el estado reconciliado
para la implementación vigente.

| Tema                    | Resultado                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Personal                | Sin cierre por inactividad; máximo absoluto 8 horas                                        |
| Clientes                | Recordar acceso 30 días                                                                    |
| Autenticación           | JWT en cookie con renovación PostgreSQL y revocación                                       |
| Bloqueo                 | 5 fallos en 15 minutos; bloqueo 15 minutos y límite por IP                                 |
| Contraseñas             | 8–24 caracteres; NIP cliente cuatro dígitos                                                |
| Administrador           | Hereda operaciones de cajero y conserva extras; auditoría                                  |
| Caja                    | Solo responsable cobra/cierra; administrador cierra excepcionalmente con motivo            |
| Asociación              | Buscar por teléfono/número y confirmar nombre con datos mínimos                            |
| Compra pagada           | Asociación inmutable salvo alta de invitado por QR                                         |
| Producto agotado        | Respetar orden previa y precios dentro del plazo; impedir nuevas                           |
| Efectivo                | Registrar recibido/cambio; neto igual a venta                                              |
| Límites                 | 50 líneas, 99 unidades/línea, máximo 99999 MXN = 9999900 centavos                          |
| Teléfono                | México +52; cambio con NIP y unicidad                                                      |
| Correo                  | Verificación de un uso, 30 minutos; conservar anterior hasta verificar nuevo               |
| Reset manual            | Presencial, datos de cuenta y compra reciente, auditoría con motivo                        |
| Administración clientes | Corregir nombre/teléfono con auditoría, sin alterar historia ni saltar QR                  |
| Fuera de alcance        | Inventario, descuentos, promociones, propinas, facturación fiscal y devoluciones generales |
| Imágenes                | Cloudinary Free; carga desde panel administrador dentro de cuota                           |
| Correo/hosting          | Correo de pruebas; selección de proveedores antes de desplegar                             |
| Contrato                | IDs/centavos como texto JSON, UTC, cursor y errores uniformes aprobados                    |
| Desarrollo              | Catálogo lectura, autenticación/administración, compra efectivo, luego Stripe/recuperación |

## Decisiones cerradas y preparación pendiente

- Imágenes resueltas: carga desde panel administrador a Cloudinary Free, dentro de cuota; ver ADR 0010.
- Duración de personal resuelta: 8 horas absolutas, sin cierre por inactividad ni extensión mediante refresh.
- ADR 0005 aceptada: JWT 15 minutos, rotación de renovación con coordinación de concurrencia, revocación inmediata, Argon2id con sal individual y firma secreta exclusiva del backend. Concretar biblioteca, algoritmo de firma y pruebas de concurrencia al implementar.
- LISTO resuelto: PREPARACION, CAJERO y ADMINISTRADOR pueden marcar EN_PREPARACION como LISTO.
- ADR 0001–0012 aceptadas. Imágenes: una por producto, JPEG/PNG/WebP, máximo 5 MiB, carga autorizada, reemplazo seguro y marcador visual ante ausencia/fallo. Preparar el contrato antes de implementar cada módulo pendiente.
- Retención/anonimización, hosting, dominio y correo real antes de producción.

## Cambios necesarios en el modelo

auth_sessions: user_id, refresh_token_hash, familia/rotación, expires_at absoluto, revoked_at y timestamps; sin caducidad por inactividad del personal. JWT referencia sid para consultar revocación. Detalle de tabla/historial de rotación pendiente del diseño físico.

payments de efectivo incorpora cash_received_cents y change_cents; recibido >= amount_cents y cambio = recibido − amount_cents; Stripe deja ambos NULL. Estos campos están consolidados en data-dictionary.md.

pin_reset_audit incluye reason y registro mínimo de verificación realizada sin copiar documentos ni secretos.
Auditoría de correcciones de cliente y cierre excepcional: actor, entidad, fecha y motivo; limitar datos personales a lo necesario.

No hay implementación de estas funciones ni migraciones por esta revisión.
