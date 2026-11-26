# Contrato E2 aceptado — Participación por categorías

- Estado: **CONTRATO DOCUMENTAL E2-12 ACEPTADO el 2026-11-25 por delegación del responsable al coordinador**, con el paquete de decisiones D01–D10 aceptado en la misma fecha. No autoriza runtime, UI, CSV, SQL ejecutable, migraciones, dependencias ni commit; E2-13/14/15 requieren sus propias tareas, verificación y revisión.
- Tarea: `TASK-DA-E2-12`. Objetivo RF: RF-12/14, ampliación E2 aceptada en alcance; RF-01/03/19 y RNF-02/06, con C-CONTRACT/C-DATA/C-LIMIT de E2.
- Alcance documental: ruta aceptada, entrada estricta, DTO cerrado, agrupación por categoría **vigente**, denominadores, porcentajes, conciliación, orden, inactivas/bajas, errores, matriz de escenarios y decisiones aceptadas. Sin implementación, pruebas HTTP/BD, CSV, snapshot de categoría ni cambios de esquema.
- Fuentes: [spec](../spec.md) (RF-12/14, H5, E2), [plan](../plan.md), [tasks](../tasks.md), [contrato E1](./E1-summary-contract.md), [contrato de series](./E2-series-contract.md), [contrato de ranking](./E2-ranking-contract.md), [contrato de sin movimiento](./E2-no-movement-contract.md), [OpenAPI](../../../../../backend/docs/api/openapi.yaml), [reglas de negocio](../../../../../backend/docs/business-rules.md), [permisos](../../../../../backend/docs/permissions.md), [esquema Prisma](../../../../../backend/prisma/schema.prisma), [módulo sales](../../../../../backend/src/modules/sales/sales.read.repository.ts) y [catálogo administrativo](../../../../../backend/src/modules/catalog/admin.service.ts).

> Este contrato fue **aceptado por delegación del responsable el 2026-11-25** y no implementa runtime ni cierra E2. Define una capacidad **distinta** del ranking de productos y de la lista separada sin movimiento: agrupa líneas históricas por la categoría **actual** del producto y calcula porcentajes en backend. La aceptación es documental y no autoriza commit, push ni despliegue. Las reservas explícitas (medición de coste, verificación de cabeceras en rechazos globales y CSV al cierre E2) se mantienen para sus tareas propias. E2-13/14/15 solo pueden iniciarse sobre este contrato aceptado.

## Hechos corroborados

| Fuente                                                            | Hecho relevante                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/prisma/schema.prisma` (`Product`)                        | `categoryId BigInt` es obligatorio y tiene FK `onDelete: Restrict` a `Category`; existe índice `products_category_id_idx`. **No** tiene `isActive`: usa `deletedAt` e `isAvailable`.                                        |
| `backend/prisma/schema.prisma` (`Category`)                       | Tiene `name VarChar(120)`, `isActive` y `deletedAt Timestamptz(6)`. No existe una relación histórica producto-categoría ni snapshot de categoría en las líneas.                                                             |
| `backend/src/modules/catalog/admin.service.ts` (`deleteCategory`) | La baja lógica exige `product.count({ where: { categoryId } }) === 0` (cuenta también productos con baja lógica) y luego marca `deletedAt` e `isActive=false`. Una categoría borrada no debería conservar productos.        |
| `backend/prisma/schema.prisma` (`OrderItem`)                      | Conserva `productId`, `quantity`, `unitPriceCents`, `lineTotalCents` y `productNameSnapshot`. Solo hay índice por `orderId`; no hay índice por `productId` ni por categoría.                                                |
| `backend/prisma/schema.prisma` (`Sale`, `Payment`)                | `Sale` es la venta pagada, única por orden y pago, con `totalCents` y `soldAt Timestamptz(6)`. `Payment.method` es `CASH` o `STRIPE`.                                                                                       |
| `backend/prisma/schema.prisma` (`OrderItemOption`, `Refund`)      | Las opciones ya están incluidas en `lineTotalCents`; un reembolso es una entidad separada que no borra ni reduce la venta. No se unen para agregar.                                                                         |
| `backend/src/modules/sales/sales.read.repository.ts`              | Las lecturas E1/E2 filtran `s.sold_at >= from` y `< to`, unen `payments` solo para el método y agregan en una sola lectura, sin N+1. El ranking no aplica por defecto un filtro defensivo de estado de pago (D11 de E2-04). |
| `backend/src/shared/http/serialization.ts`                        | `BigInt` se serializa como cadena; IDs, importes y conteos no deben pasar por `Number`.                                                                                                                                     |
| `backend/docs/api/openapi.yaml`                                   | `/api/v1/admin/dashboard/summary`, `/sales-series`, `/product-ranking` y `/no-movement-products` son contratos existentes. Esta adición es documental y no altera sus esquemas ni ejemplos.                                 |

No existe snapshot histórico de la categoría de una línea ni del vínculo producto-categoría. Los nombres de categoría **no son únicos** ni estables; la identidad de agrupación es `Category.id`, no el nombre.

## Ruta aceptada y autorización

```http
GET /api/v1/admin/dashboard/category-participation?from=...Z&to=...Z&metric=units|amount[&method=CASH|STRIPE]
```

- **Ruta aceptada**: `/api/v1/admin/dashboard/category-participation`, método `GET`, en el paquete documental del 2026-11-25. Su implementación runtime pertenece a E2-13.
- Solo `ADMINISTRADOR` con cookie de acceso vigente. Sin sesión: `401 UNAUTHENTICATED`. Cualquier otro rol, incluido `GERENTE`, `CLIENTE`, `CAJERO` o `PREPARACION`: `403 FORBIDDEN`, sin consultar el agregado.
- Se reutilizan `authenticate`, `authorize('ADMINISTRADOR')` y el middleware privado de respuesta (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`) de las rutas administrativas existentes.
- GET de lectura: sin CSRF nuevo, sin ampliar permisos de `/api/v1/sales`, sin body. Cualquier body no vacío se rechaza.
- No se modifica `/api/v1/sales`, `/api/v1/sales/summary`, `/api/v1/admin/dashboard/summary`, `/sales-series`, `/product-ranking` ni `/no-movement-products`.

