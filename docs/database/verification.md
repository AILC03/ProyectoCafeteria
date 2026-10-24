# Verificación y evidencias — candidato corregido

## Revisión del 18/10/2026

La sección histórica inferior describe la entrega original de Leonel. La
revisión posterior sí ejecutó Prisma y SQL en instancias temporales 18.6 y
17.10; la evidencia vigente en `review-evidence/corrections-results.json`
corresponde a 17.10. No se aplicó la migración a las bases del proyecto.

Comando principal: `npm run db:verify`, con TEST_DATABASE_URL local apuntando
explícitamente a cafeteria_test. Requiere permiso CREATEDB en pruebas.
El runner no modifica tablas de esa base: crea dos bases con prefijo aleatorio
cafeteria_review_, aplica candidato y mutante C01-C04, y elimina solo esas dos
bases creadas por él. No usa reset/push ni desarrollo/shadow existentes.
Rechaza otros nombres/hosts y PostgreSQL diferente de 17; opt-in
ALLOW_PG18_REVIEW=1 permite revisión adicional 18, no sustituye aceptación 17.

Con Docker operativo:

```powershell
npm.cmd run db:up
npm.cmd run db:check:docker
npm.cmd run db:verify:docker
```

Si Docker falla, no borrar volúmenes para intentar solucionarlo. En esta revisión
se usaron binarios temporales PostgreSQL 17.10 del paquete
@embedded-postgres/windows-x64@17.10.0-beta.17, sin instalar otro servicio.
La instancia se limita a loopback y se detiene al finalizar la revisión.

Pruebas realizadas: 22 casos SQL, C01-C04 detectados por mutación, 29 tablas,
aperturas y pagos concurrentes, FK/unicidad/rollback/snapshots; deploy y segundo
deploy sin reaplicar; diff declarativo vacío y smoke del cliente Prisma con
adapter-pg. El mutante reintroduce únicamente cuatro defectos, no es una copia
exacta del archivo original. No prueba servicios QR, refresh o Stripe.

Validación API repetible: `npm run api:validate` (Swagger Parser, AJV y
ajv-formats); 18 ejemplos contra esquemas y rutas. Dependencias solo de
desarrollo añadidas para hacer reproducible la corrección C10, no para la API runtime.
ER renderizado con Mermaid CLI 11; fuente generable con `npm run db:diagram`.

Pendientes externos: conexión en el ordenador de Leonel y primer arranque Compose
(C08), aprobación de precisiones ADR 0011 y revisión final de Ángel (C12).

## Estado real al entregar

- Se inspeccionaron los archivos de la rama `dev` del commit `6a41644`.
- Se generó Prisma, SQL de migración candidata, contrato YAML, tareas y ER.
- **No se conectó a PostgreSQL ni se ejecutaron migraciones ni pruebas de concurrencia.** Sin PostgreSQL test disponible, los escenarios pendientes **NO APROBADOS**.
- La validación real de Prisma, aplicación SQL y OpenAPI debe ejecutarse en un entorno con las dependencias instaladas; ver abajo.

## Conexión (solo SELECT, proceso separado)

1. En Windows con Node 22 y Docker Desktop Linux, desde `dev`: `npm.cmd ci`.
2. `npm.cmd run db:up`; confirma que sea instalación local no compartida.
3. `npm.cmd run db:check:docker`: comprueba las tres BD por SELECT. Nunca usar `migrate`, `reset`, `push` o `seed` como prueba de conexión.
4. Si es PostgreSQL manual, `npm.cmd run db:check` solo con credenciales locales.
5. Registrar fecha, etiqueta de base, exit code, conteo de tablas; **no** copiar credenciales ni cadenas de conexión.

## Migración candidata (solamente test aislado)

La migración contiene `BEGIN`/`COMMIT`. Ejecutarla únicamente al verificar inequívocamente que `cafeteria_test` sea una BD aislada y vacía, administrada para pruebas. **No usar el comando `prisma migrate dev` en desarrollo/shadow con información ajena.**

