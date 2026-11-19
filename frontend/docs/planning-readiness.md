# Evaluación de criterios de aceptación (`AC-01` a `AC-22`) en el frontend

Contrastación de los 22 criterios de aceptación definidos en
[planning-readiness.md del backend](../../backend/docs/planning-readiness.md) frente al
comportamiento actual de `frontend/clientes/` y `frontend/empleados/`.

| ID | Escenario | Comportamiento requerido en frontend | Estado actual en frontend | Brecha observada |
| --- | --- | --- | --- | --- |
| `AC-01` | Invitado crea pedido con opciones válidas | Enviar `POST /orders` sin precios/totales y mostrar folio/total del backend | **Cumplido (`clientes`)** | Faltan opciones en POS (`OrderingWorkspace` envía `[]`) y corregir tracker visual |
| `AC-02` | Precio/opción manipulada o producto agotado | Impedir pedir agotados y mostrar error `Problem Details` actualizando catálogo | **Parcial** | `ProductCard` bloquea agotados en clientes; `OrderingWorkspace` en POS no bloquea agotados |
| `AC-03` | Efectivo sin caja abierta | Informar o abrir caja explícitamente antes de cobrar; nunca simular venta | **Desviación** | `cash.js` abre caja de `$500` automáticamente y `App.jsx` guarda localmente ante error API |
| `AC-04` | Dos aperturas concurrentes | Mostrar error `409` y refrescar sesión abierta actual | **Parcial** | Muestra toast de error `409`, sin refrescar automáticamente la sesión ganadora |
| `AC-05` | Repetición/doble clic de cobro | Deshabilitar botón y conservar misma `Idempotency-Key` en reintentos | **Parcial** | `ScanQrModal` deshabilita botón; `CheckoutModal` no tiene estado `isCharging` y regenera UUID por intento |
| `AC-06` | Efectivo pendiente vence | Mostrar estado `EXPIRADA` desde backend sin simular expiración local | **Parcial** | `OrderHistoryModal` aún no lee órdenes reales del backend |
| `AC-07` | Stripe confirma y webhook se repite | Llamar `POST /orders/{id}/checkout` y releer orden tras `/pago/retorno` | **Pendiente** | Flujo Checkout y ruta `/pago/retorno` no implementados |
| `AC-08` | Stripe incierto al vencer | No declarar cancelada ni abrir otra orden por timeout de red | **Pendiente** | Depende de `FE-STR-01` |
| `AC-09` | Cobro excepcional en expirada | Mostrar estado `EXPIRADA` si el backend lo informa en historial | **Pendiente** | Depende de `FE-CUS-01` y `FE-STR-01` |
| `AC-10` | Preparación marca `LISTO` | Listar `EN_PREPARACION`, marcar `LISTO` y retirar de KDS | **Parcial** | Funciona la transición, pero `KitchenWorkspace` lee `optionName` en lugar de `valueName` |
| `AC-11` | Ticket de compra asociada | No mostrar QR de registro cuando la orden tiene cliente asociado | **Cumplido si usa `GET /sales/{id}/ticket`** | Actualmente `App.jsx` llama a `ticket-access` en lugar de `GET /sales/{id}/ticket` |
| `AC-12` | Invitado pagado | Imprimir ticket con `registration.qrPayload` (`AUTH-02`) y vencimiento 24h | **Desviación crítica** | Imprime el token `GUEST_TICKET` de `TKT-02` como si fuera registro |
| `AC-13` | Dos registros simultáneos del mismo token | Deshabilitar botón al enviar y manejar `409 REGISTRATION_TOKEN_USED` | **Parcial** | `AuthPage` deshabilita botón `isRegistering`, falta mensaje diferenciado para `409` |
| `AC-14` | Token usado/vencido o teléfono duplicado | Mostrar causa clara y ofrecer login si teléfono ya existe | **Parcial** | Muestra `err.message`; falta enlace directo a pestaña login ante `PHONE_ALREADY_REGISTERED` |
| `AC-15` | Login teléfono/número con NIP `0007` | Conservar ceros iniciales como string al autenticar | **Cumplido** | `PinInput.tsx` y `AuthPage.tsx` manipulan el NIP estrictamente como texto |
| `AC-16` | Recuperación por correo no verificado | Respuesta genérica `202` sin enumerar existencia | **Pendiente** | Pantallas de recuperación y verificación no implementadas (`FE-AUTH-03`) |
| `AC-17` | Reset administrativo | Pantalla admin con compra reciente y flujo `PIN_CHANGE_REQUIRED` en cliente | **Pendiente** | Ni el reset presencial ni `mustChangePin` están implementados |
| `AC-18` | Cajero intenta CRUD catálogo o reset NIP | Ocultar administración y permitir solo disponibilidad al cajero | **Parcial** | Oculta admin al cajero, pero también oculta el cambio de disponibilidad |
| `AC-19` | Producto/opción cambia o se da de baja | Historial/tickets muestran snapshots históricos | **Pendiente (`clientes`)** / **Parcial (`empleados`)** | Depende de conectar `OrderHistoryModal` y `GET /sales/{id}/ticket` |
| `AC-20` | Categoría con productos incluso dados de baja | Manejar `409` sin romper UI | **Cumplido** | `MenuManagementWorkspace` deshabilita botón si hay productos visibles y muestra error si API devuelve `409` |
| `AC-21` | Repetir pedido | Mostrar preview revisable con precios actuales y avisos (`repeat-preview`) | **Pendiente** | `OrderHistoryModal` aún no usa `repeat-preview` |
| `AC-22` | Reinicio durante trabajo externo | Soportar `503` y reintentos idempotentes sin simular éxito | **Parcial** | `clientes` muestra `ApiError`; `App.jsx` en POS guarda localmente aunque falle cobro |

Referencias: [criterios backend](../../backend/docs/planning-readiness.md), [backlog frontend](development-tasks.md).