## Entrada estricta aceptada

| Parámetro        | Regla aceptada                                                                                                                                                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`           | Obligatorio, escalar único, fecha real UTC terminada en `Z`, inicio inclusivo. Forma `YYYY-MM-DDTHH:mm:ss` con fracción opcional de 1–3 decimales antes de `Z`; años 2000–9999, sin offsets, sin hora 24 ni fechas imposibles. Mínimo `2000-01-01T08:00:00.000Z`; un `from` anterior devuelve `400 VALIDATION_ERROR` sin truncar. |
| `to`             | Obligatorio, escalar único, fecha real UTC `Z`, fin exclusivo, estrictamente mayor que `from`. Mismo formato, dominio y mínimo. `to - from` máximo **366 días absolutos**; excederlo devuelve 400 sin truncar ni devolver parcial.                                                                                                |
| `metric`         | Obligatoria en este contrato: `units` o `amount`. Sin default. Es la métrica de `sharePercent` y de la ordenación primaria; el DTO devuelve siempre unidades e importes por categoría.                                                                                                                                            |
| `method`         | Opcional, `CASH` o `STRIPE`. Omitido incluye ambos y devuelve `method: null`. Vacío, `null` literal o minúsculas son inválidos.                                                                                                                                                                                                   |
| Extras           | Se rechazan `category`, `categoryId`, `top`, `direction`, `limit`, `cursor`, `granularity`, `timeZone`, `order`, `sort`, `includeZeroSales`, `includeInactive` y cualquier otro parámetro o body. No se ignoran silenciosamente.                                                                                                  |
| Repetidos/arrays | Se rechazan parámetros repetidos —aunque tengan el mismo valor—, arrays, objetos, variantes con corchetes y valores vacíos.                                                                                                                                                                                                       |

- **No hay filtro de categoría.** Enviar `category`/`categoryId` no filtra: devuelve 400. Un filtro así cambiaría el denominador y el porcentaje, y requiere contrato propio.
- Intervalo `[from,to)` UTC; zona de presentación fija `America/Tijuana`, sin offset UTC-8 fijo. El frontend futuro convierte límites locales a UTC; el backend no interpreta la entrada en hora local y no construye buckets.
- Precisión de entrada: hasta milisegundos (0–3 decimales). Cualquier fracción de 4–6 decimales —incluidas las que terminan en cero— se rechaza. Las entradas se comparan de forma exacta sobre `timestamptz`; las filas de `sold_at` conservan su precisión PostgreSQL de microsegundos y no se convierten a `Date` para filtrar.
- El rango máximo es un tope de trabajo, no un SLA medido. No se acepta truncar, redondear, ajustar el rango ni devolver resultados parciales.

## DTO cerrado aceptado

La respuesta 200 es un objeto cerrado con envoltura `{ data }`:

| Campo                    | Regla aceptada                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generatedAt`            | UTC con tres decimales; instante de generación. **No es token de snapshot** entre peticiones.                                                                                             |
| `currency`               | `MXN`.                                                                                                                                                                                    |
| `period`                 | Objeto cerrado `{from,to,timeZone}`; límites UTC normalizados y zona fija `America/Tijuana`.                                                                                              |
| `method`                 | `null`, `CASH` o `STRIPE`; eco del filtro efectivo.                                                                                                                                       |
| `metric`                 | `units` o `amount`; eco de la entrada.                                                                                                                                                    |
| `denominator.unitsSold`  | String decimal exacto; unidades del **conjunto completo** filtrado por rango/método. Base para conciliación y para `sharePercent` cuando `metric=units`.                                  |
| `denominator.totalCents` | String decimal exacto; importe bruto histórico del **conjunto completo** filtrado por rango/método, en centavos MXN. Base para conciliación y para `sharePercent` cuando `metric=amount`. |
| `totalCategories`        | String decimal exacto; número de categorías distintas con al menos una línea en el conjunto filtrado. Sin top N, `totalCategories` = longitud de `items`.                                 |
| `items`                  | Array de **todas** las categorías con movimiento en el conjunto filtrado, en el orden determinista del contrato. Cero resultados válidos producen `200` con `[]`.                         |
| `items[].categoryId`     | String decimal exacto, positivo. Identidad de la categoría actual; no se agrupa por nombre.                                                                                               |
| `items[].name`           | `Category.name` actual; no es único ni histórico.                                                                                                                                         |
| `items[].isActive`       | `Category.isActive` actual. `false` indica categoría **inactiva**, no borrada; la categoría inactiva con movimiento se incluye.                                                           |
| `items[].unitsSold`      | String decimal exacto; `SUM(OrderItem.quantity)` de las líneas de la categoría en el universo.                                                                                            |
| `items[].totalCents`     | String decimal exacto; `SUM(OrderItem.lineTotalCents)` histórico bruto de las líneas de la categoría en el universo.                                                                      |
| `items[].sharePercent`   | String de porcentaje con **exactamente dos decimales**, sin signo `%`, calculado por el backend sobre la métrica seleccionada. Rango `0.00`–`100.00`; redondeo half-up.                   |

- Todos los IDs, conteos, importes y porcentajes son strings; los IDs y conteos canónicos cumplen `^(0|[1-9][0-9]*)$` y los porcentajes cumplen `^(100\.00|(0|[1-9][0-9]?)\.[0-9]{2})$`. Sin `Number`, exponentes, fracciones ni límite injustificado de 19 dígitos.
- No hay `position`, `top`, `truncated`, `matchedTotals` ni cursor: no existe corte ni paginación en este contrato.
- No hay PII: el DTO no incluye cliente, correo, teléfono, ticket, pago ni datos del personal. Los nombres de categoría son de catálogo.
- No se añade un token de modo de categoría: la agrupación por categoría vigente y la advertencia de reclasificación son parte obligatoria del contrato y de la UI; no se infieren de un campo opcional.

