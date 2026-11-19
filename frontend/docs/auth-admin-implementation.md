# Autenticación y administración en el frontend

Documenta los flujos de inicio de sesión, gestión de sesiones, control administrativo de
catálogo/personal y las funcionalidades pendientes frente a `OpenAPI 0.11.0`.

## 1. Autenticación de clientes (`frontend/clientes/`)

### Qué existe y cómo funciona

- **Pantalla `AuthPage.tsx` (`/iniciar-sesion`)**: Ofrece dos pestañas (`INICIAR SESIÓN` y `REGISTRAR CON TICKET`) más el botón `CONTINUAR COMO INVITADO`.
  - **Login (`handleSubmit`)**: Normaliza el identificador eliminando `@` inicial y valida que sea teléfono MX de 10 dígitos (opcional `+52`) o número de cliente (`C` seguido de dígitos). Exige PIN de 4 dígitos capturado con `PinInput.tsx` (4 casillas numéricas con soporte de pegado, teclas de flecha y botón ver/ocultar).
  - **Llamada API**: `AuthContext.login()` invoca `loginCustomer(identifier, pin)` → `POST /api/v1/auth/login/customer` y luego `refreshProfile()` → `GET /api/v1/customers/me` + `GET /api/v1/customers/me/favorites`.
  - **Modo invitado (`guestLogin`)**: Establece `isGuest = true`, guarda `taffy_is_guest` y `taffy_guest_name` en `localStorage`, ejecuta `logoutCustomer()` para limpiar cookies previas y navega a `/menu`.
- **Verificación de sesión al cargar (`AuthContext.tsx`)**: Al montar la app llama a `refreshProfile()`. Si recibe `403` (p. ej. cookie de empleado en la misma origin), limpia la sesión vía `POST /auth/logout`.

### Qué falta en autenticación de clientes

- Manejo de `403 PIN_CHANGE_REQUIRED` (`mustChangePin: true` tras un reset presencial de admin) redirigiendo a una pantalla obligatoria de cambio de NIP (`PATCH /api/v1/auth/pin`).
- Cambio voluntario de NIP en `ProfileModal.tsx` (`PATCH /api/v1/auth/pin`).
- Renovación automática de access JWT (`POST /api/v1/auth/refresh`).
- Verificación de correo (`POST /customers/me/recovery-email` y ruta `/verificar-correo#token=...` con `history.replaceState`) y recuperación de NIP (`/recuperar-nip#token=...`, `POST /auth/pin-recovery` y `POST /auth/pin-recovery/confirm`).

---

## 2. Autenticación de personal (`frontend/empleados/`)

### Qué existe y cómo funciona

Flujo en dos pantallas diseñado para terminal táctil:

1. **`WelcomeScreen.jsx` (`welcome`)**: Muestra el nombre del negocio, reloj en tiempo real, botón `EMPEZAR` y acceso a `MenuModal` (temas y configuración).
2. **`EmployeeIdScreen.jsx` (`employee-id`)**:
   - Campo `@username` (3–24 caracteres alfanuméricos y guión bajo).
   - Lista rápida de perfiles debajo del formulario: intenta sincronizar desde `GET /api/v1/admin/employees` y, si falla (p. ej. porque aún no hay sesión abierta), recurre a `getEmployees()` en `localStorage` / `DEFAULT_EMPLOYEES` (`AngelAdmin`).
3. **`EmployeePinScreen.jsx` (`employee-pin`)**:
   - Muestra tarjeta con avatar, nombre y rol del empleado seleccionado.
   - Valida contraseña de **8 a 24 caracteres** (acorde a `ADR 0005`).
   - Llama a `loginStaff(username, cleanPassword)` → `POST /api/v1/auth/login/staff`.
   - **Respaldo offline**: Si la petición falla con un error distinto de `401` (red caída o backend apagado), valida localmente con `verifyEmployeeCredentials()` en `src/data/employees.js`.

### Brechas y riesgos de seguridad en auth de personal

