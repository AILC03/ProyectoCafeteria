# Flujo de desarrollo del frontend

Proceso estándar para mantener la coherencia entre `frontend/clientes/`, `frontend/empleados/` y el
contrato del backend, equivalente al [flujo obligatorio del backend](../../../backend/docs/workflow/README.md).

## 1. Descubrir y verificar fuentes antes de editar

1. Revisar `git status --short` y la rama actual (`dev` para trabajo continuo, `main` estable).
2. Consultar:
   - [Índice del frontend](../README.md) y [cobertura de endpoints](../api/endpoints-coverage.md).
   - [OpenAPI 0.11.0](../../../backend/docs/api/openapi.yaml) y [guía de integración del backend](../../../backend/docs/frontend-integration.md).
   - [Reglas de negocio](../business-rules.md) y [matriz de permisos](../permissions.md).
3. No inventar endpoints, campos JSON ni estados de orden que no figuren en `openapi.yaml`. Si una pantalla necesita un campo nuevo, acordarlo primero con el responsable del backend (**Ángel**).

## 2. Acordar una tarea verificable

Copiar [task-template.md](task-template.md) en `frontend/docs/tasks/<id>-<nombre>.md` indicando:
- Aplicación afectada (`clientes`, `empleados` o ambas).
- Endpoints de `/api/v1` consumidos, cabeceras requeridas (`X-CSRF-Token`, `Idempotency-Key`, `X-Ticket-Token`, `X-Checkout-Token`) y manejo de errores.
- Criterios de aceptación observables y pruebas negativas (rol incorrecto, sesión expirada, producto agotado, red inestable, doble clic).

## 3. Implementar respetando reglas de UI y seguridad

- Formatear dinero e IDs con `utils/money.ts` / `utils/money.js` sin perder precisión de cadenas decimales.
- No almacenar secretos, tokens de registro/ticket, contraseñas ni NIPs en `localStorage` o URLs persistentes.
- Implementar los cuatro estados en cada pantalla: carga, vacío, error (`Problem Details`) y éxito.
- Evitar `innerHTML` sobre nombres del catálogo/snapshots.

## 4. Verificar antes de entregar

| Aplicación | Comprobaciones obligatorias al editar código |
| --- | --- |
| `frontend/clientes/` | `npm.cmd run lint` (`oxlint`), `npm.cmd run build` (`tsc -b && vite build`) |
| `frontend/empleados/` | `npm.cmd run build` (`vite build`); revisar consola de navegador y compatibilidad Electron si se toca `electron/` o rutas |
| Documentación | Verificar que todos los enlaces relativos resuelven sin roturas y actualizar `frontend/docs/README.md`, `endpoints-coverage.md` y `development-tasks.md` |

## 5. Entregar y revisar

- Reportar archivos modificados, comandos realmente ejecutados con sus resultados (incluyendo advertencias o checks omitidos), pruebas manuales con API local y pendientes restantes.
- Coordinar revisión cruzada entre **Enrique** (frontend) y **Ángel** (backend) antes de promover a `main`.