### Ejemplo canónico del contrato aceptado (no ejecución HTTP)

```json
{
  "data": {
    "generatedAt": "2026-11-25T18:30:00.000Z",
    "currency": "MXN",
    "period": {
      "from": "2026-11-24T08:00:00.000Z",
      "to": "2026-11-25T08:00:00.000Z",
      "timeZone": "America/Tijuana"
    },
    "method": null,
    "metric": "amount",
    "denominator": {
      "unitsSold": "12",
      "totalCents": "36000"
    },
    "totalCategories": "3",
    "items": [
      {
        "categoryId": "3",
        "name": "Cafés",
        "isActive": true,
        "unitsSold": "8",
        "totalCents": "26000",
        "sharePercent": "72.22"
      },
      {
        "categoryId": "5",
        "name": "Panadería",
        "isActive": false,
        "unitsSold": "3",
        "totalCents": "7500",
        "sharePercent": "20.83"
      },
      {
        "categoryId": "7",
        "name": "Postres",
        "isActive": true,
        "unitsSold": "1",
        "totalCents": "2500",
        "sharePercent": "6.94"
      }
    ]
  }
}
```

El ejemplo es aritmético y documental: `8+3+1=12` unidades y `26000+7500+2500=36000` centavos, iguales a `denominator`. Con `metric=amount`, los porcentajes se calculan sobre `36000`: `26000/36000=72.222…→72.22`, `7500/36000=20.833…→20.83` y `2500/36000=6.944…→6.94`. La suma mostrada es `99.99`, no `100.00`: el residuo de redondeo se documenta y **no** se reasigna. `Panadería` está inactiva pero se incluye porque tuvo movimiento; filtrarla rompería la conciliación. No representa una consulta HTTP ejecutada ni un dataset sembrado.

## Vectores documentales de escenarios (no ejecución HTTP)

Vectores aritméticos del contrato; **no** son respuestas HTTP, datasets sembrados ni pruebas ejecutadas. Los fragmentos omiten `generatedAt`, `currency` y `period` para centrarse en la semántica. La verificación real corresponde a E2-13/E2-15.

### V-A — Cambio de categoría y cambio de precio actual

Dataset documental: el producto `101` se vendió el 2026-11-20 con 2 unidades y `lineTotalCents=9000` (precio histórico). El 2026-11-22 se reclasificó de la categoría `3` a la categoría `9` y su precio actual cambió a 5200 centavos. La consulta cubre el 2026-11-20 y usa `metric=amount`.

```json
{
  "method": null,
  "metric": "amount",
  "denominator": { "unitsSold": "2", "totalCents": "9000" },
  "totalCategories": "1",
  "items": [
    {
      "categoryId": "9",
      "name": "Especiales",
      "isActive": true,
      "unitsSold": "2",
      "totalCents": "9000",
      "sharePercent": "100.00"
    }
  ]
}
```

La venta antigua aparece bajo la categoría **actual** `9`, no bajo la categoría que tenía al vender. La categoría `3` no aparece porque ya no tiene movimiento en el conjunto (no se rellena con cero). El importe es el histórico `9000`, no `2 × 5200`; el cambio de precio no altera el pasado. El total no cambia por la reclasificación: solo cambia de grupo. La UI debe advertir esta semántica.

### V-B — Categoría inactiva con movimiento

Dataset documental: categoría `5` `Panadería`, hoy `isActive=false`, con una venta en rango de 1 unidad y 1500 centavos; categoría `7` `Postres`, activa, con 1 unidad y 500 centavos. `method=CASH`, `metric=units`.

```json
{
  "method": "CASH",
  "metric": "units",
  "denominator": { "unitsSold": "2", "totalCents": "2000" },
  "totalCategories": "2",
  "items": [
    {
      "categoryId": "5",
      "name": "Panadería",
      "isActive": false,
      "unitsSold": "1",
      "totalCents": "1500",
      "sharePercent": "50.00"
    },
    {
      "categoryId": "7",
      "name": "Postres",
      "isActive": true,
      "unitsSold": "1",
      "totalCents": "500",
      "sharePercent": "50.00"
    }
  ]
}
```

`Panadería` se incluye con `isActive:false`; no se filtra por categoría activa porque el objetivo es conciliar ventas históricas y el porcentaje. El desempate entre ambas (misma métrica `1`) es por nombre `COLLATE "C"` ascendente (`Panadería` antes que `Postres`) y, si coincidiera, por `categoryId`.

### V-C — Base cero: sin ventas y denominador seleccionado cero con líneas

Sin ventas pagadas en el rango/método:

```json
{
  "method": "STRIPE",
  "metric": "amount",
  "denominator": { "unitsSold": "0", "totalCents": "0" },
  "totalCategories": "0",
  "items": []
}
```

Estado `200`; no 404, no categorías ficticias, no `"Sin categoría"`, no ceros de relleno.

Caso degenerado documentado: si existen líneas con unidades pero **todo** el importe es `0` (productos gratuitos) y `metric=amount`, `denominator.totalCents` es `"0"` e `items` **no** se vacía, porque las líneas y las unidades existen y vaciarlo rompería la conciliación de unidades. En ese caso cada `sharePercent` es `"0.00"` (base cero, sin porcentaje calculable), y la UI debe apoyarse en `denominator.totalCents` para mostrar «sin base», no interpretar `0.00` como participación real. `items: []` solo aplica cuando no hay ninguna línea en el universo.

### V-D — Enteros mayores que `Number.MAX_SAFE_INTEGER`

Dos categorías documentales, no dos ventas necesariamente sembrables:

