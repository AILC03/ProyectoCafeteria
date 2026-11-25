# Contrato E2 aceptado — Ranking de productos

- Estado: **CONTRATO DOCUMENTAL E2-04 ACEPTADO por el responsable el 2026-11-25** con el paquete de decisiones D01–D15 aceptado el 2026-11-25. No autoriza por sí mismo runtime, UI, CSV ni cambios de esquema; E2-05/06/07 requieren sus propias tareas, verificación y revisión. Commit pendiente de autorización.
- Tarea: `TASK-DA-E2-04`. Autor: `dashboard-backend-implementer`; verificación: `dashboard-verifier`; revisión independiente: `dashboard-reviewer`. Evidencia documental en [validation.md](../validation.md).
- Fuentes: [spec](../spec.md) (RF-13, H5, E2), [plan](../plan.md), [tasks](../tasks.md), [contrato E1](./E1-summary-contract.md), [contrato de series](./E2-series-contract.md), [OpenAPI](../../../../../backend/docs/api/openapi.yaml), [reglas de negocio](../../../../../backend/docs/business-rules.md), [permisos](../../../../../backend/docs/permissions.md), [esquema Prisma](../../../../../backend/prisma/schema.prisma) y los módulos `sales`/`catalog` vecinos.
- Alcance documental: contrato aceptado de ruta, entrada estricta, DTO cerrado, semántica de datos, desempates, matriz de escenarios, límites y errores. Sin SQL ejecutable, migraciones, dependencias, proveedores, secretos ni commit.

> Este contrato fue **aceptado por el responsable el 2026-11-25** y no implementa runtime ni cierra E2. E2-03 cerró la capacidad de series; E2-04 acepta el contrato de ranking como base para E2-05/06/07. La aceptación no autoriza commit, push ni despliegue, y las decisiones que se reservaron para E2-05 (por ejemplo, adopción futura del filtro defensivo D11) no se dan por implementadas.

## Hechos corroborados

| Fuente | Hecho relevante |
| --- | --- |
| `backend/prisma/schema.prisma` (`Sale`) | `Sale` es la venta pagada, una por `orderId`/`paymentId`, con `totalCents` y `soldAt Timestamptz(6)`. |
| `backend/prisma/schema.prisma` (`Payment`) | `Payment.method` es `CASH` o `STRIPE`; los estados son `PENDING`, `SUCCEEDED`, `FAILED` y `EXPIRED`. Existe un único pago exitoso por orden/venta según BR-ORD-003/BR-PAY-002. |
| `backend/prisma/schema.prisma` (`OrderItem`) | Conserva `quantity`, `unitPriceCents`, `lineTotalCents` y `productNameSnapshot`. |
| `backend/prisma/schema.prisma` (`OrderItemOption`) | Los recargos/opciones se conservan aparte; ya están incluidos en `lineTotalCents` y **no se deben unir** para sumar importe. |
| `backend/prisma/schema.prisma` (`Refund`) | Es una entidad separada; un reembolso no borra ni reduce la venta registrada. |
| `backend/prisma/schema.prisma` (`Product`) | **No tiene `isActive`**; usa `deletedAt` e `isAvailable`. `backend/src/modules/catalog/admin.service.ts` marca `deletedAt` y `isAvailable=false` en la baja lógica. |
| `backend/prisma/schema.prisma` (`Category`) | Tiene `isActive` y `deletedAt`. La categoría no forma parte de este contrato. |
| `backend/prisma/schema.prisma` (`OrderItem`) | No existe índice por `order_items.product_id`; solo `order_items_order_id_idx`. No se añade índice en esta tarea. |
| `backend/src/modules/sales/sales.read.repository.ts` | Las lecturas existentes filtran `s.sold_at >= from` y `< to`, unen `payments` para el método y agregan en una sola consulta. |
| `backend/src/modules/sales/sales.routes.ts` | Las rutas de dashboard usan `privateCashResponse` y `authorize('ADMINISTRADOR')`; no hay módulo dashboard preexistente. |
| `backend/src/shared/http/serialization.ts` | `BigInt` se serializa como cadena; IDs/importes no deben pasar por `Number`. |
| `backend/docs/api/openapi.yaml` | `/api/v1/admin/dashboard/summary` y `/api/v1/admin/dashboard/sales-series` son contratos aceptados; este contrato aceptado es aditivo y no los modifica. |

Nombres de producto **no son únicos**. La identidad de agrupación es `productId`; el nombre es solo presentación y puede cambiar con el tiempo. Un mismo nombre puede corresponder a productos distintos.

## Ruta aceptada y autorización

```http
GET /api/v1/admin/dashboard/product-ranking?from=...Z&to=...Z&metric=units|amount&direction=top|bottom[&top=5|10|20][&method=CASH|STRIPE]
```

