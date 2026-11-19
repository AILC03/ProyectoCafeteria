# Guía de integración técnica entre Frontend y Backend

Documenta cómo los clientes HTTP de `frontend/clientes/` (`src/api/client.ts`) y
`frontend/empleados/` (`src/api/client.js`) implementan la comunicación con `/api/v1`, qué
reglas de [frontend-integration.md](../../backend/docs/frontend-integration.md) ya cumplen y qué
mecanismos faltan por alinear.

## 1. Proxy de desarrollo y origen (`Origin`)

Ambos servidores de desarrollo Vite interceptan toda petición que inicie con `/api` y la redirigen
al backend en `http://localhost:3000`:

| App | Puerto Vite | Archivo | Comportamiento del proxy |
| --- | --- | --- | --- |
| `clientes` | `5173` | `frontend/clientes/vite.config.ts` | Reenvía `/api` → `http://localhost:3000`, `changeOrigin: true` e inyecta `Origin: http://localhost:5173` y `Referer: http://localhost:5173/` |
| `empleados` | `5174` | `frontend/empleados/vite.config.js` | Reenvía `/api` → `http://localhost:3000`, `changeOrigin: true` e inyecta `Origin: http://localhost:5173` y `Referer: http://localhost:5173/` |

> [!WARNING]
> En producción o cuando `empleados` corre empaquetado con Electron desde `file://`, `/api/v1` como
> ruta relativa fallará a menos que se configure una variable `VITE_API_BASE_URL` apuntando al
> origen HTTP/HTTPS del backend y dicho origen esté autorizado en `FRONTEND_ORIGIN`.

## 2. Cookies `HttpOnly` y gestión de token CSRF

Ambos clientes (`client.ts` y `client.js`) implementan el mismo patrón base:

1. Envían `credentials: 'include'` en todas las llamadas `fetch` para que el navegador adjunte las cookies `caf_access`, `caf_refresh` y `caf_csrf` (o `__Host-caf_*` en producción).
2. Antes de cualquier mutación (`POST`, `PUT`, `PATCH`, `DELETE`), si `cachedCsrfToken` es nulo, `getCsrfToken()` realiza un `GET /api/v1/auth/csrf` con promesa compartida (`csrfPromise`) para evitar llamadas paralelas duplicadas.
3. Adjuntan el token en la cabecera `X-CSRF-Token`.
4. Si una mutación recibe `403` cuyo cuerpo JSON contiene `code === 'CSRF_INVALID'` o `title` con `'CSRF'`, invalidan `cachedCsrfToken`, solicitan un token nuevo y reintentan la petición **una sola vez**.
5. Al cerrar sesión (`logoutCustomer()` / `logoutStaff()`), llaman a `invalidateCsrfToken()`.

### Diferencia pendiente respecto al contrato

- Tras `POST /auth/login/customer`, `POST /auth/login/staff` o `POST /auth/refresh`, el backend rota y devuelve un nuevo `data.csrfToken` en el JSON de respuesta. Actualmente `loginCustomer()` y `loginStaff()` devuelven solo `res.data.user` y **descartan `res.data.csrfToken`** en lugar de actualizar `cachedCsrfToken` inmediatamente (aunque el reintento en `403` lo recupera en la siguiente mutación, genera una petición fallida innecesaria).

## 3. Manejo de errores RFC 7807 (`Problem Details`)

Ambos clientes solicitan `Accept: application/json, application/problem+json` y, cuando `!response.ok`, construyen una instancia de `ApiError`:

```text
ApiError {
  status: number,      // Código HTTP (400, 401, 403, 404, 409, 429, 503...)
  message: string,     // detail || title || statusText
  code?: string,       // Código estable de negocio (CSRF_INVALID, PIN_CHANGE_REQUIRED, etc.)
  detail?: string,     // Detalle devuelto por el backend
  requestId?: string   // Identificador de traza X-Request-Id
}
```

### Pendientes en manejo de errores

- Mostrar `requestId` o registrar soporte controlado en fallos `500`/`503`.
- Manejar específicamente los códigos `PIN_CHANGE_REQUIRED` (`403`), `REFRESH_ALREADY_ROTATED` (`409`), `REGISTRATION_RATE_LIMITED` (`429` respetando `Retry-After`) y `CASH_CONFLICT` (`409`).
- No mostrar el objeto de error crudo; mapear `code` a mensajes claros en español por pantalla.

## 4. Renovación de sesión (`401` / `POST /auth/refresh`)

- **`frontend/clientes/src/api/client.ts`**: **No implementa interceptor de refresh**. Si el JWT de 15 minutos vence mientras el cliente navega en `/menu`, la petición falla con `401` y no se intenta renovar con la cookie de 30 días.
- **`frontend/empleados/src/api/client.js`**: Ante `401` (líneas 101–150), **no llama a `POST /auth/refresh`**. En su lugar, lee la contraseña guardada en `localStorage` (`coffees_current_employee`), vuelve a llamar a `POST /auth/login/staff` en segundo plano y, si no hay usuario guardado, usa el fallback hardcodeado `admin` / `Admin1234`.
  - **Acción requerida**: Eliminar el fallback y la contraseña en `localStorage`, e implementar un gestor *single-flight* con `navigator.locks` (Web Locks) llamando a `POST /api/v1/auth/refresh`, tolerando `409 REFRESH_ALREADY_ROTATED` conforme a [ADR 0011](../../backend/docs/adr/0011-integrity-protocols.md) y la guía de integración.

## 5. Idempotencia (`Idempotency-Key`)

El backend exige `Idempotency-Key` UUID v4 en `POST /orders`, `POST /cashier/orders`, `POST /cash-sessions`, `POST /cash-sessions/{id}/close`, `POST /payments/cash` y `POST /orders/{id}/checkout`.

- **Estado actual**: `orders.ts` y `cash.js` generan `crypto.randomUUID()` **dentro** de la función API en cada invocación.
- **Brecha**: Si hay un corte de red o timeout al enviar una orden o cobrar, y el usuario vuelve a pulsar el botón de confirmar, se genera un UUID **distinto**, rompiendo la garantía de idempotencia ante red inestable.
- **Acción requerida**: Generar y mantener la clave UUID en el estado del componente/acción (ej. `CartDrawer`, `CheckoutModal`, `ShiftWorkspace`) hasta recibir respuesta definitiva (`201`/`200` o `4xx` de validación).

Referencias: [guía de integración backend](../../backend/docs/frontend-integration.md), [FE-ADR 0002](adr/0002-http-client-csrf-cookies.md), [cobertura de endpoints](api/endpoints-coverage.md).
