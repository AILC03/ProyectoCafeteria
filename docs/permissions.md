# Matriz de permisos vigentes

ADR 0003–0009 y cuestionario aceptados. Un rol por usuario; ADMINISTRADOR incluye
operaciones de CAJERO y sus funciones administrativas. Cada solicitud valida rol,
propiedad y estado en backend, nunca solo controles del frontend.

| Operación                                    | Invitado | CLIENTE                     | CAJERO                          | PREPARACION          | ADMINISTRADOR                               |
| -------------------------------------------- | -------- | --------------------------- | ------------------------------- | -------------------- | ------------------------------------------- |
| Consultar menú disponible                    | Sí       | Sí                          | Sí                              | No requerido         | Sí                                          |
| Crear orden móvil                            | Sí       | Propia                      | No por este canal               | No                   | No por este canal                           |
| Crear orden en caja                          | No       | No                          | Sí                              | No                   | Sí                                          |
| Buscar/asociar cliente antes del pago        | No       | No                          | Teléfono/número y nombre mínimo | No                   | Sí                                          |
| Abrir caja                                   | No       | No                          | Si no hay sesión abierta        | No                   | Si no hay sesión abierta                    |
| Consultar caja/resumen operativo             | No       | No                          | Sí                              | No                   | Sí                                          |
| Obtener ticket CASH protegido para impresión | No       | No                          | Sí                              | No                   | Sí                                          |
| Cobrar efectivo                              | No       | No                          | Solo responsable de sesión      | No                   | Solo si es responsable                      |
| Cerrar caja ordinariamente                   | No       | No                          | Solo responsable                | No                   | Solo si es responsable                      |
| Cerrar caja ajena excepcionalmente           | No       | No                          | No                              | No                   | Sí, con motivo y auditoría                  |
| Confirmar Stripe                             | No       | No                          | No                              | No                   | No: proceso Backend                         |
| Consultar órdenes operativas/ventas          | No       | Solo órdenes propias        | Sí                              | Solo EN_PREPARACION  | Sí                                          |
| Marcar LISTO                                 | No       | No                          | Desde EN_PREPARACION            | Desde EN_PREPARACION | Desde EN_PREPARACION                        |
| Cambiar disponibilidad producto              | No       | No                          | Sí                              | No                   | Sí                                          |
| Crear/editar/baja catálogo y opciones        | No       | No                          | No                              | No                   | Sí                                          |
| CRUD empleados                               | No       | No                          | No                              | No                   | Sí; baja lógica                             |
| Consultar/corregir nombre y teléfono cliente | No       | Propios; teléfono exige NIP | Solo búsqueda mínima            | No                   | Sí, con auditoría                           |
| Historial personal/favoritos                 | No       | Propios                     | No historial personal           | No                   | Sin acceso adicional a favoritos personales |
| Crear cuenta con ticket válido               | Sí       | No segunda cuenta           | No registro libre               | No                   | No registro libre                           |
| Cambiar NIP propio                           | No       | Con NIP actual              | No NIP de cliente               | No                   | No por flujo de cliente                     |
| Restablecer NIP manualmente                  | No       | No                          | No                              | No                   | Identidad presencial verificada y auditoría |
| Autorizar carga/reemplazo de imagen          | No       | No                          | No                              | No                   | Sí, Cloudinary                              |
| Cancelar orden                               | No       | No                          | No                              | No                   | No                                          |

ADMINISTRADOR consulta órdenes/ventas operativas, pero eso no concede modificar
históricos. Cajero no obtiene correo, NIP ni historial personal mediante búsqueda.
La asociación es inmutable después del pago, salvo alta de invitado por QR.
La consulta protegida de ticket CASH no habilita ticket digital público del
invitado. Su QR de registro permite únicamente el alta AUTH-02, nunca lectura de compras.
POST `/api/v1/customer-registration/ticket` exige invitado sin cookie de acceso/refresh,
Origin/CSRF prelogin, token original válido, no usado y dentro de 24h desde pago.
Asocia solo esa compra pagada, consume permanentemente el código y no inicia sesión.
El QR no permite asociar compras a cuentas existentes ni evita la unicidad de teléfono.
Al marcar LISTO se registra actor y fecha; no se habilita transición desde pendientes/expiradas.

Una sesión con must_change_pin solo permite cambio obligatorio y logout.
La caducidad de acceso del personal a 8 horas no cierra la caja; volver a iniciar
sesión como el responsable permite continuar. No hay cambio de responsable.

Ver [reglas](business-rules.md) y [acuerdos](questionnaire-decisions.md).