- **Contrato aceptado**: solo `ADMINISTRADOR` con cookie de acceso vigente; sin sesión `401`; cualquier rol distinto de `ADMINISTRADOR` (p. ej. `CLIENTE`, `CAJERO`, `PREPARACION`, `GERENTE`) `403`, sin consulta de agregados. Coherente con `authorize('ADMINISTRADOR')`.
- Middleware privado existente: `Cache-Control: no-store` y `Referrer-Policy: no-referrer` en la respuesta y en errores que lo atraviesen. Los rechazos globales previos (Origin, parsing, 413, 429) **no garantizan** esas cabeceras con el orden actual; E2-05 debe verificarlo y el límite queda documentado. No se promete cobertura global ni se cambia middleware aquí.
- GET de lectura: sin CSRF nuevo, sin ampliar permisos de `/api/v1/sales` y sin body. Cualquier body no vacío se rechaza.
- No se modifica `/api/v1/sales`, `/api/v1/sales/summary`, `/api/v1/admin/dashboard/summary` ni `/api/v1/admin/dashboard/sales-series`.

## Entrada estricta aceptada

| Parámetro | Regla aceptada |
| --- | --- |
| `from` | Obligatorio, escalar único, fecha real UTC terminada en `Z`, inicio inclusivo. Forma `YYYY-MM-DDTHH:mm:ss[.S|.SS|.SSS]Z`; años 2000–9999, sin offsets, sin hora 24 ni fechas imposibles. Mínimo `2000-01-01T08:00:00.000Z`. Un `from` anterior devuelve 400 sin truncar. |
| `to` | Obligatorio, escalar único, fecha real UTC `Z`, fin exclusivo, estrictamente mayor que `from`. Mismo formato y mínimo de dominio. |
| `metric` | Obligatorio en este contrato: `units` o `amount`. Sin default. |
| `direction` | Obligatorio en este contrato: `top` o `bottom`. `top` descendente; `bottom` ascendente. |
| `top` | Opcional; default aceptado 5. Forma léxica exacta: solo `5`, `10` o `20`; se rechazan `05`, `+5`, `5.0`, decimales, signos, texto y otros enteros (`0`, negativos, `4`, `21`). No es cursor ni paginación. |
| `method` | Opcional: `CASH` o `STRIPE`. Omitido incluye ambos y devuelve `method: null`. Vacío o `null` literal inválidos. |
| Extras | Se rechazan `category`, `cursor`, `limit`, `timeZone`, `order`, `sort`, `includeZeroSales` y cualquier otro parámetro o body. No se ignoran silenciosamente. |
| Repetidos/arrays | Se rechazan parámetros repetidos —aunque tengan el mismo valor—, arrays, objetos, variantes con corchetes y valores vacíos. |

- Intervalo `[from,to)` UTC; la zona de presentación es fija `America/Tijuana`, sin offset UTC-8 fijo. El frontend convierte límites locales a UTC.
- Precisión de entrada aceptada: hasta milisegundos (0–3 decimales). Cualquier fracción de más de 3 decimales (incluidas 4–6) se rechaza. `from`/`to` se comparan de forma exacta sobre `timestamptz`; `sold_at` conserva su precisión PostgreSQL de microsegundos y no se trunca ni se convierten filas a `Date` para agrupar. El límite `to − 1 µs` debe probarse en E2-05.
- Límite aceptado: `to - from` máximo **366 días absolutos**. Es un tope de trabajo, no un SLA medido; se rechaza 400 sin truncar, ajustar ni devolver resultados parciales.
- Cualquier límite fuera del dominio mínimo/máximo o una fecha imposible produce 400; el patrón regex no sustituye la validación semántica.

## DTO cerrado aceptado

La respuesta 200 es un objeto cerrado con envoltura `{ data }`:

| Campo | Regla aceptada |
| --- | --- |
| `generatedAt` | UTC con tres decimales; instante de generación. **No es token de snapshot** entre peticiones. |
| `currency` | `MXN`. |
| `period` | Objeto cerrado `{from,to,timeZone}`; límites UTC normalizados y zona fija `America/Tijuana`. |
| `method` | `null`, `CASH` o `STRIPE`; eco del filtro efectivo. |
| `metric` | `units` o `amount`; eco de la entrada. |
| `direction` | `top` o `bottom`; eco de la entrada. |
| `top` | String decimal `"5"`, `"10"` o `"20"`; eco del top efectivo, incluido el default. |
| `matchedProductCount` | String decimal exacto; número de productos distintos con movimiento que cumplen el filtro, **antes** del corte top N. |
| `matchedTotals` | Objeto cerrado `{unitsSold,totalCents}` con strings decimales; agregados de **todo** el conjunto filtrado antes del corte, no solo de `items`. |
| `truncated` | Booleano; `true` si `matchedProductCount` es mayor que `items.length`, `false` si se devolvió el conjunto completo. |
| `items` | Array de hasta `top` elementos. Cero resultados válidos producen `200` con `[]`, no error. |
| `items[].position` | Opcional en el contrato aceptado: string decimal 1-based, consecutivo si está presente. No es un ID. Hacerlo obligatorio requiere decisión propia. |
| `items[].productId` | String decimal exacto, positivo. Agrupación y orden final por ID numérico, nunca por nombre. |
| `items[].name` | Nombre de presentación según la regla de bajas/nombre; no es único. |
| `items[].nameSource` | Opcional en el contrato aceptado: `current` o `snapshot`; origen determinista del nombre. Hacerlo obligatorio requiere decisión propia. |
| `items[].unitsSold` | String decimal exacto; unidades del producto. |
| `items[].totalCents` | String decimal exacto; importe histórico bruto del producto en centavos MXN. |

