# Reglas de negocio en el frontend

Mapeo de las [reglas de negocio aprobadas](../../backend/docs/business-rules.md) respecto a su
cumplimiento real en `frontend/clientes/` y `frontend/empleados/`. Los estados posibles son
**Cumplida**, **Parcial** o **Desviación / Pendiente**.

## Usuarios y autenticación

| Regla | Descripción resumida | Estado en frontend | Detalle observable |
| --- | --- | --- | --- |
| `BR-USR-001` | Un rol por usuario: cliente, cajero, preparación o administrador | **Desviación** | `empleados` añade el rol visual `GERENTE` en `UserManagementWorkspace.jsx` y `employees.js`, que no existe en `OpenAPI 0.11.0` |
| `BR-USR-002` | Cliente accede con teléfono o número `C` y NIP de 4 dígitos | **Cumplida** | `AuthPage.tsx` valida formato `/^(\+?52\s?)?\d{10}$/` o `/^C\d{1,19}$/i` y `PinInput.tsx` captura 4 dígitos como texto |
| `BR-USR-003` | Teléfono obligatorio normalizado `+52` y único; nombre en un campo | **Parcial** | `registration.ts` normaliza a `+52`; `ProfileModal.tsx` no permite editar el teléfono con NIP actual |
| `BR-USR-004` | Personal accede con usuario y contraseña; bajas lógicas | **Parcial** | `EmployeeIdScreen` y `EmployeePinScreen` usan username/contraseña (8–24 chars); `UserManagementWorkspace` realiza baja lógica (`isActive: false`) |
| `BR-USR-005` | Administrador hace CRUD del catálogo; cajero solo disponibilidad | **Parcial** | El admin gestiona productos/categorías; el cajero no tiene acceso en UI al toggle de disponibilidad porque `menu-admin` está restringido a admin |
| `BR-USR-006` | Correo opcional verificado para recuperar NIP (enlace 30 min, 1 uso) | **Pendiente** | Sin pantallas ni llamadas para `recovery-email`, `email-verification` o `pin-recovery` |
| `BR-USR-007` / `012` | Reset administrativo presencial con auditoría y NIP temporal | **Pendiente** | Sin vista en admin para `POST /admin/customers/{id}/pin-reset` ni redirección `PIN_CHANGE_REQUIRED` |
| `BR-USR-008` | Número visible `C000105`; NIP como texto; correo no es login | **Cumplida** | `AuthPage.tsx` solo admite teléfono o número `C` y conserva ceros en `PinInput` como string |
| `BR-USR-013` | Admin corrige nombre/teléfono de cliente con auditoría | **Pendiente** | Sin pantalla de gestión de clientes en POS admin |
| `BR-AUTH-001` / `002` | JWT en cookie `HttpOnly` 15 min, refresh rotativo; personal 8h, cliente 30d | **Desviación** | No se invoca `POST /auth/refresh`; `empleados/src/api/client.js` guarda contraseña en `localStorage` para auto-login silencioso ante `401` |
| `BR-AUTH-003` | 5 fallos en 15 min bloquean 15 min | **Cumplida (UI)** | `EmployeePinScreen.jsx` y `AdminAuthModal.jsx` muestran mensaje específico ante `429` |

## Catálogo y carrito

| Regla | Descripción resumida | Estado en frontend | Detalle observable |
| --- | --- | --- | --- |
| `BR-CAT-001` | Recargos globales leche/sabor/extras; tamaño por producto | **Cumplida (clientes)** / **Pendiente (POS)** | `ProductModal.tsx` lee `surchargeCents` efectivos desde `/products/{id}/options`; `OrderingWorkspace.jsx` no consulta opciones |
| `BR-CAT-002` | Selección mínima/máxima por grupo; extra máximo 1 vez por unidad | **Parcial** | `ProductModal.tsx` controla `maxSelections` al marcar botones, pero no bloquea agregar al carrito si falta cumplir `minSelections` |
| `BR-CAT-003` | `total = suma(base + recargos) * cantidad`; centavos enteros; cálculo backend | **Desviación (POS)** | `clientes` muestra estimación y usa `backendOrder.totalCents` al confirmar. `OrderingWorkspace.jsx` y `App.jsx` suman **+16% de IVA** local sobre el precio base |
| `BR-CAT-004` | Configuraciones diferentes generan líneas distintas | **Cumplida (clientes)** | `CartContext.tsx` asigna un `cartItemId` único por cada adición personalizada |
| `BR-CAT-005` | Bajas lógicas y snapshots; categoría con productos no se borra | **Cumplida** | `MenuManagementWorkspace.jsx` deshabilita visualmente el borrado de categorías con productos y delega la validación `409` al backend |
| `BR-CAT-006` | Producto agotado impide nuevas órdenes | **Cumplida (clientes)** / **Parcial (POS)** | `ProductCard.tsx` deshabilita productos con `!isAvailable`; `OrderingWorkspace.jsx` permite hacer clic en productos aunque estén agotados |
| `BR-CAT-007` | Admin carga 1 imagen JPEG/PNG/WebP <= 5 MiB a Cloudinary | **Pendiente** | Sin UI para subir ni reemplazar imágenes de productos |