```json
{
  "method": null,
  "metric": "units",
  "denominator": {
    "unitsSold": "9007199254740993",
    "totalCents": "9007199254740993"
  },
  "totalCategories": "2",
  "items": [
    {
      "categoryId": "22",
      "name": "Grande B",
      "isActive": true,
      "unitsSold": "6004799503160662",
      "totalCents": "6004799503160662",
      "sharePercent": "66.67"
    },
    {
      "categoryId": "21",
      "name": "Grande A",
      "isActive": true,
      "unitsSold": "3002399751580331",
      "totalCents": "3002399751580331",
      "sharePercent": "33.33"
    }
  ]
}
```

Sumas exactas como strings: `6004799503160662 + 3002399751580331 = 9007199254740993`; `2/3` se redondea a `66.67` y `1/3` a `33.33`, con suma `100.00`. Ningún valor pasa por `Number`; el orden usa el valor entero exacto de la métrica y del ID.

### V-E — Residuo de redondeo sin forzar 100.00

Tres categorías con la misma métrica seleccionada: `unitsSold=1` cada una, `totalCents=1000` cada una; `metric=units`.

```json
{
  "method": null,
  "metric": "units",
  "denominator": { "unitsSold": "3", "totalCents": "3000" },
  "totalCategories": "3",
  "items": [
    {
      "categoryId": "31",
      "name": "A",
      "isActive": true,
      "unitsSold": "1",
      "totalCents": "1000",
      "sharePercent": "33.33"
    },
    {
      "categoryId": "32",
      "name": "B",
      "isActive": true,
      "unitsSold": "1",
      "totalCents": "1000",
      "sharePercent": "33.33"
    },
    {
      "categoryId": "33",
      "name": "C",
      "isActive": true,
      "unitsSold": "1",
      "totalCents": "1000",
      "sharePercent": "33.33"
    }
  ]
}
```

Cada porcentaje exacto es `33.333…`; half-up produce `33.33` y la suma mostrada es `99.99`. El backend **no** ajusta una categoría a `33.34` ni normaliza a `100.00`. En un conjunto de `n` categorías, el residuo absoluto de la suma es menor que `0.005 × n` puntos porcentuales; se informa y se deja a la UI explicar el redondeo.

## Semántica de datos aceptada (C-DATA)

1. **Universo:** ventas pagadas del intervalo `[from,to)` y del método efectivo. `Sale` es la fuente de la venta; su invariante es que nace de un pago exitoso, por lo que se reutiliza D11 de E2-04: **no se aplica por defecto** el filtro defensivo `p.status='SUCCEEDED'`. No se incluyen órdenes sin `Sale` (pendientes, fallidas o expiradas) ni intentos de pago.
2. **Agrupación:** por `Product.categoryId` **actual**, nunca por nombre de categoría ni por una categoría histórica. El vínculo se resuelve con `OrderItem.productId → Product.categoryId → Category.id`; no existe snapshot de categoría en la línea.
3. **Unidades:** `SUM(OrderItem.quantity)` de las líneas del universo. No se multiplica por opciones, pagos, intentos ni reembolsos.
4. **Importe:** `SUM(OrderItem.lineTotalCents)` histórico bruto de las líneas del universo, en centavos MXN. No se usa `Product.basePriceCents` ni `OrderItem.unitPriceCents` actual como sustituto. `OrderItemOption` ya está incluido en `lineTotalCents`; no se une.
5. **Bruto:** no se resta `Refund`; un reembolso no elimina ni reduce la venta registrada. No se une `refunds` para ajustar unidades o importes.
6. **Método:** se obtiene de `Payment.method` mediante `Sale.paymentId`; no se infiere del nombre de la categoría/producto ni de la orden. Sin `method` se incluyen `CASH` y `STRIPE` en el mismo conjunto.
7. **Conjunto completo:** se agrega todo el conjunto filtrado, sin top N, sin paginación, sin `limit` y sin calcular desde páginas de `/api/v1/sales`. `denominator` y `items` describen el mismo conjunto; no hay recorte.
8. **Sin doble conteo:** una venta tiene una sola `Sale`; cada línea contribuye una vez. No se unen `OrderItemOption`, `Refund`, `PaymentEvent`, `PaymentIncident` ni reintentos. Sin N+1 ni una consulta por categoría.
9. **Consistencia:** `denominator`, `totalCategories` e `items` provienen de una lectura/snapshot coherente. En un dataset estable, `Σ items.unitsSold = denominator.unitsSold` y `Σ items.totalCents = denominator.totalCents` exactamente. Además, con el mismo rango/método, esas sumas deben conciliar con el resumen completo: unidades con `summary.unitsSold`/`/api/v1/sales/summary` y centavos con la suma de `Sale.totalCents`, porque las líneas particionan el total de la venta. No se exige igualdad entre respuestas tomadas en instantes distintos con ventas nuevas; `generatedAt` no fija un snapshot compartido.
10. **Cero:** si no hay líneas en el universo, `items: []`, `denominator` en `"0"` y `totalCategories: "0"`, con 200. No se inventan categorías, «sin categoría», «otras» ni ceros de relleno.
11. **Integridad:** una línea sin producto/categoría resoluble no se reclasifica a una categoría ficticia. La FK y las reglas de catálogo lo impiden; si apareciera por datos inconsistentes, el contrato exige un fallo interno explícito y saneado (ver abajo), no una omisión silenciosa que rompa la conciliación.

## Categoría vigente, reclasificación e inactivas

### Agrupación por categoría actual

- La categoría se lee en su estado **actual** al generar la respuesta. No se reconstruye la categoría que el producto tenía al momento de la venta: **no existe** ese snapshot en el esquema.
- Si un producto cambia de categoría, **todo** su historial dentro del rango se agrupa bajo la categoría nueva; la categoría anterior deja de contener esas líneas. El importe y las unidades **no** cambian, solo el grupo. El total y `denominator` siguen conciliando.
- Si un producto está dado de baja lógica (`deletedAt` no nulo) o no disponible (`isAvailable=false`), sus líneas **sí** participan: excluirlas rompería la conciliación con ventas históricas. `Product` no tiene `isActive` y no se usa.
- El nombre de la categoría es el actual y puede haber cambiado; el `categoryId` es la identidad. Nombres iguales de categorías distintas no se fusionan.
- No se usa `Category.isActive`, `Category.deletedAt`, `Product.deletedAt` ni `Product.isAvailable` como filtro de inclusión del universo de ventas: excluir filas rompería la conciliación. La categoría inactiva con movimiento se incluye y se marca `isActive:false`; una categoría borrada se detecta como inconsistencia y produce el fallo explícito descrito abajo, no se incorpora como si estuviera vigente.