- Todos los IDs, conteos e importes son strings decimales canónicos `^(0|[1-9][0-9]*)$` (los IDs positivos no tienen cero inicial). Sin `Number`, exponentes, fracciones ni límite injustificado de 19 dígitos.
- `top` es un conteo de presentación echo; no se usa para calcular importes/unidades en frontend.
- Sin PII: el DTO no incluye cliente, correo, teléfono, ticket, pago ni datos del personal.

### Ejemplo canónico del contrato aceptado (no ejecución HTTP)

```json
{
  "data": {
    "generatedAt": "2026-11-24T18:30:00.000Z",
    "currency": "MXN",
    "period": {
      "from": "2026-11-24T08:00:00.000Z",
      "to": "2026-11-25T08:00:00.000Z",
      "timeZone": "America/Tijuana"
    },
    "method": null,
    "metric": "units",
    "direction": "top",
    "top": "5",
    "matchedProductCount": "3",
    "matchedTotals": {
      "unitsSold": "12",
      "totalCents": "34500"
    },
    "truncated": false,
    "items": [
      {
        "position": "1",
        "productId": "10",
        "name": "Latte",
        "nameSource": "current",
        "unitsSold": "6",
        "totalCents": "21000"
      },
      {
        "position": "2",
        "productId": "11",
        "name": "Capuchino",
        "nameSource": "current",
        "unitsSold": "3",
        "totalCents": "8500"
      },
      {
        "position": "3",
        "productId": "12",
        "name": "Americano",
        "nameSource": "snapshot",
        "unitsSold": "3",
        "totalCents": "5000"
      }
    ]
  }
}
```

El ejemplo es aritmético y documental: `6+3+3=12` unidades y `21000+8500+5000=34500` centavos. Con `metric=units` y `direction=top`, el orden es descendente por unidades; el empate de 3 se resuelve por importe descendente (8500 antes de 5000) y luego por nombre/ID. No representa una consulta HTTP ejecutada ni un dataset sembrado.

## Vectores documentales de escenarios (no ejecución HTTP)

Vectores aritméticos del contrato; **no** son respuestas HTTP, datasets sembrados ni pruebas ejecutadas. Los fragmentos JSON omiten la envoltura `{data}` y los campos comunes (`generatedAt`, `currency`, `period`) para centrarse en la aritmética; no deben copiarse como respuesta completa. La verificación real corresponde a E2-05/E2-07.

### V-A — `metric=amount` + `direction=top` con importes históricos

Dataset documental: P101 = 2 unidades / 9000 centavos; P102 = 5 unidades / 5000 centavos; P103 = 1 unidad / 12000 centavos.

```json
{
  "method": null,
  "metric": "amount",
  "direction": "top",
  "top": "5",
  "matchedProductCount": "3",
  "matchedTotals": {"unitsSold": "8", "totalCents": "26000"},
  "truncated": false,
  "items": [
    {"position": "1", "productId": "103", "unitsSold": "1", "totalCents": "12000"},
    {"position": "2", "productId": "101", "unitsSold": "2", "totalCents": "9000"},
    {"position": "3", "productId": "102", "unitsSold": "5", "totalCents": "5000"}
  ]
}
```

Orden por `lineTotalCents` histórico: `12000 > 9000 > 5000`; totales `1+2+5=8` unidades y `12000+9000+5000=26000` centavos. No usa precio actual.

### V-B — `direction=bottom` en unidades e importe (incluye unidades >0 e importe 0)

Dataset documental: P201 = 1 unidad / **0 centavos** (producto gratuito); P202 = 2 unidades / 3000 centavos; P203 = 7 unidades / 5000 centavos.

Con `metric=units`, `direction=bottom`, `top=5`: orden P201 (1), P202 (2), P203 (7); `matchedTotals` = `{"unitsSold":"10","totalCents":"8000"}`; `matchedProductCount:"3"`; `truncated:false`.

Con `metric=amount`, `direction=bottom`, `top=5`: orden P201 (0), P202 (3000), P203 (5000); los mismos totales y conteo. P201 se incluye porque tuvo unidades >0 aunque su importe sea 0; solo se excluye un producto sin movimiento (`unitsSold=0`), no cualquier métrica 0. D05 aceptada en el paquete 2026-11-25.

### V-C — `top=10`, `top=20` y top mayor que el conjunto

Dataset documental: 12 productos con movimiento, producto `i` (1–12) con `unitsSold=i` y `totalCents=100*i`. Totales del conjunto: `1+…+12=78` unidades y `100*(1+…+12)=7800` centavos.

- `metric=units`, `direction=top`, `top=10`: 10 ítems (productos 12…3), `matchedProductCount:"12"`, `matchedTotals` completos `78`/`7800`, `truncated:true`.
- `metric=units`, `direction=top`, `top=20`: los 12 ítems, `matchedProductCount:"12"`, `truncated:false`; el conjunto no se rellena con ceros.

