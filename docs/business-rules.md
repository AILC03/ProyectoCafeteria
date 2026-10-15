# Reglas de negocio aprobadas

## Usuarios

- BR-USR-001: un rol por usuario: cliente, cajero, preparación o administrador.
- BR-USR-002: cliente accede con teléfono/número y NIP de cuatro dígitos.
- BR-USR-003: teléfono obligatorio normalizado y único; nombre en un campo.
- BR-USR-004: personal accede con usuario y contraseña; bajas lógicas.
- BR-USR-005: administrador hace CRUD del catálogo; cajero solo cambia disponibilidad.
- BR-USR-006: correo opcional para recuperar NIP, enlace de 30 minutos y un uso.
- BR-USR-007: reset administrativo exige verificar identidad, auditoría y NIP temporal con cambio obligatorio; cajero no recupera cuentas.

## Catálogo y carrito

- BR-CAT-001: leche, sabor y extras tienen recargos globales; tamaño depende del producto.
- BR-CAT-002: selección mínima/máxima por grupo y producto; cada extra como máximo una vez por unidad.
- BR-CAT-003: total = suma de (base + recargos) por cantidad; cálculo en backend, centavos enteros.
- BR-CAT-004: configuraciones diferentes generan líneas distintas.
- BR-CAT-005: bajas lógicas y snapshots preservan historial; categoría con productos asociados no se elimina.

## Órdenes y pagos

- BR-ORD-001: efectivo y Stripe comparten orders; QR de cobro solo para efectivo.
- BR-ORD-002: PENDIENTE_PAGO → EN_PREPARACION tras pago → LISTO; pendiente vencida sin pago → EXPIRADA. No hay cancelación.
- BR-ORD-003: método fijo al crear, sin pagos mixtos/parciales; varios intentos, máximo un pago exitoso y una venta.
- BR-ORD-004: plazo previsto de 30 minutos; Stripe requiere reconciliación antes de expiración definitiva.
- BR-ORD-005: invitados no consultan estado. Se usarán folio y nombre opcional para llamarlos, conforme al documento aprobado.
- BR-PAY-001: confirmación Stripe exclusivamente backend, firma válida, importe/moneda/relación verificados.
- BR-PAY-002: pago, venta y transición se coordinan transaccionalmente; reintentos/eventos no duplican resultados.
- BR-PAY-003: ante error de red al expirar Stripe, reintentar; aviso tardío no implica pago tardío.
- BR-PAY-004: cobro excepcional sobre orden definitivamente expirada se registra y solicita reembolso, sin preparación automática.

## Caja y registro

- BR-CASH-001: una caja física y una sesión abierta globalmente; efectivo exige sesión abierta. Stripe independiente de caja.
- BR-CASH-002: esperado = fondo inicial + ventas efectivo; diferencia = contado − esperado. Sin retiros/depósitos adicionales en alcance inicial.
- BR-REG-001: solo compra pagada de invitado emite QR de registro; distinto al QR de cobro.
- BR-REG-002: token de un uso vence 24 horas tras pago confirmado.
- BR-REG-003: cuenta, asociación de esa compra y consumo del token en una transacción.
- BR-REG-004: efectivo entrega ticket imprimible; Stripe ticket digital con opción de imprimir.
- BR-FAV-001: favoritos guardan producto, no configuración; repetir pedido usa disponibilidad/precios actuales.

El correo debe verificarse antes de recuperación. Políticas aceptadas en ADR 0005 y 0008: JWT en cookie, renovación PostgreSQL, Argon2id y tokens de un uso.

## Detalles aprobados recuperados del contexto