### Advertencia obligatoria de reclasificación en la UI

La UI futura (E2-14) debe mostrar una advertencia visible y accesible, no solo en tooltip, del tipo:

> «Las ventas se agrupan por la categoría actual del producto. Si un producto cambió de categoría, su historial aparece en la categoría nueva; el total no cambia, pero la distribución puede diferir de la que tenía en la fecha de venta.»

La advertencia es requisito del contrato, no una preferencia visual. El frontend no debe recalcular ni reasignar categorías, ni presentar el resultado como «categoría al momento de la venta».

### Categorías inactivas y borradas

| Situación actual                                                        | Resultado aceptado                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categoría `isActive=true`, `deletedAt=null`, con líneas en el universo  | Se incluye con `isActive:true`.                                                                                                                                                                                                                            |
| Categoría `isActive=false`, `deletedAt=null`, con líneas en el universo | Se incluye con `isActive:false`; no se filtra, para conciliar.                                                                                                                                                                                             |
| Categoría con `deletedAt` no nulo vinculada a un producto con líneas    | **Fallo explícito** interno saneado; no se incluye como categoría ficticia ni se descartan sus líneas en silencio. La baja de categoría exige cero productos (BR-CAT-005); esta situación solo puede provenir de datos inconsistentes y debe investigarse. |
| Línea sin producto/categoría resoluble                                  | **Fallo explícito** interno saneado; no se agrupa en «Sin categoría». La FK `Restrict` debería impedirlo.                                                                                                                                                  |
| Categoría renombrada                                                    | Se devuelve el nombre actual; no hay snapshot histórico.                                                                                                                                                                                                   |
| Categoría sin movimiento en rango/método                                | No aparece; no se completa con `0` ni con una fila «otras».                                                                                                                                                                                                |

El fallo explícito es un `500 INTERNAL_ERROR` saneado por el manejador existente, sin stack, SQL ni PII. No es un `400` de entrada: la petición es válida y el problema es de integridad del dato. E2-13 debe probar esta defensa con una fila inconsistente controlada.

## Orden, denominadores, porcentajes y conciliación

### Orden determinista

1. Métrica seleccionada (`unitsSold` si `metric=units`; `totalCents` si `metric=amount`) **descendente**.
2. `Category.name` ascendente con comparación byte a byte UTF-8 `COLLATE "C"`, sensible a mayúsculas y sin depender de la configuración regional.
3. `Category.id` numérico ascendente como desempate final, usando el valor entero exacto, no la comparación lexicográfica de strings.

La combinación es total para el conjunto devuelto. Dos ejecuciones sobre el mismo dataset, catálogo y filtros producen el mismo orden. El frontend futuro **no reordena**, no agrupa y no recalcula porcentajes. No hay top N ni `position`.

### Denominadores

- `denominator.unitsSold` = `Σ OrderItem.quantity` del conjunto completo filtrado.
- `denominator.totalCents` = `Σ OrderItem.lineTotalCents` del conjunto completo filtrado.
- Ambos se calculan una sola vez sobre el mismo universo que `items`; no son los totales de una página ni de una categoría.
- `sharePercent` usa como denominador la métrica seleccionada: `unitsSold` si `metric=units`, `totalCents` si `metric=amount`. El otro valor sigue disponible por ítem para conciliación y contexto.

### Cálculo y representación del porcentaje (backend)

Con enteros no negativos exactos:

```text
porcentaje_centesimas = redondeo_half_up(
  valor_categoria * 10000 / denominador_seleccionado
)
sharePercent = formatear(porcentaje_centesimas / 100) con dos decimales
```

- `redondeo_half_up` redondea al entero más cercano y, en el empate exacto, hacia arriba (por ejemplo, `1/6` → `16.666…` → `16.67`; `1/8` → `12.5` → `12.50`).
- Se calcula en backend con aritmética entera exacta (bigint), nunca con `Number` flotante ni en el frontend.
- Formato: exactamente dos decimales, sin separador de miles, sin signo `%` y sin notación científica. Rango `0.00`–`100.00`.
- **Base cero:** si hay ítems y el denominador seleccionado es `0`, `sharePercent` es `"0.00"` para cada ítem; la UI debe mostrar «sin base» usando `denominator`, no interpretar `0.00` como una participación real. Si no hay líneas, `items` es `[]` y no hay porcentajes que mostrar. No se usa `null` para evitar un esquema con dos formas de ausencia.
- No se normaliza a `100.00`, no se reasigna el residuo a la categoría mayor, no se redondea a un decimal y no se oculta el residuo.

### Conciliación y residuo

- **Conciliación exacta:** `Σ items.unitsSold = denominator.unitsSold` y `Σ items.totalCents = denominator.totalCents`, con independencia de `metric`. Con el mismo rango/método y dataset estable, unidades e importes concilian con el resumen completo; no hay categoría omitida ni doble conteo.
- **Residuo de porcentajes:** los porcentajes redondeados no se fuerzan a sumar `100.00`. Cada uno difiere del exacto en menos de `0.005` puntos porcentuales; para `n` categorías, la suma puede desviarse menos de `0.005 × n` puntos porcentuales. Se documenta y se muestra tal cual; el residuo no se reasigna ni se esconde. Ejemplo: tres tercios iguales → `33.33 + 33.33 + 33.33 = 99.99`.
- Cuando el denominador seleccionado es cero, los porcentajes son `0.00` y no se pretende que sumen `100.00`.
- La conciliación se mide sobre el conjunto completo, no sobre lo visible en una tabla o gráfica. Un residuo de porcentaje no es un error de agregación.