1. `npm.cmd run db:validate` para validar `schema.prisma` con `DATABASE_URL` de pruebas.
2. `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (Prisma 7) para comparar DDL generado por ORM contra el SQL candidato. No ejecutar ese resultado automáticamente.
3. Preferir el runner aislado anterior. Para ejecución manual abrir una sola sesión `psql -h HOST_TEST -p PUERTO_TEST -U USUARIO_TEST -d cafeteria_test -v ON_ERROR_STOP=1`. No poner contraseña en argumentos.
4. En esa misma sesión verificar `SELECT current_database(); SELECT count(*) FROM information_schema.tables WHERE table_schema='public';`, confirmar destino desechable y vacío y usar `\i prisma/migrations/20261015_initial_candidate/migration.sql`.
5. Sin salir de esa sesión usar `\i tests/database/structural-assertions.sql`. Un nuevo proceso psql no hereda la conexión de otro. No ejecutar manualmente sobre bases existentes con datos.
6. Comparar manualmente Prisma y DDL, especialmente enum, nombre de PK, índices, defaults y `ON DELETE RESTRICT` antes de aprobar.

## Matriz de escenarios por ejecutar

Estado histórico de la entrega original. La revisión técnica posterior completó
los casos SQL de caja, pago, venta, precios/cantidades, campos híbridos, FK,
snapshot y rollback SQL en 17.10. Los escenarios que requieren servicios siguen
pendientes, incluidos QR doble, 50 líneas, cobro/cierre y Checkout; no se cierran
por haber probado solo índices o rollback SQL. Ver evidencia JSON vigente.

| Escenario                               | Procedimiento esperado                                                    | Estado                                     |
| --------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| Unicidad de caja abierta                | Dos sesiones concurrentes intentando abrir                                | PENDIENTE de PostgreSQL test               |
| Pago exitoso único                      | Dos transacciones tratando de confirmar SUCCEEDED en misma orden          | PENDIENTE                                  |
| Venta única por orden y pago            | Intentar duplicar `sales.order_id` / `payment_id`                         | PENDIENTE                                  |
| Cantidad inválida y precio negativo     | INSERT de `quantity=0`, `base_price_cents=-1`                             | PENDIENTE                                  |
| Usuario híbrido                         | INSERT con `account_type=STAFF` y `phone` presente                        | PENDIENTE                                  |
| Categoría con producto retirado         | DELETE categoría con producto `deleted_at` no null                        | PENDIENTE                                  |
| Snapshot                                | Crear orden, actualizar precio de producto, leer snapshot                 | PENDIENTE                                  |
| Registro doble por QR                   | Dos transacciones que bloquean token y venta                              | PENDIENTE: requiere servicio transaccional |
| 50 líneas, total, pertenencia de opción | Lock + validaciones en servicio                                           | PENDIENTE: requiere servicio transaccional |
| Fallo intermedio                        | Generar error entre actualización de orden/pago/venta, verificar ROLLBACK | PENDIENTE: requiere servicio               |
| Cobro vs cierre                         | Carrera con lock en cash_sessions                                         | PENDIENTE: requiere servicio               |
| Un Checkout pendiente                   | Doble petición concurrente, reservar intento/lock orden                   | PENDIENTE: requiere servicio               |

## Comprobación OpenAPI

Archivo: `docs/api/openapi.yaml`. Se revisó sintaxis YAML localmente, pero para validación formal de OpenAPI ejecutar `npx @redocly/cli lint docs/api/openapi.yaml` o validador equivalente con dependencias disponibles, registrando versión y salida. Advertencias/errores se reportan, no se omiten. Las rutas no están implementadas.

## Concurrencia — orden de locks propuesto

- Efectivo/caja: `cash_sessions FOR UPDATE` → `orders FOR UPDATE` → `payments` → `sales`; validar que sesión continúe abierta antes de cobrar. Cierre toma el mismo primer lock.
- Stripe: `orders FOR UPDATE` → `payments` → `sales`. Reconciliar PaymentIntent/Checkout usando timestamp de proveedor antes de expirar.
- Registro: `customer_registration_tokens FOR UPDATE` → `sales FOR UPDATE` → inserción de cliente y asociación; marcar token usado en la misma transacción.
- Refresh: `auth_sessions FOR UPDATE` → verificar familia y vencimiento absoluto; invalidar reuso y rotar atómicamente.

No aplicar el esquema a `dev`, `shadow` compartida o producción hasta la aprobación final de Ángel.