- BR-USR-008: número visible único C000105 independiente del ID interno; NIP como texto para conservar ceros; correo no es identificador de login.
- BR-USR-009: invitado no tiene fila en users; personal usa username/contraseña; no guardar NIP ni tokens originales en auditoría/logs.
- BR-ORD-006: cajero puede levantar órdenes directamente y asociar un cliente existente por teléfono/número. Se confirma el nombre y se muestran datos mínimos; asociación posterior al pago solo mediante registro por QR, conforme BR-ORD-008/009.
- BR-ORD-007: preparación consulta solo EN_PREPARACION; LISTO sale de esa vista y permanece en BD/historial.
- BR-PAY-005: inicialmente tarjeta Stripe en modo prueba, MXN; nunca guardar PAN/CVV. Guardar referencias Checkout/PaymentIntent/Refund.
- BR-PAY-006: reembolso excepcional conserva cobro y su estado; fallo requiere revisión; no existe módulo general de devoluciones.
- BR-CASH-003: sin cambio de responsable dentro de sesión; Stripe sin cajero ni sesión de caja.
- BR-REG-005: compra ya asociada a cliente no emite QR de registro; registro asocia únicamente la compra del token y crea una sola cuenta.
- BR-REG-006: persistir hash del token; ticket muestra vencimiento. Ticket digital no concede consulta de estado al invitado.

## Acuerdos del cuestionario

- BR-AUTH-001: JWT de acceso de 15 minutos en cookie segura con renovación registrada en PostgreSQL; revocar al cerrar sesión, cambiar/restablecer credencial o dar de baja. Comprobar sesión y permisos vigentes en backend; renovación atómica con coordinación de concurrencia. Credenciales con Argon2id y sal individual.
- BR-AUTH-002: personal sin cierre por inactividad y con duración absoluta de 8 horas; clientes recuerdan acceso hasta 30 días. Renovar JWT no prolonga el límite absoluto; vencer acceso no cierra caja.
- BR-AUTH-003: cinco fallos en 15 minutos bloquean 15 minutos; límite adicional por IP. Contraseña personal de 8–24 caracteres; NIP de cuatro dígitos.
- BR-ADM-001: administrador incluye permisos de cajero, con auditoría; no elimina restricción del responsable de sesión.
- BR-CASH-004: solo quien abrió cobra/cierra; administrador puede cerrar excepcionalmente con motivo. Sin cambio de responsable.
- BR-CASH-005: guardar efectivo recibido y cambio; ingreso neto igual al total de venta, sin pago parcial.
- BR-ORD-008: asociación por teléfono/número y confirmación de nombre; cajero ve datos mínimos, no correo/NIP/historial personal.
- BR-ORD-009: cliente asociado no cambia tras pago salvo registro transaccional de invitado por QR.
- BR-CAT-006: agotado impide nuevas órdenes; respetar órdenes ya creadas dentro de plazo con precio/opciones originales.
- BR-ORD-010: hasta 50 líneas, 1–99 unidades por línea y total máximo 9999900 centavos (99999 MXN).
- BR-USR-010: teléfono inicialmente México, formato +52; cambio propio exige NIP actual y unicidad.
- BR-USR-011: verificar correo por enlace de un uso de 30 minutos; conservar anterior hasta verificar nuevo.
- BR-USR-012: reset administrativo presencial con datos de cuenta y compra reciente; auditoría con administrador, fecha y motivo sin NIP.
- BR-USR-013: administrador corrige nombre/teléfono con auditoría; no altera compras ni crea cuenta sin QR.
- BR-SCOPE-001: fuera inventario, descuentos, promociones, propinas, factura fiscal y devoluciones generales; se mantiene reembolso excepcional.

Las decisiones restantes se enumeran en [cuestionario resuelto](questionnaire-decisions.md). Cloudinary Free aprobado para carga desde panel administrador dentro de cuota; correo de pruebas aprobado, proveedor final antes del despliegue.

- BR-ORD-011: PREPARACION, CAJERO y ADMINISTRADOR pueden marcar EN_PREPARACION como LISTO, con actor y fecha registrados; ninguna orden sin pago pasa a LISTO.
- BR-CAT-007: administrador carga una imagen por producto a Cloudinary Free: JPEG/PNG/WebP, máximo 5 MiB, carga autorizada, reemplazo seguro y marcador visual ante fallo. Conservar referencias en BD y no contratar plan de pago sin decisión explícita. Ver ADR 0010.

ADR 0001–0010 aceptadas; no confundir acuerdos con funciones ya implementadas.
Consultar [decisiones pendientes y aceptación](planning-readiness.md) y
[matriz de permisos](permissions.md). Las reglas anteriores prevalecen sobre
el anteproyecto antiguo en registro, permisos de cajero, estados y PostgreSQL.
