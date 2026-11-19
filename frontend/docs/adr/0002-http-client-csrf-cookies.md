# 0002 — Cliente HTTP con cookies HttpOnly, CSRF en memoria y Problem Details

- Estado: Documentada sobre implementación existente (pendiente completar `/auth/refresh`)
- Fecha: 2026-11-18
- Responsables: Enrique (frontend), Ángel (backend)

## Contexto

El backend exige autenticación basada en cookies `HttpOnly` (`caf_access`, `caf_refresh`, `caf_csrf`), validación estricta de cabecera `Origin`, token `X-CSRF-Token` en toda mutación (incluidas las de invitado) y respuestas de error uniformes bajo `application/problem+json` ([ADR 0005](../../../backend/docs/adr/0005-authentication.md), [ADR 0006](../../../backend/docs/adr/0006-http-contract.md), [ADR 0009](../../../backend/docs/adr/0009-web-security-operation.md)).

## Opciones consideradas

- **Tokens Bearer en `localStorage`**: rechazado por seguridad y por incompatibilidad con el backend.
- **Cliente `fetch` centralizado con `credentials: 'include'` y bootstrap CSRF automático**: garantiza consistencia en cookies, encabezados y parseo de errores.

## Decisión

Implementar un wrapper central (`apiFetch` en `clientes/src/api/client.ts` y `empleados/src/api/client.js`) que:
1. Incluye `credentials: 'include'` en todas las peticiones hacia `/api/v1`.
2. Mantiene `cachedCsrfToken` exclusivamente en memoria del módulo, solicitándolo con `GET /api/v1/auth/csrf` bajo promesa compartida (`csrfPromise`) antes de mutaciones `POST`/`PUT`/`PATCH`/`DELETE`.
3. Reintenta automáticamente una vez si recibe `403 CSRF_INVALID`, invalidando y renovando el token.
4. Convierte errores JSON/Problem Details en instancias `ApiError(status, message, code, detail, requestId)`.
5. En desarrollo, ambos `vite.config.*` inyectan `Origin: http://localhost:5173` en el proxy `/api`.

## Consecuencias

- Ninguna vista necesita manipular cookies de sesión directamente.
- **Deuda técnica pendiente**: `empleados/src/api/client.js` resuelve el `401` con un re-login usando credenciales de `localStorage` en lugar de `POST /api/v1/auth/refresh`, y `clientes/src/api/client.ts` aún no intercepta `401` para renovar tokens. Ambos deben migrar a un gestor *single-flight* / Web Locks sobre `/auth/refresh`.

## Verificación

Inspeccionar `frontend/clientes/src/api/client.ts`, `frontend/empleados/src/api/client.js` y probar mutaciones con cookies y renovación ante `403 CSRF_INVALID`.

## Referencias

- [Integración con backend](../backend-integration.md)
- [Guía de integración backend](../../../backend/docs/frontend-integration.md)