## Metadatos, límites y consistencia

- `totalCategories` se calcula sobre el conjunto completo antes de ordenar y es igual a la longitud de `items`; no hay truncado.
- `generatedAt` es el instante de generación y no un token de snapshot. `period` refleja los límites efectivos normalizados.
- Una sola lectura/transacción coherente en backend; sin acumulación de páginas, sin consultas por categoría y sin N+1. La resolución de `Product.categoryId → Category` ocurre en la misma lectura/CTE, no con una consulta por categoría.
- Límite de rango: 366 días absolutos. No hay límite de top N, cursor, offset ni paginación en este contrato; el número de categorías está acotado por el catálogo, no por la cantidad de ventas.
- No se promete latencia ni SLA. El coste se medirá con volumen autorizado en E2-13/E2-15; no se añaden índices ni migraciones por este contrato. La ausencia de índice por `order_items.product_id` es un riesgo conocido y compartido con el ranking.
- El volumen de `items` puede crecer con el catálogo, no con las ventas; aun así, E2-13 debe documentar el plan y medir el coste real con el volumen representativo autorizado antes de afirmar un límite operativo.

## Seguridad, errores y privacidad

- Solo `ADMINISTRADOR`; `authenticate` + `authorize('ADMINISTRADOR')` existentes. `GERENTE` no hereda esta lectura analítica: recibe `403`.
- Must-change-PIN y Origin conservan sus códigos actuales (`PIN_CHANGE_REQUIRED`, `ORIGIN_NOT_ALLOWED`) dentro de `403`.
- `Cache-Control: no-store` y `Referrer-Policy: no-referrer` dentro del middleware privado de ruta, en éxito y en errores que lo atraviesen. Los rechazos globales previos (Origin/parsing, 413, 429) **no garantizan** esas cabeceras con el orden actual de middleware; E2-13 debe verificarlo. No se cambia el orden de middleware en esta tarea.
- Errores `application/problem+json` con `type,title,status,detail,instance,code,requestId` y `errors` de validación cuando corresponda; sin stack, SQL, secretos ni PII.
- Códigos aceptados: `400 VALIDATION_ERROR` (entrada/rango/body), `401 UNAUTHENTICATED`, `403 FORBIDDEN` (roles) / `PIN_CHANGE_REQUIRED` / `ORIGIN_NOT_ALLOWED`, `413 PAYLOAD_TOO_LARGE` global, `429 RATE_LIMITED`, `500 INTERNAL_ERROR` (incluida integridad de categoría no resoluble) y `503 DEPENDENCY_UNAVAILABLE` solo para fallos reconocidos por `problemHandler`. No se promete 503 para todo fallo ni éxito con ceros inventados.
- No se devuelven datos de cliente, pago, ticket, personal ni secretos. Los nombres de categoría son de catálogo.
- Sin CSRF nuevo para este GET; se conservan sesión/cookies/Origin existentes. El frontend futuro reutilizará cliente HTTP y sesión única; 401 delega en el gestor común y 429 se informa sin bucle. Un fallo de este panel no debe borrar otros paneles ni sustituirse por ceros.
- Sin CSV en este contrato. La exportación de esta capacidad, si se incluye al cierre E2, se rige por el contrato CSV específico; no se infiere de la UI ni de este DTO.

## Matriz de escenarios aceptada (R01–R18)

Todos los resultados son **exigencias del contrato aceptado**, no pruebas ejecutadas. La evidencia futura se reparte entre E2-13 (backend HTTP/BD), E2-14 (frontend/MSW) y E2-15 (aceptación real). Esta tarea documental no acredita ninguna prueba.