1. **Almacenamiento de contraseña en claro en `localStorage`**: `EmployeePinScreen.jsx` (líneas 74–75) pasa `pin: cleanPassword` y `password: cleanPassword` a `handleLoginSuccess()`, que lo persiste en `coffees_current_employee` y `taffy_current_employee`. Además, `src/api/client.js` contiene credenciales de prueba hardcodeadas (`'Admin1234'`) para reautenticarse ante `401`. Esto viola [ADR 0005](../../backend/docs/adr/0005-authentication.md) y [la guía de integración](../../backend/docs/frontend-integration.md).
2. **Lista rápida de empleados en `EmployeeIdScreen`**: Un empleado sin sesión de administrador no puede leer `/admin/employees` (`401`/`403`), por lo que en un navegador limpio solo verá `AngelAdmin` en la lista rápida y deberá escribir su `@username` — pero `handleSubmit` busca en `findEmployee()` local antes de pasar a la pantalla de contraseña, **impidiendo iniciar sesión a un cajero real creado en BD que no esté cacheado en ese navegador**.
3. **Cambio de contraseña propio**: No hay interfaz para `PATCH /api/v1/auth/password`.

---

## 3. Administración en POS (`frontend/empleados/`)

Solo accesible para `ADMINISTRADOR` mediante la barra lateral de `AdminDashboardWorkspace.jsx`, que agrupa 4 vistas:

- **`ShiftWorkspace.jsx`** (*Corte de Caja*).
- **`MenuManagementWorkspace.jsx`** (*Editar Menú*).
- **`UserManagementWorkspace.jsx`** (*Personal y Usuarios*).
- **`HistoryWorkspace.jsx`** (*Historial de Pedidos*).

### Administración de catálogo (`MenuManagementWorkspace.jsx`)

- **Implementado contra API**:
  - Sincroniza categorías y productos (`GET /categories`, `GET /products`).
  - Modal de categorías: crea (`POST /admin/categories`) y elimina lógicamente (`DELETE /admin/categories/{id}`), bloqueando visualmente el botón si la categoría tiene productos visibles.
  - Alta y edición de productos (`POST /admin/products`, `PATCH /admin/products/{id}`), baja lógica (`DELETE /admin/products/{id}`) y cambio rápido de disponibilidad (`PATCH /products/{id}/availability`).
- **Qué falta y desajustes**:
  - Usa `GET /categories` y `GET /products` públicos en vez de `/admin/categories` y `/admin/products`, por lo que no puede listar entidades inactivas o eliminadas (`includeDeleted`) ni editar categorías existentes (`PATCH /admin/categories/{id}`).
  - El campo `SKU` (`formSku`) del formulario no existe en el backend y solo se guarda en `localStorage`.
  - **Sin gestión de opciones**: No implementa CRUD para `option-groups`, `option-values` ni `PUT /admin/products/{id}/configuration`.
  - **Sin imágenes Cloudinary**: No implementa `POST /admin/products/{id}/image-upload`, subida directa `FormData` a Cloudinary ni `PUT /admin/products/{id}/image`.

### Administración de usuarios (`UserManagementWorkspace.jsx`)

- **Implementado contra API**:
  - Lista empleados (`GET /admin/employees?limit=50`), crea empleado (`POST /admin/employees`), edita nombre/rol/estado activo (`PATCH /admin/employees/{id}`) y ejecuta baja/reactivación lógica (`isActive: false/true` con `reason`). Impide darse de baja a uno mismo en la UI.
- **Qué falta y desajustes**:
  - Incluye el rol `GERENTE` en el `<select>`, el cual no existe en el backend.
  - Si `employees` contiene empleados locales previos sin API, también los muestra mezclados.
  - **Sin administración de clientes**: Faltan vistas para buscar clientes, corregir nombre/teléfono auditado (`PATCH /admin/customers/{id}`) y realizar reset presencial de NIP (`POST /admin/customers/{id}/pin-reset` seleccionando la última venta pagada).

Referencias: [guía auth/admin backend](../../backend/docs/auth-admin-implementation.md), [matriz de permisos](permissions.md), [cobertura API](api/endpoints-coverage.md).
