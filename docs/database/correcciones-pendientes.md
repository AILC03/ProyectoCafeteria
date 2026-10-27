# Correcciones pendientes de la entrega de Leonel

Actualización 2026-10-20: Ángel aprobó candidato y ADR 0011, y autorizó aplicar
la migración a su desarrollo local. Aplicada sin reset; menú demo cargado.
C06 y aprobación C12 ya cerrados; C08 requiere evidencia externa de Leonel/Docker.
La lista inferior conserva la revisión del 18/10; ver backend-progress.md para estado actual.

Actualizado: 18/10/2026. Responsable de revisión final: Angel.
Estado histórico: **INTEGRADO COMO CANDIDATO, NO APROBADO NI MIGRADO**. Fue
superado por la aceptación del ADR 0011, las migraciones posteriores y la
implementación actual en `dev`; conservar como evidencia de la revisión 18/10.

## Resolución técnica del 18/10/2026

La lista original inferior conserva los hallazgos y criterios. Estado actual:

| ID  | Resultado de esta corrección                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------- |
| C01 | Corregido: 21 defaults alineados, metadatos e inserciones comprobados                                          |
| C02 | Corregido: cambio NULL/incorrecto rechazados, efectivo válido y Stripe aceptados                               |
| C03 | Corregido: cierre completo obligatorio, actor y diferencia, sin campos de cierre en caja abierta               |
| C04 | Corregido: esperado/contado no negativos; diferencia negativa válida                                           |
| C05 | Corregido: índices mapeados, relaciones únicas singulares, ER derivado de Prisma, SVG renderizado y diff vacío |
| C06 | Protocolos especificados; en esa fecha ADR 0011 era propuesta. Fue aceptado el 2026-10-20.                     |
| C07 | Suite funcional repetible: 22 casos y mutantes C01-C04, Prisma deploy/diff/cliente, PostgreSQL 17.10           |
| C08 | Pendiente externo: Docker falla y no se accede al equipo de Leonel; requiere ejecución suya                    |
| C09 | Corregido: --to-schema, destinos psql explícitos y runner aislado documentados                                 |
| C10 | Corregido: descripciones/rutas de error, validación formal y 18 ejemplos conformes                             |
| C11 | Corregido: administración depende de auth; worker separado de handlers; backlog y orden ampliados              |
| C12 | Informe/evidencias actualizados; pendiente aprobación final de Ángel y evidencia C08                           |

Evidencia vigente: `review-evidence/corrections-results.json` en PostgreSQL 17.10.
Se usaron instancias temporales distintas de las bases del proyecto. Pruebas de
servicios QR/refresh/Stripe siguen pendientes de implementación. Las correcciones
del candidato no autorizan migración a entornos compartidos.

## Qué se integró

Se incorporaron los 9 archivos diferentes de la entrega ZIP respecto del commit
`6a41644`: 7 archivos nuevos y 2 modificados. Los archivos recibidos se conservaron
sin corregir su contenido técnico para distinguir entrega y revisión.

- `prisma/schema.prisma`: 29 modelos.
- `prisma/migrations/20261015_initial_candidate/migration.sql`: SQL candidato.
- `docs/api/openapi.yaml`: catálogo de lectura y health.
- `docs/database/physical-model.md`: diccionario físico.
- `docs/database/er-diagram.mmd`: diagrama fuente.
- `docs/database/verification.md`: procedimientos y matriz de pruebas.
- `docs/database/delivery-report.md`: informe original de Leonel.
- `docs/development-tasks.md`: 11 historias futuras.
- `tests/database/structural-assertions.sql`: comprobación estructural básica.

También se añadieron evidencias de la revisión en `review-evidence/` y se actualizaron
los resúmenes de estado. No hay endpoints de catálogo implementados. La presencia
de una migración en el repositorio no autoriza aplicarla a desarrollo o producción.

Se normalizó el formato de Prisma, YAML, Markdown y evidencias JSON sin resolver
los defectos funcionales de esta lista. Tras integrar pasaron typecheck, lint,
las 4 pruebas iniciales, la validación de Prisma y format:check. Esto comprueba
la base del backend, no las reglas de negocio todavía pendientes.

## Prioridad 1: corregir antes de aprobar la migración

### C01. Alinear los 21 defaults de fecha entre Prisma y SQL

- **Problema:** Prisma declara `@default(now())`, pero el SQL crea las columnas
  NOT NULL sin `DEFAULT CURRENT_TIMESTAMP`. El diccionario promete ese valor.
- **Ejemplo reproducido:** insertar una categoría con solo `name` falla con código
  `23502` porque `created_at` no tiene valor automático.
- **Acción:** alinear SQL, Prisma y diccionario; revisar todo el DDL, no solo categorías.
- **Aceptación:** las columnas siguientes tienen el default documentado y una
  inserción que omite cada fecha obtiene un valor válido cuando corresponde.