| ID  | RF/criterio  | Escenario                                                                                                                                     | Resultado exigido                                                                                                                                                                    | Evidencia futura    |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| R01 | RF-12/14     | `GET /api/v1/admin/dashboard/category-participation` con `from`, `to`, `metric`; método omitido                                               | 200 con DTO cerrado, `method:null`, todas las categorías con movimiento y porcentajes backend                                                                                        | E2-13, E2-14, E2-15 |
| R02 | RF-12/14     | `metric` ausente, vacía, `units` y `amount`; `metric=both` u otro valor                                                                       | `units`/`amount` aceptadas sin default; ausente o inválida → 400 sin consultar                                                                                                       | E2-13, E2-14        |
| R03 | RF-03/19     | `from`/`to` reales UTC con 0–3 decimales; mínimo 2000; 366 días; 366 días + 1 ms; `from>=to`; 4–6 decimales; venta en `from`, `to−1 µs`, `to` | Acepta límites válidos, incluye `from` y `to−1 µs`, excluye `to`; 400 sin truncar en el resto                                                                                        | E2-13, E2-15        |
| R04 | RF-19        | Extras (`category`, `categoryId`, `top`, `limit`, `cursor`…), repetidos, arrays, vacíos o body no vacío                                       | `400 VALIDATION_ERROR`; no se ignoran ni se consulta                                                                                                                                 | E2-13, E2-14        |
| R05 | RF-14        | Producto reclasificado después de la venta                                                                                                    | La línea aparece bajo `Product.categoryId` actual; la categoría anterior no recibe el importe; el total no cambia; advertencia UI visible                                            | E2-13, E2-14, E2-15 |
| R06 | RF-12/14     | Cambio de precio actual después de la venta; línea con `lineTotalCents` histórico                                                             | Importe histórico de `lineTotalCents`, no `basePriceCents`/`unitPriceCents` actuales                                                                                                 | E2-13, E2-15        |
| R07 | RF-12        | Varias cantidades, opciones y recargos; varios intentos/pagos                                                                                 | Unidades = `quantity` una vez; importe = `lineTotalCents`; no se une `OrderItemOption` ni se multiplica                                                                              | E2-13               |
| R08 | RF-12/14     | Venta con reembolso total o parcial                                                                                                           | La línea sigue contando bruta; no se resta `Refund` ni se elimina la categoría                                                                                                       | E2-13, E2-15        |
| R09 | RF-03        | `method` omitido, `CASH`, `STRIPE`; ventas de ambos métodos                                                                                   | Mixto incluye ambos; cada método concilia su subconjunto; no se duplica una venta                                                                                                    | E2-13, E2-15        |
| R10 | RF-12/14     | Varias categorías con distinto número de líneas; categoría sin movimiento                                                                     | `denominator` e `items` cubren el conjunto completo; `totalCategories` = longitud de `items`; categorías sin movimiento no se rellenan con cero                                      | E2-13, E2-14        |
| R11 | RF-12/14     | Porcentajes con resultados exactos y con empate half-up (`1/6`, `1/8`, tercios)                                                               | `sharePercent` string de dos decimales, calculado en backend, redondeo half-up, base seleccionada correcta                                                                           | E2-13, E2-14        |
| R12 | RF-14        | Tres o más categorías cuyos porcentajes redondeados no suman 100.00                                                                           | Se conserva el residuo (p. ej. 99.99); no se fuerza `100.00` ni se reasigna; se documenta el máximo teórico                                                                          | E2-13, E2-14, E2-15 |
| R13 | RF-14        | Sin ventas; base seleccionada cero con líneas; categoría inactiva con movimiento                                                              | Sin líneas: `items:[]`, denominadores `"0"`, `totalCategories:"0"`, 200. Con líneas y base cero: ítems conservados y `sharePercent:"0.00"`; inactiva se incluye con `isActive:false` | E2-13, E2-14        |
| R14 | RF-14        | Categoría `deletedAt` no nulo con producto/línea; línea sin categoría resoluble                                                               | Fallo interno explícito y saneado; no se inventa categoría ni se descarta la línea en silencio                                                                                       | E2-13, E2-15        |
| R15 | RF-14        | Empates de métrica; nombres iguales, mayúsculas/acentos; categorías con el mismo nombre                                                       | Orden por métrica descendente, `name COLLATE "C"` ascendente y `categoryId` numérico ascendente; repetible; el frontend no reordena                                                  | E2-13, E2-14        |
| R16 | RNF-02       | IDs, unidades, importes y totales mayores que `Number.MAX_SAFE_INTEGER`                                                                       | Strings decimales exactos; sin `Number`; suma y orden exactos; porcentajes sobre bigint                                                                                              | E2-13, E2-14        |
| R17 | RF-01/19     | Sin sesión; ADMINISTRADOR; CLIENTE/CAJERO/PREPARACION/GERENTE; PIN/Origin; cabeceras; body                                                    | 401/200/403; denegados sin agregado; `no-store`/`no-referrer` en el alcance del middleware; sin CSRF nuevo; body no vacío 400                                                        | E2-13, E2-15        |
| R18 | RF-19/RNF-06 | 413/429/500/503; lectura coherente; volumen, N+1, coste; fallo parcial en UI                                                                  | Problem Details saneados; sin ceros/fallback; una lectura; coste medido sin índices implícitos; el frontend conserva otros paneles y la sesión única                                 | E2-13, E2-14, E2-15 |

## Decisiones aceptadas — 2026-11-25

D01–D10 fueron **aceptadas por delegación del responsable al coordinador el 2026-11-25**, con las recomendaciones de este contrato. La aceptación es documental: no implementa runtime ni autoriza tareas posteriores o commit; las reservas explícitas (medición de coste y verificación de cabeceras en E2-13, advertencia UI en E2-14, CSV en el cierre E2) se mantienen en sus tareas propias.

### Ruta, entrada y categoría

| ID  | Decisión                        | Contenido aceptado                                                                                                                                                                                                                                            | Estado                                |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| D01 | Ruta y rol                      | `GET /api/v1/admin/dashboard/category-participation`, solo ADMINISTRADOR; GET sin CSRF nuevo ni body; sin filtro de categoría                                                                                                                                 | Aceptada por delegación el 2026-11-25 |
| D02 | Entrada temporal y estricta     | `from` inclusivo/`to` exclusivo UTC `Z`, 0–3 decimales, mínimo `2000-01-01T08:00:00.000Z`, máximo 366 días absolutos; `metric` con valores `units` o `amount` es obligatoria y sin default; `method` opcional; extras/repetidos/arrays/body → 400 sin truncar | Aceptada por delegación el 2026-11-25 |
| D03 | Categoría vigente y advertencia | Agrupar por `Product.categoryId` actual; no existe snapshot histórico; la reclasificación mueve el historial a la categoría actual sin cambiar el total; la UI debe advertirlo de forma visible; nombre y `isActive` actuales                                 | Aceptada por delegación el 2026-11-25 |

### Universo y métricas

| ID  | Decisión                       | Contenido aceptado                                                                                                                                                                                                | Estado                                |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| D04 | Universo y bruto               | Ventas pagadas del rango/método; sin órdenes sin `Sale`; sin filtro defensivo de pago por defecto (D11 E2-04); reembolsos no restan; sin unir opciones/intentos/eventos                                           | Aceptada por delegación el 2026-11-25 |
| D05 | Unidades, importe y agrupación | Unidades = `SUM(quantity)`; importe = `SUM(lineTotalCents)` histórico; agrupar por `Product.categoryId`, no por nombre; sin multiplicadores ni precios actuales; incluir productos con baja lógica/no disponibles | Aceptada por delegación el 2026-11-25 |

### DTO, porcentajes y conciliación

