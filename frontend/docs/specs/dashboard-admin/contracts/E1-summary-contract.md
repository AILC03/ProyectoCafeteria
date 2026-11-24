# Contrato E1 — Resumen administrativo

Estado: **aprobado por el responsable el 2026-11-24; backend implementado y verificado con PostgreSQL real; revisión final y cierre formal pendientes**. Tarea: `TASK-DA-E1-00`. Fuente funcional: [spec.md](../spec.md), [plan.md](../plan.md) y [tasks.md](../tasks.md). La ruta `GET /api/v1/admin/dashboard/summary` está en `backend/docs/api/openapi.yaml` con `x-contract-status: approved-2026-11-24`.

La aprobación autoriza `TASK-DA-E1-01` (backend) y `TASK-DA-E1-04` (adaptador) dentro de sus alcances. No modifica reglas de negocio, no autoriza CSV, series/rankings, migraciones ni cambios de permisos de otras rutas.

La implementación backend está en `backend/src/modules/sales/` con pruebas unitarias e integración. No se modificó esquema ni migraciones. La integración PostgreSQL pasó 146/146 y `db:verify` 22 comprobaciones; ver [validation.md](../validation.md). `npm run api:validate` valida el contrato.

## Hechos del repositorio

| Fuente | Hecho relevante |
| --- | --- |
| `backend/docs/api/openapi.yaml:5966` | `/sales` admite CAJERO/ADMINISTRADOR, `from` inclusivo, `to` exclusivo sobre `soldAt`, cursor y método. |
| `backend/docs/api/openapi.yaml:6109` | `/sales/summary` devuelve `count`, `totalCents`, `cashCents`, `stripeCents`; no incluye promedio, unidades ni comparación. |
| `backend/src/modules/sales/sales.validation.ts:3` | `from`/`to` usan `z.string().datetime()` opcional; `to<=from` se rechaza. |
| `backend/src/modules/sales/sales.read.repository.ts:18` | El filtro es `s.sold_at >= from` y `s.sold_at < to`; el método se obtiene de `payments.method`. |
| `backend/src/modules/sales/sales.read.repository.ts:49` | El resumen actual agrega `sales` unidas a `payments` y no calcula unidades ni periodos anteriores. |
| `backend/src/modules/sales/sales.routes.ts:12` | `/sales` aplica `privateCashResponse` (no-store/no-referrer) y autorización de caja/admin. |
| `backend/src/middleware/authenticate.ts:17` | `authorize` permite ADMINISTRADOR aunque el rol requerido sea CAJERO/GERENTE; un endpoint con `authorize('ADMINISTRADOR')` no admite CAJERO. |
| `backend/prisma/schema.prisma:334` | `Sale` tiene uno por `orderId` y `paymentId` únicos, `totalCents` y `soldAt`. |
| `backend/prisma/schema.prisma:270` | `OrderItem` conserva `quantity`, `unitPriceCents` y `lineTotalCents`; `OrderItemOption` no debe multiplicar unidades. |
| `backend/prisma/schema.prisma:301` | `Payment.method` es CASH/STRIPE; estados PENDING/SUCCEEDED/FAILED/EXPIRED. |
| `backend/prisma/schema.prisma:385` | `Refund` es una entidad separada; no borra ni altera `Sale`. |
| `backend/src/modules/payments/payments.service.ts:39` | Una orden no se cobra si ya tiene pago exitoso o venta; la venta se crea junto al pago. |
| `backend/src/modules/cash/cash.service.ts:62` | La caja actual calcula ventas efectivo y esperado bajo lock; no es un histórico del periodo. |
| `backend/src/shared/http/serialization.ts:2` | BigInt se serializa como cadena; dinero/IDs no pasan por Number. |
| `backend/tests/integration/completion.integration.test.ts:653` | Existe evidencia de filtros, resumen completo y cursor estable de ventas. |

## Contrato propuesto

### Ruta y autorización

```http
GET /api/v1/admin/dashboard/summary?from=...Z&to=...Z[&method=CASH|STRIPE]
```

