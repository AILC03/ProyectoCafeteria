# Tarea: TASK-12 — Cuenta de cliente en frontend unificado

- Responsable: Leonel (implementación coordinada con IA)
- Revisor humano: Equipo frontend, pendiente de PR
- Aplicación afectada: `frontend/unified/` (área cliente)
- Rama base: `feat/frontend-task-11` (PR #12; se actualizará a `main` tras su integración)
- Rama de trabajo: `feat/frontend-task-12`
- Estado: acordada

## Objetivo y fuentes

Migrar perfil propio, favoritos, historial y repetición de órdenes para el rol
`CLIENTE` conforme a [TASK-12](../specs/frontend-unification/FRONTEND-UNIFICATION-TASKS.md),
[SPEC-FE-001](../specs/frontend-unification/FRONTEND-UNIFICATION-SPEC.md),
[PLAN-FE-001](../specs/frontend-unification/FRONTEND-UNIFICATION-PLAN.md),
[OpenAPI](../../../backend/docs/api/openapi.yaml),
[reglas](../business-rules.md) y [permisos](../permissions.md).

## Alcance y exclusiones

- Incluye: perfil `GET/PATCH /customers/me`, favoritos `GET/PUT/DELETE`, historial
  paginado `GET /customers/me/orders`, detalle propio `GET /orders/{id}` y
  `POST /customers/me/orders/{id}/repeat-preview`; confirmar repetición sólo
  mediante una nueva orden pendiente por `POST /orders` reutilizando TASK-11.
- No incluye: datos de otros roles/clientes, cobros, checkout Stripe, QR,
  recuperación/cambio de NIP ni cambios de contrato o backend.
- Preservar CSRF/cookies, IDs y centavos como cadenas, cursores opacos,
  idempotencia de creación y limpieza de estado privado entre actores.

## Criterios de aceptación y trazabilidad

| ID | Requisito y fuente | Archivo / componente previsto | Verificación esperada | Estado |
| --- | --- | --- | --- | --- |
| CA-01 | Perfil propio y teléfono con NIP actual; OpenAPI `customers/me` | `features/clientes/account/` | GET/PATCH, validación, revocación y errores | Pendiente |
| CA-02 | Favoritos del CLIENTE; OpenAPI `customers/me/favorites` | `features/clientes/account/` | paginación, PUT/DELETE 204 y rollback ante fallo | Pendiente |
| CA-03 | Historial propio y detalle; OpenAPI `customers/me/orders`, `orders/{id}` | `features/clientes/account/` | vacío, cursor, estados pagados/no pagados, 404 ajeno | Pendiente |
| CA-04 | Preview y confirmación explícita de nueva orden; OpenAPI `repeat-preview`, `POST /orders` | `features/clientes/account/`, órdenes TASK-11 | avisos informativos/bloqueantes, nueva clave, red incierta sin éxito falso | Pendiente |
| CA-05 | Sólo CLIENTE, limpieza entre actores y accesibilidad; SPEC-FE-001 | router, cuenta y pruebas | invitado/STAFF denegados, 401/403, teclado y estados | Pendiente |

## Impacto técnico

- API: sólo rutas y esquemas existentes en OpenAPI; no agregar endpoints.
- Estado local: datos de cuenta, favoritos, historial y preview sólo en memoria.
- Interfaz móvil: estados de carga, vacío, error y éxito; importes del backend.

## Evidencia de entrega

- Archivos modificados: pendiente.
- Comandos y resultados: pendiente (perfil V-CLIENT).
- Pruebas manuales con API real: no previstas; mocks de API para pruebas.
- Pendientes conocidos: revisión humana y eventual retarget del PR tras integrar TASK-11.