### V-D — Cero resultados

```json
{
  "metric": "units",
  "direction": "top",
  "top": "5",
  "matchedProductCount": "0",
  "matchedTotals": {"unitsSold": "0", "totalCents": "0"},
  "truncated": false,
  "items": []
}
```

Estado `200`; no 404, no productos ficticios ni ceros de relleno.

### V-E — Enteros mayores que `Number.MAX_SAFE_INTEGER`

Dos ítems documentales, no dos ventas necesariamente sembrables:

```json
{
  "metric": "amount",
  "direction": "top",
  "top": "5",
  "matchedProductCount": "2",
  "matchedTotals": {"unitsSold": "9007199254740995", "totalCents": "9007199254740999"},
  "truncated": false,
  "items": [
    {"position": "1", "productId": "9007199254740993", "unitsSold": "9007199254740993", "totalCents": "9007199254740995"},
    {"position": "2", "productId": "9007199254740994", "unitsSold": "2", "totalCents": "4"}
  ]
}
```

Sumas exactas como strings: unidades `9007199254740993+2=9007199254740995`; centavos `9007199254740995+4=9007199254740999`. Ningún valor pasa por `Number`; el orden usa el valor entero exacto del ID/métrica.

### V-F — Entradas inválidas, roles y coste (exigencias de contrato, no HTTP ejecutado)

Los escenarios de éxito/datos de la matriz (R01–R04, R06, R08–R16, R18 y R21) no producen 400/401/403; sus resultados se resumen en V-A–V-E y en la matriz. Los negativos se agrupan así:

| Vector | Condición | Resultado exigido |
| --- | --- | --- |
| R05 / R07 | `top` con forma `05`, `+5`, `5.0`, `4`, `0`, `21`, decimal, signo o texto | `400 VALIDATION_ERROR`, sin consulta |
| R07 / R17 | Falta `from`/`to`; fecha imposible; `from>=to`; cualquier fracción de más de 3 decimales (incluidas 4–6); `from` anterior a `2000-01-01T08:00:00.000Z`; rango >366 días; extras/repetidos/arrays/vacíos/body no vacío | `400 VALIDATION_ERROR`; sin truncar, normalizar ni consultar |
| R17 | Venta en `from` y en `to−1 µs`; venta en `to` | Incluir `from` y `to−1 µs`; excluir `to`; conservar microsegundos de `sold_at` (comprobar en E2-05) |
| R19 | Sin sesión vigente | `401 UNAUTHENTICATED` |
| R19 | Cualquier rol distinto de `ADMINISTRADOR` (CLIENTE/CAJERO/PREPARACION/GERENTE) | `403 FORBIDDEN`, sin agregación |
| R20 | 413, 429, 500 inesperado, 503 de dependencia reconocida | Problem Details saneados; sin ceros/fallback |
| R22 | Coste con volumen, índice ausente y resolución de nombres | **No medido** en esta tarea; medir en E2-05 sin añadir índices implícitos |

## Semántica de datos aceptada (C-DATA)

1. **Universo:** ventas pagadas del intervalo `[from,to)` y método efectivo. `Sale` es la fuente de venta; su invariante es que nace de un pago exitoso, por lo que el contrato aceptado **no aplica por defecto** el filtro defensivo `p.status = 'SUCCEEDED'`. No se incluyen órdenes sin venta (pendientes, fallidas o expiradas) ni intentos de pago. Si se quisiera un filtro defensivo, debería aplicarse el mismo predicado en el resumen/`/api/v1/sales/summary` y probarse con una fila inconsistente; su adopción futura requiere decisión propia; D11 quedó aceptada sin filtro por defecto el 2026-11-25.
2. **Agrupación:** por `OrderItem.productId`, nunca por `productNameSnapshot` ni por nombre actual. Nombres iguales de productos distintos no se fusionan.
3. **Unidades:** `SUM(OrderItem.quantity)` de las líneas de esas ventas. No se multiplica por opciones, pagos, intentos ni refunds.
4. **Importe:** `SUM(OrderItem.lineTotalCents)` histórico de las líneas. No se usa `Product.basePriceCents` ni `OrderItem.unitPriceCents` actual como sustituto. `OrderItemOption` ya está incluido en `lineTotalCents`; no se une.
5. **Bruto:** no se resta `Refund`; un reembolso es una entidad separada y no elimina la venta. No se une `refunds` para ajustar unidades o importes.
6. **Método:** se obtiene de `Payment.method` mediante `Sale.paymentId`; no se infiere del nombre del producto ni de la orden.
7. **Conjunto completo:** se agrega todo el conjunto filtrado antes de ordenar y recortar a `top`. No se calcula desde una página de `/api/v1/sales`, desde `limit`/`cursor` ni con una llamada por orden.
8. **Sin doble conteo:** una venta tiene una sola `Sale`; cada línea contribuye una vez. No se unen `OrderItemOption`, `PaymentEvent`, `PaymentIncident` ni reintentos. Sin N+1.
9. **Consistencia:** `matchedProductCount`, `matchedTotals` e `items` provienen de una lectura/snapshot coherente. En un dataset estable, `matchedTotals` debe conciliar con el resumen completo del mismo periodo/método: `totalCents` con `Sale.totalCents` (suma de líneas) y `unitsSold` con `SUM(quantity)`. No se exige igualdad entre respuestas tomadas en instantes distintos con ventas nuevas; `generatedAt` no fija un snapshot compartido.
10. **Cero:** si no hay productos con movimiento para el filtro, `items: []`, `matchedProductCount: "0"`, `matchedTotals` en `"0"` y `truncated: false`, con 200. No se inventan productos ni ceros de relleno.

