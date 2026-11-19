# Matriz de permisos en el frontend

En **Coffee's POS**, la autorización real recae siempre en el backend (`authenticate` y `authorize`
sobre PostgreSQL). El frontend implementa controles de navegación y visibilidad de pantalla para
mejorar la experiencia de cada rol, descritos en esta matriz junto con sus desfases actuales.

## Matriz por rol en UI

| Operación / Vista | Invitado (`clientes`) | `CLIENTE` (`clientes`) | `CAJERO` (`empleados`) | `PREPARACION` (`empleados`) | `ADMINISTRADOR` (`empleados`) | `GERENTE` *(solo frontend)* |
| --- | --- | --- | --- | --- | --- | --- |
| Consultar menú público y personalizar producto | Sí | Sí | Sí (`OrderingWorkspace` sin opciones) | No | Sí (`OrderingWorkspace` sin opciones) | No |
| Crear orden móvil (`POST /orders`) | Sí (con `guestName`) | Sí (propia) | No | No | No | No |
| Solicitar QR de cobro en creación (`includeCashQr`) | Sí (automático si `CASH`) | Sí (automático si `CASH`) | Sí (`createCashierOrder`) | No | Sí (`createCashierOrder`) | No |
| Favoritos personales (`Header` + corazón en tarjeta) | Visible pero sin sesión (no persiste) | Sí (`PUT/DELETE /favorites`) | No | No | No | No |
| Perfil e historial propio (`ProfileModal` / `OrderHistoryModal`) | Edición local de nombre de vaso; sin cuenta | Perfil real (solo nombre); historial local vacío | No | No | No | No |
| Registro con código de ticket (`AuthPage`) | Sí | No requiere | No | No | No | No |
| Pantalla Tomar Orden (`order`) | No | No | Sí | Bloqueado | Sí | Bloqueado (solo lectura) |
| Cobro efectivo en caja y escaneo QR (`CheckoutModal` / `ScanQrModal`) | No | No | Sí | Bloqueado | Sí | Bloqueado |
| Cocina / Barista KDS (`kitchen`) | No | No | Sí (desde menú) | Sí (única vista permitida) | Sí (desde menú) | Bloqueado |
| Historial operativo de ventas (`history`) | No | No | Sí (desde menú) | Bloqueado | Sí (en `admin-dashboard`) | Sí |
| Corte y sesión de caja (`shift`) | No | No | Sí (abre/cierra caja) | Bloqueado | Sí (en `admin-dashboard`) | Sí (solo lectura) |
| Panel de administración (`admin-dashboard`) | No | No | Bloqueado | Bloqueado | Sí | Bloqueado |
| Editar menú (`menu-admin`) | No | No | Bloqueado *(ver brecha)* | Bloqueado | Sí | Bloqueado |
| Gestión de personal (`users-admin`) | No | No | Bloqueado | Bloqueado | Sí | Bloqueado |
| Ajustes de terminal (`MenuModal`) | No | No | Sí | Sí | Sí | Bloqueado |

## Mecanismos de control implementados

### 1. En `frontend/clientes/`

- **Separación de sesión cruzada (`AuthContext.tsx`)**: Si un empleado inició sesión en el mismo navegador (misma origin/cookies) y el cliente intenta llamar `GET /customers/me` recibiendo `403`, `AuthContext` ejecuta `logoutCustomer()` automáticamente para limpiar la cookie de personal antes de operar como cliente.
- **Reintento limpio en `CartContext.tsx`**: Si `createMobileOrder` falla con `403` o `400` siendo invitado (por una cookie residual de empleado), cierra sesión y reintenta la creación como invitado.

### 2. En `frontend/empleados/`

- **Guardas reactivos en `App.jsx` (`useEffect` líneas 145–171 y `handleTabChange`)**:
  - `PREPARACION` (`isEmployeeKitchen`): fuerza `activePosTab = 'kitchen'` e impide cambiar a cualquier otra pestaña.
  - `GERENTE` (`isEmployeeGerente`): restringe `activePosTab` exclusivamente a `['history', 'shift']`, oculta los botones de apertura/cierre de caja en `ShiftWorkspace.jsx` y bloquea `MenuModal`.
  - `ADMINISTRADOR` (`isEmployeeAdmin`): centraliza `menu-admin`, `users-admin`, `history` y `shift` dentro de `AdminDashboardWorkspace.jsx` (barra lateral oscura).
  - `CAJERO`: permite `order`, `history`, `shift` y `kitchen`, bloqueando `admin-dashboard`, `menu-admin` y `users-admin`.
- **Autorización puntual (`AdminAuthModal.jsx`)**: Componente existente en `App.jsx` (`adminAuthPendingTab`) para solicitar credenciales de administrador antes de abrir una pestaña sensible; actualmente no se dispara desde ningún botón del header pero permanece montado.

## Brechas de permisos detectadas

1. **Rol `GERENTE` inexistente en backend**: `UserManagementWorkspace.jsx` permite crear empleados con rol `GERENTE`, pero el esquema de `POST /api/v1/admin/employees` en `OpenAPI 0.11.0` solo acepta `CAJERO`, `PREPARACION` y `ADMINISTRADOR` (devolverá `400 VALIDATION_ERROR`). Ver [matriz de permisos backend](../../backend/docs/permissions.md).
2. **Disponibilidad de productos para `CAJERO`**: El contrato permite a `CAJERO` cambiar disponibilidad vía `PATCH /products/{id}/availability`, pero `MenuManagementWorkspace.jsx` está bloqueado íntegramente para no administradores, por lo que el cajero no tiene ningún control visual para agotar un producto.
3. **`AdminAuthModal` sobrescribe la sesión de caja**: Al verificar credenciales mediante `loginStaff(username, cleanPassword)`, reemplaza la cookie `HttpOnly` del navegador por la del administrador, rompiendo la sesión del cajero responsable que tenía abierta la caja.
4. **Favoritos mostrados a invitados**: `Header.tsx` y `ProductCard.tsx` muestran el icono de corazón a invitados aunque `AuthContext.toggleFavorite` retorna inmediatamente sin persistir si `!currentUser`.
5. **Restricción de responsable en caja abierta**: `ShiftWorkspace.jsx` no comprueba si `activeSession.openedByEmployeeId === currentEmployee.id` para distinguir cierre ordinario de cierre excepcional de administrador.

Referencias: [permisos backend](../../backend/docs/permissions.md), [auth y administración](auth-admin-implementation.md), [auditoría FE-GAP-01](tasks/FE-GAP-01-integration-audit.md).
