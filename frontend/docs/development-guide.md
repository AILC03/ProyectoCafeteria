# Guía de desarrollo del frontend

Convenciones técnicas y reglas obligatorias para mantener y completar `frontend/clientes/` y
`frontend/empleados/` en alineación con [development-guide.md](../../backend/docs/development-guide.md)
y [frontend-integration.md](../../backend/docs/frontend-integration.md).

## 1. Convenciones por aplicación

| Aspecto | `frontend/clientes/` | `frontend/empleados/` |
| --- | --- | --- |
| Lenguaje | TypeScript (`strict` en `tsconfig.app.json`) | JavaScript ES Modules (`.js` / `.jsx`) |
| Estilos | Tailwind CSS v3 + tokens de color café/crema en `tailwind.config.js` | Vanilla CSS (`src/styles/index.css`) con variables CSS y temas |
| Iconografía | Material Symbols Outlined (Google Fonts) y `lucide-react` | SVG en línea y texto accesible (evitar dependencias pesadas para Electron) |
| Enrutamiento | `react-router-dom` v7 (`BrowserRouter`) | Máquina de estados en `App.jsx` (`activeScreen`, `activePosTab`) compatible con `file://` |
| Linter | `oxlint` (`npm run lint`) | Sin linter configurado actualmente (pendiente añadir ESLint/Oxlint) |

### Idioma y nomenclatura

- Nombres técnicos, variables, componentes, funciones API y tipos: **en inglés**, usando `camelCase` para variables/funciones y `PascalCase` para componentes/tipos/interfaces.
- Textos visibles al usuario, mensajes de error y documentación: **en español**.

## 2. Manejo estricto de dinero, IDs y fechas

1. **IDs e importes como cadenas decimales**: La API siempre envía y espera IDs y montos en centavos como `string` (`"6500"` = `$65.00 MXN`). Nunca convertir IDs a `Number` (pueden superar `Number.MAX_SAFE_INTEGER` por `BIGINT` de PostgreSQL).
2. **Utilidades monetarias obligatorias**:
   - En `clientes`: usar `formatCents`, `formatPrice`, `centsToNumber` y `numberToCents` de `frontend/clientes/src/utils/money.ts`.
   - En `empleados`: usar las equivalentes de `frontend/empleados/src/utils/money.js`.
3. **Nunca calcular precios definitivos ni impuestos ficticios**: El backend calcula recargos, totales y cambio desde el catálogo vigente y snapshots. Mostrar únicamente estimaciones basadas en `basePriceCents + surchargeCents` y siempre adoptar `totalCents` de la respuesta oficial del servidor al confirmar.
4. **Fechas UTC**: Todas las fechas devueltas por el backend son ISO 8601 UTC. Formatearlas a `es-MX` únicamente en la capa visual y enviar rangos `from`/`to` de `/sales` en formato ISO UTC.

## 3. Reglas de seguridad en navegador

1. **Prohibido guardar secretos en `localStorage` o `sessionStorage`**:
   - Nunca almacenar JWT, refresh token, contraseñas, NIPs, tokens de registro (`AUTH-02`), tokens de ticket digital (`TKT-02`), tokens de Checkout Stripe ni tokens QR de cobro (`CASH-03`).
   - Permitido en `localStorage`: carrito temporal no autenticado (`taffy_cart`), tema visual, ancho de ticket y preferencias de sonido.
2. **Tokens en URL por fragmento (`#token=...`)**:
   - Al implementar `/verificar-correo` y `/recuperar-nip`, extraer el token del hash únicamente a estado en memoria y ejecutar inmediatamente `window.history.replaceState(null, '', window.location.pathname)` antes de realizar llamadas de red.
3. **Mutaciones y CSRF**:
   - Toda mutación (`POST`, `PUT`, `PATCH`, `DELETE`) contra `/api/v1` debe pasar por `apiFetch` con `credentials: 'include'` y cabecera `X-CSRF-Token`.
   - Nunca reutilizar un `X-Ticket-Token` o `X-Checkout-Token` dentro de query strings; enviarlos siempre en cabecera HTTP o cuerpo JSON según el contrato.
4. **Escape de texto al imprimir**:
   - Renderizar nombres de productos, opciones y clientes siempre mediante JSX (`{valor}`), nunca con `dangerouslySetInnerHTML` o plantillas HTML inyectadas en `innerHTML` (como ocurría en el prototipo legado `js/app.js`).
5. **Reintentos e idempotencia**:
   - Conservar una misma `Idempotency-Key` UUID v4 por intención de usuario en mutaciones críticas (`POST /orders`, `POST /cashier/orders`, `POST /payments/cash`, `POST /cash-sessions`, `POST /cash-sessions/{id}/close`, `POST /orders/{id}/checkout`) para reintentar ante red inestable sin duplicar cobros.

## 4. Estados obligatorios por pantalla

Toda pantalla o modal que consuma la API debe contemplar explícitamente:
- **Carga** (*spinner* / estado deshabilitado durante mutaciones para prevenir doble clic).
- **Vacío** (mensaje informativo cuando una categoría, historial o cola de cocina no tiene registros).
- **Error `Problem Details`** (traducción amigable de `code` HTTP sin exponer trazas técnicas; manejar `401`, `403`, `409`, `429` y `503`).
- **Éxito** (retroalimentación clara por toast o modal).

Referencias: [integración con backend](backend-integration.md), [contrato OpenAPI](../../backend/docs/api/openapi.yaml), [flujo de trabajo](workflow/README.md).
