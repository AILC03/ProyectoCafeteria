# Matriz de permisos vigentes

## Continuidad FIN-01 — 2026-11-10

La matriz inferior se mantiene. FIN-01 implementa edición propia con NIP para
teléfono, corrección administrativa auditada, empleados con baja lógica y reset
presencial con última compra/identidad contrastadas. Perfil/historial/favoritos siguen
exclusivos de CLIENTE; ADMINISTRADOR no hereda ese rol. Ticket propio de una orden
pagada: GET `/customers/me/orders/{id}/ticket` solo propietario CLIENTE.
Tickets protegidos/comprobantes con X-Ticket-Token admiten también Stripe coherente,
sin ampliar permisos ni habilitar estado público. Para invitado STRIPE, opt-in al
crear emite permiso independiente X-Checkout-Token, válido solo para solicitar
Checkout de esa orden; no permite lectura ni historial. CSRF/Origin obligatorios.
Ventas/resumen solo CAJERO/ADMINISTRADOR, sin datos personales de clientes.
Verificación/recuperación usan tokens de un uso 30min y CSRF, no crean sesiones.
Cambiar credencial/teléfono, baja o cambio de rol revoca sesiones. No desactivar ni
degradar la propia cuenta; no impedir operación del responsable con caja abierta.
Fuentes/contrato: [FIN-01](backend-completion.md) y [OpenAPI](api/openapi.yaml).

ADR 0003–0009 y cuestionario aceptados. Un rol por usuario; ADMINISTRADOR incluye
operaciones de CAJERO y sus funciones administrativas. Cada solicitud valida rol,
propiedad y estado en backend, nunca solo controles del frontend.

| Operación                                    | Invitado             | CLIENTE                     | CAJERO                          | PREPARACION          | ADMINISTRADOR                               |
| -------------------------------------------- | -------------------- | --------------------------- | ------------------------------- | -------------------- | ------------------------------------------- |
| Consultar menú disponible                    | Sí                   | Sí                          | Sí                              | No requerido         | Sí                                          |
| Crear orden móvil                            | Sí                   | Propia                      | No por este canal               | No                   | No por este canal                           |
| Crear orden en caja                          | No                   | No                          | Sí                              | No                   | Sí                                          |
| Obtener QR CASH al crear con includeCashQr   | En su creación       | En su creación              | Por canal de caja               | No                   | Por canal de caja                           |
| Emitir/reimprimir QR de orden CASH pendiente | No                   | No                          | Sí                              | No                   | Sí                                          |
| Escanear QR CASH y consultar para cobro      | No                   | No                          | Sí                              | No                   | Sí                                          |
| Buscar/asociar cliente antes del pago        | No                   | No                          | Teléfono/número y nombre mínimo | No                   | Sí                                          |
| Abrir caja                                   | No                   | No                          | Si no hay sesión abierta        | No                   | Si no hay sesión abierta                    |
| Consultar caja/resumen operativo             | No                   | No                          | Sí                              | No                   | Sí                                          |
| Obtener ticket CASH protegido para impresión | No                   | No                          | Sí                              | No                   | Sí                                          |
| Emitir/reemitir acceso digital de invitado   | No                   | No                          | Sí, compra pagada sin cliente   | No                   | Sí                                          |
| Leer comprobante con X-Ticket-Token          | Solo ese comprobante | Solo ese comprobante        | Solo ese comprobante            | Solo ese comprobante | Solo ese comprobante                        |
| Cobrar efectivo                              | No                   | No                          | Solo responsable de sesión      | No                   | Solo si es responsable                      |
| Cerrar caja ordinariamente                   | No                   | No                          | Solo responsable                | No                   | Solo si es responsable                      |
| Cerrar caja ajena excepcionalmente           | No                   | No                          | No                              | No                   | Sí, con motivo y auditoría                  |
| Confirmar Stripe                             | No                   | No                          | No                              | No                   | No: proceso Backend                         |
| Consultar órdenes operativas/ventas          | No                   | Solo órdenes propias        | Sí                              | Solo EN_PREPARACION  | Sí                                          |
| Marcar LISTO                                 | No                   | No                          | Desde EN_PREPARACION            | Desde EN_PREPARACION | Desde EN_PREPARACION                        |
| Cambiar disponibilidad producto              | No                   | No                          | Sí                              | No                   | Sí                                          |
| Crear/editar/baja catálogo y opciones        | No                   | No                          | No                              | No                   | Sí                                          |
| CRUD empleados                               | No                   | No                          | No                              | No                   | Sí; baja lógica                             |
| Consultar/corregir nombre y teléfono cliente | No                   | Propios; teléfono exige NIP | Solo búsqueda mínima            | No                   | Sí, con auditoría                           |
| Historial personal/favoritos                 | No                   | Propios                     | No historial personal           | No                   | Sin acceso adicional a favoritos personales |
| Crear cuenta con ticket válido               | Sí                   | No segunda cuenta           | No registro libre               | No                   | No registro libre                           |
| Cambiar NIP propio                           | No                   | Con NIP actual              | No NIP de cliente               | No                   | No por flujo de cliente                     |
| Restablecer NIP manualmente                  | No                   | No                          | No                              | No                   | Identidad presencial verificada y auditoría |
| Autorizar carga/reemplazo de imagen          | No                   | No                          | No                              | No                   | Sí, Cloudinary                              |
| Cancelar orden                               | No                   | No                          | No                              | No                   | No                                          |

