# 0006 — Contrato HTTP, errores e idempotencia

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: explícita del responsable del backend tras revisar rutas, respuestas, paginación, errores y protección contra duplicados durante 48 horas. Coordinar contrato con Enrique antes de integrar.

## Contexto

Solo health está implementado; frontend necesita convenciones antes de integrar.

## Opciones consideradas

Respuestas variables; envoltura uniforme; errores propios o Problem Details.

## Decisión

Conservar health actual. API /api/v1; recursos en plural y nombres JSON camelCase. Éxito individual {data}, lista {data,page:{limit,nextCursor}}. Cursor opaco con orden estable (createdAt,id), limit 20 por defecto y máximo 100; filtros permitidos explícitos. IDs y dinero como strings decimales, fechas ISO 8601 UTC. Errores application/problem+json con type,title,status,detail,instance,code,requestId y errors para validación; sin stack/SQL. 400 entrada inválida, 401 no autenticado, 403 sin permiso, 404 ausente/no visible, 409 conflicto, 429 límite, 503 dependencia indisponible. Idempotency-Key obligatorio para crear orden y cobrar efectivo: vincular a actor/alcance y hash de entrada; misma clave/entrada devuelve resultado original, otra entrada 409. Invitados usan clave aleatoria de operación, nunca como permiso para consultar órdenes. Retener registros 48 horas; invariantes SQL permanecen sin vencimiento.

## Consecuencias

Actualizar ejemplos OpenAPI antes de programar. Las claves de idempotencia no son credenciales y no sustituyen transacciones. El frontend reutiliza la misma clave para reintentos de una operación, incluido doble clic; una operación nueva utiliza otra clave. La protección de 48 horas se refiere al registro de idempotencia, no a borrar pagos ni ventas. Esta aprobación no implica endpoints de negocio implementados.

## Verificación

Repetición concurrente produce una operación; error de validación no crea recursos; paginación no depende de Number para IDs. health conserva exactamente su respuesta actual.

## Referencias

- [Reglas](../business-rules.md)
- [Cierre de planeación](../planning-readiness.md)