- Solo `ADMINISTRADOR`, con cookie de acceso vigente.
- `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.
- Sin body; se rechazan body y query extra.
- No modifica `/sales`, `/sales/summary`, caja ni permisos de CAJERO.

### Entradas

- `from`: obligatorio, UTC ISO 8601 terminado en `Z`.
- `to`: obligatorio, UTC ISO 8601 terminado en `Z`, estrictamente posterior.
- Intervalo `[from,to)`; máximo propuesto de 366 días absolutos.
- `method`: opcional; omitido incluye CASH y STRIPE.
- Sin cursor, límite, categoría ni zona horaria configurable. La zona de presentación es fija: `America/Tijuana`; el frontend convierte límites locales a UTC.
- `to - from` máximo: 366 × 24 h. Un día local con DST puede medir 23/25 h; no se usa un offset UTC fijo.

### Respuesta 200

```json
{
  "data": {
    "generatedAt": "2026-11-24T18:30:00.000Z",
    "currency": "MXN",
    "period": {
      "from": "2026-11-24T08:00:00.000Z",
      "to": "2026-11-25T08:00:00.000Z",
      "timeZone": "America/Tijuana",
      "previousFrom": "2026-11-23T08:00:00.000Z",
      "previousTo": "2026-11-24T08:00:00.000Z"
    },
    "totalCents": "1234500",
    "ticketCount": "42",
    "averageTicketCents": "29393",
    "unitsSold": "87",
    "paymentMix": {
      "cashCents": "800000",
      "stripeCents": "434500"
    },
    "comparison": {
      "totalCents": { "previous": "1000000", "change": "234500", "changePercent": "23.45" },
      "ticketCount": { "previous": "38", "change": "4", "changePercent": "10.53" },
      "averageTicketCents": { "previous": "26316", "change": "3077", "changePercent": "11.69" },
      "unitsSold": { "previous": "80", "change": "7", "changePercent": "8.75" }
    }
  }
}
```

Todos los importes, conteos y unidades son cadenas decimales. La interfaz solo formatea; no recalcula promedio, porcentajes ni unidades.

### Semántica de datos

- **Universo:** filas `Sale` del intervalo, unidas a su `Payment`; una venta representa un ticket. No se usan órdenes sin venta, pendientes, fallidas o expiradas.
- **Total bruto:** `SUM(Sale.totalCents)`. Es el importe histórico de la venta y **no descuenta reembolsos**; un reembolso se conserva como incidencia/entidad separada.
- **Mezcla:** suma de ventas por `Payment.method`; `cashCents + stripeCents = totalCents`.
- **Tickets:** `COUNT(Sale)`, no `COUNT(OrderItem)` ni número de órdenes.
- **Unidades:** `SUM(OrderItem.quantity)` de las ventas filtradas. Se une una sola vez a `OrderItem`; `OrderItemOption` no multiplica la cantidad. No se descuentan unidades por reembolsos.
- **Promedio:** `ROUND(totalCents / ticketCount)` a centavo entero, mitades hacia arriba; `0` cuando no hay tickets. No es promedio de promedios ni de filas paginadas. La comparación de promedio usa esos valores enteros ya redondeados en ambos periodos, para que el cambio corresponda a lo mostrado.
- **Periodo anterior:** `[from - (to-from), from)`. Igual duración absoluta inmediatamente anterior; se devuelven `previousFrom`/`previousTo` para que la interfaz etiquete el intervalo efectivo. No se infiere del listado de ventas.
- **Cambio absoluto:** `current - previous` para cada métrica.
- **Cambio porcentual:** `(current - previous) / previous × 100`, redondeado a dos decimales, mitades hacia arriba; `null` si `previous = 0`. No se emite `Infinity`, `NaN`, `-0.00` ni división en frontend.
- **Consistencia:** todos los valores de una respuesta deben provenir de una sola lectura agregada/transacción coherente; no se combinan páginas ni consultas N+1. `generatedAt` identifica el instante de generación. No se promete igualdad entre respuestas tomadas en instantes distintos con ventas nuevas.
- **Caja:** no forma parte de este DTO. Se consulta con `/cash-sessions/current`; cambiar `from/to` no cambia su significado ni debe convertir un fallo de caja en «cerrada».

## Decisiones aprobadas

El responsable aceptó la propuesta completa el 2026-11-24:

1. **Rango obligatorio y máximo 366 días** para evitar consultas sin límite.
2. **Periodo anterior por duración absoluta igual** (no por días locales recalculados); aceptar que un cambio DST pueda desplazar una hora la etiqueta local del periodo anterior.
3. **Promedio en backend** con redondeo al centavo y mitades hacia arriba; cero sin tickets.
4. **Unidades = suma de cantidades de líneas**, sin multiplicar por opciones ni descontar reembolsos.
5. **Ventas brutas:** reembolsos no restan del resumen, coherente con reglas actuales.
6. **Porcentaje como cadena con dos decimales o null**; la UI muestra «Sin comparación» si es null.
7. **Solo ADMINISTRADOR** en este endpoint; caja sigue en su endpoint existente y el resumen no incluye caja.
8. **Ruta y nombres del DTO** de este documento, incluido `x-contract-status: approved-2026-11-24` en OpenAPI.

Decisiones que este contrato **no** resuelve y no deben implementarse por extensión: rango de fechas concreto de los presets de UI, frecuencia de actualización, rankings/series/categorías, CSV, comparación de días locales con DST, o columnas adicionales.

## Matriz de escenarios

| ID | Escenario | Resultado exigido |
| --- | --- | --- |
| C-01 | Periodo con ventas CASH y STRIPE | Totales, tickets, promedio, unidades y mezcla conciliables con DB; suma de mezcla = total. |
| C-02 | Filtro `method=CASH` o `STRIPE` | Solo ventas del método; comparación usa el mismo método en ambos periodos. |
| C-03 | Sin ventas en el periodo | Ceros en total/tickets/promedio/unidades/mezcla; comparación con base cero produce `changePercent: null` y no error. |
| C-04 | Periodo anterior sin ventas, actual con ventas | `previous=0`, `change=current`, `changePercent=null`. |
| C-05 | Venta con varias líneas y opciones | Unidades suman `quantity` una vez; opciones no multiplican; tickets cuentan la venta una vez. |
| C-06 | Orden pendiente/fallida/expirada | No aparece ni suma. |
| C-07 | Venta con reembolso registrado | La venta y su importe bruto permanecen; no se resta el reembolso. |
| C-08 | `from >= to` o fechas inválidas/no UTC | 400 `VALIDATION_ERROR`; no consulta. |
| C-09 | Rango > 366 días | 400 `VALIDATION_ERROR`; no trunca ni devuelve parcial. |
| C-10 | Query/body extra, `limit`, `cursor`, `category` | 400; no se ignora silenciosamente. |
| C-11 | Sin sesión / CLIENTE / CAJERO / PREPARACION | 401/403; no se ejecuta agregación ni se exponen datos. |
| C-12 | ADMINISTRADOR con sesión válida | 200, no-store/no-referrer, DTO conforme. |
| C-13 | Borde de medianoche Tijuana y cambio DST | Límites UTC efectivos, sin duplicar/perder ventas; periodo anterior de igual duración. |
| C-14 | Importes grandes y cantidades grandes | Se preservan como cadenas; sin `Number`, desbordamiento ni notación científica. |
| C-15 | Promedio no exacto / porcentaje no exacto | Redondeo documentado a centavo y a dos decimales; sin `NaN/Infinity`. |
| C-16 | Fallo de BD/servicio | 503 saneado; no ceros ni éxito inventado. |
| C-17 | Cambio de ventas entre dos llamadas | Cada respuesta es internamente coherente; no se exige igualdad entre instantes distintos. |

## Verificación prevista para aceptación

- `npm run api:validate` en `backend/` (ya ejecutado sobre la propuesta).
- Revisión de OpenAPI por backend y frontend.
- Tras aceptar, `TASK-DA-E1-01` debe añadir pruebas HTTP/BD de C-01…C-17 y conciliar con `/sales/summary` usando dataset estable.
- Pruebas frontend de contrato (TASK-DA-E1-04) deben rechazar DTO no verificable y no convertir importes/IDs a `Number`.
- No se considera aceptada la tarea por pasar solo la validación documental.

## Checklist de aceptación

- [x] Confirmar ruta/método y nombres del DTO.
- [x] Confirmar rango obligatorio/máximo 366 días.
- [x] Confirmar periodo anterior por duración absoluta y tratamiento DST.
- [x] Confirmar promedio/redondeo y porcentaje `null` con base cero.
- [x] Confirmar unidades y ventas brutas/reembolsos.
- [x] Confirmar que caja queda fuera del DTO y solo ADMINISTRADOR accede.
- [x] Aprobado por el responsable el 2026-11-24; actualizado `x-contract-status`.

## Registro de verificación documental

- `npm run api:validate` en `backend/`: OpenAPI válido, 66 ejemplos conformes.
- `npx --no-install prettier --check docs/api/openapi.yaml`: correcto.
- `git diff --check`: correcto.
- Revisión técnica independiente: pendiente de revisor nominado; no se declara ejecutada.