## Órdenes, pagos, caja y registro

| Regla | Descripción resumida | Estado en frontend | Detalle observable |
| --- | --- | --- | --- |
| `BR-ORD-001` / `003` | Efectivo y Stripe comparten `orders`, método fijo, sin pago mixto | **Desviación (POS)** | `CheckoutModal.jsx` presenta botones `Tarjeta` y `Transferencia` locales que no crean órdenes en backend |
| `BR-ORD-002` / `007` / `011` | `PENDIENTE_PAGO` → `EN_PREPARACION` → `LISTO` (sale de KDS) | **Cumplida** | `KitchenWorkspace.jsx` lista `EN_PREPARACION`, marca `LISTO` y retira la tarjeta de la cola |
| `BR-ORD-004` | Plazo 30 min; Stripe requiere reconciliación | **Parcial** | El backend gestiona expiración; el frontend no muestra contador regresivo de expiración ni consulta estado tras retorno Stripe |
| `BR-ORD-005` | Invitados no consultan estado desde celular; se llaman por folio/nombre | **Desviación parcial** | `OrderConfirmationModal.tsx` muestra el folio correctamente, pero incluye un tracker visual estático que sugiere "En preparación / Barra" aunque el pago en efectivo siga pendiente |
| `BR-ORD-006` / `008` / `009` | Cajero busca cliente por teléfono/número y confirma nombre antes del pago | **Pendiente** | Sin flujo de búsqueda ni asociación de cliente (`cashier/customers/search`) en `OrderingWorkspace.jsx` |
| `BR-ORD-010` | Hasta 50 líneas, 1–99 unidades/línea, máximo `9999900` centavos | **Parcial** | `ProductModal.tsx` limita cantidad rápida a 20, pero `CartDrawer` y `OrderingWorkspace` no validan el límite de 50 líneas, 99 unidades o tope monetario |
| `BR-CASH-001` / `003` / `004` | Una caja abierta global; solo responsable cobra/cierra; admin cierra ajena con motivo | **Parcial** | `ShiftWorkspace.jsx` abre y cierra caja propia, pero no muestra responsable de caja ajena ni campo `exceptionalCloseReason` |
| `BR-CASH-002` / `005` | Esperado = fondo + ventas efectivo; diferencia = contado - esperado | **Parcial** | El backend calcula y valida; `ShiftWorkspace.jsx` lee campos `startingCashCents` y `cashSalesCents` con posibles discrepancias de nombres respecto al DTO |
| `BR-REG-001` a `006` | QR de registro único 24h solo en compra pagada de invitado | **Desviación crítica** | `App.jsx` llama a `POST /sales/{id}/ticket-access` (`TKT-02`) en vez de `GET /sales/{id}/ticket` (`registration.token`) para imprimir el código de registro |
| `BR-FAV-001` | Favoritos guardan producto; repetir usa catálogo actual | **Parcial** | Favoritos implementados para `CLIENTE`; repetición contra `repeat-preview` pendiente |
| `BR-SCOPE-001` | Fuera inventario, descuentos, promociones, propinas y factura fiscal | **Cumplida** | Se retiraron descuentos/propinas en `OrderingWorkspace.jsx`; quedan propiedades residuales inertes en `ReceiptModal.jsx` y `App.jsx` |

Referencias: [reglas backend](../../backend/docs/business-rules.md), [matriz de permisos](permissions.md), [auditoría de brechas](tasks/FE-GAP-01-integration-audit.md).