## Más/menos, corte y orden determinista

- `top`: productos ordenados por la métrica seleccionada de mayor a menor.
- `bottom`: productos ordenados por la métrica seleccionada de menor a mayor, **excluyendo productos sin movimiento** (`unitsSold = 0`). Un producto sin movimiento no se devuelve como «menos vendido»; la lista separada de activos sin movimiento es el objeto de E2-08, no de este contrato. Un producto con unidades >0 pero importe 0 (por ejemplo, precio gratuito) sí tuvo movimiento: con `metric=amount` puede aparecer al final, y con `metric=units` se ordena por sus unidades. La definición de «cero» por métrica quedó aceptada en D05 el 2026-11-25.
- Si `top` supera el número de productos con movimiento, se devuelven todos, sin completar con ceros ni con productos sin ventas. Ejemplo: `top=10`, 3 productos con movimiento → 3 items, `truncated=false`.
- Si hay más productos que `top`, se devuelve exactamente `top` y `truncated=true`; `matchedProductCount`/`matchedTotals` siguen describiendo el conjunto completo anterior al corte.

### Desempates aceptados — D07

Para que el orden sea repetible:

1. Métrica primaria (`units` o `amount`) en la dirección solicitada.
2. Métrica secundaria (la otra) en la **misma** dirección solicitada.
3. `name` ascendente con comparación byte a byte UTF-8 `COLLATE "C"`, sensible a mayúsculas y sin depender de la configuración regional de la base; colación aceptada en D07 el 2026-11-25.
4. `productId` numérico ascendente como desempate final, usando el valor entero exacto (no comparación lexicográfica de strings).

La combinación de los cuatro criterios debe ser total para el conjunto devuelto; dos ejecuciones sobre el mismo dataset y filtros deben producir el mismo orden. D07 acepta la métrica secundaria en la misma dirección y el nombre ascendente con `COLLATE "C"`; su implementación y prueba corresponden a E2-05/E2-07.

## Inactivos, bajas y nombre aceptado

- **Universo de ranking:** incluir productos con movimiento en el periodo aunque hoy estén dados de baja (`deletedAt IS NOT NULL`) o no estén disponibles (`isAvailable=false`). Excluirlos rompería la conciliación con ventas históricas; `Product` **no tiene `isActive`** y no se debe inventar.
- **Nombre:** si `Product.deletedAt IS NULL`, usar el nombre actual (`nameSource: "current"`). Si está dado de baja, usar el `productNameSnapshot` de la línea más reciente del producto en el conjunto filtrado, ordenando por `Sale.soldAt DESC, OrderItem.id DESC` (`nameSource: "snapshot"`). `productNameSnapshot` es no nulo en el esquema; aun así, si una baja no tuviera snapshot resoluble, el contrato aceptado deja como decisión propia el rechazo explícito o fallback determinista (D08), sin inventar un nombre.
- **Resolución de nombres:** la resolución de nombres, incluido el snapshot de bajas, debe hacerse en **una sola lectura/CTE o `LATERAL`**, nunca con una consulta por producto. Su coste se mide en E2-05.
- **Advertencia:** el nombre actual puede haber cambiado desde la venta; eso no altera el importe histórico ni la identidad `productId`. El universo de productos activos y la lista de «sin movimiento» pertenecen a E2-08 y no se infieren de este ranking.
- No filtrar por categoría, `isAvailable` ni `Category.isActive`: no forman parte de la entrada aceptada y cambiarían el denominador. Cualquier filtro de categoría requiere contrato propio.

## Metadatos, límites y consistencia

- `matchedProductCount` y `matchedTotals` se calculan sobre el conjunto completo después de aplicar rango/método/universo con movimiento, antes del corte top N. No son totales de la página ni de los items visibles.
- `truncated` se deriva de la comparación anterior; no se usa para ocultar un error de agregación.
- `generatedAt` es el instante de generación y no un token de snapshot. `period` refleja los límites efectivos normalizados.
- Una sola lectura/transacción coherente en backend; sin acumulación de páginas, sin consultas por producto y sin N+1. La resolución de nombres usa una sola lectura/CTE o `LATERAL`. Se medirá el coste con volumen autorizado en E2-05/E2-07; no se promete latencia ni se añaden índices/migraciones por este contrato.
- Límite de rango aceptado: 366 días absolutos. El máximo de `top` es 20; no existe cursor en este endpoint.
- La falta de índice por `order_items.product_id` es un riesgo de coste conocido. Cualquier índice o cambio de esquema requiere análisis, migración y aprobación propios; no se autoriza por este contrato.