Columnas afectadas:

| Tabla                        | Columna(s)               |
| ---------------------------- | ------------------------ |
| audit_events                 | occurred_at              |
| auth_sessions                | created_at, last_seen_at |
| cash_sessions                | opened_at                |
| categories                   | created_at               |
| customer_registration_tokens | created_at               |
| favorites                    | created_at               |
| guest_ticket_tokens          | created_at               |
| idempotency_records          | created_at               |
| jobs                         | available_at             |
| orders                       | created_at               |
| outbox_messages              | available_at             |
| payment_events               | received_at              |
| payment_incidents            | created_at               |
| payments                     | created_at               |
| pin_recovery_tokens          | created_at               |
| pin_reset_audit              | reset_at                 |
| products                     | created_at               |
| refunds                      | created_at               |
| sales                        | sold_at                  |
| users                        | created_at               |

`updated_at` es distinto: `@updatedAt` lo mantiene Prisma, no un default de SQL.
No añadir un trigger o prometer actualización desde otros clientes sin diseñarlo.

### C02. Impedir cambio NULL en efectivo

- **Archivo:** migración, restricción `payments_check_2`.
- **Reproducción:** pago CASH de 6500, recibido 10000 y `change_cents=NULL` se acepta
  con orden, cajero y sesión válidos.
- **Causa:** comparar con NULL produce resultado indeterminado que el CHECK acepta.
- **Acción:** exigir `change_cents IS NOT NULL` en la rama CASH y mantener la igualdad
  `change_cents = cash_received_cents - amount_cents`. Stripe conserva campos CASH NULL.
- **Aceptación:** efectivo con cambio NULL o incorrecto se rechaza; cambio 3500 en
  el ejemplo se acepta; el caso Stripe sigue siendo válido.

### C03. Impedir cierre sin diferencia y revisar campos de cierre

- **Archivo:** migración, restricción `cash_sessions_check_2`.
- **Reproducción:** se acepta caja cerrada con actor, esperado y contado informados,
  pero `difference_cents=NULL`.
- **Acción:** exigir diferencia no nula al cerrar y coherente con contado menos
  esperado. Revisar también qué campos deben ser NULL mientras esté abierta.
- **Aceptación:** cierre sin actor/importes/diferencia o con cálculo incorrecto se
  rechaza; un cierre completo se acepta; una diferencia negativa válida se conserva.

### C04. Rechazar efectivo esperado o contado negativo

- **Reproducción:** se acepta cierre con esperado -100, contado -100 y diferencia 0.
- **Acción:** añadir validaciones para importes esperado/contado no negativos,
  permitiendo NULL mientras no corresponda cerrar.
- **Aceptación:** -1 se rechaza para esos importes; diferencia negativa sí se admite.

## Prioridad 2: completar coherencia y diseño

### C05. Sincronizar ER, diccionario, Prisma y SQL

- Añadir `users.account_type` al diagrama.
- Representar FK opcionales y relaciones únicas: la referencia de cliente en una
  orden puede faltar; `sales.order_id` y `sales.payment_id` son únicos.
- El ER usa `||--o{` de forma generalizada; corregir cardinalidades reales.
- Documentar índices manuales y declarar/mapear en Prisma los que este represente.
- Revisar diferencias de nombres de índices y comprobar futuras migraciones sin drift.
- Generar una exportación legible del diagrama y comprobar que Mermaid lo renderiza.
- **Aceptación:** ningún campo/relación contradice los otros archivos; el flujo de
  migraciones se prueba en una BD aislada y sus diferencias manuales están justificadas.

### C06. Concretar decisiones que quedaron en términos generales

- Elegir cómo generar folio y customer_number únicos sin carreras.
- Definir duración, revocación y eventual rotación del permiso al ticket de invitado,
  sin habilitar consulta de estado ni historial.
- Definir renovación refresh concurrente legítima frente a reutilización indebida,
  manteniendo los límites absolutos 8 h/30 días y revocación inmediata.
- Especificar coherencia rol/account_type y pertenencia de opciones/precios mediante
  protocolos transaccionales donde no alcance un CHECK.
- **Aceptación:** cada mecanismo tiene una decisión, justificación y caso de prueba;
  no se exige implementar todos los servicios de negocio en esta etapa.

## Prioridad 3: pruebas y evidencia pendientes

### C07. Sustituir comprobación de presencia por pruebas funcionales

El archivo `structural-assertions.sql` solo comprueba seis tablas, dos índices y
un CHECK. Pasa aunque existan los errores C01-C04.

- Añadir pruebas que detecten C01-C04 y verifiquen unicidad, FK y rollback.
- Incluir concurrencia de caja/pagos y planes reproducibles para QR y refresh.
- Separar las garantías del SQL de las que implementarán servicios futuros.
- Probar migración completa y compatibilidad con Prisma en PostgreSQL **17**, que
  es la versión mayor definida en Compose.