| ID  | Decisión               | Contenido aceptado                                                                                                                                                                                                                       | Estado                                |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| D06 | DTO y representación   | DTO cerrado con `generatedAt/currency/period/method/metric/denominator/totalCategories/items`; IDs, unidades, importes, conteos y porcentajes como strings exactos; sin `Number`, PII, top N ni paginación                               | Aceptada por delegación el 2026-11-25 |
| D07 | Porcentaje y base cero | `sharePercent` de dos decimales calculado en backend con half-up sobre la métrica seleccionada; base cero con ítems → `"0.00"` y la UI muestra «sin base» usando `denominator`; sin líneas → `items:[]`; la UI no recalcula ni normaliza | Aceptada por delegación el 2026-11-25 |
| D08 | Conciliación y residuo | Sumas exactas de unidades/importes de ítems = `denominator` y conciliación con resumen completo en dataset estable; el residuo de porcentajes no se fuerza a 100.00 ni se reasigna; máximo menor que `0.005 × n` puntos porcentuales     | Aceptada por delegación el 2026-11-25 |

### Categorías, orden y seguridad

| ID  | Decisión                             | Contenido aceptado                                                                                                                                                                                                                                                                                                                                                      | Estado                                                                  |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| D09 | Inactivas, borradas, orden y volumen | Incluir categorías con movimiento aunque estén inactivas y mostrar `isActive`; una categoría borrada o no resoluble es un fallo interno explícito, no una categoría ficticia; orden métrica descendente, nombre `COLLATE "C"` ascendente y `categoryId` numérico ascendente; todas las categorías, sin top N; volumen/coste a medir en E2-13 sin índices ni migraciones | Aceptada por delegación el 2026-11-25 (con reserva de medición)         |
| D10 | Seguridad, errores y CSV             | Solo ADMINISTRADOR; 401/403 (incluido GERENTE); `no-store`/`no-referrer` en middleware privado con límite documentado para rechazos globales; 400/413/429/500/503 Problem Details saneados; sin CSRF nuevo; sin CSV en este contrato                                                                                                                                    | Aceptada por delegación el 2026-11-25 (con reserva de verificación/CSV) |

## OpenAPI y estado de contrato

- Se añade de forma aditiva la ruta `/api/v1/admin/dashboard/category-participation` y los esquemas `DashboardCategoryParticipation*` en [OpenAPI](../../../../../backend/docs/api/openapi.yaml).
- El path usa `x-contract-status: approved-2026-11-25`. La `description` indica que el contrato fue aceptado por delegación el 2026-11-25 y que no implementa runtime.
- El esquema cierra `denominator`, `items` y el DTO con `additionalProperties: false`; `sharePercent` declara el patrón de dos decimales y `totalCategories`/`unitsSold`/`totalCents` strings canónicos.
- El ejemplo 200 de OpenAPI es el ejemplo canónico documental, válido para el esquema; no es una respuesta HTTP ejecutada ni un dataset real.
- No se modifican `/api/v1/admin/dashboard/summary`, `/api/v1/admin/dashboard/sales-series`, `/api/v1/admin/dashboard/product-ranking`, `/api/v1/admin/dashboard/no-movement-products`, `/api/v1/sales`, `/api/v1/sales/summary` ni sus esquemas aceptados.

## Verificación documental de esta tarea

Solo validación documental, sin runtime, integración ni pruebas de API real:

- Desde `backend/`: `npm.cmd run format:check`, `npm.cmd run api:validate` y `npx.cmd --no-install prettier --check docs/api/openapi.yaml`.
- Desde `backend/`: `node scripts/check-doc-links.mjs` revisa enlaces del backend; los enlaces de `frontend/docs` se revisan a mano.
- Desde raíz: `git diff --check` y `git status --short`.
- No se atribuyen pruebas HTTP/BD, benchmarks ni implementación runtime a esta tarea. Los resultados reales de los comandos se reportan en la entrega; no se registran aceptaciones ficticias en `validation.md` ni se edita ese archivo.

## Fuentes y enlaces revisados

- [Spec DA-001](../spec.md) — RF-12/14, H5, criterios comunes E2 y advertencia de reclasificación.
- [Plan DA-001](../plan.md) — contrato, backend y frontend por capacidad; límites e índices requieren aprobación.
- [Backlog DA-001](../tasks.md) — TASK-DA-E2-12 y secuencia E2-13/14/15.
- [Contrato E1](./E1-summary-contract.md) — semántica bruta, método, unidades y conciliación.
- [Contrato de series](./E2-series-contract.md) — precisión de entrada, cabeceras y límites de middleware.
- [Contrato de ranking](./E2-ranking-contract.md) — D11 sin filtro defensivo, importe histórico y desempates.
- [Contrato de sin movimiento](./E2-no-movement-contract.md) — categoría actual, inactivas/bajas y estados actuales.
- [OpenAPI](../../../../../backend/docs/api/openapi.yaml) — contratos existentes y adición documental aceptada.
- [Reglas de negocio](../../../../../backend/docs/business-rules.md) — pagos, ventas, catálogo, bajas y categorías (BR-CAT-005).
- [Permisos](../../../../../backend/docs/permissions.md) — solo ADMINISTRADOR para dashboard administrativo; GERENTE no hereda esta lectura.
- [Esquema Prisma](../../../../../backend/prisma/schema.prisma) — `Product`, `Category`, `Sale`, `Payment`, `OrderItem`, `OrderItemOption` y `Refund`.
- [Catálogo administrativo](../../../../../backend/src/modules/catalog/admin.service.ts) — baja lógica de categoría y regla de cero productos.
- [Repositorio de ventas](../../../../../backend/src/modules/sales/sales.read.repository.ts) — patrones de lectura agregada, método y resolución de nombres/categorías.
- [Validación de ventas](../../../../../backend/src/modules/sales/sales.validation.ts) — precisión temporal y entradas estrictas E2.
- [Servicio de ventas](../../../../../backend/src/modules/sales/sales.service.ts) — composición de DTO y porcentajes backend.

**Contrato documental aceptado el 2026-11-25 por delegación del responsable al coordinador; sin runtime, UI, CSV, migraciones ni commit. E2-13/14/15 y el CSV de cierre E2 siguen pendientes de sus propias tareas.**