## Autorización, errores y privacidad

- Solo `ADMINISTRADOR`; `authenticate` + `authorize` existentes. Must-change-PIN y Origin conservan sus códigos actuales.
- `Cache-Control: no-store`, `Referrer-Policy: no-referrer` dentro del middleware privado de ruta. Los rechazos globales anteriores (incluidos 413/429) **no garantizan** cabeceras privadas con el orden actual; E2-05 debe verificarlo. Se documenta el límite, no se modifica el orden de middleware.
- Errores `application/problem+json` con `type,title,status,detail,instance,code,requestId` y `errors` de validación cuando corresponda; sin stack, SQL, secretos ni PII.
- Códigos del contrato aceptado: `400 VALIDATION_ERROR` (entrada/rango/body), `401 UNAUTHENTICATED`, `403 FORBIDDEN` (roles) / `PIN_CHANGE_REQUIRED` / `ORIGIN_NOT_ALLOWED`, `413 PAYLOAD_TOO_LARGE` global, `429 RATE_LIMITED`, `500 INTERNAL_ERROR` y `503 DEPENDENCY_UNAVAILABLE` solo para fallos reconocidos por `problemHandler`. No se promete 503 para todo fallo ni éxito con ceros inventados.
- No se devuelven datos de cliente, pago, ticket, personal ni secretos. Los nombres de producto son nombres de catálogo, no PII.
- En frontend futuro se reutilizarán cliente HTTP y sesión única; 401 delega en el gestor común y 429 se informa sin bucle. Un fallo de ranking no debe borrar otros paneles correctos ni sustituirse por ceros.

## Matriz de escenarios del contrato aceptado (R01–R22)

Todos los resultados son **exigencias de contrato**, no pruebas ejecutadas. La evidencia futura se reparte entre E2-05 (backend HTTP/BD), E2-06 (frontend/MSW) y E2-07 (aceptación real). No se atribuye ninguna prueba a esta tarea documental.

| ID | RF/criterio | Escenario | Resultado exigido | Evidencia futura |
| --- | --- | --- | --- | --- |
| R01 | RF-13 | `metric=units`, `direction=top`, default `top=5`, método omitido | Orden descendente por unidades; `method:null`; top efectivo `"5"`; agregado completo antes del corte | E2-05, E2-06, E2-07 |
| R02 | RF-13 | `metric=amount`, `direction=top` | Orden descendente por `lineTotalCents` histórico; unidades como secundaria; no precio actual | E2-05, E2-07 |
| R03 | RF-13 | `metric=units`, `direction=bottom` | Orden ascendente; productos sin movimiento (`unitsSold=0`) excluidos; no ceros de relleno | E2-05, E2-06 |
| R04 | RF-13 | `metric=amount`, `direction=bottom` | Orden ascendente por importe histórico; excluye productos sin movimiento (`unitsSold=0`), no necesariamente importe 0 si hubo unidades; desempates deterministas; D05 aceptada el 2026-11-25 | E2-05, E2-07 |
| R05 | RF-13 | `top` omitido; `top=5`, `10`, `20`; formas `05`, `+5`, `5.0`, `4`, `0`, `21`, decimales, signos y texto | Default 5; solo la forma léxica `5`/`10`/`20` es válida y devuelve hasta ese máximo; cualquier otra 400 sin consulta | E2-05 |
| R06 | RF-03/13 | `method` omitido, `CASH`, `STRIPE` | Mixto/null incluye ambos; cada método concilia su subconjunto; no se mezclan filtros ni se duplica una venta | E2-05, E2-07 |
| R07 | RF-03/19 | Faltan `from`/`to`, fechas imposibles, `from>=to`, cualquier fracción de más de 3 decimales (incluidas 4–6), año anterior a 2000, rango >366 días, extras/repetidos/arrays/body | 400 `VALIDATION_ERROR`; sin truncar, normalizar ni consultar; body no vacío rechazado | E2-05, E2-06 |
| R08 | RF-13, RNF-02 | Empate exacto de métrica primaria y secundaria entre productos | Nombre con colación explícita y, si persiste, `productId` numérico ascendente; orden repetible | E2-05, E2-07 |
| R09 | RF-13 | Dos productos distintos con el mismo nombre; nombres largos/acentos | Se separan por `productId`; no se agrupan por nombre; strings exactos | E2-05, E2-06 |
| R10 | RF-13 | Producto renombrado y cambio de precio actual | Importe histórico de `lineTotalCents`; nombre actual solo si no está de baja; el precio actual no altera importes | E2-05, E2-07 |
| R11 | RF-13 | Producto con ventas y baja lógica; `deletedAt`/`isAvailable` actuales | Se incluye para conciliar; nombre snapshot de la línea más reciente por `soldAt DESC, orderItem.id DESC`; no se usa `Product.isActive` | E2-05, E2-07 |
| R12 | RF-13 | Líneas con opciones, varias cantidades y opciones con recargo | Unidades = `quantity` una vez; importe = `lineTotalCents`; no se une `OrderItemOption` ni se multiplica | E2-05 |
| R13 | RF-13 | Órdenes sin `Sale`, pagos `PENDING`/`FAILED`/`EXPIRED` sin `Sale`, intentos múltiples y fila inconsistente `Sale` sin pago `SUCCEEDED` | Las órdenes/pagos sin `Sale` no aparecen ni suman. Una fila inconsistente `Sale` sin pago `SUCCEEDED` **se incluye con el default sin filtro** y solo se excluiría si se adopta el filtro defensivo con el mismo predicado en resumen/`/api/v1/sales/summary`; D11 aceptada sin filtro por defecto; adopción futura requiere decisión propia | E2-05, E2-07 |
| R14 | RF-13 | Reembolso total/parcial sobre una venta | La venta y sus unidades/importe permanecen brutos; no se resta `Refund` | E2-05, E2-07 |
| R15 | RF-13 | Más productos con movimiento que `top` y más que una página de `/api/v1/sales` | Se agrega el conjunto completo; `matchedProductCount`/`matchedTotals` previos al corte; `truncated=true`; no se infiere de páginas | E2-05, E2-07 |
| R16 | RNF-02 | Agregados/IDs mayores que `Number.MAX_SAFE_INTEGER` | Strings decimales exactos; no `Number`; suma y orden por ID numérico exactos | E2-05 |
| R17 | RF-03 | Venta en `from`, justo antes, en `to` y en `to−1 µs`; mínimo exacto; máximo y +1 ms | Incluye `from` y `to−1 µs`; excluye `to` y anteriores; 400 fuera de dominio/rango; microsegundos de fila intactos | E2-05, E2-07 |
| R18 | RF-13 | Cero ventas; método sin ventas; `bottom` sin productos con movimiento | 200 con `items: []`, conteos/totales `"0"`, `truncated:false`; no 404 ni ceros ficticios | E2-05, E2-06 |
| R19 | RF-01/19 | Sin sesión; cualquier rol distinto de ADMINISTRADOR (CLIENTE/CAJERO/PREPARACION/GERENTE); admin válido; cabeceras | 401/403/200; denegados sin agregación; `no-store`/`no-referrer` en el alcance del middleware y verificación de rechazos globales en E2-05; sin CSRF nuevo | E2-05, E2-07 |
| R20 | RF-19/RNF-06 | 413, 429, 500 inesperado y 503 de dependencia reconocida | Problem Details saneados; sin ceros/fallback; frontend conserva paneles y sesión única; sin bucle | E2-05, E2-06 |
| R21 | RF-13/RNF-06 | Mismo dataset y filtros frente a resumen completo/`sales/summary` | `matchedTotals` y unidades concilian; no joins multiplicadores, páginas ni N+1; `generatedAt` no token | E2-05, E2-07 |
| R22 | RNF-06 | Volumen representativo, filtros rápidos, aborto y coste | Sin N+1; respuesta internamente coherente; coste medido sin índices implícitos; frontend descarta respuesta antigua | E2-05, E2-06, E2-07 |