- **Aceptación:** pruebas que fallan con la versión original y pasan tras corregir;
  comandos, versión, resultado y pendientes documentados sin secretos.

### C08. Comprobar conexión en el entorno de Leonel

Leonel declaró que no se conectó a PostgreSQL. Las instrucciones no sustituyen
una ejecución. Con Docker Desktop abierto, desde la raíz:

```powershell
npm.cmd ci
npm.cmd run db:up
npm.cmd run db:check:docker
```

- Registrar conexión de desarrollo, shadow y test, fecha y código de salida.
- La comprobación usa SELECT: no ejecutar migraciones como prueba de conexión.
- Las pruebas de SQL se ejecutan aparte y solo sobre una BD desechable verificada.
- **Aceptación:** evidencia real, saneada, de las tres conexiones y destinos separados.

### C09. Actualizar instrucciones de validación

- En `verification.md`, usar la opción de Prisma 7 disponible `--to-schema` en
  lugar del antiguo `--to-schema-datamodel`.
- Hacer explícito el destino test de psql: abrir una sesión y luego lanzar otro
  proceso psql sin conexión explícita no conserva automáticamente esa sesión.
- Registrar validación Prisma/OpenAPI y comprobaciones de código/formato.
- **Aceptación:** otra persona puede reproducir los comandos sin adivinar destinos
  ni versiones y sin riesgo de apuntar a desarrollo para limpiar pruebas.

## Prioridad 4: pulir contrato y plan

### C10. Ajustes del contrato OpenAPI

- Limpiar descripciones copiadas que hablan de cursor/listas en detalle y opciones,
  que no declaran esos parámetros.
- Ajustar `instance` en los ejemplos de error a la ruta del ejemplo, en vez de
  repetir `/api/v1/products` en todas las operaciones.
- Mantener los cuatro endpoints como contrato futuro, no funcionalidad disponible.
- **Aceptación:** validación formal y ejemplos pasan; cada operación describe su
  entrada/respuesta real y health permanece compatible.

### C11. Completar tareas y dependencias

- ADM-01 necesita autenticación/autorización además del catálogo.
- Revisar OPS-01 y sus dependencias con recuperación/correo y reconciliación:
  separar infraestructura worker/outbox de los flujos que dependen de ella.
- Precisar dependencias faltantes, módulos/archivos previstos y alcance por historia.
- **Aceptación:** orden realizable sin dependencias circulares, con criterios
  comprobables y distinción entre preparación entregada y funcionalidad futura.

### C12. Cerrar la entrega corregida

- Actualizar `delivery-report.md` y `verification.md` con lo realmente ejecutado.
- Mantener separado lo verificado por Leonel de lo comprobado en revisión.
- Adjuntar decisiones, archivos/commit, pruebas y limitaciones.
- Angel revisa al terminar y aprueba o solicita ajustes. Integración local no equivale
  a aprobación ni a autorización de aplicar esta migración en entornos compartidos.

## Qué se comprobó ya en la revisión del 18/10/2026

Estas comprobaciones las realizó la revisión posterior, no Leonel:

| Comprobación                                      | Resultado                             |
| ------------------------------------------------- | ------------------------------------- |
| Prisma 7.10.0 validate                            | Válido                                |
| Validación formal OpenAPI                         | Válido                                |
| 18 ejemplos OpenAPI                               | Conformes a sus esquemas              |
| Aplicar SQL en PostgreSQL 18 temporal             | 29 tablas creadas                     |
| Assertions entregadas                             | Pasan; cobertura estructural limitada |
| Dos aperturas concurrentes                        | Un éxito y un rechazo                 |
| Dos pagos exitosos concurrentes                   | Un éxito y un rechazo                 |
| Venta duplicada                                   | Rechazada                             |
| Categoría con producto dado de baja               | Borrado físico rechazado              |
| Precio negativo / cantidad cero / usuario híbrido | Rechazados                            |
| Cambiar precio de catálogo                        | Snapshot conserva 6500                |
| Comparación de defaults                           | 21 ausentes en SQL                    |
| C02-C04                                           | Defectos reproducidos                 |

La instancia temporal se detuvo; no se tocaron las bases originales. Aún debe
repetirse en PostgreSQL 17 y comprobar el flujo de migraciones Prisma completo.
El cambio de precio demuestra separación de snapshots, no protección contra
una modificación directa de históricos. Tampoco demuestra servicios QR/Stripe.

Evidencias: [resultados SQL](review-evidence/database-review-results.json) y
[contrato y diagrama](review-evidence/contract-and-diagram-review.json).
Los informes originales de Leonel conservan su estado histórico de NO PROBADO.