ADMINISTRADOR consulta órdenes/ventas operativas, pero eso no concede modificar
históricos. Cajero no obtiene correo, NIP ni historial personal mediante búsqueda.
QR CASH: entrega al crear solo mediante opt-in; recuperar/emitir después y escanear
exigen CAJERO/ADMINISTRADOR, sesión vigente, Origin y CSRF. No conceden consulta
pública de estado y no confirman pago; el cobro existente sigue exigiendo caja
abierta y responsable, incluso tras escanear correctamente.
La asociación es inmutable después del pago, salvo alta de invitado por QR.
La consulta protegida de ticket pagado no habilita ticket digital público del
invitado. Su QR de registro permite únicamente el alta AUTH-02, nunca lectura de compras.
TKT-02 añade un permiso independiente para GET `/api/v1/guest-ticket`, exclusivamente
en `X-Ticket-Token`: cualquier portador obtiene solo el comprobante, nunca estado,
historial, datos de cuenta o QR de registro. Expira 24h desde pago. Emisión/reemisión
por CAJERO/ADMINISTRADOR con sesión vigente, Origin y CSRF, solo venta pagada
sin cliente; reemitir revoca anteriores sin ampliar plazo. La asociación posterior
por alta QR no amplía ni consume el permiso digital ya emitido.
POST `/api/v1/customer-registration/ticket` exige invitado sin cookie de acceso/refresh,
Origin/CSRF prelogin, token original válido, no usado y dentro de 24h desde pago.
Asocia solo esa compra pagada, consume permanentemente el código y no inicia sesión.
El QR no permite asociar compras a cuentas existentes ni evita la unicidad de teléfono.
Al marcar LISTO se registra actor y fecha; no se habilita transición desde pendientes/expiradas.

Una sesión con must_change_pin solo permite cambio obligatorio y logout.
FAV-01 concreta favoritos personales con GET/PUT/DELETE
`/api/v1/customers/me/favorites[/{productId}]` y POST
`/api/v1/customers/me/orders/{id}/repeat-preview`. Solo CLIENTE/propietario;
PUT/DELETE/POST requieren Origin y CSRF. No permite configuración guardada en
favoritos, ni favoritos ajenos para personal/admin. Preview no crea/cobra orden,
conserva los IDs originales y advierte/bloquea según catálogo actual; confirmar
explícitamente mediante creación de orden vigente, sin alterar la original.
CUS-01 añade exclusivamente lecturas GET `/api/v1/customers/me` y
`/api/v1/customers/me/orders` para CLIENTE con identidad de sesión. No recibe
customerId/telefono/número como filtro, ni amplía acceso de personal (incluido
administrador) al perfil/historial personal de estas rutas. La consulta operativa
de órdenes conserva permisos existentes. La edición excluida de CUS-01 fue añadida
en FIN-01; ver su continuidad vigente al inicio de este documento.
La caducidad de acceso del personal a 8 horas no cierra la caja; volver a iniciar
sesión como el responsable permite continuar. No hay cambio de responsable.

Ver [reglas](business-rules.md) y [acuerdos](questionnaire-decisions.md).