## Decisiones aceptadas — 2026-11-25

D01–D15 fueron **aceptadas por el responsable en el paquete del 2026-11-25**. La aceptación es documental: no implementa runtime ni autoriza tareas posteriores o commit; las reservas explícitas requieren decisión propia.

### Entrada y ruta

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D01 | Ruta exacta y método | `GET /api/v1/admin/dashboard/product-ranking`, solo ADMINISTRADOR | Aceptada en el paquete 2026-11-25 |
| D02 | `metric`/`direction` obligatorios y defaults | Metric y direction obligatorios; `top` default 5 y forma léxica exacta `5`/`10`/`20` (rechazo de `05`, `+5`, `5.0`, decimales y signos) | Aceptada en el paquete 2026-11-25 |
| D03 | Dominio temporal, precisión y rango | Entrada 0–3 decimales; mínimo `2000-01-01T08:00:00.000Z`; máximo 366 días absolutos; 400 sin truncar | Aceptada en el paquete 2026-11-25 |

### Universo y semántica

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D04 | Universo de productos con movimiento y bajas | Incluir bajas/no disponibles con ventas; no usar `Product.isActive`; `isAvailable` no filtra | Aceptada en el paquete 2026-11-25 |
| D05 | Definición de cero y resultado vacío | `items: []`, conteos/totales `"0"`, `truncated:false`; `bottom` excluye productos sin movimiento (`unitsSold=0`), no necesariamente métrica 0 si hubo unidades | Aceptada en el paquete 2026-11-25 |
| D06 | Direcciones | `top` descendente; `bottom` ascendente; top mayor que conjunto devuelve todos sin relleno | Aceptada en el paquete 2026-11-25 |

### Orden y nombre

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D07 | Desempates | Primaria en dirección, secundaria en misma dirección, nombre ascendente con comparación byte a byte UTF-8 `COLLATE "C"` y `productId` numérico ascendente | Aceptada en el paquete 2026-11-25 |
| D08 | Nombre y `nameSource` | Nombre actual si no está de baja; snapshot más reciente por `soldAt DESC, orderItem.id DESC` si está de baja; resolución en una sola lectura/CTE o `LATERAL`. `productNameSnapshot` es no nulo; si una baja no tuviera snapshot resoluble, decidir rechazo explícito o fallback determinista, sin inventar nombre. `nameSource` queda opcional en el DTO; E2-05 puede hacerlo obligatorio solo con decisión propia | Aceptada en el paquete 2026-11-25 |

### Metadatos y precisión

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D09 | Metadatos antes del corte | `matchedProductCount`/`matchedTotals` completos; `truncated` derivado; `position` opcional y hacerlo obligatorio requiere decisión propia | Aceptada en el paquete 2026-11-25 |
| D10 | Representación exacta | IDs/importes/conteos como strings canónicos; sin `Number`; importe por `lineTotalCents` y unidades por `quantity` | Aceptada en el paquete 2026-11-25 |

### Integridad, errores y coste

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D11 | Filtro defensivo de pago | **No aplicar por defecto** `p.status='SUCCEEDED'`: la fuente `Sale` implica pago exitoso. Si en el futuro se quisiera filtro defensivo, aplicar el mismo predicado en resumen/`/api/v1/sales/summary` y probarlo con una fila inconsistente; adopción futura requiere decisión propia y no forma parte de este contrato | Aceptada en el paquete 2026-11-25 (sin filtro por defecto) |
| D12 | Errores y cabeceras | 400/401/403/413/429/500/503 saneados; no-store/no-referrer dentro del middleware privado; su cobertura en rechazos globales previos no está garantizada y E2-05 debe verificarla | Aceptada en el paquete 2026-11-25 |
| D13 | Coste e índices | Medir con volumen autorizado; no añadir índice por `order_items.product_id` ni migración sin tarea y aprobación propias | Aceptada en el paquete 2026-11-25 |

### Contrato y CSV

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D14 | Estado OpenAPI | La ruta lleva `x-contract-status: approved-2026-11-25`; la descripción indica contrato aceptado y que no implementa runtime. Cualquier cambio posterior requiere su propia tarea | Aceptada en el paquete 2026-11-25 |
| D15 | CSV de ranking | No incluir exportación en E2-04; columnas/metadatos/filtros se definen en el contrato CSV de cierre E2, sin exportar imágenes ni inferir el CSV desde la UI | Aceptada en el paquete 2026-11-25 |

## OpenAPI y estado de contrato

- Se añadió de forma aditiva la ruta `/api/v1/admin/dashboard/product-ranking` y los esquemas `DashboardRanking*`/`DashboardProductRankingResponse` en `backend/docs/api/openapi.yaml`.
- No se modificaron `/api/v1/admin/dashboard/summary`, `/api/v1/admin/dashboard/sales-series`, `/api/v1/sales`, `/api/v1/sales/summary` ni esquemas aceptados.
- El path usa `x-contract-status: approved-2026-11-25`. La `description` indica que el contrato está aceptado y que no implementa runtime.
- El ejemplo canónico del path es un ejemplo documental, no una respuesta HTTP ejecutada ni un dataset real.

## Verificación documental de esta tarea

Previsto y ejecutado solo como validación documental, sin runtime, integración ni pruebas de API real:

- Desde `backend/`: `npm.cmd run format:check`, `npm.cmd run api:validate` y `npx.cmd --no-install prettier --check docs/api/openapi.yaml`.
- Desde `backend/`: `node scripts/check-doc-links.mjs` revisa enlaces del backend; los enlaces de `frontend/docs` se revisan a mano.
- Desde raíz: `git diff --check` y `git status --short`.
- No se atribuyen pruebas HTTP/BD, benchmarks ni aceptación de negocio a esta tarea. Los resultados reales de los comandos se reportan en la entrega; no se registran aceptaciones ficticias en `validation.md`.

## Fuentes y enlaces revisados

- [Spec DA-001](../spec.md) — RF-13, H5, criterios comunes E2 y limitaciones de ceros/activos.
- [Plan DA-001](../plan.md) — contrato, backend y frontend por capacidad; límites/índices requieren aprobación.
- [Backlog DA-001](../tasks.md) — TASK-DA-E2-04 y secuencia posterior.
- [Contrato E1](./E1-summary-contract.md) — semántica bruta, unidades, método y conciliación.
- [Contrato de series](./E2-series-contract.md) — precisión de entrada, cabeceras y límites de middleware.
- [OpenAPI](../../../../../backend/docs/api/openapi.yaml) — contratos existentes y adición documental aceptada.
- [Reglas de negocio](../../../../../backend/docs/business-rules.md) — pagos, ventas, catálogo y reembolsos.
- [Permisos](../../../../../backend/docs/permissions.md) — solo ADMINISTRADOR para dashboard administrativo.
- [Esquema Prisma](../../../../../backend/prisma/schema.prisma) — `Sale`, `Payment`, `OrderItem`, `Product`, `Category`, `Refund`.

**Contrato documental aceptado el 2026-11-25; E2-05 backend implementado, verificado y revisado sin bloqueantes. Commit pendiente de autorización; E2 y CSV siguen abiertos.**
